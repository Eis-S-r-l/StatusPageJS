# EIS Service Status

A bilingual, manually managed status-page system built as a Next.js modular monolith. The same application serves the public English/Italian status pages, the Cognito-protected administration area, APIs, bot webhooks, and a PostgreSQL-backed notification worker. Administrators can configure separate light and dark palettes and upload mode-specific logos and a favicon.

Incident and maintenance dates are entered in the administrator's browser timezone and stored as UTC. The administration area provides full event editing, automatic-but-editable slugs, compact per-service downtime selection, separate timeline/status updates, and sanitized rich-text descriptions with headings, text sizes, lists, links, and tables. Subscriber administration supports searching, notification preferences, permanent deletion, and Telegram profile names. Email subscribers can request a confirmed unsubscription from the public status page, and all notification emails include a link to that flow.

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

The public dashboard stores collapsed service-category preferences in the browser cookie `eis-collapsed-categories`. It contains only current category IDs, is limited in size, and expires after one year; deleting it restores all categories to their expanded state.

## VM deployment

GitHub Actions publishes the application as two public, multi-platform container images:

- `ghcr.io/eis-s-r-l/statuspagejs-web`
- `ghcr.io/eis-s-r-l/statuspagejs-worker`, shared by the migration and worker services

Publishing a GitHub Release runs the container workflow against that release's exact Git tag. It publishes the release tag, such as `v1.2.0`, plus an immutable `sha-<full-commit-sha>` tag. Stable releases also update `latest`; prereleases do not. Ordinary commits, draft releases, and creating a Git tag without publishing a release do not start a container build. Ensure the workflow is present on the repository's default branch before publishing the first release. PostgreSQL continues to use the official `postgres:17-alpine` image.

After the first successful **Publish container images** workflow run, verify both packages under the EIS organization are public. GitHub normally links workflow-published packages to this public repository; if an organization policy leaves either package private, open its **Package settings → Change visibility → Public**. GitHub treats that visibility change as irreversible.

Copy `.env.example` to `.env`, replace every placeholder and default password, and set `APP_URL` to the public HTTPS URL. Leave `CONTAINER_IMAGE_TAG=latest` to follow the most recent stable release, or use a release/commit tag for a reproducible deployment. Then fetch and start the images without allowing Compose to build locally:

```bash
docker compose pull
docker compose up --no-build -d
```

The Compose deployment starts PostgreSQL, applies migrations, and starts the Next.js web process and background worker. The web container is published only on the VM loopback address at `127.0.0.1:3000`, where the VM's existing Nginx instance can reach it without exposing Next.js directly to the internet. A dedicated `branding_data` volume persists uploaded logos and favicons across container replacements.

To update the VM after a new release, pull the current repository configuration and images, then recreate the services:

```bash
git pull --ff-only
docker compose pull
docker compose up --no-build -d
```

For local development or an emergency source build, the existing build definitions remain available through `docker compose up --build -d`.

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
- Complete the Cloudflare Turnstile setup described below so the public email forms are enabled.
- Verify the email-sending domain in Amazon SES and request production access.
- Complete the Telegram setup below and register the optional Webex webhook using a strong webhook secret.
- Set the public Telegram bot username and optional Webex bot email so visitors can open the bot onboarding flow from the status page. Telegram accepts `/start en`, `/start it`, and `/stop`; Webex accepts `subscribe en`, `subscribe it`, and `stop` in direct conversations, or the same commands preceded by an `@` mention in group spaces.
- Replace the default PostgreSQL password.
- Configure encrypted off-VM backups for both PostgreSQL and the `branding_data` volume, then test a complete restore.

### Delete all testing data before production

This factory-reset procedure permanently removes all application data stored by the Compose deployment:

- The complete PostgreSQL database, including services, incidents, maintenance, subscribers, settings, audit records, uptime calculations, and notification history.
- Every uploaded light/dark logo and favicon in the `branding_data` volume.

It does not remove the repository, `.env` configuration, Docker images, Nginx configuration, certificates, or backup files stored outside the Compose volumes. Back up any data that must be retained before continuing.

From the repository directory, stop the application and remove its containers, network, PostgreSQL volume, branding volume, and any orphaned services:

```bash
docker compose down --volumes --remove-orphans
```

This action is irreversible. Start the application again and verify that the migration completed successfully:

```bash
docker compose up --no-build -d
docker compose logs --no-color migrate
docker compose ps
```

PostgreSQL will initialize a new empty database, the migration container will recreate the complete schema, and the application will start without any uploaded branding assets. The application can then be configured with production data through the administration area.

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

## Cloudflare Turnstile setup

The public email subscription and unsubscription forms use the existing Turnstile widget with site key `0x4AAAAAAEdj1rvMcjmnbsjH`. Email subscription confirmation links also open a second Turnstile-protected form instead of activating the subscription on page load. The confirmation link remains usable until its seven-day expiry and is consumed only after the visitor passes that check and presses **Confirm subscription**. The browser renders each challenge, but the Next.js API always validates the resulting single-use token with Cloudflare before it queues an email or confirms a subscription. Tokens are also checked against the exact `subscribe`, `confirm_subscription`, or `unsubscribe` action and an approved frontend hostname.

