# VPS deployment

Owner-authorized target: existing Ubuntu 24.04 VPS. Keep its existing bot, environment,
service state, Caddy site and firewall rules intact. Deploy AI Chat independently at
`https://chat.72-56-89-122.sslip.io`.

## Current status

Live at **https://chat.72-56-89-122.sslip.io**. Current web release is `20261111T135627Z`;
current runtime remains `20261111T111852Z`. The first published release `20261111T095526Z` is retained on
the owner's existing Ubuntu VPS. The personal SSH key was added through the provider panel;
no work identity was used. Caddy serves the static export and proxies to the API on loopback.
Both app services are enabled, running as the dedicated unprivileged `aichat` user, and have
restart-on-failure configured. The old pushbot remains inactive and disabled with its original
Caddy hostname unchanged.

Verified: trusted public HTTPS; web, callback and deep-link routes return 200; readiness reports
database/queue ok; anonymous profile access returns 401; private env path returns 404. Actual
Google login returned to the hosted origin and displayed the signed-in home screen. The owner
added the Supabase redirect/site URLs. With the local development worker stopped, synthetic
photo and legacy Word uploads through the public API reached ready on the VPS worker.
The synthetic identity/files were cleaned up; no paid model inference was needed for this
deployment check. Previous live Gemini photo/DOCX proof remains in PROGRESS.

The 894 MiB server had approximately 432 MiB available after initial startup. API and worker
used approximately 69 and 60 MiB respectively, with zero restarts at the initial health check.
Node required `libatomic1`, which was installed on the minimal image; application Node/pnpm
remain isolated under the toolchain path. The published frontend was built locally.

Web secret scan, API typecheck, workspace lint, shell syntax and local/remote Caddy validation
passed. Server secrets reside at `/etc/ai-chat/server.env` (root-owned, 0600), separately from
public assets. The release archive excludes `.env` and macOS node_modules; production
dependencies and Linux Sharp prebuilds were installed on the VPS.

## Layout

| Path                              | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `/opt/ai-chat/toolchain`          | Isolated Node 26.13.0 and pnpm 12.18.0                   |
| `/opt/ai-chat/releases/<release>` | Private runtime sources and Linux-installed dependencies |
| `/opt/ai-chat/current`            | Active runtime release symlink                           |
| `/srv/ai-chat/releases/<release>` | Public static web assets only                            |
| `/srv/ai-chat/current`            | Active web release symlink                               |
| `/etc/ai-chat/server.env`         | Root-owned secret environment, mode 0600                 |
| `/etc/ai-chat/supabase-ca.crt`    | Public CA certificate, mode 0644                         |
| `/etc/caddy/conf.d/ai-chat.caddy` | Dedicated chat hostname and API proxy                    |

The application uses its existing Supabase database, Auth and private Storage. Preserve
`ENCRYPTION_KEYS` to retain access to existing encrypted user keys. Supply production
`CLIENT_ORIGINS`, callback origins and the explicit database CA path; omit all test adapter
and test JWT settings. Do not use another project's `.env`.

## GitHub web deploy

A successful CI run on `master` publishes the static web client. The workflow is
`.github/workflows/deploy-web.yml`. It builds the Expo web export in GitHub Actions and
switches `/srv/ai-chat/current` through `deploy/publish-web.sh`. API and worker are not
restarted. A full runtime release still uses `deploy/install-release.sh` when server code
changes.

Repository Actions secrets, not committed values:

| Secret | Purpose |
| --- | --- |
| `SSH_HOST` | VPS address |
| `SSH_PRIVATE_KEY` | Dedicated deploy key, public half in root `authorized_keys` |
| `EXPO_PUBLIC_API_URL` | Public site origin |
| `EXPO_PUBLIC_SUPABASE_URL` | Hosted Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public Supabase key baked into the web client |

The server environment at `/etc/ai-chat/server.env` stays only on the VPS.

## Installation sequence for a future release

1. Inspect actual memory, disk, listening ports, Caddy configuration and service states.
   Resolve any conflict before installation; a 1 GB VPS is a small staging deployment,
   with limits on the API, worker and document-processing child processes.
2. Confirm the chat hostname resolves to the server. Upload only the release archive,
   reviewed deployment scripts, separate environment and public CA through authenticated SSH.
