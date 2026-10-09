/**
 * 演示模式数据
 *
 * 用途：在无法调用 AI 的环境下（如小程序成长计划限制 Web SDK 调 AI），
 * 仍能完整体验卡片墙、封面上传、删除等功能。
 *
 * 说明：这些是预置的示例内容，**不来自 AI**。
 * 卡片墙展示、保存、封面、删除走的都是真实逻辑。
 */

/**
 * 演示模式开关
 *
 * 默认开启 —— 当前环境为小程序成长计划，Web SDK 调用 AI 会被
 * `AI_CHANNEL_NOT_ALLOWED` 拒绝，无法真实生成。
 *
 * 升级为资源点套餐、或改用云函数中转后，
 * 把 .env 中 VITE_DEMO_MODE 设为 false 即可切回真实 AI。
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';

/** 预置卡片：覆盖各种配色场景（含深色底，验证可读性兜底） */
const DEMO_CARDS: Array<{
  theme: string;
  title: string;
  quote: string;
  reflection: string;
  palette: { bg: string; fg: string; accent: string };
}> = [
  {
    theme: '城市夜行',
    title: '城市在凌晨三点换了��班',
    quote: '灯光把深夜煮成一碗热汤，喂给还没回家的人',
    reflection: '留意那些24 小时亮着的小店，它们比地铁线路更能说明城市的心跳。',
    palette: { bg: '#2C3E50', fg: '#FDEBD8', accent: '#F2A65A' },
  },
  {
    theme: '旧物',
    title: '旧物的价值在于磨损',
    quote: '一只用旧的杯子，杯沿的缺口是时间的签名',
    reflection: '把「还能用」当成判断标准，会错过很多被时间打磨过的东西。',
    palette: { bg: '#FFF8F0', fg: '#2C2C2A', accent: '#E8613C' },
  },
  {
    theme: '沟通',
    title: '沉默也是一种回答',
    quote: '对方停下话头的那一刻，往往是答案要来了',
    reflection: '急着填满空白会打断对方的组织语言。',
    palette: { bg: '#FDEBD8', fg: '#2C2C2A', accent: '#C74E2E' },
  },
  {
    theme: '深夜进食',
    title: '深夜的胃不看营养表',
    quote: '凌晨两点的烧烤摊，比任何食评都诚实',
    reflection: '能深夜排队的东西，一定有它过人的地方。',
    palette: { bg: '#1A1A1A', fg: '#FFFFFF', accent: '#F2A65A' },
  },
  {
    theme: '注意力',
    title: '专注不是意志力问题',
    quote: '把手机放到另一个房间，比忍住不看不冲突',
    reflection: '环境设计能省下的意志力，应该省下来做重要的事。',
    palette: { bg: '#FFF8F0', fg: '#2C2C2A', accent: '#E8613C' },
  },
  {
    theme: '告别',
    title: '结束也需要仪式',
    quote: '认真告别，才能好好开始下一段',
    reflection: '不告别的离开，会在原地留下一段没说完的话。',
    palette: { bg: '#E8D9C8', fg: '#2C2C2A', accent: '#8B4513' },
  },
];

/**
 * 模拟流式输出
 *
 * 按固定节奏逐块吐出，模拟真实 AI 的打字机效果，
 * 让 UI 的光标、流式渲染、节流解析等逻辑得到真实检验。
 *
 * @param theme 用户输入的主题，会替换首卡的标题内容
 * @param onChunk 逐块回调
 */
export function streamDemoCard(
  theme: string,
  onChunk: (chunk: string, fullText: string) => void,
): Promise<{ fullText: string; totalTokens: number }> {
  // 用用户主题替换第一条的内容，让输入有真实反馈
  const [first, ...rest] = DEMO_CARDS;
  const card = {
    ...first,
    title: theme.trim() || first.title,
    quote: `关于「${theme.trim() || first.theme}」，${first.quote}`,
  };

  // 配色随机取一张，让每次看到的卡片配色不同
  const picked = rest.length > 0 && Math.random() > 0.5 ? rest[0]! : rest[1] ?? first;
  const finalText = [
    `标题：${card.title}`,
    `金句：${card.quote}`,
    `配色背景：${picked.palette.bg}`,
    `配色文字：${picked.palette.fg}`,
    `配色强调：${picked.palette.accent}`,
    `延伸思考：${card.reflection}`,
  ].join('\n');

  return new Promise((resolve) => {
    let fullText = '';
    let index = 0;

    const timer = setInterval(() => {
      // 每次吐2 个字符，模拟逐字输出
      const chunk = finalText.slice(index, index + 2);
      if (!chunk) {
   clearInterval(timer);
        // token 数按字数估算，仅用于展示
        resolve({ fullText, totalTokens: Math.ceil(fullText.length * 1.5) });
        return;
      }

      index += 2;
    fullText += chunk;
      onChunk(chunk, fullText);
    }, 45);
  });
}

/**
 * 首次进入时注入的示例卡片
 *
 * 仅在演示模式下调用一次，让空卡片墙立刻有内容可看。
 */
export function seedDemoCards(): Array<{
  theme: string;
  title: string;
  quote: string;
  reflection: string;
  palette: { bg: string; fg: string; accent: string };
  tokenUsage: { total_tokens: number };
}> {
  return DEMO_CARDS.slice(0, 4).map((c) => ({
    ...c,
    tokenUsage: { total_tokens: Math.ceil((c.title.length + c.quote.length) * 1.4) },
  }));
}