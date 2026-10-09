import { BG_WARM, FALLBACK_PALETTE, INK } from '../constants/theme';
import type { CardPalette } from '../types/card';

/**
 * 配色安全与调和工具
 *
 * AI 直接输出的 hex 有三个问题，本模块负责全部收敛：
 * 1. 格式非法 → 渲染异常
 * 2. 对比度不足 → 文字不可读
 * 3. 色相与明度不可控 → 可能给出**深色卡片**（在暖白页面上显得突兀），
 *    也可能给出**和页面底色几乎一样的卡片**（卡片"消失"在背景里）
 *
 * 因此这里的策略不是"信任 AI 的输出"，而是**只取它的色相**：
 * 把 AI 的色相当作主题的气质线索（深夜偏蓝、田野偏绿），
 * 明度与饱和度则由本模块统一锁定在"浅色卡片"区间内重建。
 * 这样无论 AI 返回什么，卡片都既贴合主题、又一定是浅色、也不会和页面撞色。
 */

/** 合法 6位 hex（含# 前缀） */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** WCAG AA 对正文对比度的最低要求 */
export const WCAG_AA_CONTRAST = 4.5;

/** 页面底色：卡片背景必须与它拉开距离，否则卡片会在页面上"消失" */
const PAGE_BG = BG_WARM;

/** 卡片背景的固定饱和度（%）—— 低到柔和，高到能看出色相 */
const CARD_BG_SATURATION = 55;

/** 卡片背景的起始明度（%）—— 浅色区间，见 buildCardBg */
const CARD_BG_LIGHTNESS = 88;

/** 卡片背景明度允许下调的步长与次数（用于和页面底色拉开距离） */
const CARD_BG_LIGHTNESS_STEP = 3;
const CARD_BG_LIGHTNESS_TRIES = 5;

/** 卡片文字：同色系的深墨，对 88% 明度的底色对比度约 9:1 */
const CARD_FG_SATURATION = 26;
const CARD_FG_LIGHTNESS = 20;

/** 强调色：饱和度拉高才够"鲜活"，明度由 buildAccent 按对比度下探 */
const CARD_ACCENT_SATURATION = 68;
const CARD_ACCENT_LIGHTNESS = 46;

/** 强调色明度允许下调的步长与次数（用于在浅底上达到 AA 对比度） */
const CARD_ACCENT_LIGHTNESS_STEP = 4;
const CARD_ACCENT_LIGHTNESS_TRIES = 6;

/** 强调色明度下限：再深就失去"强调"的意义，且会与正文墨色混同 */
const CARD_ACCENT_MIN_LIGHTNESS = 28;

/**
 * 与页面底色的最小 RGB 欧氏距离。
 * 暖色相的浅色（如米黄）最容易和奶油页面撞色，实测其距离约 35，
 * 因此阈值取 26：足以挡住"几乎同色"，又不会把暖色主题误伤成灰。
 */
const MIN_PAGE_BG_DISTANCE = 26;

/** 判定"有色相"的最低饱和度：低于此值视为灰阶，不拿它当主题线索 */
const CHROMATIC_MIN_SATURATION = 10;

/** 无任何可用色相时（AI 全给灰阶）使用的兜底色相：暖珊瑚 */
const FALLBACK_HUE = 14;

/**
 * 候选前景色，按偏好排序。
 * 暖调深灰在暖白底上最协调，但遇到深色背景会失效，
 * 因此以纯白作为次选，保证任何背景下的文字都可读。
 */
const FG_CANDIDATES = [INK, '#FFFFFF'] as const;

/**
 * 校验并规范化 hex 值
 * @param raw AI 输出的原始值
 * @param fallback 非法时的回退值
 */
export function normalizeHex(raw: string | undefined | null, fallback: string): string {
  if (!raw) {
    return fallback;
  }
  const trimmed = raw.trim();
  return HEX_RE.test(trimmed) ? trimmed : fallback;
}

