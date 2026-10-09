/**
 * aiGen —— HTTP 版灵感卡片生成云函数
 *
 * ## 为什么需要它（而不是复用 Event 版的 genCard）
 *
 * 前端 `@cloudbase/js-sdk` 的 `app.callFunction()` 走的是「云函数调用」链路，
 * 会经过环境角色策略校验。当前环境的**匿名用户角色**缺少 `FunctionsAccess`，
 * 因此无论 OPA 网关策略怎么放开，Web 端匿名登录后调用云函数始终
 * `PERMISSION_DENIED`。
 *
 * 而**HTTP 访问服务**（`https://<envId>.service.tcloudbase.com/<path>`）是
 * 网关层的另一条链路：路由 `enableAuth=false` 时网关不做身份校验，直接转发到
 * 云函数，**不经过角色策略**。前端用普通 `fetch` 即可，完全绕开权限问题。
 *
 * ⚠️ 代价：该 URL 是免鉴权的公网端点，任何人拿到都能消耗 AI 额度。
 * 个人 Demo 可接受；生产环境应改成 `enableAuth=true` 或加自定义鉴权。
 *
 * ## AI 额度渠道
 *
 * 与 genCard 一致：用 `wx-server-sdk` 的 `cloud.ai()`（属「云开发服务端」，
 * 是「小程序成长计划」允许的调用来源）。Web SDK 直接调用会被拒：
 * `AI_CHANNEL_NOT_ALLOWED`。
 *
 * 部署：`tcb fn deploy aiGen --httpFn --path /aiGen`
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

function json(data, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data),
  };
}

/**
 * 从 HTTP 请求里取出 theme
 *
 * 兼容三种来源：JSON body、query string、form-urlencoded。
 * 云函数 HTTP 事件中 body 恒为字符串；若平台已经解析成对象则直接用。
 */
function readTheme(event) {
  const e = event || {};

  let payload = e.body;
  if (typeof payload === 'string' && payload.trim()) {
    try {
      payload = JSON.parse(payload);
    } catch {
      // 可能是 a=b&c=d 形式
      if (payload.includes('=')) {
        const params = new URLSearchParams(payload);
        payload = Object.fromEntries(params.entries());
      }
    }
  }
  if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  const theme =
    payload.theme ?? e.queryStringParameters?.theme ?? e.query?.theme ?? '';

  return typeof theme === 'string' ? theme.trim() : '';
}

/**
 * HTTP 云函数入口
 *
 * @param event HTTP 请求事件（{ httpMethod, headers, body, queryStringParameters }）
 * @returns {{statusCode: number, headers: Object, body: string}}
 */
exports.main = async (event) => {
  const e = event || {};

  // 预检请求：直接放行
  if (e.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const theme = readTheme(e);

  if (theme.length === 0) {
    return json({ ok: false, error: '请输入一个主题' }, 400);
  }
  if (theme.length < 2) {
    return json({ ok: false, error: '主题至少需要 2 个字符' }, 400);
  }
  if (theme.length > 60) {
    return json(
      { ok: false, error: `主题不超过 60 个字符，当前 ${theme.length}` },
      400,
    );
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

    return json({
      ok: true,
      text: result.text ?? '',
      totalTokens: result.usage?.total_tokens ?? 0,
    });
  } catch (err) {
    // 把真实错误带出去，便于前端展示与排查
    const code = err?.code || err?.errCode || 'UNKNOWN';
    const message = err?.message || String(err);
    console.error('[aiGen] AI 调用失败:', code, message);

    return json({ ok: false, error: `${code}: ${message}` }, 500);
  }
};
