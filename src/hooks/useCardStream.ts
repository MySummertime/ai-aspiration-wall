import { useCallback, useRef, useState } from 'react';
import { generateCard, revealText } from '../services/aiService';
import { parseCard } from '../utils/parseCard';
import { THEME_MAX_LENGTH, THEME_MIN_LENGTH } from '../constants/theme';
import type { ParsedCard } from '../types/card';

/** 流式生成状态机 */
export type StreamStatus =
  | 'idle'
  | 'streaming'
  | 'done'
  | 'error';

/** 流式解析节流间隔：300ms，避免每个 chunk 都跑正则 */
const PARSE_THROTTLE = 300;

/**
 * 提取可读的错误信息
 *
 * CloudBase SDK 抛出的不一定�� Error 实例，可能是
 * `{ code, message }` 形式的对象或纯字符串。
 * 直接用 `err instanceof Error ? err.message : '兜底文案'`
 * 会把真实原因（如 AI 未开通、模型不存在）吞掉，只显示"生成失败，请重试"，
 * 导致无法排查。此处做兼容提取。
 */
export function describeError(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  if (typeof err === 'string' && err) {
    return err;
  }

  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    // 优先取 message，其次 code
    const parts: string[] = [];
    if (typeof obj.code === 'string' && obj.code) {
      parts.push(obj.code);
    }
    if (typeof obj.message === 'string' && obj.message) {
      parts.push(obj.message);
    }
    if (parts.length > 0) {
   return parts.join(': ');
    }
  }

  return '生成失败，请重试';
}

/**
 * 把技术错误码翻译成用户能看懂的话
 *
 * ⚠️ 关键原则：**绝不把未知错误替换成笼统文案**。
 * 之前的实现把 `OPERATION_FAIL` 统一显示为"生成失败，请稍后重试"，
 * 结果真实原因（如网关拒绝、额度耗尽）被完全掩盖，无法排查。
 * 现在规则：
 *   - 只对已知的、能给出明确指引的错误做友好化
 *   - 其余一律展示原文（截断），让信息不丢失
 */
function friendlyError(raw: string): string {
  if (!raw) {
    return '生成失败，请重试';
  }

  if (raw.includes('ACCESS_TOKEN_EXPIRED') || raw.includes('Access_token expired')) {
    return '登录已过期，正在重新登录…请再点一次重试';
  }

  // 网关策略拒绝：给出可操作指引
  if (raw.includes('ACCESS_DENIED') || raw.includes('rego policy')) {
    return '访问被网关策略拒绝，请稍后重试';
  }

  // 云函数权限：注意不是 invoke 安全规则，而是「匿名用户角色缺少云函数策略」
  // （PERMISSION_DENIED 由角色策略层产生，invoke 规则管不到）
  if (raw.includes('PERMISSION_DENIED')) {
    return '权限不足：当前登录身份无权调用云函数（已改用免鉴权 HTTP 通道，请刷新页面重试）';
  }

  if (raw.includes('AI_CHANNEL_NOT_ALLOWED')) {
    return '当前环境套餐不支持 Web 端调用 AI（需通过云函数）';
  }

  if (raw.includes('EXCEED_CONCURRENT_REQUEST_LIMIT')) {
    return '当前使用人数较多，请稍后重试';
  }

  // 额度耗尽
  if (/额度|quota|QUOTA|INSUFFICIENT|余额不足/i.test(raw)) {
 return 'AI 额度已用尽，请稍后再试或升级套餐';
  }

  // ⚠️ 未知错误：展示原文而非笼统文案，否则真实原因会被掩盖
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}

export interface CardStreamState {
  status: StreamStatus;
  /** 累积的原始文本 */
  rawText: string;
  /** 节流解析出的结构化字段 */
  parsed: ParsedCard;
  totalTokens: number;
  error: string | null;
}

