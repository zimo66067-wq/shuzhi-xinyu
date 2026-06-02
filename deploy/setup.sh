#!/bin/bash
# ============================================================
# 数智心屿 · 一键部署脚本（Ubuntu 22.04）
# ============================================================
# 用法（在已 git clone 到 /opt/shuzhi-xinyu 后，root 用户跑）：
#   cd /opt/shuzhi-xinyu
#   bash deploy/setup.sh
#
# 前置条件：
#   1. 已 git clone 到 /opt/shuzhi-xinyu
#   2. 已写好 backend/.env（含 DeepSeek + 腾讯云 + PARENT_PASSWORD）
#   3. 已放好 frontend/public/models/xinyu.vrm（不在 git 里）
# ============================================================

set -e  # 任一步失败立即退出
set -u  # 引用未定义变量报错

ROOT="/opt/shuzhi-xinyu"

# ── 0. 颜色 ─────────────────────────────
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
NC="\033[0m"
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
info() { echo -e "${YELLOW}▶ $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }

# ── 1. 前置检查 ────────────────────────────
info "检查前置条件..."
[ "$(id -u)" = "0" ] || err "请用 root（或 sudo bash setup.sh）"
[ -d "$ROOT" ]       || err "$ROOT 不存在；先 git clone https://github.com/zimo66067-wq/shuzhi-xinyu.git $ROOT"
[ -f "$ROOT/backend/.env" ] || err "$ROOT/backend/.env 不存在；先 cp .env.example .env 并填入 key"
[ -f "$ROOT/frontend/public/models/xinyu.vrm" ] || err "frontend/public/models/xinyu.vrm 不存在；用 scp 上传"
ok "前置检查通过"

# ── 2. 装系统依赖 ──────────────────────────
info "安装系统依赖（nginx + python3 + nodejs + ffmpeg）..."
apt-get update -qq
apt-get install -y -qq nginx python3 python3-pip python3-venv ffmpeg curl git

# Node.js 20.x（apt 自带的可能太老）
if ! node --version 2>/dev/null | grep -qE "v(1[89]|[2-9][0-9])"; then
    info "升级 Node.js 到 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
ok "系统依赖安装完成 (node $(node --version), python $(python3 --version | cut -d' ' -f2))"

# ── 3. 后端：venv + pip ────────────────────
info "配置后端 Python 虚拟环境..."
cd "$ROOT/backend"
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install --quiet --upgrade pip
./venv/bin/pip install --quiet -r requirements.txt

# Python 3.13+ 还要装 audioop-lts（requirements.txt 里有 marker 但保险起见）
PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if dpkg --compare-versions "$PY_VER" ge "3.13"; then
    ./venv/bin/pip install --quiet audioop-lts
fi
ok "后端依赖安装完成"

# ── 4. 前端：构建 ──────────────────────────
info "构建前端（这步约 1-2 分钟）..."
cd "$ROOT/frontend"
[ -d node_modules ] || npm install --silent
npm run build --silent
[ -d dist ] || err "前端构建失败，dist 目录未生成"
ok "前端构建完成（dist/ 已生成）"

# ── 5. 安装 systemd 服务 ───────────────────
info "安装 systemd 服务..."
cp "$ROOT/deploy/xinyu-backend.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable xinyu-backend
systemctl restart xinyu-backend
sleep 2
systemctl is-active --quiet xinyu-backend || err "后端启动失败；查日志：journalctl -u xinyu-backend -n 30"
ok "后端 systemd 服务已启动并自启"

# ── 6. 安装 Nginx 配置 ────────────────────
info "配置 Nginx..."
cp "$ROOT/deploy/nginx.conf" /etc/nginx/sites-available/xinyu
ln -sf /etc/nginx/sites-available/xinyu /etc/nginx/sites-enabled/xinyu
rm -f /etc/nginx/sites-enabled/default
nginx -t || err "Nginx 配置语法错误"
systemctl reload nginx
ok "Nginx 已重载"

# ── 7. 权限 ───────────────────────────────
info "设置文件权限..."
chown -R www-data:www-data "$ROOT"
chmod 640 "$ROOT/backend/.env"  # .env 仅 owner 可读
ok "权限已设置"

# ── 8. 完成 ───────────────────────────────
echo
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 数智心屿部署完成！${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo
echo "下一步："
echo
echo "  • 测试后端: curl -s http://127.0.0.1:5000/api/health"
echo "  • 看后端日志: journalctl -u xinyu-backend -f"
echo "  • 看 Nginx 日志: tail -f /var/log/nginx/xinyu.error.log"
echo
echo "  • 如已配域名 + SSL：访问 https://your.domain.com"
echo "  • 暂用 HTTP IP 访问：访问 http://$(curl -s ifconfig.me 2>/dev/null || echo '服务器IP')"
echo
echo "  ⚠️  HTTP 下浏览器不允许使用麦克风。要语音必须配 SSL："
echo "      apt install certbot python3-certbot-nginx"
echo "      certbot --nginx -d your.domain.com"
echo
