/**
 * 卡片类型定义 —— 数据库 schema 的唯一事实来源
 * 对应集合：aiw_cards
 */

export interface CardPalette {
  /** 卡片背景色，来自 AI 输出的 hex */
  bg: string;
  /** 前景文字色，来自 AI 输出的 hex */
  fg: string;
  /** 强调色，来自 AI 输出的 hex */
  accent: string;
}

export interface CardTokenUsage {
  total_tokens: number;
}

/** 卡片在数据库中的完整形态 */
export interface Card {
  _id: string;
  /** 用户标识，由服务端安全规则注入，客户端不应写入 */
  _openid: string;
  theme: string;
  title: string;
  quote: string;
  palette: CardPalette;
  reflection: string;
  /** 封面图 fileID，可选。无封面图时不存此字段 */
  coverFileID?: string;
  tokenUsage: CardTokenUsage;
  createdAt: Date;
  updatedAt: Date;
}

/** 新建卡片时的输入（不含服务端字段） */
export interface NewCardInput {
  theme: string;
  title: string;
  quote: string;
  palette: CardPalette;
  reflection: string;
  coverFileID?: string;
  tokenUsage: CardTokenUsage;
}

/** 解析器的输出。字段可能因AI 输出不完整而缺失 */
export interface ParsedCard {
  title?: string;
  quote?: string;
  bg?: string;
  fg?: string;
  accent?: string;
  reflection?: string;
  /** 未被任何字段匹配到的剩余文本，便于调试 AI 输出异常 */
  extra: string;
}

/** 分页查询结果 */
export interface PageResult {
  cards: Card[];
  /** 本次查询是否还有后续数据 */
  hasMore: boolean;
}