/** 将 hex 转换为 0-255 的RGB 分量 */
function toRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!HEX_RE.test(hex)) {
    return null;
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * 计算相对亮度（WCAG 2.1 定义）
 * sRGB 分量先做伽马校正转线性，再按权重加权
 */
export function relativeLuminance(hex: string): number {
  const rgb = toRgb(hex);
  if (!rgb) {
    return 0;
  }

  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

/**
 * 计算两个颜色的对比度（WCAG 2.1）
 * 返回值范围 1–21
 */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 为背景色挑选可读的前景色
 *
 * 按候选顺序返回第一个达到 AA 对比度的颜色。
 * 暖调深灰 (#2C2C2A) 优先，因为它与暖色主题最协调；
 * 仅当背景过深时才退让为纯白。
 */
export function readableForeground(bg: string): string {
  for (const candidate of FG_CANDIDATES) {
    if (contrastRatio(bg, candidate) >= WCAG_AA_CONTRAST) {
      return candidate;
    }
  }
  // 理论上不可达：白与黑对任意背景必有一个达标
  return '#FFFFFF';
}

/** 两个颜色的 RGB 欧氏距离，用于判断"是否看起来像同一个色" */
export function rgbDistance(a: string, b: string): number {
  const ra = toRgb(a);
  const rb = toRgb(b);
  if (!ra || !rb) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.hypot(ra.r - rb.r, ra.g - rb.g, ra.b - rb.b);
}

/**
 * hex → HSL
 * @returns h: 0-360，s/l: 0-100；非法输入返回 null
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = toRgb(hex);
  if (!rgb) {
    return null;
  }

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = d / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === r) {
    h = 60 * (((g - b) / d) % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / d + 2);
  } else {
    h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) {
    h += 360;
  }

  return { h, s: s * 100, l: l * 100 };
}

/** HSL → hex（分量超出范围时自动收敛到合法区间） */
export function hslToHex(h: number, s: number, l: number): string {
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const ln = Math.min(100, Math.max(0, l)) / 100;
  const hh = (((h % 360) + 360) % 360) / 60;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = ln - c / 2;

  let rgb: [number, number, number];
  if (hh < 1) {
    rgb = [c, x, 0];
  } else if (hh < 2) {
    rgb = [x, c, 0];
  } else if (hh < 3) {
    rgb = [0, c, x];
  } else if (hh < 4) {
    rgb = [0, x, c];
  } else if (hh < 5) {
    rgb = [x, 0, c];
  } else {
    rgb = [c, 0, x];
  }

  const hex = rgb
    .map((v) => Math.round((v + m) * 255))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

  return `#${hex.toUpperCase()}`;
}

/**
 * 从一批候选色里挑出"主题色相"
 *
 * 取第一个饱和度达标的颜色作为色相来源：灰阶（含纯黑白）没有色相，
 * 拿它做线索只会得到任意颜色，因此直接跳过。
 */
function pickHue(candidates: Array<string | undefined | null>): number | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const hsl = hexToHsl(candidate);
    if (hsl && hsl.s >= CHROMATIC_MIN_SATURATION) {
      return hsl.h;
    }
  }
  return null;
}

/**
 * 构造卡片背景
 *
 * 先按固定浅色参数生成，若与页面底色过近（暖色主题最容易发生），
 * 则逐步下调明度直到拉开距离 —— 宁可稍微深一点的米色，也不要和页面糊成一片。
 */
function buildCardBg(hue: number): string {
  for (let i = 0; i < CARD_BG_LIGHTNESS_TRIES; i += 1) {
    const bg = hslToHex(hue, CARD_BG_SATURATION, CARD_BG_LIGHTNESS - i * CARD_BG_LIGHTNESS_STEP);
    if (rgbDistance(bg, PAGE_BG) >= MIN_PAGE_BG_DISTANCE) {
      return bg;
    }
  }

  const lightest = hslToHex(
    hue,
    CARD_BG_SATURATION,
    CARD_BG_LIGHTNESS - CARD_BG_LIGHTNESS_TRIES * CARD_BG_LIGHTNESS_STEP,
  );
  return lightest;
}

/**
 * 构造强调色
 *
 * 强调色有两个用途，都要满足：作为小字号的标签文字（要求与浅底对比 ≥ AA），
 * 以及作为按钮底色承载近白色文字。两者都靠"加深"来同时满足，
 * 因此从 44% 明度起逐级下探，取第一个达标的色值。
 * 黄色系本身亮度高，需要下探更多级，故设了明度下限兜底。
 */
function buildAccent(hue: number, bg: string): string {
  let candidate = hslToHex(hue, CARD_ACCENT_SATURATION, CARD_ACCENT_LIGHTNESS);

  for (let i = 0; i < CARD_ACCENT_LIGHTNESS_TRIES; i += 1) {
    const lightness = CARD_ACCENT_LIGHTNESS - i * CARD_ACCENT_LIGHTNESS_STEP;
    if (lightness < CARD_ACCENT_MIN_LIGHTNESS) {
      break;
    }
    candidate = hslToHex(hue, CARD_ACCENT_SATURATION, lightness);
    if (contrastRatio(bg, candidate) >= WCAG_AA_CONTRAST) {
      return candidate;
    }
  }

  return candidate;
}

/**
 * 把任意三个色值调和成可用的卡片配色
 *
 * 规则（顺序即优先级）：
 * 1. 背景色相取自 AI 的配色背景（拿不到就退到强调色/文字色），
 *    灰阶色相跳过；全部无色相时用暖珊瑚兜底
 * 2. 背景固定为浅色调（明度 88% 起），并与页面底色保持可辨识距离
 * 3. 文字用同色系深墨，对比度天然达标
 * 4. 强调色保留 AI 的色相，只重设明度饱和度，保证既醒目又可读
 *
 * @param bg AI 输出的背景色（已通过格式校验）
 * @param fg AI 输出的前景色（已通过格式校验）
 * @param accent AI 输出的强调色（已通过格式校验）
 */
export function harmonizePalette(bg: string, fg: string, accent: string): CardPalette {
  const bgHue = pickHue([bg, accent, fg]) ?? FALLBACK_HUE;
  const accentHue = pickHue([accent]) ?? bgHue;

  const safeBg = buildCardBg(bgHue);
  const safeFg = hslToHex(bgHue, CARD_FG_SATURATION, CARD_FG_LIGHTNESS);
  const safeAccent = buildAccent(accentHue, safeBg);

  return {
    bg: safeBg,
    // 兜底：万一主题色相导致对比度不足，退回按亮度挑选的通用墨色
    fg: contrastRatio(safeBg, safeFg) >= WCAG_AA_CONTRAST ? safeFg : readableForeground(safeBg),
    accent: safeAccent,
  };
}

/**
 * 生成安全配色（对外唯一入口）
 *
 * 策略：
 * 1. 三个色值分别做格式校验，非法则回退默认色
 * 2. 交给 harmonizePalette 重建为"浅色 + 主题色相 + 与页面底色可区分"的配色
 *
 * @param bg AI 输出的背景色
 * @param fg AI 输出的前景色
 * @param accent AI 输出的强调色
 */
export function safePalette(
  bg?: string | null,
  fg?: string | null,
  accent?: string | null,
): CardPalette {
  return harmonizePalette(
    normalizeHex(bg, FALLBACK_PALETTE.bg),
    normalizeHex(fg, FALLBACK_PALETTE.fg),
    normalizeHex(accent, FALLBACK_PALETTE.accent),
  );
}
