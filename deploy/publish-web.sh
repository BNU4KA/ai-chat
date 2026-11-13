#!/usr/bin/env bash
# Replace only the public web files. Does not restart the API or worker.
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo 'Run as root.' >&2; exit 1; fi
archive=${1:?Pass the uploaded web archive path}
release=${2:?Pass a unique release ID}
if [[ ! ${release} =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then echo 'Invalid release ID.' >&2; exit 1; fi
[[ -s "$archive" ]]
web="/srv/ai-chat/releases/${release}"
[[ ! -e "$web" ]]
install -d -m 0755 /srv/ai-chat /srv/ai-chat/releases "$web"
tar -xzf "$archive" -C "$web"
rm -f "$archive"
find "$web" -type d -exec chmod 0755 {} +
find "$web" -type f -exec chmod 0644 {} +
ln -sfn "$web" /srv/ai-chat/current
curl --fail --silent --max-time 5 http://127.0.0.1:3001/health/ready >/dev/null
readlink -f /srv/ai-chat/current
