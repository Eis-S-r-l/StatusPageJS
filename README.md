# EIS Service Status

A bilingual, manually managed status-page system built as a Next.js modular monolith. The same application serves the public English/Italian status pages, the Cognito-protected administration area, APIs, bot webhooks, and a PostgreSQL-backed notification worker. Administrators can configure separate light and dark palettes and upload mode-specific logos and a favicon.

The product decisions and delivery plan are recorded in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Local development

Requirements:

- Node.js 24
- npm
- PostgreSQL 17, or Docker with Docker Compose

Install dependencies and prepare configuration:

```bash
npm install
cp .env.example .env
```

Start PostgreSQL, apply migrations, then run the web and worker processes:

```bash
npm run db:migrate
npm run dev
npm run worker
```

The public application is available at `http://localhost:3000/en` and `http://localhost:3000/it`. The administration area is at `http://localhost:3000/admin`.

Branding uploads are stored under `data/branding` in local development. The directory is created automatically and is excluded from Git.

## VM deployment

Copy `.env.example` to `.env`, replace every placeholder and default password, and set `APP_URL` to the public HTTPS URL. Then run:

```bash
docker compose up --build -d
```

The Compose deployment starts PostgreSQL, applies migrations, and starts the Next.js web process and background worker. The web container is published only on the VM loopback address at `127.0.0.1:3000`, where the VM's existing Nginx instance can reach it without exposing Next.js directly to the internet. A dedicated `branding_data` volume persists uploaded logos and favicons across container replacements.

An HTTP reverse-proxy example is provided at [`deploy/nginx/eis-status-page.conf.example`](./deploy/nginx/eis-status-page.conf.example). Replace `status.example.com`, then install it using the conventions of the VM's existing Nginx setup. A typical Debian or Ubuntu installation is:

```bash
sudo cp deploy/nginx/eis-status-page.conf.example /etc/nginx/sites-available/eis-status-page
sudo ln -s /etc/nginx/sites-available/eis-status-page /etc/nginx/sites-enabled/eis-status-page
sudo nginx -t
sudo systemctl reload nginx
```

Ensure public DNS points the chosen hostname to the VM and that ports 80 and 443 are reachable. Once the HTTP virtual host is active, let Certbot add the certificate, HTTPS listener, and HTTP-to-HTTPS redirect using the VM's established certificate-management process. For a standard Certbot Nginx installation:

```bash
sudo certbot --nginx -d status.example.com
sudo nginx -t
```

If another virtual host already defines shared proxy or security settings, merge the upstream and `location` directives into that configuration rather than duplicating them.

Before production launch:

- Complete the Cognito setup described below.
- Verify the email-sending domain in Amazon SES and request production access.
- Complete the Telegram setup below and register the optional Webex webhook using a strong webhook secret.
- Set the public Telegram bot username and optional Webex bot email so visitors can open the bot onboarding flow from the status page. Telegram accepts `/start en`, `/start it`, and `/stop`; Webex accepts `subscribe en`, `subscribe it`, and `stop`.
- Replace the default PostgreSQL password.
- Configure encrypted off-VM backups for both PostgreSQL and the `branding_data` volume, then test a complete restore.

## AWS Cognito setup

The administration area uses Cognito Managed login (formerly Hosted UI). Administrators enter their password and MFA response on the Cognito domain; the status-page application does not provide its own password form.

### Create the user pool and application

1. Create an Amazon Cognito User Pool.
2. Disable self-service registration and create or invite administrators yourself.
3. Select the required sign-in identifiers, such as email, and configure MFA according to company policy.
4. Add a Cognito prefix domain or custom domain and select the Managed login branding version.
5. Create an app client using the **Traditional web application** type. Generate a client secret because the Next.js server can store it securely.
6. Enable only the **Authorization code grant** OAuth flow.
7. Enable the `openid`, `email`, and `profile` scopes.
8. Select the Cognito User Pool identity provider, plus any explicitly required corporate identity provider.

Configure these allowed callback URLs:

```text
https://status.example.com/api/auth/callback
http://localhost:3000/api/auth/callback
```

Configure these allowed sign-out URLs:

```text
https://status.example.com/en
http://localhost:3000/en
```

Replace `status.example.com` with the production status-page domain. Production callbacks must use HTTPS; Cognito permits plain HTTP only for localhost development.

### Configure the administrator group

Create a Cognito User Pool group such as `StatusPageAdmins` and add every permitted administrator to it. An authenticated user receives an application session only when their signed Cognito ID token contains the group named by `COGNITO_ADMIN_GROUP`. The comparison is exact and case-sensitive; the group does not require an IAM role or a token-customization trigger.

Configure `.env` with the values from the user pool and app client:

```env
COGNITO_ISSUER=https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_ABC123
COGNITO_CLIENT_ID=your-app-client-id
COGNITO_CLIENT_SECRET=your-app-client-secret
COGNITO_DOMAIN=https://eis-status.auth.eu-west-1.amazoncognito.com
COGNITO_ADMIN_GROUP=StatusPageAdmins
COGNITO_REDIRECT_URI=https://status.example.com/api/auth/callback
COGNITO_LOGOUT_REDIRECT_URI=https://status.example.com/en
SESSION_SECRET=replace-with-a-long-random-secret-of-at-least-32-characters
ADMIN_DEV_BYPASS=false
```

`COGNITO_ISSUER` is the regional User Pool issuer URL. `COGNITO_DOMAIN` is the Managed login domain and is a different value. Generate `SESSION_SECRET` independently from the Cognito client secret. Never commit either secret. `ADMIN_DEV_BYPASS=true` can provide a local-only development session, but the bypass is deliberately ignored when `NODE_ENV=production`.

### Authentication and browser storage

The application uses the OAuth authorization-code flow with PKCE. During login it stores a ten-minute HTTP-only flow cookie containing the PKCE verifier, state, and nonce. After Cognito returns a valid ID token and the required group is confirmed, the server discards the Cognito tokens and creates an eight-hour signed application session cookie.

Passwords, MFA responses, Cognito tokens, the Cognito client secret, and `SESSION_SECRET` are not stored in browser local storage. Production cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`. Removing an administrator from the Cognito group prevents their next login but does not revoke an already-issued application session; that session remains valid until logout or its eight-hour expiry.

## Telegram bot setup

### Create and configure the bot

1. Open the verified `@BotFather` account in Telegram and send `/newbot`.
2. Choose a display name and a unique username ending in `bot`.
3. Store the bot token returned by BotFather as a secret; anyone with this token can control the bot.
4. Optionally use BotFather's `/setcommands` command to publish this command list:

```text
start - Subscribe to status notifications
stop - Stop status notifications
help - Show subscription instructions
```

Generate an independent webhook secret locally:

```bash
openssl rand -hex 32
```

Add the bot values to `.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:replace-with-the-token-from-botfather
TELEGRAM_WEBHOOK_SECRET=replace-with-the-generated-webhook-secret
TELEGRAM_BOT_USERNAME=EisStatusBot
```

`TELEGRAM_BOT_USERNAME` is public and should not include a `t.me` URL. The bot token authenticates requests sent by the application to Telegram. The separately generated webhook secret authenticates webhook deliveries received from Telegram.

### Register the webhook

The application does not register the Telegram webhook automatically. After the application is running on its public HTTPS domain, load `.env` into the current shell:

```bash
set -a
source .env
set +a
```

Register the webhook, replacing the example domain:

```bash
curl --fail-with-body \
  --request POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://status.example.com/api/telegram/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message"]' \
  --data "drop_pending_updates=true"
```

Telegram should return an `ok: true` response. `drop_pending_updates=true` is appropriate for initial setup; omit it when updating an existing webhook if queued updates must be preserved. Telegram retains the webhook configuration, so registration only needs to be repeated when the public URL, bot token, or webhook secret changes.

Verify the active webhook and inspect any delivery error with:

```bash
curl --fail-with-body \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

The webhook URL must be publicly reachable over HTTPS; `localhost` cannot receive normal Telegram webhooks without a public development tunnel. A `401` response from the application indicates that the configured webhook secrets differ. A `503` response means `TELEGRAM_WEBHOOK_SECRET` is missing from the web process.

Visitors can subscribe through the public-page Telegram link or by sending `/start en` or `/start it`. They can unsubscribe with `/stop`. The application stores the Telegram chat ID and selected language in PostgreSQL; the worker uses that chat ID for published incident and maintenance notifications. Telegram bots cannot initiate a conversation, so each subscriber must first open the bot and press Start.

## Appearance and branding

Authenticated administrators can use `/admin/appearance` to:

- Configure background, surface, text, accent, border, success, warning, and error colors independently for light and dark mode.
- Configure the text color used on primary/accent controls.
- Upload separate light-mode and dark-mode logos.
- Upload or remove the public favicon.

Visitors initially follow their operating-system color preference and can override it with the theme button. That choice is stored only in their browser. Logos accept PNG, JPEG, or WebP; favicons accept PNG or ICO; each file is limited to 2 MB. SVG uploads are deliberately rejected.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Uptime semantics

Uptime is calculated only from incidents and maintenance entered by administrators and marked as affecting uptime. Results are persisted per service when relevant records change. The local worker refreshes active downtime and rolling-window boundaries; public requests read the persisted result and do not recompute incident history.
