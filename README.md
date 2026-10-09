# 灵感卡片墙

输入一个主题，AI 流式生成结构化灵感卡片，保存成可回顾的卡片墙。

基于 **CloudBase（腾讯云开发）** 的单页应用：

- **前端**：静态托管，匿名登录直连云数据库与云存储
- **AI 生成**：经云函数中转（`genCard` 事件型 / `aiGen` HTTP 型），
  当前线上走 `aiGen` 的 HTTP 访问服务端点，绕开匿名用户无云函数权限的限制
- **配色**：AI 只提供色相，明度由客户端统一调和为浅色卡片（见「配色」一节）

---

## 快速开始

### 环境要求

- **conda**（本项目所有 Node 工具链均在 conda env 内，不做全局安装）
- Node.js ≥ 18（本项目在 Node 20 下开发验证）

### 1. 创建并激活 conda 环境

```bash
conda create -n ai-inspiration-wall nodejs=20 -c conda-forge -y
conda activate ai-inspiration-wall

node -v   # v20.x
npm -v    # 10.x

# 部署用的 CloudBase CLI（装进当前 env，不是系统全局）
npm install -g @cloudbase/cli
```

> 已有含 Node 20 的环境（如 `spec-list`）也可直接 `conda activate spec-list` 复用。
> ⚠️ 不要 `brew install node`，不要把 npm 包装进系统目录。

### 2. 安装依赖（一键）

```bash
./scripts/setup.sh      # 也可：npm run setup
```

脚本依次做三件事：

1. `npm ci` 安装前端依赖（严格按 `package-lock.json`，保证换机版本一致）
2. 在 `cloudfunctions/genCard` 与 `cloudfunctions/aiGen` 各装一份 `wx-server-sdk`
   （云端不装依赖，这两份 `node_modules` 必须随代码包上传，故不入库）
3. 若 `.env` 不存在，从 `.env.example` 复制一份

手动分步等价于：

```bash
npm ci
npm run cf:install
cp .env.example .env
```

> 装包时若遇到 `connection refused`，多半是环境里有端口漂移的本地代理：
> 用 `env -u HTTP_PROXY -u HTTPS_PROXY npm install` 直连。

### 3. 配置环境变量

`.env` 文件（已被 `.gitignore` 忽略，**不要提交**）。直接从模板复制后填两项即可：

```bash
cp .env.example .env
```

```ini
VITE_ENV_ID=wechat-program-d8gbjr6963d3c1a0b
VITE_ACCESS_KEY=<Publishable Key>
VITE_DEMO_MODE=false
VITE_AI_HTTP_URL=https://<envId>.service.tcloudbase.com/aiGen
```

| 变量 | 说明 |
|---|---|
| `VITE_ENV_ID` | CloudBase 环境 ID |
| `VITE_ACCESS_KEY` | **必须是 Publishable Key（发布版密钥）**，绝不能是 Secret Key —— 它会被打进前端产物 |
| `VITE_DEMO_MODE` | `true` 时用预置假数据、不调 AI，供无 AI 额度环境演示 |
| `VITE_AI_HTTP_URL` | `aiGen` 的 HTTP 访问服务地址；留空则回退 `callFunction('genCard')`（本环境会被权限拒绝） |

### 4. 本地运行

```bash
npm run dev        # 开发服务器 http://localhost:5173
npm run build   # 生产构建，产物在 dist/
npm run preview    # 预览生产构建
npm test         # 单元测试
```

---

## CloudBase 控制台配置

部署前必须在控制台完成以下三项配置。

### 1. 开启匿名登录

路径：身份认证 → 登录方式 → 开启「匿名登录」

未开启时应用会停在「正在连接 CloudBase」或报错页。

### 2. 创建数据库集合与安全规则

路径：数据库 → 文档型数据库 → 新建集合 `aiw_cards`

**安全规则**（关键，决定用户数据隔离）：

```json
{
  "read": "auth != null && doc._openid == auth.uid",
  "create": "auth != null",
  "update": "auth != null && doc._openid == auth.uid",
  "delete": "auth != null && doc._openid == auth.uid"
}
```

| 规则 | 含义 |
|---|---|
| `auth != null` | 未登录一律拒绝 |
| `doc._openid == auth.uid` | 只能读写自己的记录 |

> ⚠️ **两个已踩过的坑，不要照抄网上常见的写法**：
> 1. **Web 端的身份在 `auth.uid`，不是 `auth.openid`**。Web SDK 匿名登录后
>    `auth.openid` 为空，写 `doc._openid == auth.openid` 会恒为 false，
>    表现为 `DATABASE_PERMISSION_DENIED`。文档里 `_openid` 字段存的正是 uid。
> 2. **`create` 规则里不能用 `doc.*`**（创建时文档还不存在）。用 `write` 键
>    会被 `create` 继承，导致写入一律被拒 —— 必须显式写 `"create": "auth != null"`。

