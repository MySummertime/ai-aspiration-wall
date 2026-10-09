import { describe, it, expect } from 'vitest';
import {
  normalizeHex,
  relativeLuminance,
  contrastRatio,
  safePalette,
  harmonizePalette,
  hexToHsl,
  hslToHex,
  rgbDistance,
  readableForeground,
  WCAG_AA_CONTRAST,
} from '../color';
import { BG_WARM } from '../../constants/theme';

describe('normalizeHex', () => {
  it('接受合法 6 位 hex', () => {
    expect(normalizeHex('#E8613C', '#000000')).toBe('#E8613C');
  });

  it('接受小写hex', () => {
    expect(normalizeHex('#e8613c', '#000000')).toBe('#e8613c');
  });

  it('去除首尾空格', () => {
    expect(normalizeHex('  #E8613C  ', '#000000')).toBe('#E8613C');
  });

  it.each([
    ['3 位 hex', '#ABC'],
    ['无# 前缀', 'E8613C'],
    ['8 位hex', '#E8613CFF'],
    ['非法字符', '#GGGGGG'],
    ['中文', '暖橙色'],
    ['CSS 变量', 'var(--accent)'],
    ['rgb 写法', 'rgb(232,97,60)'],
  ])('拒绝%s并回退', (_label, input) => {
    expect(normalizeHex(input, '#FALLBACK')).toBe('#FALLBACK');
  });

  it('空值与 null 回退', () => {
    expect(normalizeHex(undefined, '#FB')).toBe('#FB');
    expect(normalizeHex(null, '#FB')).toBe('#FB');
    expect(normalizeHex('', '#FB')).toBe('#FB');
  });
});

