import { describe, it, expect } from 'vitest';
import { validateImage } from '../../services/storageService';
import { MAX_COVER_BYTES } from '../../constants/theme';

/** 构造测试用File 对象 */
function makeFile(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  // 覆盖 size 属性（JSDOM 中只读）
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateImage', () => {
  it('接受合法图片', () => {
    const f = makeFile('a.jpg', 'image/jpeg', 1024);
    expect(validateImage(f).ok).toBe(true);
  });

  it.each(['image/png', 'image/webp', 'image/gif', 'image/jpeg'])(
  '接受类型 %s',
    (type) => {
      expect(validateImage(makeFile('x', type, 500)).ok).toBe(true);
    },
  );

  it('拒绝非图片类型', () => {
    const r = validateImage(makeFile('a.pdf', 'application/pdf', 1024));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('图片文件');
  });

  it('拒绝空类型', () => {
    const r = validateImage(makeFile('a', '', 100));
    expect(r.ok).toBe(false);
  });

  it('超过 5 MB 上限时拒绝并给出具体数值', () => {
    const r = validateImage(makeFile('big.png', 'image/png', MAX_COVER_BYTES + 1));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('5 MB');
  });

  it('恰好等于上限时通过', () => {
    const f = makeFile('exact.jpg', 'image/jpeg', MAX_COVER_BYTES);
    expect(validateImage(f).ok).toBe(true);
  });

  it('错误文案包含实际大小', () => {
    const r = validateImage(makeFile('x.png', 'image/png', 8 * 1024 * 1024));
    expect(r.error).toMatch(/\d+\.\d+ MB/);
  });
});