**前端配合**：保存卡片时**不传** `_openid` 字段，由服务端依据登录态自动注入。
若客户端传入，会与服务端注入值冲突导致写入被拒。

**索引**（必需，否则分页查询会全表扫描）：

| 索引名 | 字段 | 顺序 |
|---|---|---|
| `idx_openid_createdAt` | `_openid` → `createdAt` | 升序 → 降序 |

### 3. 开启 AI+ 能力

路径：AI+ → 开启模型能力

本项目使用 `hunyuan-exp` provider 下的 `hunyuan-2.0-instruct-20251111`。

### 4. 配置安全来源

路径：环境设置 → 安全来源 → 安全域名

添加开发与生产域名，否则文件上传会出现 CORS 错误：

```
http://localhost:5173
https://<你的静态托管域名>
```

---

## 部署

所有命令都通过 `scripts/tcb.sh` 执行，它会自动定位当前 conda env 内的 node 与 tcb，
并按 `.env` 里的 `VITE_ENV_ID` 补上 `-e` 参数，因此换机器不用改脚本里的路径。

```bash
# 首次：登录（凭证存在 ~/.cloudbase，不入库）
./scripts/tcb.sh login

# 静态托管
npm run build
npm run deploy:hosting

# 云函数（--force 必需：同名函数会交互式询问是否覆盖，非交互环境下会挂住）
npm run deploy:aiGen
npm run deploy:genCard
```

等价的手写命令：

```bash
./scripts/tcb.sh hosting deploy ./dist
./scripts/tcb.sh fn deploy aiGen --dir ./cloudfunctions/aiGen \
  --path /aiGen --runtime Nodejs20.19 --install-dependency false --force
```

> ⚠️ 使用 `tcb hosting deploy`，**不要用** `tcb deploy`。
> ⚠️ 云函数部署必须带 `--install-dependency false` 且本地已有 `node_modules`
> （`npm run cf:install`），否则会用云端安装那条路径，实测会长时间无输出。
> ⚠️ 部署 `aiGen` 时**不要加 `--httpFn`**：会触发 `Create scf_bootstrap` 交互提示而卡死；
> 用 `--path /aiGen` 让 CLI 顺带创建 HTTP 访问服务路由。

部署后：

- 静态站点：`https://<envId>-<id>.tcloudbaseapp.com/`
- AI 端点：`https://<envId>.service.tcloudbase.com/aiGen` —— 填入 `.env` 的 `VITE_AI_HTTP_URL`

> 该端点是**免鉴权**公网地址，谁拿到都能消耗 AI 额度。个人 Demo 可接受，
> 对外使用前应在控制台把路由的鉴权打开。

**CDN 缓存**：静态托管更新后有数分钟缓存，验证时给链接加随机 query 参数绕过缓存。

---

## 项目结构

```
src/
├── main.tsx                    # 入口，SDK 初始化
├── App.tsx                 # 主编排：状态协调、登录态、保存与删除流程
├── types/card.ts                # 类型定义（数据库 schema 唯一事实来源）
├── constants/theme.ts           # 设计 token、System Prompt、分页与限制常量
├── services/
│   ├── cloudbase.ts             # SDK 单例（db / auth / ai / app）
│   ├── authService.ts        # 匿名登录（幂等）
│   ├── aiService.ts             # 流式生成
│   ├── cardService.ts           # 数据库 CRUD
│   └── storageService.ts        # 云存储上传/临时链接/删除
├── hooks/
│   ├── useCardStream.ts      # 流式状态机 + 300ms 节流解析
│   └── useCardWall.ts           # 分页加载 + IntersectionObserver
├── utils/
│   ├── parseCard.ts             # AI 输出解析器
│   ├── color.ts             # 配色安全（格式校验 + WCAG 对比度）
│   └── __tests__/               # 单元测试
├── components/
│   ├── InputBar/             # 左上悬浮输入区
│   ├── CardPreview/          # 流式预览（含打字机光标 + 封面上传）
│   ├── CardWall/             # 瀑布流容器 + 分页
│   ├── CardItem/             # 单卡（配色背景 + 封面 + 删除入口）
│   ├── CoverUploader/        # 封面选择与进度
│   ├── ConfirmDeleteModal/   # 删除二次确认
│   └── EmptyState/
└── styles/index.css    # Tailwind + 噪点纹理 + 暖色光斑
```

## 技术架构