describe('relativeLuminance', () => {
  it('纯白亮度为 1', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('纯黑亮度为 0', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  it('中间灰亮度在 0.2 左右', () => {
    expect(relativeLuminance('#808080')).toBeCloseTo(0.2158, 3);
  });

  it('非法 hex 返回 0', () => {
    expect(relativeLuminance('nope')).toBe(0);
  });
});

describe('contrastRatio', () => {
  it('黑白对比为 21（最大值）', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('同色对比为 1（最小值）', () => {
    expect(contrastRatio('#E8613C', '#E8613C')).toBeCloseTo(1, 5);
  });

  it('深底浅字对比度高', () => {
    expect(contrastRatio('#2C3E50', '#FDEBD8')).toBeGreaterThan(WCAG_AA_CONTRAST);
  });
});

describe('hexToHsl / hslToHex', () => {
  it('往返转换保持一致', () => {
    for (const hex of ['#E8613C', '#0B1026', '#FDEBD8', '#2C3E50', '#FFFFFF']) {
      const hsl = hexToHsl(hex);
      expect(hsl).not.toBeNull();
      expect(hslToHex(hsl!.h, hsl!.s, hsl!.l)).toBe(hex.toUpperCase());
    }
  });

  it('灰阶无色相', () => {
    expect(hexToHsl('#808080')?.s).toBeCloseTo(0, 5);
  });

  it('非法 hex 返回 null', () => {
    expect(hexToHsl('nope')).toBeNull();
  });

  it('色相可识别', () => {
    const night = hexToHsl('#0B1026')!;
    expect(night.h).toBeGreaterThan(200);
    expect(night.h).toBeLessThan(250);
  });
});

describe('rgbDistance', () => {
  it('同色距离为 0', () => {
    expect(rgbDistance('#FFF8F0', '#FFF8F0')).toBe(0);
  });

  it('黑白距离最大（约 441）', () => {
    expect(rgbDistance('#000000', '#FFFFFF')).toBeCloseTo(441.67, 1);
  });
});

describe('safePalette', () => {
  /** 卡片恒为浅色：亮度过低就意味着卡片在暖白页面上"发黑" */
  const isLightCard = (bg: string) => relativeLuminance(bg) > 0.55;

  it('深色主题色被抬成浅色卡片', () => {
    const p = safePalette('#1A1A1A', '#FFFFFF', '#F2A65A');
    expect(isLightCard(p.bg)).toBe(true);
    expect(contrastRatio(p.bg, p.fg)).toBeGreaterThanOrEqual(WCAG_AA_CONTRAST);
  });

  it('保留主题色相：输入深夜蓝 → 输出仍是蓝色系浅卡', () => {
    const p = safePalette('#0B1026', '#F2F6F8', '#E88B4A');
    const bg = hexToHsl(p.bg)!;
    expect(bg.h).toBeGreaterThan(200);
    expect(bg.h).toBeLessThan(250);
    expect(isLightCard(p.bg)).toBe(true);
  });

  it('卡片背景不与页面底色重复', () => {
    const candidates: Array<[string, string, string]> = [
      ['#FFF8F0', '#2C2C2A', '#E8613C'],
      ['#FDEBD8', '#2C2C2A', '#E8613C'],
      ['#F5EFE6', '#333333', '#B87333'],
      ['#FFF3E0', '#333333', '#FF9800'],
      ['#0B1026', '#F2F6F8', '#E88B4A'],
      ['#1A1A1A', '#FFFFFF', '#F2A65A'],
    ];
    for (const [bg, fg, accent] of candidates) {
      const p = safePalette(bg, fg, accent);
      expect(rgbDistance(p.bg, BG_WARM)).toBeGreaterThanOrEqual(26);
    }
  });

  it('灰阶输入也能得到有色相的卡片（用暖色兜底）', () => {
    const p = safePalette('#808080', '#000000', '#999999');
    expect(hexToHsl(p.bg)!.s).toBeGreaterThan(20);
    expect(isLightCard(p.bg)).toBe(true);
  });

  it('强调色保持醒目：与背景对比达标，且能承载白字', () => {
    const p = safePalette('#0B1026', '#F2F6F8', '#E88B4A');
    expect(contrastRatio(p.bg, p.accent)).toBeGreaterThanOrEqual(WCAG_AA_CONTRAST);
    expect(contrastRatio(p.accent, '#FFFFFF')).toBeGreaterThan(3);
  });

  it('高亮色相（黄系）的强调色也会被加深到可读', () => {
    const p = safePalette('#F5E6A8', '#4A3F1B', '#F2C94C');
    expect(contrastRatio(p.bg, p.accent)).toBeGreaterThanOrEqual(WCAG_AA_CONTRAST);
    expect(contrastRatio(p.accent, '#FFFFFF')).toBeGreaterThan(3);
  });

  it('harmonizePalette 可独立调用且结果稳定', () => {
    const a = harmonizePalette('#0B1026', '#F2F6F8', '#E88B4A');
    const b = harmonizePalette('#0B1026', '#F2F6F8', '#E88B4A');
    expect(a).toEqual(b);
  });

  it('readableForeground 按背景亮度挑选', () => {
    expect(readableForeground('#FFF8F0')).toBe('#2C2C2A');
    expect(readableForeground('#1A1A1A')).toBe('#FFFFFF');
  });

  it('无论 AI 输出什么，卡片都是浅色、可读、且不与页面撞色', () => {
    const candidates = [
      ['#FFFFFF', '#FFFFFF'],
      ['#000000', '#000000'],
      ['#FFF8F0', '#FFF8F0'],
      ['#123456', '#654321'],
      ['#FDEBD8', '#FDEBD8'],
      ['#7B1FA2', '#00FF00'],
      ['bad', 'worse'],
    ];
    for (const [bg, fg] of candidates) {
      const p = safePalette(bg, fg, '#E8613C');
      expect(isLightCard(p.bg)).toBe(true);
      expect(contrastRatio(p.bg, p.fg)).toBeGreaterThanOrEqual(WCAG_AA_CONTRAST);
      expect(rgbDistance(p.bg, BG_WARM)).toBeGreaterThanOrEqual(26);
    }
  });
});
