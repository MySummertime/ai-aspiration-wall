/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 暖色板 —— 依据 requirements.md 设计规范 §4.3
        'warm-base': '#FFF8F0',   // 主导暖底（奶油暖白）
        'warm-subtle': '#FDEBD8', // 次级暖底
        'warm-line': '#E8D9C8',   // 暖色描边
        accent: '#E8613C',        // 主强调（暖珊瑚）
        'accent-deep': '#C74E2E',// 主强调按下态
        'accent-soft': '#F2A65A', // 辅助强调（蜜橘）
        ink: '#2C2C2A',           // 正文暖调深灰
        'ink-muted': '#888780',   // 次要文字
        success: '#639922',
        danger: '#E24B4A',
      },
      fontFamily: {
        // 字体搭配 —— 依据设计规范 §4.4
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Nunito', 'Trebuchet MS', 'sans-serif'],
        mono: ['Space Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        card: '14px',
panel: '18px',
      },
      keyframes: {
        // 打字机光标闪烁
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        // 新卡入场：轻微上浮+ 淡入
        'card-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
 },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        blink: 'blink 1s step-end infinite',
        'card-in': 'card-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
};