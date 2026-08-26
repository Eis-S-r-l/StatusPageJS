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

Copy `.env.example` to `.env`, replace every placeholder and default password, set `STATUS_DOMAIN`, and then run:

```bash
docker compose up --build -d
```

The Compose deployment starts PostgreSQL, applies migrations, starts the Next.js web process and background worker, and exposes the application through Caddy with automatic HTTPS. A dedicated `branding_data` volume persists uploaded logos and favicons across container replacements.

Before production launch:

- Configure a Cognito User Pool and app client with the callback URL shown in `.env.example`. Create the administrator group named by `COGNITO_ADMIN_GROUP` and add every permitted administrator to it; group names are matched exactly and case-sensitively.
- Verify the email-sending domain in Amazon SES and request production access.
- Register Telegram and optional Webex webhooks using strong webhook secrets.
- Set the public Telegram bot username and optional Webex bot email so visitors can open the bot onboarding flow from the status page. Telegram accepts `/start en`, `/start it`, and `/stop`; Webex accepts `subscribe en`, `subscribe it`, and `stop`.
- Replace the default PostgreSQL password.
- Configure encrypted off-VM backups for both PostgreSQL and the `branding_data` volume, then test a complete restore.

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