```
浏览器 (Web)
   │  匿名登录 + 读写数据库 + 文件上传
   ▼
CloudBase ──────────────────────────────┐
   │                                │
   │ callFunction(genCard)            │ 静态托管
   ▼            │
 genCard 云函数                      │
   │  wx-server-sdk cloud.ai()       │
   ▼                                │
 AI 模型 (hy3)  ────────────► 回传结果到浏览器
（消耗成长计划免费额度）              │
   │                                ▼
   └──► 数据库 aiw_cards  ◄───── 卡片墙渲染
```

### ⚠️ 为什么必须经云函数中转

当前环境属「小程序成长计划」，其 AI 额度**仅限小程序端与云开发服务端**使用：

| 来源 | 是否允许 |
|---|---|
| 小程序端 `wx.cloud.extend.AI` | ✅ |
| 云函数 / 云托管（`wx-server-sdk`） | ✅ |
| **Web 端 `@cloudbase/js-sdk`** | ❌ `AI_CHANNEL_NOT_ALLOWED` |
| 第三方 API / 直接 HTTP | ❌ |

本项目是纯 Web 应用，因此**必须**经云函数中转。云函数属"云开发服务端"，在允许来源内。

### provider 与模型的搭配

云函数内调用 AI 时，provider 决定额度扣减方式：

| provider | 模型 | 免费额度 | 套餐额度 |
|---|---|---|---|
| `cloudbase` | `hy3` | 优先消耗 | 不足时消耗 |
| `hunyuan-v3` | `hy3` | 仅消耗 | 不支持 |

本项目用 `createModel('cloudbase')` + `model: 'hy3'`，优先消耗成长计划免费额度。
（`hunyuan-v3` 在免费额度耗尽后直接报错，不够友好。）

**注意**：`wx-server-sdk` 需 ≥ `3.0.5-beta.1` 才有 `cloud.ai()`。
`@cloudbase/node-sdk` 虽有 `app.ai()`，但实测在云函数运行时不可用。

### 关于流式

云函数一次性返回完整结果，**没有真实的打字机流式**。
前端 `revealText()` 在拿到结果后模拟逐字播放，复用既有的流式 UI（光标、节流解析）。
若要真实流式，需将云函数改为流式返回（SSE）并调整前端，复杂度较高。

---

## 云函数

`cloudfunctions/genCard/index.js`

| 项 | 值 |
|---|---|
| 运行时 | Node.js 20 |
| 超时 | 30s（`cloud.init` 内设60s） |
| 内存 | 512 MB |
| 依赖 | `wx-server-sdk@3.0.5-beta.1` |

前端调用：

```js
await app.callFunction({ name: 'genCard', data: { theme } });
```

返回结构：

```js
// 成功
{ ok: true, text: '标题：...\n金句：...', totalTokens: 249 }
// 失败
{ ok: false, error: 'CODE: message' }
```

部署：

```bash
./scripts/tcb.sh fn deploy genCard
```

> 重复部署需确认覆盖：`printf 'y\n' | ./scripts/tcb.sh fn deploy genCard`

### 1. AI 输出解析用分隔符，不用 JSON

System Prompt 要求模型输出：

```
标题：<不超过 14 字>
金句：<不超过 40 字>
配色背景：#RRGGBB
配色文字：#RRGGBB
配色强调：#RRGGBB
延伸思考：<不超过 60 字>
```

**原因**：JSON 在流式过程中不完整，无法增量解析。分隔符格式允许边生成边提取已完成字段。

解析器还处理了：Markdown 装饰（`**标题**：`）、英文冒号、续行合并（`\`结尾）。

### 2. 配色：只取 AI 的色相，明度由客户端锁定

AI 返回的三个 hex 不再被直接使用，`safePalette()` → `harmonizePalette()` 会重建一遍：

1. **格式非法** → `/^#[0-9a-fA-F]{6}$/` 校验，非法回退默认暖色
2. **色相**取自 AI 的配色背景（灰阶跳过，退到强调色/文字色，全灰则暖珊瑚兜底）——
   这是唯一保留的 AI 意图，也是"融入主题"的来源
3. **背景**固定为 `S 55% / L 88%` 的浅色调。深色卡在暖白页面上发黑，
   所以**卡片永远不会是深色**
4. **不与页面底色重复**：与 `#FFF8F0` 的 RGB 距离小于 26 就逐级下调明度
   （暖色主题最容易和奶油底撞色）
5. **文字**＝同色相 `S 26% / L 20%` 的深墨，对比度约 9:1
6. **强调色**＝AI 强调色的色相 + `S 68%`，从 `L 46%` 按 4% 下探，
   取第一个与浅底对比 ≥ 4.5 的色值，让标签小字与按钮白字同时达标

示例：深夜蓝 `#0B1026` → 月光蓝 `#D0D6F1`；草绿 → 薄荷绿 `#D0F1D0`。

