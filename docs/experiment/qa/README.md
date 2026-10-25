# 隔离自动化QA证据

此目录全部是软件测试证据，不是第二轮人工实验结果。pytest的HTTP上游为Mock；浏览器服务器使用新的临时automated数据库，未配置DeepSeek与腾讯云密钥，只验证诚实回退、拦截、渲染与审计。原始日志未包含密码或密钥，不随公开代码提交服务端日志；Junit、构建结果与截图用于复核开发过程。

复现后端：在项目根执行 `python -m pytest backend/tests -q`，使用隔离依赖环境。

复现浏览器：另装playwright和其Chromium；执行 `python backend/tests/ui_browser_check.py`。可用CHROMIUM_EXECUTABLE指定实际可执行文件，QA_OUTPUT_DIR指定输出目录。脚本会在同一进程网络环境启动Vite5173和Flask5000，临时库与正式数据库无关，不要把它改为生产目标。浏览器QA只创建计划和两个合成轮次，不填真人评分。

本次环境中标准Playwright浏览器下载失败，改用实际Chromium153运行。字体和浏览器二进制只安装于临时QA环境，不加入项目依赖或交付代码。
