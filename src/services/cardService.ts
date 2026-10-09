import { db } from './cloudbase';
import { PAGE_SIZE } from '../constants/theme';
import { safePalette } from '../utils/color';
import type { Card, NewCardInput, PageResult } from '../types/card';

/**
 * 卡片数据服务
 *
 * 需求 R4/R6/R8：保存、分页查询、删除
 * 安全要点（需求 R8.2）：客户端**不传** `_openid`，由服务端安全规则注入
 */

const COLLECTION = 'aiw_cards';

/**
 * 当前用户身份占位符
 *
 * CloudBase 安全规则要求**前端查询条件必须是规则的子集**——
 * 规则是 `doc._openid == auth.uid`，那么查询就必须显式带上 `_openid` 条件，
 * 否则整条请求会被直接判为 DATABASE_PERMISSION_DENIED（哪怕规则本身没问题）。
 *
 * `'{openid}'` 由服务端替换为当前身份（小程序端为 openid，Web 端为 uid）。
 */
const OWNER_FILTER = '{openid}';

/**
 * 把 CloudBase 返回的错误对象转成可读错误
 *
 * ⚠️ SDK 的读写失败**不抛异常**，而是在返回值里带 `code` / `message`。
 * 早期实现直接吞成"请稍后重试"，导致 DATABASE_PERMISSION_DENIED
 * 这种明确可修的问题被掩盖，排查成本极高。这里保留原始错误码。
 */
function dbError(action: string, result: { code?: unknown; message?: unknown }): Error {
  const code = typeof result.code === 'string' ? result.code : '';
  const message = typeof result.message === 'string' ? result.message : '';

  if (code === 'DATABASE_PERMISSION_DENIED') {
    return new Error(
      `${action}失败：数据库安全规则拒绝了本次请求（DATABASE_PERMISSION_DENIED）。` +
        '请检查集合 aiw_cards 的权限规则与查询条件。',
    );
  }

  if (code) {
    return new Error(`${action}失败：${code}${message ? ` ${message}` : ''}`);
  }

  return new Error(`${action}失败，请稍后重试`);
}

/** 将数据库文档转为前端Card 类型 */
function toCard(doc: Record<string, unknown>): Card {
  const palette = (doc.palette ?? {}) as Record<string, string>;
  return {
    _id: String(doc._id ?? ''),
    _openid: String(doc._openid ?? ''),
    theme: String(doc.theme ?? ''),
    title: String(doc.title ?? ''),
    quote: String(doc.quote ?? ''),
    reflection: String(doc.reflection ?? ''),
    palette: {
      bg: palette.bg ?? '#FDEBD8',
      fg: palette.fg ?? '#2C2C2A',
      accent: palette.accent ?? '#E8613C',
    },
    coverFileID: doc.coverFileID ? String(doc.coverFileID) : undefined,
    tokenUsage: (doc.tokenUsage ?? { total_tokens: 0 }) as { total_tokens: number },
    createdAt: new Date(doc.createdAt as string),
    updatedAt: new Date(doc.updatedAt as string),
  };
}

/**
 * 保存卡片
 *
 * 注意：不传 `_openid`。客户端传入会与服务端注入值冲突，导致安全规则校验失败。
 */
export async function saveCard(input: NewCardInput): Promise<string> {
  const now = new Date();

  // 写入前再次做一次配色安全处理，避免绕过 UI 直接调用
  const palette = safePalette(input.palette.bg, input.palette.fg, input.palette.accent);

  const payload: Record<string, unknown> = {
    theme: input.theme,
    title: input.title,
    quote: input.quote,
    reflection: input.reflection,
    palette,
    tokenUsage: input.tokenUsage,
    createdAt: now,
    updatedAt: now,
  };

  if (input.coverFileID) {
 payload.coverFileID = input.coverFileID;
  }

  const result = await db.collection(COLLECTION).add(payload);

  // CloudBase 的错误以 code 字段返回，不抛异常
  if (typeof result.code === 'string') {
    throw dbError('保存卡片', result);
  }

  return String(result.id);
}

/**
 * 分页查询当前用户的卡片
 *
 * 按创建时间倒序。
 *
 * ⚠️ `where({ _openid })` **不可省略**：CloudBase 会校验「前端查询条件是否为
 * 安全规则的子集」——规则是 `doc._openid == auth.uid`，查询若不带 `_openid`，
 * 会被直接判为 DATABASE_PERMISSION_DENIED（即使规则本身完全正确）。
 * 该条件同时命中 idx_openid_createdAt 索引。
 *
 * @param page 从 0 开始
 */
export async function fetchCards(page: number): Promise<PageResult> {
  const result = await db
    .collection(COLLECTION)
    .where({ _openid: OWNER_FILTER })
    .orderBy('createdAt', 'desc')
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .get();

  if (typeof result.code === 'string') {
    throw dbError('加载卡片', result);
  }

  const cards = (result.data ?? []).map((d) =>
    toCard(d as Record<string, unknown>),
  );

  return {
    cards,
    // 多取一条判断是否还有下一页会被浪费，这里用实际数量判断
    hasMore: cards.length === PAGE_SIZE,
  };
}

/**
 * 删除卡片
 *
 * 使用带条件的 remove()，而非 .doc(id).remove()——
 * 前者会经过安全规则校验（doc._openid == auth.uid），
 * 因此可防止越权删除他人卡片。
 *
 * ⚠️ 同样带上 `_openid`：让查询条件成为安全规则的子集。
 */
export async function deleteCard(id: string): Promise<void> {
  const result = await db
    .collection(COLLECTION)
    .where({ _id: id, _openid: OWNER_FILTER })
    .remove();

  if (typeof result.code === 'string') {
    throw dbError('删除', result);
  }

  if (result.deleted === 0) {
    throw new Error('卡片不存在或无权删除');
  }
}