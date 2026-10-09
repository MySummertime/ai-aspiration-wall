/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // storageService 测试会间接引入 CloudBase SDK，
    // 它依赖浏览器全局对象 window，因此统一使用 jsdom 环境。
    // 纯函数测试（parseCard / color）不依赖 DOM，在 jsdom 下同样可运行。
    environment: 'jsdom',
  },
});