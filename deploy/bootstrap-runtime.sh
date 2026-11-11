#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
command -v caddy >/dev/null
for command in curl tar xz sha256sum; do command -v "$command" >/dev/null; done
version=26.13.0
case "$(uname -m)" in x86_64) arch=x64;; aarch64) arch=arm64;; *) echo 'Unsupported architecture.' >&2; exit 1;; esac
# Official Node Linux builds require libatomic, absent on minimal Ubuntu images.
if ! ldconfig -p | grep 'libatomic.so.1' >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libatomic1
fi
prefix=/opt/ai-chat/toolchain
install -d -m 0755 "$prefix"
if [[ ! -x "$prefix/node/bin/node" ]]; then
  archive="node-v${version}-linux-${arch}.tar.xz"
  temporary=$(mktemp -d)
  trap 'rm -rf "$temporary"' EXIT
  curl --fail --silent --show-error "https://nodejs.org/dist/v${version}/${archive}" -o "$temporary/$archive"
  curl --fail --silent --show-error "https://nodejs.org/dist/v${version}/SHASUMS256.txt" -o "$temporary/SHASUMS256.txt"
  (cd "$temporary"; awk -v file="$archive" '$2==file {print}' SHASUMS256.txt | sha256sum --check --status)
  [[ ! -e "$prefix/node" ]]
  install -d -m 0755 "$prefix/node"
  tar -xJf "$temporary/$archive" --strip-components=1 -C "$prefix/node"
fi
[[ "$($prefix/node/bin/node --version)" == "v$version" ]]
export PATH="$prefix/node/bin:$PATH"
if [[ ! -x "$prefix/pnpm/bin/pnpm" ]]; then
  npm install --global --prefix "$prefix/pnpm" pnpm@12.18.0
fi
[[ "$($prefix/pnpm/bin/pnpm --version)" == '12.18.0' ]]
install -d -m 0755 /etc/ai-chat
printf 'Isolated Node and pnpm ready.\n'