In the Cloudflare dashboard, open the existing widget and confirm that its hostname list contains every hostname where the public forms will run. Obtain the widget secret from the dashboard and place it directly in the deployment's ignored `.env` file; do not commit it or paste it into chat:

```env
TURNSTILE_SITE_KEY=0x4AAAAAAEdj1rvMcjmnbsjH
TURNSTILE_SECRET=replace-with-the-existing-widget-secret
TURNSTILE_HOSTNAMES=status.example.com
```

Replace `status.example.com` with the hostname from `APP_URL`. `TURNSTILE_HOSTNAMES` is a comma-separated list of hostnames only: do not include `https://`, ports, or paths. A production value must not include `localhost` or `127.0.0.1`. For local development, use a widget that permits local hostnames and set `TURNSTILE_HOSTNAMES=localhost,127.0.0.1`.

After changing the production `.env`, recreate the web container so it receives the new secret:

```bash
docker compose up -d --force-recreate web
```

The worker does not need the Turnstile secret. If nginx or another layer adds a Content Security Policy, allow `https://challenges.cloudflare.com` in both `script-src` and `frame-src`; the supplied nginx example does not define a CSP. Missing configuration makes the endpoints fail closed with a temporary-unavailable response, while missing, expired, replayed, wrong-action, or wrong-hostname tokens are rejected before subscription logic runs.

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

Telegram usernames are optional and may change. The application stores the chat ID as the delivery identity, records the username/display name received by the webhook, and lets an administrator refresh an existing Telegram profile with the Bot API. `/stop` and permanent Telegram delivery errors remove the subscription and its queued jobs.

Event notifications use Telegram Rich Messages when formatted content is available, preserving supported headings, emphasis, lists, links, and tables. If Telegram rejects a rich payload, the worker retries that delivery as a plain-text message.

## Webex bot setup

### Create and configure the bot

