/**
 * 默认配色与主题常量
 * 依据 requirements.md 设计规范 §4.3
 */

/** 主强调色（暖珊瑚） */
export const ACCENT = '#E8613C';

/** 辅助强调色（蜜橘） */
export const ACCENT_SOFT = '#F2A65A';

/** 页面主导暖底（奶油暖白） */
export const BG_WARM = '#FFF8F0';

/** 次级暖底 */
export const BG_SUBTLE = '#FDEBD8';

/** 正文暖调深灰（非纯黑） */
export const INK = '#2C2C2A';

/** AI 配色不可用时的回退方案 */
export const FALLBACK_PALETTE = {
  bg: BG_SUBTLE,
  fg: INK,
  accent: ACCENT,
} as const;

/**
 * AI System Prompt
 * 要求固定的分隔符格式，而非 JSON ——因为 JSON 在流式过程中不完整，无法增量解析
 *
 * 配色只要求"浅色 + 主题色相"，客户端 safePalette 会再统一调和明度，
 * 因此这里的措辞是为了让 AI 的取向与最终渲染结果一致，而非唯一约束。
 */
export const SYSTEM_PROMPT = `你是一位创意灵感卡片生成器。用户会给出一个主题，请生成一张结构化的灵感卡片。

严格按以下格式输出，不要添加任何额外说明或 Markdown 语法：

标题：<不超过 14 字的标题>
金句：<不超过 40 字的金句>
配色背景：#RRGGBB
配色文字：#RRGGBB
配色强调：#RRGGBB
延伸思考：<不超过 60 字的延伸思考>

要求：
1. 三个颜色值必须是合法的 6 位十六进制色值，如 #E8613C
2. 配色背景必须是**浅色**（明度高的柔和色，如 #E9F0FA / #F3EAD8），禁止深色、暗色
3. 配色文字用与背景同色系的深色，与背景形成强对比，确保清晰可读
4. 配色强调用与主题气质相符的饱和色，用于小面积点缀
5. 三个颜色都要贴合主题气质，整体感觉偏亮、清爽，不要沉闷
6. 内容使用简体中文`;

/** 单页最多加载的卡片数 */
export const PAGE_SIZE = 20;

/** 主题长度限制 */
export const THEME_MIN_LENGTH = 2;
export const THEME_MAX_LENGTH = 60;

/** 封面图大小上限：5 MB */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** 云存储封面图目录 */
export const COVER_PREFIX = 'aiw-covers';

/** 临时链接有效期：1 小时 */
export const TEMP_URL_MAX_AGE = 3600;