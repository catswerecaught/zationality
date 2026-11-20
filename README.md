# Zationality

知乎 × Rationality。一个本地运行的问答论证与现实核查工作台，为「知乎 AI 黑客松 · AI × 知识与探索」制作。

## 部署到自己的电脑

这是一个运行在本机的全栈应用。每位使用者都需要自行准备 Node.js、知乎官方 CLI 和自己的知乎凭证，以及自己的 DeepSeek API Key。项目不包含、不代管这些凭证，也不会把它们发给 GitHub。

### 1. 安装运行环境

- 安装 Node.js 22 或更高版本（包含 npm）：<https://nodejs.org/>
- 安装知乎官方 `zhihu-cli`。CLI 不包含在本项目中；请按照知乎官方 CLI / Zhihu Skill 提供的安装说明安装适用于自己系统的版本。官方支持 macOS、Windows 和 Linux。
- 打开 <https://developer.zhihu.com/profile>，登录自己的知乎账号并按官方说明配置 CLI 凭证。凭证由 CLI 保存和使用；不要把 Access Secret 发给项目作者或写入项目文件。
- 准备 DeepSeek API Key：<https://platform.deepseek.com/>。每位使用者使用自己的 Key，并仅配置在下面的服务端环境文件中。

可以先在终端确认 Node/npm 可用：

```sh
node --version
npm --version
```

### 2. 下载项目并安装依赖

macOS / Linux 终端：

```sh
git clone https://github.com/catswerecaught/zationality.git
cd zationality
npm ci
```

Windows PowerShell：

```powershell
git clone https://github.com/catswerecaught/zationality.git
Set-Location zationality
npm ci
```

### 3. 配置本机密钥

在项目根目录复制环境变量模板。

macOS / Linux：

