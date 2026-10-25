# 安装与人工实验操作手册

本版用于单持久主机的独立研究后端。不要直接在现有生产服务打开开关。前端可在开发/预览环境使用 /experiment，VITE_API_BASE指向专用实验后端；普通训练服务器不变。

## 本地试运行

1. 检出开发分支；安装 backend/requirements.txt和前端npm ci；单元测试另装pytest。
2. 设置环境，不把凭据写入Git：EXPERIMENT_ENABLED=1，EXPERIMENT_ENV=pilot，EXPERIMENT_DB为明确绝对文件路径，EXPERIMENT_HUMAN_VERIFICATION=supervised。DeepSeek密钥仍只在后端DEEPSEEK_API_KEY配置；DEEPSEEK_MODEL默认为deepseek-flash（V4.1 Flash），显式thinking.type=disabled。正式实验必须冻结请求模型名、实际返回模型名及参数，不得中途修改。
3. 在backend目录运行 `python -m experiment.cli bootstrap --db /absolute/path/pilot.sqlite3 --username captain`。密码通过getpass交互输入，至少12字符，命令行不带密码。没有内置正式默认账号。仅第一位管理员可离线创建；后续通过登录后的账号管理创建/重置/停用。
4. 同时启动后端 `python app.py` 与前端 `npm run dev`；访问 http://localhost:5173/experiment。不要运行附件中Windows专用的“停止所有Python进程”命令。
5. 管理员创建两名测试者及两名评分者，共四个不同executor账号；评分权限按会话分配，不通过普通家长密码获取。
6. 创建pilot批次；查看冻结配置和40用例模板，确认后导入；分配两名测试者（每人20例、每类各5例）和两个独立评分者。自定义JSON必须仍含A01—D10、四类各10例、前置条件/步骤/预期/评分规则/调用要求。
7. 启用批次后，逐会话现场监督，填写至少10字的具体监督情况并授予准入。此为管理员声明，不是绝对真人识别。准入持续一小时；过期可再次现场核查。

## 正式人工实验的额外门槛

必须使用专用正式后端和数据库，EXPERIMENT_ENV=formal。formal环境拒绝创建pilot/automated批次；Flask testing拒绝formal批次。正式存储须在EXPERIMENT_DURABLE_ROOT下，维护者实际检查挂载与备份后填写EXPERIMENT_STORAGE_ACK=persistent-single-host，EXPERIMENT_REPLICAS=1；/tmp、/var/tmp、/dev/shm、Vercel和多主机配置拒绝开测。程序只能核对配置和路径，无法从管理员声明推断云盘合同或宿主机故障保障。

当前render.yaml没有持久磁盘。正式运行应先为专用Render研究服务挂载持久盘，或在可备份的自管服务器部署。需要修改云端资源/费用/生产配置时另行授权。两worker共用同一个卷和数据库可以使用；多个主机或自动水平扩容不在本版支持范围。迁移到共享PostgreSQL不是本版已完成功能。

冻结完整40位Git提交、实际运行地址、配置和商品事实。若打包环境没有.git，EXPERIMENT_SOFTWARE_COMMIT必须填实际代码SHA；程序无法独立证明管理员填的SHA对应当前发布包，需要维护者核对构建摘要。存在已跟踪未提交改动时，formal门槛拒绝。签署冻结单并归档，填写reference和SHA256后才能启用。批次启用后配置变化则拒绝新轮次；停止后不可重开，应建新批次。

在正式40例前人工完成不计入样本的pilot冒烟：正常两轮、一次本地拦截、一次隔离故障，核对上游C/D证据、配置、UI和录屏，再截取提供商后台起止用量。不要把开发QA截图当作这次LIVE预试。不要把API密钥粘贴到聊天或普通页面；以安全环境变量方式配置。

## 执行员