1. Open [Webex for Developers](https://developer.webex.com/), sign in, and create a bot under **My Apps**.
2. Save the permanent access token shown for the bot as a secret. Do not use the short-lived personal developer access token from the Webex API documentation. The web process uses the bot token to read and reply to incoming messages, and the worker uses the same token to send status notifications.
3. Record the bot email address so the application can ignore messages sent by the bot itself.
4. Generate an independent webhook secret locally:

```bash
openssl rand -hex 32
```

Add the Webex values to `.env`:

```env
WEBEX_BOT_TOKEN=replace-with-the-webex-bot-token
WEBEX_WEBHOOK_SECRET=replace-with-the-generated-webhook-secret
WEBEX_BOT_EMAIL=eis-status@example.com
```

`WEBEX_WEBHOOK_SECRET` is a shared secret chosen by you; Webex does not generate it. When the webhook is registered with the same secret, Webex signs each request body and sends the HMAC-SHA1 signature in `X-Spark-Signature`. The application verifies that signature before reading or acting on the message. The value in `.env` and the value registered with Webex must match exactly.

After changing the production `.env`, recreate both processes so the web handler and notification worker receive the credentials:

```bash
docker compose up -d --force-recreate web worker
```

### Register the webhook

The application does not register the Webex webhook automatically. The target must be publicly reachable over HTTPS. After the application is running, load `.env` into the current shell:

```bash
set -a
source .env
set +a
```

Register a webhook for newly created messages. This command uses `jq` to construct the JSON without placing the webhook secret directly in the command arguments:

```bash
jq -n \
  --arg target "${APP_URL%/}/api/webex/webhook" \
  '{
    name: "EIS Status Page Bot",
    targetUrl: $target,
    resource: "messages",
    event: "created",
    secret: env.WEBEX_WEBHOOK_SECRET
  }' |
curl --fail-with-body \
  --request POST \
  "https://webexapis.com/v1/webhooks" \
  --header "Authorization: Bearer ${WEBEX_BOT_TOKEN}" \
  --header "Content-Type: application/json" \
  --data-binary @-
```

List the bot's registered webhooks and confirm that the new webhook is active and points to the expected URL:

```bash
curl --fail-with-body \
  "https://webexapis.com/v1/webhooks" \
  --header "Authorization: Bearer ${WEBEX_BOT_TOKEN}"
```

Do not create a duplicate if a webhook already exists for this application. Update the existing webhook through Webex's **Update a Webhook** API with the same target and secret, or delete and recreate it. Changing only `WEBEX_WEBHOOK_SECRET` in `.env` causes the old webhook to fail signature validation.

A `401` response from `/api/webex/webhook` means the secret registered with Webex does not match `WEBEX_WEBHOOK_SECRET`. A `503` response means the secret is missing from the web container. Webex may disable a webhook after repeated unsuccessful deliveries, so resolve the error and reactivate the webhook before testing again.

Visitors can open the bot from the public status page when `WEBEX_BOT_EMAIL` is configured. In a direct conversation they can send `subscribe en` or `subscribe it` to enable notifications and `stop` to unsubscribe.

Webex only delivers group-space messages to a bot when the bot is explicitly mentioned. In a group space, select the bot from the mention menu and send commands in this form:

```text
@EIS subscribe en
@EIS subscribe it
@EIS stop
```

Replace `@EIS` with the displayed mention for the configured bot. A plain `subscribe en` message in a group space never reaches the bot and therefore cannot produce a reply. The application removes the displayed bot-name prefix from mentioned messages before parsing the command.

When a visitor subscribes, the application records the sender email supplied by the message and attempts to retrieve their Webex display name through the People API. Profile lookup failure does not block the subscription; the email remains searchable in the admin subscriber view. An existing Webex subscriber can send the appropriate subscribe command again to refresh these details. A group subscription belongs to the space, so notifications are posted to that shared space rather than privately to the person who entered the command.

Webex incident and maintenance notifications do not link to the public email-unsubscription page. They instruct direct-chat subscribers to send `unsubscribe` to the bot, and group-space subscribers to mention the bot and write `unsubscribe`. Both commands remove the subscription associated with that direct chat or shared space.

### Test and troubleshoot delivery

The subscription reply is sent by the `web` container, while incident and maintenance notifications are sent asynchronously by the `worker` container. Receiving the subscription reply therefore does not prove that the worker has the Webex token. After changing `.env`, always recreate both containers as shown above.

In **Admin → Subscribers**, open a Webex subscriber and select **Queue Webex test notification**. This uses the same database queue, worker, token, and Webex Messages API path as a real status update. Refresh the subscriber page after a few seconds: it now shows whether the latest notification is waiting, retrying, sent, or failed, along with the detailed Webex error and tracking ID when Webex supplies one.

Check that both containers received a token without printing the secret:

```bash
docker compose exec -T web node -e 'console.log(process.env.WEBEX_BOT_TOKEN ? "WEBEX_BOT_TOKEN=SET" : "WEBEX_BOT_TOKEN=MISSING")'
docker compose exec -T worker node -e 'console.log(process.env.WEBEX_BOT_TOKEN ? "WEBEX_BOT_TOKEN=SET" : "WEBEX_BOT_TOKEN=MISSING")'
```

Then inspect worker delivery errors:

```bash
docker compose logs --no-color --tail=200 worker
```

Common results are:

- `Webex is not configured`: `WEBEX_BOT_TOKEN` is absent from the worker container. Recreate `web` and `worker`.
- HTTP `401`: the token is invalid, expired, or is a short-lived personal developer token instead of the bot token.
- HTTP `403` or `404`: the bot cannot access the stored room. Webex requires the sending bot to be a member of the target room; ask the user to start a direct conversation with the configured bot and subscribe again.
- HTTP `429` or a server error: the worker retains the job and retries it with exponential backoff.

The worker logs and admin page include the Webex response reason and tracking ID, but never log the bot token. If a profile name is missing while delivery works, the People lookup was unavailable; the sender email from the Webex message is still stored and searchable.

## Email subscriptions

The public English and Italian pages provide both subscription and unsubscription forms. Unsubscription is confirmed through a one-time email link; the confirmed action permanently deletes the subscription. Confirmation links return a localized human-readable result page rather than JSON.

Incident and maintenance notifications use the configured company name and dark-header logo, contain localized event details, and include the localized unsubscription-page link. The worker always sends a plain-text alternative alongside the HTML message.

## Appearance and branding

Authenticated administrators can use `/admin/settings` to set the persisted public status-page title, and `/admin/appearance` to:

- Configure background, surface, text, accent, border, success, warning, error, and service-status text colors independently for light and dark mode. Service-status text is separate from its marker color: operational, degraded, outage, and maintenance markers remain success, warning, error, and primary respectively.
- Configure the text color used on primary/accent controls.
- Upload separate light-mode and dark-mode logos.
- Upload or remove the public favicon.

Visitors initially follow their operating-system color preference and can override it with the theme button. That choice is stored only in their browser. Logos accept PNG, JPEG, or WebP; favicons accept PNG or ICO; each file is limited to 2 MB. SVG uploads are deliberately rejected.

The settings page also accepts custom JavaScript for analytics and consent tools. Administrators can enter plain JavaScript or paste one or more complete `<script>...</script>` elements; external `src` scripts and common `data-*` configuration attributes are supported. These scripts run early on every public page and never on the administration area. Because they execute with the same browser privileges as application code, only snippets from trusted providers should be saved.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npx drizzle-kit check
npm run build
```

## Uptime semantics

Uptime is calculated only from incidents and maintenance entered by administrators and marked as affecting uptime. Results are persisted per service when relevant records change. The local worker refreshes active downtime and rolling-window boundaries; public requests read the persisted result and do not recompute incident history.
