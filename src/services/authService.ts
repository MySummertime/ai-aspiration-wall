import { auth } from './cloudbase';

/**
 * 认证服务
 *
 * 需求 R1：匿名登录，零表单，重复调用不重复登录
 */

let loginPromise: Promise<void> | null = null;

/**
 * 判断当前是否已登录
 *
 * getLoginState() 返回 Promise，因此这里是异步的。
 */
export async function isSignedIn(): Promise<boolean> {
  try {
 const state = await auth.getLoginState();
    return Boolean(state?.user);
  } catch {
    return false;
  }
}

/**
 * 确保已登录（幂等）
 *
 * 多次并发调用共享同一个 Promise，避免重复触发登录。
 * 失败时重置 loginPromise，允许下次重试。
 *
 * @param force 强制重新登录，跳过"已登录"检查。
 *   token 过期时必须为 true —— 因为 `getLoginState()` 可能仍返回
 *   本地缓存的旧用户信息，若不强制重登会误判为已登录而空转。
 */
export function ensureAnonymousLogin(force = false): Promise<void> {
  if (loginPromise) {
    return loginPromise;
  }

  loginPromise = (async () => {
    // 先检查已有会话，避免重复登录；force 时跳过此检查
    if (!force && (await isSignedIn())) {
      return;
    }

    await auth.signInAnonymously();

    if (!(await isSignedIn())) {
   throw new Error('匿名登录后未获取到有效会话');
    }
  })().catch((err: unknown) => {
    // 失败后清空，下一次调用可重试
    loginPromise = null;
 const message = err instanceof Error ? err.message : '登录失败';
  throw new Error(`匿名登录失败：${message}`);
  });

  return loginPromise;
}

/**
 * 确保登录态有效（带重试）
 *
 * ## 为什么需要这个
 *
 * 匿名登录的 access_token 有有效期。页面长时间挂着不刷新时，
 * token 可能已过期，而 `getLoginState()` 仍可能返回本地缓存的用户信息，
 * 导致 `ensureAnonymousLogin()` 误判"已登录"而不重新签发 ——
 * 结果调用云函数时报 `ACCESS_TOKEN_EXPIRED`。
 *
 * 做法：捕获到 token 过期类错误时，清除本地会话并重新匿名登录，
 * 最多重试一次，避免无限递归。
 *
 * @param operation 需要登录态的操作
 */
export async function withValidAuth<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    const code = extractErrorCode(err);
    const message = String(err instanceof Error ? err.message : err);

    const isTokenError =
 code === 'ACCESS_TOKEN_EXPIRED' ||
      code === 'INVALID_TOKEN' ||
    code === 'TOKEN_EXPIRED' ||
   message.includes('Access_token expired');

    if (!isTokenError) {
      throw err;
    }

    // token 过期：清空登录态缓存并重置幂等锁，**强制**重新登录
    try {
      await auth.signOut();
    } catch {
      // signOut 失败不阻断后续重登
    }
    loginPromise = null;

    // force = true：跳过 isSignedIn 检查。
    // 关键 —— getLoginState() 可能返回过期的缓存会话，
    // 若不强制重登，ensureAnonymousLogin 会误判"已登录"直接返回，
    // 于是用同一个过期 token 重试，必然再次失败（死循环）。
    await ensureAnonymousLogin(true);
    return operation();
  }
}

/**
 * 从各种错误形态中提取错误码
 *
 * CloudBase 抛出的错误形态不统一，可能是：
 * - `{ code: 'OPERATION_FAIL', msg: '[ACCESS_TOKEN_EXPIRED] Access_token expired...' }`
 * - `Error('OPERATION_FAIL [ACCESS_TOKEN_EXPIRED] ...')`
 * - 纯字符串
 *
 * ⚠️ 关键：`code` 往往只是外层的通用码（OPERATION_FAIL），
 * **真实错误码在方括号里**（位于 msg / message）。因此必须优先提取方括号内容，
 * 否则永远识别不出具体原因（曾导致 token 自动重试逻辑永不触发）。
 */
function extractErrorCode(err: unknown): string {
  // 先从所有文本形态里找方括号错误码——这是真实原因
  const candidates: string[] = [];

  if (typeof err === 'string') {
    candidates.push(err);
  } else if (err instanceof Error) {
    candidates.push(err.message);
  } else if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.msg === 'string') {
      candidates.push(obj.msg);
    }
    if (typeof obj.message === 'string') {
      candidates.push(obj.message);
    }
    if (typeof obj.code === 'string') {
      candidates.push(obj.code);
    }
    // 有些形态把原文整个放在 detail / errmsg
    for (const key of ['detail', 'errmsg', 'errorMessage'] as const) {
      const v = obj[key];
      if (typeof v === 'string') {
        candidates.push(v);
      }
    }
  }

  for (const text of candidates) {
    const code = extractBracketCode(text);
    if (code) {
      return code;
    }
  }

  // 没有方括号时退回 code 字段
  if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).code === 'string') {
    return (err as Record<string, string>).code;
  }

  return '';
}

/** 从文本中提取 [XXX_ERROR] 形式的错误码 */
function extractBracketCode(text: string): string {
  const match = text.match(/\[([A-Z_]+)\]/);
  return match?.[1] ?? '';
}