/**
 * 卡片流式生成 Hook
 *
 * 需求 R3：逐块追加渲染 + 打字机光标 + 失败保留部分内容 + token 展示
 */
export function useCardStream() {
  const [state, setState] = useState<CardStreamState>({
    status: 'idle',
    rawText: '',
    parsed: { extra: '' },
    totalTokens: 0,
    error: null,
  });

  /** 节流计时器 id */
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 当前请求的中止标记 */
  const aborted = useRef(false);

  /** 校验主题，返回错误文案；合法则返回 null */
  const validateTheme = useCallback((theme: string): string | null => {
    const trimmed = theme.trim();
    if (trimmed.length === 0) {
      return '请输入一个主题';
    }
    if (trimmed.length < THEME_MIN_LENGTH) {
      return `主题至少需要 ${THEME_MIN_LENGTH} 个字符`;
    }
    if (trimmed.length > THEME_MAX_LENGTH) {
      return `主题不超过 ${THEME_MAX_LENGTH} 个字符，当前 ${trimmed.length}`;
    }
    return null;
  }, []);

  const reset = useCallback(() => {
    aborted.current = false;
    setState({
      status: 'idle',
      rawText: '',
      parsed: { extra: '' },
      totalTokens: 0,
      error: null,
    });
  }, []);

  /**
   * 执行流式生成
   * @returns 校验错误文案；成功发起则返回 null
   */
  const start = useCallback(async (theme: string): Promise<string | null> => {
    const validationError = validateTheme(theme);
    if (validationError) {
      return validationError;
    }

    aborted.current = false;

setState({
   status: 'streaming',
   rawText: '',
  parsed: { extra: '' },
      totalTokens: 0,
      error: null,
 });

    try {
      // 云函数一次性返回完整结果
      const result = await generateCard(theme.trim());

      if (aborted.current) {
        return null;
      }

      // 拿到结果后模拟逐字播放，复用既有流式 UI（光标、节流解析）
      let lastParseAt = 0;
      const scheduleParse = (revealed: string, immediate = false) => {
      if (parseTimer.current) {
  clearTimeout(parseTimer.current);
     }
        parseTimer.current = setTimeout(() => {
      lastParseAt = Date.now();
       setState((prev) => ({
            ...prev,
            parsed: parseCard(revealed),
       }));
        }, immediate ? 0 : PARSE_THROTTLE);
      };

      await revealText(
        result.fullText,
   (_chunk, revealed) => {
   if (aborted.current) {
            return;
   }
          setState((prev) => ({
      ...prev,
       status: 'streaming',
     rawText: revealed,
          }));
      scheduleParse(revealed, Date.now() - lastParseAt > PARSE_THROTTLE);
        },
        () => {
     /* 播放完毕，下面统一置为 done */
      },
      );

  if (aborted.current) {
 return null;
      }

      if (parseTimer.current) {
        clearTimeout(parseTimer.current);
      }

      // 结束时强制完整解析一次
      setState({
        status: 'done',
      rawText: result.fullText,
        parsed: parseCard(result.fullText),
        totalTokens: result.totalTokens,
      error: null,
      });
    } catch (err) {
      if (parseTimer.current) {
        clearTimeout(parseTimer.current);
    }
      if (aborted.current) {
        return null;
      }
// 完整错误打进控制台便于排查（界面只展示简化信息）
      console.error('[generate] 失败:', err);
      // 保留已生成的部分内容，仅标记错误状态
      setState((prev) => ({
     ...prev,
 status: 'error',
      parsed: parseCard(prev.rawText),
        error: friendlyError(describeError(err)),
      }));
    }

    return null;
  }, [validateTheme]);

  /** 中止当前生成 */
  const abort = useCallback(() => {
    aborted.current = true;
    if (parseTimer.current) {
      clearTimeout(parseTimer.current);
    }
    setState((prev) => ({ ...prev, status: 'idle' }));
  }, []);

  return { ...state, start, reset, abort, validateTheme };
}