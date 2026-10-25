# 数智心屿第二轮实验系统交付索引

本次为独立开发分支，不是生产部署或第二轮人工实验结果。正式实验的 LIVE 准入须完成真实密钥、持久卷、现场监督和实际运行验收。40个会话是计划样本，不能当作40次API调用。测试数据均为隔离的 synthetic QA。

| 材料 | 文件 |
| --- | --- |
| 基线架构、调用链、风险、修改计划 | [P01-audit.md](P01-audit.md) |
| 实验与审计架构、数据库、字段、导出 | [architecture-and-schema.md](architecture-and-schema.md) |
| 安装、账号、执行、评分、审核、备份恢复 | [operations.md](operations.md) |
| 自动化限制、证明边界、已知局限 | [controls-and-limitations.md](controls-and-limitations.md) |
| 验收结果与尚未完成项 | [acceptance.md](acceptance.md) |
| 40个用例及空结果模板 | [cases_r2.json](../../backend/experiment/cases_r2.json)、[blank-records.csv](blank-records.csv) |
| 自动化测试 | [backend/tests](../../backend/tests) |

普通模式默认不启用实验数据库；配置 EXPERIMENT_ENABLED=1 后才注册实验API。前端访问 /experiment，普通训练仍使用根路径。实验角色与家长、治疗师的既有登录完全分开。
