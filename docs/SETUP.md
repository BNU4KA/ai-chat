# Local setup

Use Node.js 26.13.0, pnpm 12.18.0, and PostgreSQL 15 or newer. The shared application
uses Expo SDK 58 and React Native 0.88. Native Google sign-in requires a development
build and platform OAuth clients; use the web application for the first setup check.

```bash
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm setup:env
```

The setup script creates a gitignored `.env` only if it is missing and generates a local
AES-256-GCM encryption key. Keep that key backed up securely: replacing it makes existing
encrypted credentials unreadable. Never put server secrets in `EXPO_PUBLIC_` variables.

## Supabase and database

Create a personal Supabase project and configure these local `.env` variables:

| Variable                                   | Value                                                       |
| ------------------------------------------ | ----------------------------------------------------------- |
| `SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_URL` | The same project URL                                        |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`     | The project's publishable key                               |
| `SUPABASE_SERVICE_ROLE_KEY`                | Server-only Secret key or legacy service-role key           |
| `DATABASE_URL`                             | Session pooler connection string with the database password |
| `DATABASE_SSL_CA_FILE`                     | Optional path to the downloaded database CA certificate     |

For a remote database, certificate and hostname verification are enforced. Download the CA
from **Database → Settings → SSL Configuration**. Save it in `.local/supabase-ca.crt` (the
automatic default) or set `DATABASE_SSL_CA_FILE=prod-ca-2021.crt` for a file in the repository
root. Relative paths resolve from the repository root for both API and worker. Do not disable
certificate validation to work around a connection error. See the
[Supabase SSL documentation](https://supabase.com/docs/guides/platform/ssl-enforcement).

```bash
pnpm migrate
```

Migrations create application tables and restricted `app_api` / `app_worker` roles. The
migration database user needs permission to create roles and grant those roles to itself.
The queue uses its own `pgboss` schema, initialized when the worker starts. Migrations load
the root `.env`; do not point integration tests at the personal hosted database.

In Supabase Storage create the bucket named by `STORAGE_BUCKET` (default `chat-files`).
Set **Public bucket off** and a **20 MiB** maximum file size. Do not add public read/write
policies. Upload and download access is granted by the authenticated API through signed URLs.

## Google sign-in for web

1. Create a **Web application** OAuth client in a personal Google Cloud project.
2. Add `https://<project-ref>.supabase.co/auth/v1/callback` as its authorized redirect URI.
3. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter
   the client ID and secret. These are provider settings; they are not public application keys.
4. In Supabase **Authentication → URL Configuration**, set Site URL to
   `http://localhost:8081` and add `http://localhost:8081/auth/callback` to Redirect URLs.
5. If the Google consent screen is in testing, add the intended personal account as a test user.

The login requests identity scopes only. Gmail and Calendar have a separate consent flow.

## Optional Gmail and Calendar connections