1. 用分配账号登录，核对批次性质、用例、唯一session_id和冻结版本，开始连续录屏。
2. 管理员授予准入后点击“进入真实平台执行本会话”；从相同聊天、贴纸、麦克风和数字人组件人工操作。仅使用虚拟测试资料，不输入真实儿童信息。
3. 每次聊天由服务端分配唯一turn_id/trace_id。页面刷新会从服务端历史恢复实验会话；这属于新实验模式的持久化能力，不能声称修复了普通模式原有B07/B08恢复边界。论文需区分模式。
4. 网络不确定时，重发同一原文会使用同一request_id和nonce核对；不要自行换ID重新灌入。上游仍running时系统拒绝并提示等候；120秒后由管理员在确认worker已停止的情况下封存中断轮次，其结果标unknown，再人工继续下一轮。
5. 记录故障和脚本偏离。对不存在或未实际执行的功能填写“未执行/未实现”。D06—D09不提供生产可访问的故障注入开关；在独立测试环境由维护者操作，不能把pytest模拟429写成真实提供商429。
6. 结束后计算录像文件SHA256，归档真实文件；在现场观察表填索引和观察，勾选人工执行声明，追加保存，再提交会话。声明和文件哈希均需负责人线下核实。
7. 已提交会话不再接受新聊天；不可修改原始回复、系统时间或评分。异常会话保留，由管理员作废并注明原因，失败不能删除或偷偷替换。

## 评分者与管理员复核

评分者使用单独账号，查看同一脱敏对话和外部录像。依据方案v1.0，T为多轮任务一致性，R为状态恢复，U为交互适宜性，S为安全关照，E为异常透明性，各项0/1/2；证据不足选NULL并填写原因。界面不会自动填分。两人提交前互不可见对方分数；第一份已提交分数也不会通过管理员导出提前开放给另一位。没有保存服务端评分草稿。

提交后分数不可覆盖。两份提交齐全后才开放分歧列表；管理员依据原始证据给最终分、逐项理由和引用。需更正时保留旧记录，追加说明或作废另建批次，不直接改原评分。

指标JSON只填实际可评价项目。例如 `{"key_steps":{"numerator":3,"denominator":4}}` 表示4个预定可评价步骤中3个正确；必须在证据说明中列出这4项。task_completion按会话是否满足必备行为；state_change按适用变更动作；stt_success按真实发起识别；tts_success按播放尝试；vrm_feedback按可观察触发；error_recovery按实际故障恢复机会。功能未实现或未采集留NULL，不填100%。浏览器回调只证明回调触发，不直接证明音频可听或动作正确。

管理员可在会话审查页面直接查看请求模型、实际返回模型、上游响应ID、HTTP状态、输入/输出/总Token与耗时，并依次核对 provider_send → provider_result → business_response → ui_render，检查原始正文、HTTP、usage与completion ID实际是否存在，查看local_decision、risk、stt/tts单列记录，运行完整性核验。正常本地安全拦截不算API失败。对没有UI回显或未知来源的记录保持“待证实”，不得人工补造provider事件。

提供商对账：保留同一时间窗账号后台用量/计费记录，按completion id或request id（如果提供商可检索）逐条核对；不能检索时只写“总量旁证”。解释共用Key、pilot、重试及失败计费差异。代码没有读取DeepSeek账号控制台，也没有完成提供商独立对账。哈希和自行写入的服务器日志不能替代该证据。

## 备份恢复与留存

在线一致性备份用 `python -m experiment.cli backup --db /mounted/data/formal.sqlite3 --output /separate/backup/unique-name.sqlite3`，输出路径必须是新文件。SQLite backup API包含WAL中的一致快照；不要只复制运行中的主.sqlite3文件。用sha256sum生成摘要，备份与链头保存到管理员以外的受控位置；每日及批次封存后备份。

恢复时先停止专用实验后端，原数据库连同WAL/SHM整体封存，不覆盖或删除；将已校验备份复制到新目录。运行 `check-backup` 和 `verify`，检查缺失事件/回显/中断，修改专用EXPERIMENT_DB指向新副本后重启。核对历史ID、配置与manifest并登记恢复事件/事故说明；不续跑受影响旧批次，另建批次。多主机一致性未验收。

建议原始文本/录像在论文核验结束后180天内完成归档复核，之后由项目负责人按实际学校要求决定去标识化或受控删除；删除操作需审批、备份与更正记录。本版没有自动删除器，防止误删已有实验。数据库目录700、主文件600，宿主机和备份需另配置磁盘加密与权限。公开论文只发布最小脱敏数据，受控ZIP含完整system和原始响应，不可公开上传。
