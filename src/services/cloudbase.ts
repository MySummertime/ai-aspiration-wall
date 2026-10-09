import cloudbase from '@cloudbase/js-sdk';

/**
 * CloudBase SDK 单例
 *
 * 依据 ai-model-web / no-sql-web-sdk skill 的要求：
 * - 同步初始化，使用顶层 import，不做动态加载
 * - 整个应用共享同一个 app 实例
 */

const env = import.meta.env.VITE_ENV_ID as string;
const accessKey = import.meta.env.VITE_ACCESS_KEY as string;

if (!env || !accessKey) {
  throw new Error(
    '缺少 CloudBase 配置：请在 .env 中设置 VITE_ENV_ID 与 VITE_ACCESS_KEY',
  );
}

const app = cloudbase.init({ env, accessKey });

/** 数据库实例 */
export const db = app.database();

/** 认证实例 */
export const auth = app.auth();

/** AI 模型实例 */
export const ai = app.ai();

/** 云存储所需的 app 实例（uploadFile / getTempFileURL / deleteFile） */
export { app };

export default app;