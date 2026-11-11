#!/usr/bin/env bash
# Run as root on Ubuntu only after reviewing existing Caddy configuration and ports.
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo 'Run as root.' >&2; exit 1; fi
bundle=${1:?Pass the uploaded release archive path}
release=${2:?Pass a unique release ID}
if [[ ! ${release} =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then echo 'Invalid release ID.' >&2; exit 1; fi
command -v caddy >/dev/null
[[ -s /etc/ai-chat/server.env && -s /etc/ai-chat/supabase-ca.crt ]]
[[ -x /opt/ai-chat/toolchain/node/bin/node && -x /opt/ai-chat/toolchain/pnpm/bin/pnpm ]]
if ! id aichat >/dev/null 2>&1; then useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin aichat; fi
install -d -m 0755 /opt/ai-chat /opt/ai-chat/releases /srv/ai-chat /srv/ai-chat/releases
runtime="/opt/ai-chat/releases/${release}"
web="/srv/ai-chat/releases/${release}"
[[ ! -e "$runtime" && ! -e "$web" ]]
install -d -m 0750 -o aichat -g aichat "$runtime"
tar -xzf "$bundle" --no-same-owner -C "$runtime"
install -d -m 0755 "$web"
cp -a "$runtime/web/." "$web/"
rm -r "$runtime/web"
find "$web" -type d -exec chmod 0755 {} +
find "$web" -type f -exec chmod 0644 {} +
export PATH="/opt/ai-chat/toolchain/node/bin:/opt/ai-chat/toolchain/pnpm/bin:$PATH"
cd "$runtime"
pnpm install --prod --frozen-lockfile --ignore-scripts
# Workspace symlinks and Linux Sharp prebuilds are installed on the VPS, never copied from macOS.
node --input-type=module -e 'import {createRequire} from "node:module"; const require=createRequire(process.cwd()+"/packages/integrations/package.json"); require("sharp")({create:{width:1,height:1,channels:3,background:"white"}}).jpeg().toBuffer().then(()=>console.log("Image decoder ready"));'
chown -R root:aichat "$runtime"
chmod -R g+rX,o-rwx "$runtime"
previous_runtime=$(readlink /opt/ai-chat/current || true)
previous_web=$(readlink /srv/ai-chat/current || true)
rollback() {
  if [[ -n "$previous_runtime" ]]; then ln -sfn "$previous_runtime" /opt/ai-chat/current; fi
  if [[ -n "$previous_web" ]]; then ln -sfn "$previous_web" /srv/ai-chat/current; fi
  if [[ -n "$previous_runtime" ]]; then systemctl restart ai-chat-api ai-chat-worker || true; fi
}
ln -sfn "$runtime" /opt/ai-chat/current
ln -sfn "$web" /srv/ai-chat/current
install -m 0644 "$runtime/deploy/ai-chat-api.service" /etc/systemd/system/ai-chat-api.service
install -m 0644 "$runtime/deploy/ai-chat-worker.service" /etc/systemd/system/ai-chat-worker.service
systemctl daemon-reload
systemctl enable ai-chat-api ai-chat-worker
systemctl restart ai-chat-api ai-chat-worker
ready=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3001/health/ready >/dev/null; then ready=true; break; fi
  sleep 2
done
if [[ $ready != true ]]; then rollback; echo 'Readiness failed; see service journals.' >&2; exit 1; fi
# Do not alter the old pushbot service or its Caddy site. Add only this dedicated hostname.
install -d -m 0755 /etc/caddy/conf.d
backup="/etc/caddy/Caddyfile.before-ai-chat-${release}"
cp -p /etc/caddy/Caddyfile "$backup"
if [[ -e /etc/caddy/conf.d/ai-chat.caddy ]]; then cp -p /etc/caddy/conf.d/ai-chat.caddy "/etc/caddy/ai-chat.before-${release}"; fi
install -m 0644 "$runtime/deploy/Caddyfile" /etc/caddy/conf.d/ai-chat.caddy
if ! grep -Fqx 'import /etc/caddy/conf.d/*.caddy' /etc/caddy/Caddyfile; then
  printf '\nimport /etc/caddy/conf.d/*.caddy\n' >> /etc/caddy/Caddyfile
fi
if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  cp -p "$backup" /etc/caddy/Caddyfile
  if [[ -f /etc/caddy/ai-chat.before-${release} ]]; then cp -p "/etc/caddy/ai-chat.before-${release}" /etc/caddy/conf.d/ai-chat.caddy; else rm -f /etc/caddy/conf.d/ai-chat.caddy; fi
  rollback; exit 1
fi
systemctl reload caddy
systemctl is-active ai-chat-api ai-chat-worker caddy
