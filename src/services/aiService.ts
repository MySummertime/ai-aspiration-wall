import { app } from './cloudbase';
import { withValidAuth } from './authService';

/**
 * AI 生成服务（经云函数中转）
 *
 * ## 为什么要云函数中转
 *
 * 当前环境属「小程序成长计划」，其 AI 额度**仅限小程序端与云开发服务端**使用。
 * Web 端 `@cloudbase/js-sdk` 直接调用会报：
 * `AI_CHANNEL_NOT_ALLOWED: 小程序成长计划仅支持小程序 SDK 和云开发 SDK 调用`
 *
 * 因此改为：前端 → 云函数（用 wx-server-sdk 的 `cloud.ai()`，属允许来源）→ AI。
 * 云函数侧实现见 `cloudfunctions/genCard/index.js`。
 *
 * ## 代价：无真实流式
 *
 * 云函数一次性返回完整结果，所以**没有真实的打字机流式**。
 * 这是「A 方案」的有意取舍——先跑通链路。
 * 视觉上的逐字效果由 `revealText` 模拟（拿到结果后播放），复用既有流式 UI。
 */

/** Event 型云函数名，需与 cloudfunctions/genCard 对应（仅作降级通道） */
const FUNCTION_NAME = 'genCard';

/**
 * 免鉴权 HTTP 端点（云函数 aiGen）
 *
 * 配置于 .env 的 `VITE_AI_HTTP_URL`。留空则退回 `app.callFunction()`。
 */
const HTTP_URL = (import.meta.env.VITE_AI_HTTP_URL as string | undefined) ?? '';

export interface StreamResult {
  /** 完整的原始文本 */
  fullText: string;
  /** 本次消耗的 token 数量 */
  totalTokens: number;
}

/**
 * 经 HTTP 访问服务调用云函数
 *
 * 与 `app.callFunction()` 的区别：HTTP 访问服务是网关层链路，
 * 路由 `enableAuth=false` 时不校验身份，也不走「角色策略」，
 * 因此不受匿名用户缺少 `FunctionsAccess` 的影响。
 *
 * @throws 网络错误或业务错误
 */
async function generateViaHttp(theme: string): Promise<StreamResult> {
  let res: Response;

  try {
    res = await fetch(HTTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
  } catch (err) {
    // fetch 失败通常是网络/域名问题，带上 URL 便于排查
    throw new Error(`无法连接生成服务（${HTTP_URL}）：${err instanceof Error ? err.message : String(err)}`);
  }

  const raw = await res.text();

  let data: { ok?: boolean; text?: string; totalTokens?: number; error?: string } | null = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // 非 JSON：把原始响应带出去（截断），避免"生成失败，请重试"掩盖真相
    throw new Error(`生成服务返回了非 JSON 响应（HTTP ${res.status}）：${raw.slice(0, 160)}`);
  }

  if (!data?.ok) {
    throw new Error(data?.error || `生成服务调用失败（HTTP ${res.status}）`);
  }

  return { fullText: data.text ?? '', totalTokens: data.totalTokens ?? 0 };
}

/**
 * 调用云函数生成卡片
 *
 * 优先走免鉴权 HTTP 端点；未配置时降级为 `app.callFunction()`。
 *
 * @param theme 用户输入的主题
 * @returns 完整文本与 token 用量
 */
export async function generateCard(theme: string): Promise<StreamResult> {
  // HTTP 通道不依赖登录态，直接返回
  if (HTTP_URL) {
    return generateViaHttp(theme);
  }

  // 用 withValidAuth 包裹：token 过期时自动重登并重试一次，
  // 避免用户长时间挂页面后遇到 ACCESS_TOKEN_EXPIRED
  return withValidAuth(async () => {
  const res = await app.callFunction({
      name: FUNCTION_NAME,
    data: { theme },
    });

    const result = res.result as {
      ok?: boolean;
      text?: string;
      totalTokens?: number;
      error?: string;
 };

    // 云函数以返回值表达业务错误（而非抛异常），此处显式检查
    if (!result?.ok) {
      throw new Error(result?.error || '云函数未返回有效结果');
    }

  return { fullText: result.text ?? '', totalTokens: result.totalTokens ?? 0 };
  });
}

/**
 * 模拟逐字显示
 *
 * 云函数返回是瞬时的，若直接一次性渲染，用户会看到卡片「突然出现」，
 * 缺少「正在生成」的感知。这里在拿到完整文本后模拟逐字播放，
 * 复用既有的流式 UI（光标、节流解析、token 计数）。
 *
 * ⚠️ 这是**视觉模拟**，非真实流式。真实流式需改造云函数为流式返回。
 *
 * @param fullText 完整文本
 * @param onChunk 增量回调
 * @param onDone 播放完毕回调
 */
export async function revealText(
  fullText: string,
  onChunk: (chunk: string, revealed: string) => void,
  onDone: () => void,
): Promise<void> {
  const STEP = 3; // 每次 3 个字符
  const INTERVAL = 40; // 每 40ms 一次

  return new Promise((resolve) => {
    let index = 0;
    let revealed = '';

    const timer = setInterval(() => {
      const chunk = fullText.slice(index, index + STEP);
      if (!chunk) {
        clearInterval(timer);
        onDone();
        resolve();
        return;
      }

      index += STEP;
      revealed += chunk;
      onChunk(chunk, revealed);
    }, INTERVAL);
  });
}