import { describe, it, expect } from 'vitest';
import { parseCard, isCardComplete, toNewCard } from '../parseCard';

/** 完整且规范的 AI 输出 */
const FULL_OUTPUT = `标题：城市夜行的温度
金句：灯光把深夜煮成一碗热汤
配色背景：#2C3E50
配色文字：#FDEBD8
配色强调：#F2A65A
延伸思考：想想那些在深夜仍亮着的窗口`;

/** 流式中途：只有前几行 */
const PARTIAL_OUTPUT = `标题：城市夜行的温度
金句：灯光把深夜煮成一碗热汤`;

describe('parseCard - 完整格式', () => {
  it('解析全部六个字段', () => {
    const r = parseCard(FULL_OUTPUT);
    expect(r.title).toBe('城市夜行的温度');
    expect(r.quote).toBe('灯光把深夜煮成一碗热汤');
    expect(r.bg).toBe('#2C3E50');
    expect(r.fg).toBe('#FDEBD8');
    expect(r.accent).toBe('#F2A65A');
    expect(r.reflection).toBe('想想那些在深夜仍亮着的窗口');
    expect(r.extra).toBe('');
  });

  it('六个字段全部就绪时判定为完整', () => {
    expect(isCardComplete(parseCard(FULL_OUTPUT))).toBe(true);
  });
});

describe('parseCard - 部分与缺失字段', () => {
  it('流式中途只解析已有字段，不抛异常', () => {
    const r = parseCard(PARTIAL_OUTPUT);
    expect(r.title).toBe('城市夜行的温度');
    expect(r.quote).toBe('灯光把深夜煮成一碗热汤');
    expect(r.bg).toBeUndefined();
    expect(isCardComplete(r)).toBe(true);
  });

  it('空字符串返回全空结果', () => {
    const r = parseCard('');
    expect(r.title).toBeUndefined();
    expect(r.extra).toBe('');
  });

  it('完全无字段格式的文本全部进入 extra', () => {
    const r = parseCard('今天天气不错\n适合出门走走');
    expect(r.title).toBeUndefined();
    expect(r.extra).toContain('今天天气不错');
  });

  it('字段缺失时不判定为完整', () => {
    expect(isCardComplete(parseCard('配色背景：#E8613C'))).toBe(false);
  });
});

describe('parseCard - 格式容错', () => {
  it('兼容英文冒号', () => {
    const r = parseCard('标题: 用英文冒号也能解析');
    expect(r.title).toBe('用英文冒号也能解析');
  });

  it('容忍冒号前后多余空格', () => {
    const r = parseCard('金句：   空格会被去除   ');
    expect(r.quote).toBe('空格会被去除');
  });

  it('保留超长字段值不截断', () => {
    const long = '长'.repeat(200);
    const r = parseCard(`金句：${long}`);
    expect(r.quote).toBe(long);
  });

  it('以反斜杠结尾时合并下一行', () => {
    const r = parseCard('延伸思考：第一行内容 \\\n第二行内容');
    expect(r.reflection).toBe('第一行内容 第二行内容');
  });

  it('忽略空行与纯空白行', () => {
    const r = parseCard('\n\n标题：忽略空行\n\n\n');
    expect(r.title).toBe('忽略空行');
  });

  it('AI 输出 Markdown 前缀时仍能解析', () => {
    const r = parseCard('**标题**：带加粗标记');
    expect(r.title).toBe('带加粗标记');
  });
});

describe('toNewCard', () => {
  it('组装完整卡片数据', () => {
    const p = parseCard(FULL_OUTPUT);
    const card = toNewCard(p, '城市夜行', { total_tokens: 512 });

    expect(card).toEqual({
      theme: '城市夜行',
      title: '城市夜行的温度',
      quote: '灯光把深夜煮成一碗热汤',
      reflection: '想想那些在深夜仍亮着的窗口',
      // 配色经 safePalette 调和：AI 的深蓝底被抬成浅蓝卡片，色相保留
      palette: { bg: '#D0E0F1', fg: '#263340', accent: '#814D18' },
      tokenUsage: { total_tokens: 512 },
      coverFileID: undefined,
    });
  });

  it('标题缺失时用主题兜底', () => {
    const p = parseCard('金句：只有金句');
    const card = toNewCard(p, '兜底主题', { total_tokens: 10 });
    expect(card.title).toBe('兜底主题');
    expect(card.quote).toBe('只有金句');
    expect(card.reflection).toBe('');
  });

  it('携带封面图 fileID', () => {
    const p = parseCard(FULL_OUTPUT);
    const card = toNewCard(p, '主题', { total_tokens: 1 }, 'cloud://env/aiw-covers/a.jpg');
    expect(card.coverFileID).toBe('cloud://env/aiw-covers/a.jpg');
  });
});