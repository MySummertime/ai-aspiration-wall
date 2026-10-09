/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENV_ID: string;
  readonly VITE_ACCESS_KEY: string;
  /** 演示模式：设为 'false' 时关闭演示数据，改用真实 AI 调用 */
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}