3. Run `deploy/bootstrap-runtime.sh` as root. It installs a checksum-verified Node distribution
   and pinned pnpm under the app's own toolchain, without replacing system Node.
4. Install the environment at `/etc/ai-chat/server.env` (root:root, 0600) and CA at
   `/etc/ai-chat/supabase-ca.crt` (root:root, 0644).
5. Run `deploy/install-release.sh <archive> <release-id>`. It installs production dependencies
   on Linux, verifies the image decoder, activates dedicated systemd services, waits for
   readiness, backs up the existing Caddyfile, adds only the dedicated host and validates
   configuration before reload. Existing pushbot service and site are left intact.
6. Verify HTTPS, readiness, anonymous API denial, static deep links, live SSE and file processing.
   Inspect service journals without printing request credentials or `.env` values.
7. Stop the local development worker only after the VPS worker is healthy, so background
   execution no longer depends on this computer. Foreground local development remains optional.

## Authentication configuration

In Supabase Authentication → URL Configuration, add:

```text
https://chat.72-56-89-122.sslip.io/auth/callback
```

Set Site URL to `https://chat.72-56-89-122.sslip.io` for the hosted deployment and retain
`http://localhost:8081/auth/callback` if local development should continue working. The
Google SSO provider still redirects to the same Supabase `/auth/v1/callback`; it does not
need a new provider callback for this frontend hostname.

Optional Gmail/Calendar integration authorization is separate. Register
`https://chat.72-56-89-122.sslip.io/integrations/google/callback` in its Google OAuth web
client, configure the corresponding client secret on the server, and keep its web completion
URL at `/auth/integration`. This is not required for ordinary Google login and chat.

## Operations and rollback

```bash
systemctl status ai-chat-api ai-chat-worker caddy
journalctl -u ai-chat-api -u ai-chat-worker --since '15 minutes ago'
curl --fail http://127.0.0.1:3001/health/ready
```

Use release symlinks to return to the previous runtime/web pair, then restart both app services.
The installer restores the previous runtime/web pair on failed readiness when one exists and
restores the original Caddy configuration on invalid proxy configuration. Keep previous releases
until the new release is verified. Schema migrations require a separate backup/review and are
not automatically run by this installer. No existing production schema is dropped.

This deployment does not establish completed iOS acceptance, completed Google scope review,
or a verified backup/restore drill. Those remain independent release gates in PROGRESS.

## Frontend-only update — 2026-11-11

Historical frontend-only release `20261111T110052Z` used runtime `20261111T095526Z`.
This update adds direct copy, subdued compact icons, gentle motion, a multicolor composer
focus border and Fool tarot-inspired loading indicators. The static symlink was switched atomically,
with previous hashed chunks retained for already-open tabs. API/worker were not restarted.
The actual hosted response toolbar and public readiness were verified after deployment.

The latest frontend also fixes Markdown tables, ordered/nested lists and blockquotes.


## Tarot and localization release — 2026-11-11

Runtime and web release `20261111T111852Z` were current before the next frontend update. Migration 0003 introduces auto/en/ru
locale validation and a default for new accounts without rewriting any existing preference.
API and worker were restarted and passed readiness. Prior runtime/static releases remain
available for rollback; old web chunks were retained. The runtime release clones the existing
production dependency tree and overlays the three changed backend files; the added Expo
Localization dependency belongs only to the bundled client and native rebuild.

## Sign-in and chat polish — 2026-11-11

Frontend-only release `20261111T131936Z` uses runtime `20261111T111852Z`. It publishes the
parchment controls, sign-in tarot screen, themed toasts, drawn sidebar icons, smoother
streaming text, and the brighter moving border on the Google button. The static symlink was
switched atomically and previous web chunks were retained. API and worker were not restarted.
Public readiness stayed ok, and the hosted sign-in screen was checked in a browser.

## Faster composer — 2026-11-11

Frontend-only release `20261111T135627Z` uses runtime `20261111T111852Z`. Wide screens show
more tarot cards. Chats can be renamed or deleted from the list. A sent message and a chosen
file appear before the server finishes. Model steps collapse into one thinking line. The
composer controls are smaller, transparent, and outlined in the moving colors. The static
symlink was switched atomically and previous web chunks were retained. API and worker were
not restarted. Public readiness stayed ok.
