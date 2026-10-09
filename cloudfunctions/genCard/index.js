/**
 * genCard 云函数
 *
 * 存在的原因：当前环境属「小程序成长计划」，其 AI 额度仅允许
 * **小程序端** 与 **云开发服务端** 调用。Web 端 `@cloudbase/js-sdk`
 * 属于被禁来源，会报 AI_CHANNEL_NOT_ALLOWED。
 *
 * 云函数用 `wx-server-sdk` 的 `cloud.ai()`（属"云开发服务端"，在允许来源内），
 * 因此可正常抵扣成长计划的免费额度。
 *
 * ⚠️ 三个关键点（来自官方文档 ai-inspire-plan-guide / wx-server-sdk-access）：
 *
 * 1. 必须用 `wx-server-sdk` ≥ 3.0.5-beta.1（云函数内置，无需安装依赖）。
 *    实测 `@cloudbase/node-sdk` 的 `app.ai()` 在云函数运行时不可用，
 *    故采用官方推荐的 wx-server-sdk。
 *
 * 2. provider 决定额度扣减方式：
 *    - `createModel('cloudbase')` + `model: 'hy3'` → 优先扣免费额度，不足转套餐额度
 *    - `createModel('hunyuan-v3')`               → 仅扣免费额度，耗尽即报错
 *    二者均仅限资源点套餐；当前环境为二期个人版（资源点套餐），符合。
 *
 * 3. `cloud.init` 的 timeout 要给足（AI 生成可能耗时较长）。
 *
 * 前端调用：tcb.callFunction({ name: 'genCard', data: { theme } })
 */

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  timeout: 60000,
});

/** 与前端 SYSTEM_PROMPT 保持一致 —— 唯一事实来源见 src/constants/theme.ts */
const SYSTEM_PROMPT = `你是一位内容创作灵感助手。用户会给你一个主题，请输出结构化的灵感卡片。

严格按以下格式输出，不要添加任何额外说明或 Markdown 装饰：

标题：<不超过 14 字的标题>
金句：<不超过 40 字的金句>
配色背景：#RRGGBB
配色文字：#RRGGBB
配色强调：#RRGGBB
延伸思考：<不超过 60 字>

配色要求：
- 配色背景必须是浅色（明度很高的柔和色），如 #E9F0FA / #F3EAD8，禁止深色、暗色
- 配色文字用与背景同色系的深色，与背景形成强对比，确保清晰可读
- 配色强调用与主题气质相符的饱和色，用于小面积点缀
- 三个颜色都要贴合主题气质，整体偏亮、清爽，不要沉闷

全部使用简体中文。`;

/**
 * 云函数入口
 * @param {{theme: string}} event
 * @returns {{ok: boolean, text?: string, totalTokens?: number, error?: string}}
 */
exports.main = async (event) => {
  const theme = typeof event?.theme === 'string' ? event.theme.trim() : '';

  // 与前端校验保持一致
  if (theme.length === 0) {
    return { ok: false, error: '请输入一个主题' };
  }
  if (theme.length < 2) {
    return { ok: false, error: '主题至少需要 2 个字符' };
  }
  if (theme.length > 60) {
    return { ok: false, error: `主题不超过 60 个字符，当前 ${theme.length}` };
  }

  try {
    const ai = cloud.ai();
    // 'cloudbase' provider：优先消耗成长计划免费额度，不足时转套餐额度
    const model = ai.createModel('cloudbase');

    const result = await model.generateText({
      model: 'hy3',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: theme },
      ],
    });

    return {
 ok: true,
  text: result.text ?? '',
      totalTokens: result.usage?.total_tokens ?? 0,
    };
  } catch (err) {
    // 把真实错误带出去，便于前端展示与排查
    const code = err?.code || err?.errCode || 'UNKNOWN';
    const message = err?.message || String(err);
    console.error('[genCard] AI 调用失败:', code, message);

    return { ok: false, error: `${code}: ${message}` };
  }
};