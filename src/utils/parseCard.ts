import type { NewCardInput, ParsedCard } from '../types/card';
import { safePalette } from './color';

/**
 * 卡片文本解析器
 *
 * 解析 AI 流式输出的分隔符格式。设计要点：
 * - 允许部分字段缺失（流式中途解析时必然不完整）
 * - 绝不抛异常，任何异常输入都返回可用结果
 * - 收集未匹配文本到extra，便于调试
 */

/** 字段行匹配规则：支持中英文冒号，允许值内含冒号 */
const FIELD_RULES: Array<{ key: keyof ParsedCard; pattern: RegExp }> = [
  { key: 'title', pattern: /^标题\s*[：:]\s*(.+)$/ },
  { key: 'quote', pattern: /^金句\s*[：:]\s*(.+)$/ },
  { key: 'bg', pattern: /^配色背景\s*[：:]\s*(.+)$/ },
  { key: 'fg', pattern: /^配色文字\s*[：:]\s*(.+)$/ },
  { key: 'accent', pattern: /^配色强调\s*[：:]\s*(.+)$/ },
  { key: 'reflection', pattern: /^延伸思考\s*[：:]\s*(.+)$/ },
];

/**
 * 清理字段标签
 *
 * AI 可能返回带 Markdown 标记的形式：
 *   `**标题**：xxx`（加粗）
 *   `# 标题：xxx`（标题/列表标记）
 *   `_金句_：xxx`（斜体）
 * 标记可能出现在标签前、标签后或冒号两侧，因此在匹配前统一剥离。
 */
function stripLabelDecoration(line: string): string {
  return line
    // 去掉冒号左侧的收尾标记，如 `标题**：` → `标题：`
    .replace(/[*_`~]+\s*([：:])/, '$1')
    // 去掉标签前的前导标记，如 `# 标题` / `**金句`
    .replace(/^[*_`~#>\s]+/, '')
    .trim();
}

/**
 * 解析累积的 AI 输出文本
 *
 * @param raw 累积文本，可为流式中途的部分内容
 * @returns 解析结果，字段可能缺失
 */
export function parseCard(raw: string): ParsedCard {
  const result: ParsedCard = { extra: '' };
  if (!raw) {
    return result;
  }

  const unmatched: string[] = [];

  // 按行处理：字段值可能在下一行继续（流式换行未完成）
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripLabelDecoration(lines[i].trim());
    if (!line) {
      continue;
    }

    let matched = false;

    for (const rule of FIELD_RULES) {
      const m = line.match(rule.pattern);
      if (!m) {
        continue;
      }

      let value = m[1].trim();

      // 字段值以「\」结尾表示续行（流式硬换行），合并下一行。
      // 两个片段之间补一个空格，避免英文单词被粘连。
      while (value.endsWith('\\') && i + 1 < lines.length) {
        i += 1;
        const next = stripLabelDecoration(lines[i].trim());
        value = `${value.slice(0, -1).trim()} ${next}`.trim();
      }

      (result as unknown as Record<string, string>)[rule.key as string] = value.trim();
      matched = true;
      break;
    }

    if (!matched) {
      unmatched.push(line);
    }
  }

  result.extra = unmatched.join('\n').trim();
  return result;
}

/**
 * 校验解析结果是否具备可保存的最小字段集
 * 需要标题与金句，其余字段由调用方补默认值
 */
export function isCardComplete(parsed: ParsedCard): boolean {
  return Boolean(parsed.title && parsed.quote);
}

/**
 * 不对外展示的字段标签
 *
 * 配色是 AI 为了渲染卡片底色/字色而自动决定的**内部实现细节**：
 * 用户既不能修改，也不需要知道色值。把它们从展示文本里去掉，
 * 界面只保留用户能感知、能修改的内容（标题 / 金句 / 延伸思考）。
 *
 * 配色本身仍在解析后用于渲染卡片背景（见 safePalette）。
 */
const HIDDEN_LABELS = ['配色背景', '配色文字', '配色强调'];

/**
 * 生成用于界面展示的原文
 *
 * 与 `rawText` 的区别：剔除配色字段所在行。
 * 兼容流式中途状态——标签只输入了一半（如「配色背」）时也会被隐藏，
 * 避免半截标签在界面上闪一下。
 */
export function visibleRawText(raw: string): string {
  if (!raw) {
    return '';
  }

  return raw
    .split('\n')
    .filter((line) => {
      const cleaned = stripLabelDecoration(line.trim());
      if (!cleaned) {
        return true;
      }

      // 冒号左侧即标签部分；未出现冒号时整行都算标签（流式未完成）
      const label = cleaned.split(/[：:]/)[0];

      return !HIDDEN_LABELS.some(
        (hidden) => label.length >= 2 && hidden.startsWith(label),
      );
    })
    .join('\n');
}

/**
 * 将解析结果与 token 用量组装为可保存的卡片数据
 *
 * 配色统一在此处经safePalette 处理，保证入库的颜色一定是可读的：
 * - 缺失或非法的色值回退默认暖色
 * - 对比度不足时按背景亮度重选前景色
 */
export function toNewCard(
  parsed: ParsedCard,
  theme: string,
  tokenUsage: { total_tokens: number },
  coverFileID?: string,
): NewCardInput {
  const palette = safePalette(parsed.bg, parsed.fg, parsed.accent);

  return {
    theme,
    title: parsed.title || theme,
    quote: parsed.quote || '',
    reflection: parsed.reflection || '',
    palette,
    tokenUsage,
    coverFileID,
  };
}