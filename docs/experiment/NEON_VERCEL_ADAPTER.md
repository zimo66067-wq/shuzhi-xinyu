# 数智心屿第二轮实验：Vercel + Neon PostgreSQL 部署与验收

状态：**仅开发/试运行，禁止正式开测**。与原SQLite实现并行，不能混合数据。

## 1. 已完成与限制

- 已在独立测试分支增加 PostgreSQL 存储适配、事务保护和审计哈希链保护。
- 测试Vercel Flask项目此前成功 READY；待用真实Neon专库验证数据库请求。
- 用户Neon组织 Vercel: shuzhi 由Vercel管理。Neon API直接创建数据库项目被禁止；不能绕过限制，更不能写入两个既有的无关数据库。
- 必须通过Vercel Storage / Marketplace 内的 Neon 提供商入口新建专用数据库；免费档需在界面核实。

## 2. 数据库接入步骤（账号所有者操作）

1. 打开 Vercel，选团队 zimo66067，进入 Storage / Marketplace 的 Neon 页面；新建免费实验数据库，建议名称 shuzhi-xinyu-experiment-r2。
2. 将新数据库仅关联隔离项目 shuzhi-xinyu-experiment-vercel-test，不连接任何正式站点。
3. 在该隔离项目的Preview环境设置 EXPERIMENT_DATABASE_URL 为Neon连接池URI，使用HTTPS控制台的加密环境变量，数据库URI须使用TLS。
4. Preview环境另设置 EXPERIMENT_ENABLED=1、EXPERIMENT_ENV=pilot、EXPERIMENT_HUMAN_VERIFICATION=supervised、DEEPSEEK_MODEL=deepseek-flash。
5. 正式实验配置 EXPERIMENT_STORAGE_ACK=neon-postgres-verified 暂勿填写，不要存真实个人信息或队员正式实验数据。

## 3. 技术说明

- 存在 EXPERIMENT_DATABASE_URL 时启用 PgStore，未设置则沿用EXPERIMENT_DB的SQLite路径。
- PostgreSQL采用事务、唯一约束、部分唯一索引和pg_advisory_xact_lock串行化全局审计哈希链，保证并发调用nonce不重放。
- PostgreSQL触发器保护事件、用例、评分和已完成对话不可静默修改。
- 原有模型响应来源分类与逐次Token/response ID审计保留。
- 旧SQLite CLI backup命令不可用于 PostgreSQL。

## 4. 必须实测（未测不得宣布通过）

A. Vercel API健康检查HTTP 200，实验配置接口能正常加载；验证应用登录与Vercel权限隔离。

B. Neon写入 → 断开连接 → 重新连接 → 重新部署函数 → 读回原数据，确保持久性与完整性。

C. 并行提交nonce，确保只有一次消费有效；主动触发回滚和故障恢复；验证事件哈希链、已完成轮次不可修改。

D. 一条真实DeepSeek请求在后端产生上游响应ID、实际模型、HTTP状态、Token用量和耗时，管理员页面与服务端原始事件一致；不得用Mock或本地兜底代替。

E. 导出JSON/JSONL证据和SHA256清单至独立安全存储，实际演练一次恢复；只靠Neon免费版历史保存不是完整备份策略。

F. 确认40次会话两名执行员及两名评分者账号可用，正式批次单独创建，绝不导入自动化测试记录。

## 5. 管理员初始化

在安全、受控终端中，设置 Neon 的 EXPERIMENT_DATABASE_URL 密钥环境变量，然后在backend目录执行：

    python -m experiment.cli bootstrap --username captain
    python -m experiment.cli verify

管理员密码交互式输入。不得在源码、命令行参数、Git提交、终端输出或ChatGPT消息中透露数据库连接串或密钥。

正式环境还需 EXPERIMENT_ENV=formal、EXPERIMENT_STORAGE_ACK=neon-postgres-verified、有效DeepSeek密钥和40位冻结源码提交哈希，并通过人工实验上线验收。

**状态判断：Vercel READY不等于数据库/API真实验收通过。测试分支保持draft，未准许合并main。**
