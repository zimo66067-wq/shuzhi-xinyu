# 数智心屿 · 阿里云部署手册

> 适用：Ubuntu 22.04 LTS 阿里云轻量应用服务器
> 目标：3 条命令完成部署
> 工作量：买完服务器后 30-60 分钟（备案另算）

---

## 0. 你需要准备的东西

| 项 | 说明 | 必需 / 可选 |
|---|---|---|
| **阿里云轻量服务器** | 1 核 2G 即可，建议杭州/上海地域 | ✅ 必需 |
| **服务器密码** | 在阿里云控制台 → 实例 → 重置密码 | ✅ 必需 |
| **公网 IP** | 控制台显示的服务器公网 IP | ✅ 必需 |
| **域名** | 阿里云万网买 `.com` 约 ¥55/年 | ⚠️ 强烈建议（不上 HTTPS 浏览器禁止使用麦克风）|
| **ICP 备案** | 国内主机用域名必须备案，7-15 工作日 | ⚠️ 用域名必需 |
| **`xinyu.vrm` 模型** | 桌面上你 VRoid 导出的那个 .vrm（18MB）| ✅ 必需 |
| **三方 API key** | DeepSeek + 腾讯云（已在本地 `.env`） | ✅ 必需 |

---

## 1. 服务器初始化（10 分钟）

### 1.1 SSH 连上服务器

在你的 Windows 终端：

```powershell
ssh root@你的服务器IP
```

第一次问 yes/no → 输 `yes` → 输入你设的密码（输入时屏幕不显示，正常打就行）。

### 1.2 防火墙开放端口

回到阿里云控制台 → 实例 → **防火墙** → 添加规则：

| 端口 | 协议 | 用途 |
|---|---|---|
| 22 | TCP | SSH（默认已开）|
| 80 | TCP | HTTP（必需）|
| 443 | TCP | HTTPS（用 SSL 时必需）|

---

## 2. 部署到服务器（3 条命令）

下面三步全部在 SSH 终端里跑。

### 2.1 拉代码

```bash
cd /opt
git clone https://github.com/zimo66067-wq/shuzhi-xinyu.git
cd shuzhi-xinyu
```

> 私有仓库会要求登录：用户名输你的 GitHub 用户名；
> 密码框**不要输登录密码**，要用 **Personal Access Token**：
> https://github.com/settings/tokens → Generate new (classic) → 勾 `repo` → 复制 `ghp_xxx`

### 2.2 配置环境变量 + 上传模型

```bash
# 写 backend/.env
nano backend/.env
```

把本地 `backend/.env` 的内容粘进来（DEEPSEEK_API_KEY + TENCENT_SECRET_ID + TENCENT_SECRET_KEY + PARENT_PASSWORD），Ctrl+O 回车保存，Ctrl+X 退出。

```bash
# 上传 VRM 模型（在你本地 Windows PowerShell 跑，不是服务器）
scp "C:\Users\Administrator\Desktop\数智心屿模型.vrm" root@你的服务器IP:/opt/shuzhi-xinyu/frontend/public/models/xinyu.vrm
```

### 2.3 一键安装

回到服务器 SSH 终端：

```bash
cd /opt/shuzhi-xinyu
bash deploy/setup.sh
```

脚本会自动：
1. 装 nginx / python3 / nodejs 20 / ffmpeg
2. 后端建 venv + pip install
3. 前端 npm install + npm run build
4. 装 systemd 服务、启动后端
5. 配 Nginx 反代、重载

看到 `🎉 数智心屿部署完成！` 就是成功。

---

## 3. 启用 HTTPS（推荐，强依赖）

**为什么必须**：HTTP 下 Chrome / Edge 禁止使用麦克风，孩子无法语音输入。

### 3.1 域名解析

阿里云控制台 → 云解析 DNS → 你的域名 → 添加解析：

| 记录类型 | 主机记录 | 记录值 |
|---|---|---|
| A | @ | 你的服务器 IP |
| A | www | 你的服务器 IP |

等 5 分钟 DNS 生效。

### 3.2 修改 Nginx 配置里的域名

```bash
sed -i 's/your.domain.com/你的实际域名.com/g' /etc/nginx/sites-available/xinyu
nginx -t
```

### 3.3 装 Certbot 申请免费证书

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d 你的实际域名.com -d www.你的实际域名.com
```

按提示填邮箱、同意条款、选自动跳转。

完成后访问 `https://你的域名.com` 应能看到心屿启动页。

---

## 4. 运维常用命令