Enable the Gmail API and Google Calendar API in Google Cloud. Configure a web OAuth client
with `http://localhost:3001/integrations/google/callback` as an authorized redirect URI and set:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=<web-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<server-only-client-secret>
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3001/integrations/google/callback
WEB_COMPLETION_URL=http://localhost:8081/auth/integration
NATIVE_COMPLETION_URL=aichat://integration
```

Supabase sign-in's callback and this integration callback are different. A client can register
both URIs. The server stores refresh tokens encrypted. Gmail requests `gmail.readonly` and
`gmail.compose`; Calendar requests `calendar.events` and `calendar.events.freebusy`, together
with identity scopes. Access is requested incrementally from **Settings → Connections**.
Google scope verification and any applicable security assessment remain public-release gates.
Use only an explicitly authorized test mailbox/calendar for live write checks.

## Run the application

```bash
pnpm dev
```

| Process                      | Local URL                          |
| ---------------------------- | ---------------------------------- |
| Web                          | http://localhost:8081              |
| API health                   | http://localhost:3001/health/live  |
| Database and queue readiness | http://localhost:3001/health/ready |
| Generated API reference      | http://localhost:3001/openapi.json |

Alternatively run `pnpm dev:api`, `pnpm dev:worker`, and `pnpm dev:client` in separate
terminals. Readiness returns 503 until the database and queue are available. Sign in with
Google, then enter the personal OpenRouter key in the app. There is no shared operator-key
fallback. Set `TAVILY_API_KEY` to enable web search; optional services stay unavailable when
unconfigured. Restart the processes after changing `.env`.

On a physical phone use the development machine's LAN address for `EXPO_PUBLIC_API_URL`
and add the required origins to `CLIENT_ORIGINS`. `localhost` on a phone is the phone itself.
An HTTPS API is required for production.

## Native development builds

Configure Google OAuth clients for the identifiers in `apps/client/app.config.ts`:

- Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for the native ID-token audience and enable it in
  the Supabase Google provider's client-ID list.
- Create an iOS client for the application's bundle identifier and set
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Its reversed URL scheme is added by the config plugin.
- Create an Android client for the application ID and the development/release signing SHA-1
  fingerprints. The Android client registration must match the actual installed build.
- Regenerate native projects after changing native configuration or OAuth client IDs.

```bash
pnpm --filter @ai-chat/client exec expo prebuild
pnpm --filter @ai-chat/client exec expo run:android
pnpm --filter @ai-chat/client exec expo run:ios
```

Generated `ios` and `android` directories are ignored (Expo Continuous Native Generation).
No signing credentials are committed. Xcode 26.2 currently fails compiling the SDK 58
ExpoModulesJSI dependency with `sending 'slot' risks causing data races`; see
[upstream issue #52754](https://github.com/expo/expo/issues/52754).
Expo's SDK 58 build image currently uses Xcode 27.1; see its
[upgrade guidance](https://expo.dev/blog/how-to-upgrade-to-sdk-58). This machine's failed
iOS build is recorded as blocked, not a successful native test. No dependency workaround
or toolchain installation has been applied.

## Automated checks

```bash
pnpm typecheck
pnpm lint
pnpm test
DATABASE_URL=postgres://<scratch-user>:<scratch-password>@127.0.0.1:<port>/<scratch-db> pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Integration tests require a disposable database and use synthetic owners and credentials.
They do not truncate shared tables. Browser tests start an isolated web server on port 8092
and intercept provider/API calls with explicit synthetic fixtures; they are not live Google
or OpenRouter verification. Locally they use installed Chrome, while CI uses Chromium.
The optional health scenario requires `E2E_BASE_URL` and is otherwise reported as skipped.

## Operations

Keep API and worker as separate processes. The worker recovers queued tasks through Postgres.
Uncertain model calls fail safely with partial text rather than automatically starting a second
paid call. An uncertain mail/calendar write is not automatically retried. Signed upload tokens
can remain valid for two hours; deletion jobs retain tombstones and retry cleanup through
that window. Account deletion revokes access, removes private objects and encrypted credentials,
and deletes the Supabase Auth user; externally sent mail/calendar data remains with its provider.

Back up Postgres, private Storage, and encryption keys together. Retain database backups for
30 days and operational logs for 14 days. Restore into a separate empty database, restore the
objects and keyring, then start the worker to resume undispatched outbox jobs. A complete
backup/restore exercise and store submissions have not been performed.

## Photo and Word attachments

Use the + control in the composer to select JPG/JPEG, PNG, WebP, GIF, Word DOC/DOCX, PDF,
TXT or Markdown. Up to five files can accompany a message, each up to 20 MiB. Wait until
Reading file finishes before sending. Photos need a model with image input (the default
Gemini model supports it); the selector marks photo-capable models. HEIC and embedded Word
images are not supported; export a JPG/PNG copy when needed. Image validation caps source
photos at 40 MP and model images at 2048 px per side. Only the five latest distinct photos
are included in model context; reattach an older photo to bring it into that set.

The API and worker must both run for processing. No additional service credential is needed.
After installing dependencies, Sharp's platform-specific prebuilt package must be available
on the worker's OS/architecture. Real OpenRouter inference incurs the user's normal model
charges; synthetic tests do not prove a live provider request.