**这保证任何 AI 产出都不会产生深色卡片、不可读文字，或与页面糊成一片。**

### 3. `uploadFile` 的 filePath 传 File 对象

**注意**：`cloud-storage-web` skill 的参数表注释写"HTML file input element"，
但其官方示例代码传的是 `fileInput.files[0]`，且 SDK 运行时走
`FormData.append("file", filePath)`——FormData 只接受 Blob/File。

**结论：应传 File 对象**。SDK 的 TS 声明 `filePath?: string` 与实际用法不符，
代码中做了类型转换。

### 4. 删除流程的顺序

先删数据库记录 → 立即更新 UI → 再删封面文件。

- 封面删除失败**不阻塞**已完成的删除，仅 `console.error` 记录
- 数据库删除失败时卡片保留在墙上并提示用户
- `deleteCard` 用 `.where({_id}).remove()` 而非 `.doc(id).remove()`，
  前者会经过安全规则校验，可防止越权删除他人卡片

### 5. 客户端不传 `_openid`

所有数据隔离依赖数据库安全规则（服务端执行）。前端显式查询条件用于效率，
规则用于防御，二者缺一不可。

---

## 验收清单

部署后逐项验证：

- [ ] 打开页面自动完成匿名登录，无登录表单
- [ ] 输入 2–60 字主题，可生成；少于 2 字或超 60 字有明确提示
- [ ] 流式逐字输出，预览区有打字机光标，显示 token 消耗
- [ ] 生成的卡片背景为 AI 配色，文字始终清晰可读
- [ ] 选择封面图：类型/大小校验生效，上传有进度条，可移除
- [ ] 不选封面也能正常保存
- [ ] 保存后卡片出现在卡片墙顶部（最新卡片有轻微旋转）
- [ ] 滚动到底部自动加载下一页，加载完毕显示结束提示
- [ ] 删除需二次确认，删除后卡片与封面同时消失
- [ ] 临时链接过期或图片加载失败时回退配色背景，不显示破图
- [ ] 刷新页面后卡片墙数据仍在

### 必测安全项

- [ ] **越权测试**：用户 A 无法读取用户 B 的卡片
- [ ] **越权测试**：用户 A 无法删除用户 B 的卡片

验证方式：在无痕窗口生成一张卡片（用户 B），再用另一个窗口/账号尝试直接
按 `id` 删除或查询，应被拒绝。

---

## 后续迭代

当前不在范围内：

- AI 生成封面图（需经云函数使用 Node SDK，Web SDK 不支持生图）
- 卡片编辑功能
- 分享与协作
- 微信小程序端（`wx.cloud` 集成，架构已预留）

---

## 版本管理与协作（GitHub）

### 首次推送

```bash
cd ai-inspiration-wall

# 1. 在 GitHub 网页新建一个**空**仓库（不要勾选 README / .gitignore / License）
# 2. 关联并推送（SSH）
git remote add origin git@github.com:<你的用户名>/ai-inspiration-wall.git
git branch -M main
git push -u origin main
```

装了 `gh` 也可以一条做完：`gh repo create ai-inspiration-wall --private --source=. --remote=origin --push`。

> 建议设为 **Private**：`.env` 虽已忽略，但环境 ID 与端点地址属于基础信息。

### 换一台机器接手

```bash
git clone git@github.com:<你的用户名>/ai-inspiration-wall.git
cd ai-inspiration-wall

conda create -n ai-inspiration-wall nodejs=20 -c conda-forge -y
conda activate ai-inspiration-wall
npm install -g @cloudbase/cli

./scripts/setup.sh          # npm ci + 云函数依赖 + 生成 .env
# 填入 .env 里的 VITE_ENV_ID 与 VITE_ACCESS_KEY

npm run dev                 # 本地开发
npm test                    # 单元测试
```

要部署的话再补一步登录（凭证在 `~/.cloudbase`，不入仓库）：

```bash
./scripts/tcb.sh login
npm run deploy:aiGen
npm run build && npm run deploy:hosting
```

### 入库边界

| 入库 | 不入库（已在 `.gitignore`） |
|---|---|
| `src/`、`cloudfunctions/*/index.js`、配置文件 | `.env`（含 Publishable Key） |
| `package-lock.json`（`npm ci` 换机一致性的前提） | `node_modules/`（含云函数依赖，约 40MB） |
| `.env.example`（模板） | `dist/`、`*.tsbuildinfo` |
| `cloudbaserc.json`（只含环境 ID 与函数配置，非密钥） | `~/.cloudbase` 的登录凭证（在用户目录，不在仓库内） |

## 技术栈

React 18 · Vite 5 · TypeScript 5.6 · Tailwind CSS 3.4 · Zustand 4 · @cloudbase/js-sdk · lucide-react · Vitest