```bash
# 看后端日志（实时滚动）
journalctl -u xinyu-backend -f

# 看后端最近 100 行
journalctl -u xinyu-backend -n 100 --no-pager

# 重启后端（改了代码 / .env 后用）
systemctl restart xinyu-backend

# 看 Nginx 错误日志
tail -f /var/log/nginx/xinyu.error.log

# 重载 Nginx 配置（改了 nginx.conf 后用，不中断服务）
nginx -t && systemctl reload nginx

# 测后端是否活着
curl -s http://127.0.0.1:5000/api/health
```

---

## 5. 更新代码（CI/CD 简化版）

代码改动后，从本地推到 GitHub，然后在服务器上：

```bash
cd /opt/shuzhi-xinyu
git pull
# 后端如有改动
cd backend && ./venv/bin/pip install -r requirements.txt
systemctl restart xinyu-backend
# 前端如有改动
cd ../frontend && npm install && npm run build
systemctl reload nginx
```

未来可以写个 `deploy/update.sh` 把这套封装起来。

---

## 6. 常见问题排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 浏览器打不开，超时 | 防火墙没开 80/443 | 阿里云控制台 → 防火墙加规则 |
| 502 Bad Gateway | 后端未启动 | `journalctl -u xinyu-backend -n 50` 看错误 |
| 后端日志报 "DEEPSEEK_API_KEY 不存在" | `.env` 没读到 | `cat /opt/shuzhi-xinyu/backend/.env` 检查 |
| 麦克风按了没反应 | HTTP 模式被浏览器禁了 | 必须配 HTTPS（见第 3 节）|
| 加载模型白屏 | xinyu.vrm 没上传 | `ls -la frontend/public/models/` 确认 |
| 前端能开但 `/api/*` 404 | Nginx 配置没生效 | `nginx -t && systemctl reload nginx` |
| 后端报 SSL EOF（偶发） | 国内 → DeepSeek 网络抖动 | 偶发，几秒后自动好；考虑加重试逻辑 |
| 备案前能用 IP 访问吗 | 不能 | 国内服务器 80/443 端口未备案时阿里云会拦截 |

---

## 7. 如果你不想备案

**最简易替代方案：用「香港轻量服务器」**

- 阿里云有香港地域的轻量服务器
- 无需 ICP 备案
- 价格稍贵约 ¥30/月
- 大陆访问稍慢但可接受
- 部署步骤完全相同，把 IP 替换成香港服务器 IP 即可

**另一个方案：用 GitHub Pages + Cloudflare**

- 前端走 GitHub Pages 免费托管
- 后端走免费 Cloudflare Workers / Render 等 Serverless
- 部署复杂度更高，但完全免费
- 需要大改架构，本手册暂不覆盖

---

## 8. 文件路径速查

```
服务器 /opt/shuzhi-xinyu/
├── backend/
│   ├── .env                        ← 你写的密钥
│   ├── venv/                       ← Python 虚拟环境（setup.sh 生成）
│   ├── app.py
│   ├── wsgi.py                     ← Gunicorn 入口
│   └── ...
├── frontend/
│   ├── public/models/xinyu.vrm     ← 你 scp 上传的
│   ├── dist/                       ← npm run build 输出（Nginx 服务这里）
│   └── ...
└── deploy/
    ├── setup.sh                    ← 一键安装
    ├── gunicorn.conf.py
    ├── xinyu-backend.service       → /etc/systemd/system/
    └── nginx.conf                  → /etc/nginx/sites-available/xinyu

服务器系统位置：
/etc/systemd/system/xinyu-backend.service    ← systemd 单元
/etc/nginx/sites-available/xinyu             ← Nginx 站点
/var/log/nginx/xinyu.{access,error}.log      ← Nginx 日志
journalctl -u xinyu-backend                  ← 后端日志
```

---

## 9. 安全清单（生产前自查）

- [ ] backend/.env 权限是 640 / owner=www-data（`ls -la backend/.env`）
- [ ] PARENT_PASSWORD 已改成 8 位以上强密码
- [ ] PARENT_SECRET 已用 `python3 -c "import secrets; print(secrets.token_hex(32))"` 生成并写入 .env
- [ ] CORS_ORIGINS 已限制为你的域名（在 .env 设 `CORS_ORIGINS=https://你的域名.com`）
- [ ] HTTPS 已配，浏览器看到锁图标
- [ ] 防火墙 22/80/443 之外的端口都关了
- [ ] DeepSeek + 腾讯云 key 已轮换（之前在仓库历史可能出现过）

---

## 10. 联系

部署遇到问题，把 `journalctl -u xinyu-backend -n 50` 输出截图给我，我帮你看。