```sh
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

用文本编辑器打开 `.env.local`，至少填写自己的 DeepSeek Key：

```dotenv
DEEPSEEK_API_KEY=在这里填写自己的DeepSeek_API_Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
PORT=3001
```

不要添加引号，不要在 `src/` 前端代码中填写 Key，也不要提交 `.env.local`。Git 忽略规则已排除 `.env.local`。若 `zhihu-cli` 没安装在程序默认位置，在同一文件里增加它的绝对路径，例如：

```dotenv
ZHIHU_CLI_PATH=/你的/CLI/绝对路径/zhihu-cli
```

Windows 路径示例：`ZHIHU_CLI_PATH=C:\\Users\\你的用户名\\...\\zhihu-cli.exe`。如果官方 CLI 使用其他文件名或安装目录，以实际路径为准。

### 4. 启动开发版

在项目根目录运行：

```sh
npm run dev
```

保持终端窗口运行，然后浏览器访问 <http://127.0.0.1:5173>。开发 API 地址是 <http://127.0.0.1:3001>；可以打开 <http://127.0.0.1:3001/api/health> 检查服务。正常时 `ok` 为 `true`，并且 `deepseek_configured`、`zhihu_cli_installed` 都为 `true`。

### 5. 运行本地生产构建（可选）

```sh
npm run build
npm start
```

然后访问 <http://127.0.0.1:3001>。停止开发版或生产版都可以在运行它的终端按 `Ctrl+C`。

### 常见问题

- **提示未配置 DeepSeek Key：** 确认 `.env.local` 位于项目根目录、变量名为 `DEEPSEEK_API_KEY`，并重启服务。
- **提示知乎 CLI 不可用：** 确认已安装 CLI 并完成知乎授权；如果 CLI 不在默认目录，在 `.env.local` 设置正确的 `ZHIHU_CLI_PATH` 后重启。
- **依赖或语法报错：** 检查 `node --version` 是否为 22 或更高，再运行 `npm ci`。
- **页面无法连接 API：** 开发时两个服务都由 `npm run dev` 启动；确认终端没有报错，且没有其他程序占用 5173 或 3001 端口。

本应用默认只监听本机回环地址 `127.0.0.1`，供安装者自己的电脑使用，不是公网部署。`.env.local`、知乎凭证和本地报告数据不会随 GitHub 仓库分发。

## 现场演示

1. 输入「喝无糖饮料真的有助于减肥吗？」或点击热榜。默认召回 5 条，候选数可选 4–10 条；知乎搜索单页最多 10 条，过滤文章、问题、空摘要、重复回答后，实际有效数量可能更少。
2. 默认打开「演示缓存」：完全匹配问题、候选数、问题链接、模型和流水线版本时回放既有真实报告；首次查询仍执行真实分析。历史报告保留原核查时间，不宣称重新验证。
3. 关闭缓存可再次实际分析。观察流式召回、拆解、取证、评分进度。
4. 在单列结果中查看可信度 Top 3，每条回答直接标注「原排名 → 现排名」，同时展示通过项与风险标签。
5. 药丸输入框在提交后平滑移至上方，结果随后入场。展开「来源与诊断」，查看三维高亮、分段分数、前提条件、逐条事实核查和可点击的证据。
6. 点击原文链接回到知乎；右侧按钮平滑展开来源与诊断。侧边栏「分析记录」支持一键回放已完成的真实报告。

真实报告保存在 `data/reports/`，这是明确的演示缓存功能，不是请求日志。此目录及凭证已被 Git 忽略。没有预置或伪造的知乎回答、作者、点赞数、来源链接或评分。

## 实现

- 前端：React 19、TypeScript、Vite 6、Tailwind CSS 4、Lucide；浅色/深色、响应式、键盘快捷键、无阴影与悬停位移动画；主题色 #1084FE，浅色背景 #F9F8F7、线条 #FEFEFC，深色背景 #1E1D1D、线条 #383836。
- 后端：Express、官方知乎 CLI 子进程（无 shell 拼接）、DeepSeek 官方 Chat Completions API。
- 召回：关键词调用 `search zhihu`，保留默认位置，筛选回答；问题 URL / 热榜问题调用 `question answers`。后者没有作者、点赞字段时明确显示未提供。不同关键词可能跨问题召回回答，页面不会假装这些回答来自同一问题。
- Step A：Flash 输出核心结论、明确前提、最多两个客观事实。
- Step B：每个事实仅使用已安装的知乎 Skill 官方 CLI `search global` 检索外部证据。已停用并移除 DeepSeek 联网工具调用。
- Step C：Flash 读取知乎全网搜索返回的证据，使用 `response_format: {type: "json_object"}` 输出诊断，以 Zod 校验分数、标签、高亮及引用。每条回答仅调用两次模型：拆解与评分；模型请求不携带任何联网工具。
- 每次最多 3 条候选回答并发；知乎请求并发最多 2，模型请求并发最多 3。取消请求会中止进行中的请求；不自动重试消耗额度的模型请求。
- 综合分由后端固定计算：`round((0.4*logic + 0.4*reality + 0.2*boundary)*10)/10`，同分保持默认顺序。点赞、原排名、作者声望与发布时间不进入模型评分输入。
- 失败回答保留默认对照位置、不评分、不进入可信榜。可用结果少于 3 时如实展示。
- 只有匹配原文的精确连续引文才会被高亮；不存在的证据 ID 会被删除；全部事实未核实或无客观事实时现实分最高 50。每份报告显示局限性。
- 额度接口按需刷新、15 秒复用；热榜缓存 5 分钟。无静默假数据回退。

## API

- `GET /api/health`：服务端配置状态（不含密钥）
- `GET /api/hot`：实时知乎热榜
- `GET /api/quota`：知乎搜索、全网搜索、热榜当日额度
- `POST /api/analyze`：`{ query: string, count: 4..10, use_cache: boolean, question_url?: string }`；返回 SSE 的 `progress`、`result` 或 `error`。
- `GET /api/reports`：本地报告索引
- `GET /api/reports/:id`：历史真实报告

结果包含 `default_top3`、`credible_top3`、`all_results`、失败记录、来源、事实核查、高亮与核查时间。

## 重要的数据边界

官方公共搜索 API 返回**摘要/片段**，问题回答接口也仅返回摘要。其他用户的回答全文不在当前开放接口能力内。因此展开区明确称「来源片段」，不把片段冒充全文。完整回答通过知乎原文链接阅读。默认对照是**服务端返回顺序**，不是重构的点赞排序。

报告是阅读辅助与模型诊断，分数不是正确概率，不代表作者整体可信度。外部搜索片段也可能不完整；未验证不等于失实。模型支持的证据匹配仍有误判可能，最终判断必须结合原文与一手来源。

## 检查

```sh
npm test
npm run build
```

测试覆盖固定权重、真实默认位置、失败隔离、证据 ID、无法核实的现实分限制、原句匹配、排序稳定性、输入范围、来源 URL、DeepSeek 请求不启用联网工具，以及流式响应的完整性。

搜索策略已升级到 v1.1.0，缓存键与旧版本隔离。历史报告保留原核查依据；回放历史报告不会触发任何搜索调用。

知乎官方 Skill：`~/.codex/skills/zhihu/`。
