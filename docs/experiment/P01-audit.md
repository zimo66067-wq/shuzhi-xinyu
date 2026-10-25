# P01 真实代码审计与实施方案

审计基线 a292257，仓库 zimo66067-wq/shuzhi-xinyu。依据本轮上传的第二轮实验方案 v1.0。该文件只记录开发审计，不是正式人工实验结果。未修改 prompts，不读取或复用旧实验数据。

## 当前系统

前端 React 18 / Vite 6 / Three.js / VRM，自定义 navigate 与 pathname 初始化；普通用户资料、消息、历史、配置在 localStorage。家长密码通过 Flask 换取短期 HMAC token；治疗师 PIN 另有前端门控，两者均不能复用作实验身份。前端 Vercel 静态部署，后端 render.yaml 指向新加坡 Render Python Gunicorn 两个 sync worker。当前配置无持久磁盘。没有后端数据库、实验账号或逐轮审计系统。

真实模型路径：ChatPage.sendMessage → POST /api/chat → ai_service.chat → 校验和截断 → prompts 文件和年龄档 → llm_client.call_llm → call_deepseek → requests.post(https://api.deepseek.com/chat/completions)。固定 deepseek-chat，temperature 0.8，max_tokens 500，25秒超时，无自动重试。请求 messages 包含后端系统提示、前端儿童化名/年龄消息和上下文。chat 后处理剥离 STAGE/SCENE 标签。实验复用同一链路，服务端从实验历史构造上下文，不接受浏览器伪造 assistant 历史。

本地分支：无有效消息返回问候；最后用户消息命中注入规则直接拦截；500字符截断、最近20条历史窗口；上游异常返回 FALLBACK_REPLY；前端网络错误显示固定文本。普通 STT 为腾讯云 ASR，TTS 为腾讯云（前端函数名称仍有 Edge 历史命名），TTS 出错后 Web Speech 和模拟音量包络。VRM 位于 /models/xinyu.vrm，加载失败显示占位；口型测试直接朗读固定句，不调用 LLM。声学提示为前端行为。不得把它们计作模型调用。

现有日志仅 logging/print/访问日志与全局 _last_source（并发不可靠）；健康检查仅 ok。评分有进程级缓存，聊天没有已实现的回复缓存或 MOCK 开关。普通请求依赖内存限流，多 worker 不共享。现有 Origin 白名单不构成身份鉴别。

## 实施决定

增加隔离的 /experiment 入口，复用 ChatPage、STT/TTS、VRM；独立 ChatContext、会话和认证，不写普通 localStorage。实验请求仍发 /api/chat，凭实验 Authorization 与服务端一次性令牌进入同一业务函数。普通匿名 /api/chat 不会产生正式实验记录。

后端采用 SQLite WAL、外键、BEGIN IMMEDIATE 事务，支持一个持久主机上的多个 worker；拒绝 Vercel/临时路径/多副本作为正式存储。正式运行须管理员配置可靠持久卷并确认、固定软件SHA与配置。多主机扩容需迁移共享数据库并另行验收，本次不宣称支持。原始证据放同一受控数据库事务内，追加事件哈希链与不可更新触发器；管理员完全控制宿主机时仍可重写整个数据库，外部备份/哈希锚定才能增加独立证据。

实验账号哈希密码、随机短期令牌仅存哈希；角色 admin/executor，评分权限按任务单独分配两人；全流程授权在服务端。正式批次、试运行批次、自动测试数据库分离。40条仅导入未执行方案。默认管理员逐会话监督准入；可选 Turnstile 必须服务端 Siteverify、hostname/action 校验。未在大陆实测可用性，不默认启用。官方服务端校验说明：https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ 。

共享文件修改：backend/llm_client.py（HTTP层上下文审计及线程隔离来源）、backend/ai_service.py（无行为变更的本地来源标记）、backend/app.py（注册隔离模块并装饰原聊天/STT/TTS路由）、frontend/src/App.jsx（独立路径入口）、ChatPage.jsx（可选实验适配）、stt.js/tts.js/usePushToTalk.js（可选请求头与事件回调）。新增 backend/experiment/*、backend/tests/*、frontend/src/pages/Experiment*、frontend/src/lib/experiment.js、docs/experiment/*。不改生产部署配置，不部署、不合并主分支。

风险与准入：无真实DeepSeek/腾讯云密钥，LIVE/声音/麦克风人工验收待配置；无大陆实机网络证据；实际 Render 磁盘未核实；自动测试与模拟HTTP响应只能证明软件分支，不能证明提供商独立真实调用；源码/模型/配置变化须新建批次。已授权增量开发和提交，历史 CLAUDE.md 的旧审批与手动提交约定由本轮明确指令覆盖。
