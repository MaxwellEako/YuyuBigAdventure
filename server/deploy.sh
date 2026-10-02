#!/usr/bin/env bash
# 心阵棋局 · 试玩记录服务的部署脚本（在腾讯云轻量服务器上以 root 运行，可重复执行）。
#
# 做的事：
#   1. 用 acme.sh 向 Let's Encrypt 申请 43.136.52.167 的 IP 证书（短期证书，约 6 天有效，每 3 天自动续期）。
#      申请和续期时会临时占用 80 端口做验证。
#   2. 在 /opt/yuyu-save/node 单独装一份 Node 24（不动系统自带的 Node 18）。
#   3. 下载 save-service.mjs（固定到某次提交，并校验 sha256），用 systemd 托管，监听 8443 端口。
#   4. 首次运行时生成查看页口令，最后打印查看页地址。
#
# 另外需要在轻量服务器控制台的「防火墙」里放通 TCP 8443。
set -euo pipefail

IP=43.136.52.167
PORT=8443
APP=/opt/yuyu-save
COMMIT=811e84152c57fd398dd28cd550c6a6a57c771704
SHA256=e85a6c37c165acf09f9f02e1328f17a5df67da85bbaa4088dcc201c4e2efebf6
SRC_URL=https://cdn.jsdelivr.net/gh/xrephmos/YuyuBigAdventure@${COMMIT}/server/save-service.mjs
ORIGINS=https://xrephmos.github.io

mkdir -p "$APP"/{data,tls}
id yuyusave >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin yuyusave

# ——— 1. 证书 ———
command -v socat >/dev/null || dnf install -y socat >/dev/null
if [ ! -x /root/.acme.sh/acme.sh ]; then
  curl -fsS --max-time 90 https://get.acme.sh | sh -s || {
    rm -rf /tmp/acme.sh && git clone --depth 1 https://gitee.com/neilpang/acme.sh.git /tmp/acme.sh &&
      (cd /tmp/acme.sh && ./acme.sh --install)
  }
fi
ACME=/root/.acme.sh/acme.sh
if [ ! -s "$APP/tls/fullchain.pem" ]; then
  "$ACME" --issue --server letsencrypt -d "$IP" --standalone \
    --certificate-profile shortlived --days 3 --keylength ec-256 || [ $? -eq 2 ] # 2 = 证书还没到续期时间
  touch "$APP/tls/key.pem" "$APP/tls/fullchain.pem"
  chown root:yuyusave "$APP/tls/key.pem" "$APP/tls/fullchain.pem"
  chmod 640 "$APP/tls/key.pem" "$APP/tls/fullchain.pem"
  "$ACME" --install-cert -d "$IP" --ecc \
    --key-file "$APP/tls/key.pem" --fullchain-file "$APP/tls/fullchain.pem" \
    --reloadcmd "systemctl restart yuyu-save || true"
fi

# ——— 2. Node 24 ———
if [ ! -x "$APP/node/bin/node" ]; then
  base=https://registry.npmmirror.com/-/binary/node/latest-v24.x/
  file=$(curl -fsS "$base" | grep -o 'node-v24[0-9.]*-linux-x64\.tar\.xz' | head -1)
  curl -fsSL "$base$file" -o /tmp/node24.tar.xz
  rm -rf "$APP/node" && mkdir -p "$APP/node"
  tar -xJf /tmp/node24.tar.xz -C "$APP/node" --strip-components=1
  rm -f /tmp/node24.tar.xz
fi
"$APP/node/bin/node" -v

# ——— 3. 服务 ———
curl -fsSL "$SRC_URL" -o "$APP/save-service.mjs.new"
echo "$SHA256  $APP/save-service.mjs.new" | sha256sum -c -
mv "$APP/save-service.mjs.new" "$APP/save-service.mjs"

if [ ! -f "$APP/env" ]; then
  cat >"$APP/env" <<EOF
PORT=$PORT
HOST=0.0.0.0
DB_PATH=$APP/data/saves.db
ADMIN_KEY=$(openssl rand -hex 16)
TLS_CERT=$APP/tls/fullchain.pem
TLS_KEY=$APP/tls/key.pem
ALLOW_ORIGINS=$ORIGINS
EOF
  chmod 600 "$APP/env"
fi
chown -R yuyusave:yuyusave "$APP/data"

cat >/etc/systemd/system/yuyu-save.service <<EOF
[Unit]
Description=Heart Gambit play log service
After=network-online.target
Wants=network-online.target

[Service]
User=yuyusave
Group=yuyusave
WorkingDirectory=$APP
EnvironmentFile=$APP/env
ExecStart=$APP/node/bin/node --disable-warning=ExperimentalWarning $APP/save-service.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$APP/data

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now yuyu-save
systemctl restart yuyu-save
sleep 2
systemctl --no-pager --lines=5 status yuyu-save || true

# ——— 4. 自检 ———
curl -fsS --max-time 10 "https://$IP:$PORT/health" && echo
echo "查看页：https://$IP:$PORT/admin?key=$(grep ^ADMIN_KEY= "$APP/env" | cut -d= -f2)"
