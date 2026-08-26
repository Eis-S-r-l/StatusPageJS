# EIS Status Page — Implementation Plan

## 1. Objective

Build a monolithic status-page system with Next.js that provides:

- A public status page in English and Italian.
- An English-only administration area.
- Manual management of service categories, services, incidents, and planned maintenance.
- Persisted uptime calculations based exclusively on manually entered downtime.
- Administrator authentication through AWS Cognito.
- Subscriber notifications through Amazon SES, Telegram, and, if practical, Webex.
- Deployment on one virtual machine outside the infrastructure being reported on.

Automated monitoring and automatic incident creation are explicitly out of scope. The displayed uptime represents availability derived from the incidents and maintenance entered by administrators.

## 2. Architectural constraints

The application will be a modular monolith:

- One repository.
- One Next.js application serving the public site, admin site, APIs, and bot webhooks.
- One PostgreSQL database.
- One VM deployment.
- One application build/image.
- A background process from the same application build for notification delivery and scheduled uptime refreshes.

The only required AWS services are:

- AWS Cognito for admin authentication.
- Amazon SES for email delivery.

Telegram and Webex are external notification integrations, not application infrastructure.

## 3. VM deployment

The VM will run the following components, preferably through Docker Compose:

1. A reverse proxy such as Caddy or Nginx for HTTPS and routing.
2. The Next.js web process.
3. A background process built from the same application image.
4. PostgreSQL.

The background process does not constitute a separate service or codebase. It uses the same application modules and database as the web process. Its responsibilities are limited to:

- Delivering and retrying email and bot notifications.
- Sending scheduled maintenance reminders.
- Refreshing persisted uptime values when time alone can make them stale.

The database must listen only on the private Docker or localhost network. Only HTTP and HTTPS should be exposed publicly.

## 4. Application structure

Suggested source layout:

```text
src/
  app/
    [locale]/                 Public English and Italian routes
    admin/                    English-only administration routes
    api/
      auth/                   Cognito callback and logout
      subscribe/              Public subscription endpoints
      telegram/webhook/       Telegram webhook
      webex/webhook/          Webex webhook
  modules/
    auth/
    categories/
    services/
    incidents/
    maintenance/
    uptime/
    subscriptions/
    notifications/
    audit/
  worker/                     Background-process entry point
  db/                         Schema, migrations, and database access
```

Public routes:

```text
/
/en
/it
/en/incidents/{slug}
/it/incidents/{slug}
/en/maintenance/{slug}
/it/maintenance/{slug}
```

Admin routes:

```text
/admin
/admin/services
/admin/incidents
/admin/maintenance
/admin/subscribers
/admin/settings
/admin/audit-log
```

## 5. Data model

English and Italian are fixed requirements, so translated values can use explicit columns such as `name_en` and `name_it`. A generic translation subsystem is unnecessary initially.

### 5.1 Categories

- ID and stable slug.
- English and Italian names.
- Display order.
- Active or archived state.
- Creation and modification timestamps.

### 5.2 Services

- ID and stable slug.
- Category ID.
- English and Italian names and descriptions.
- Monitoring start timestamp.
- Display order.
- Active or archived state.
- Creation and modification timestamps.

The monitoring start controls the earliest instant that can be included in the service uptime calculation.

### 5.3 Incidents

- ID and public slug.
- English and Italian title and description.
- Status: investigating, identified, monitoring, or resolved.
- Start timestamp.
- Resolved timestamp, nullable while active.
- Draft and publication state.
- Publication timestamp.
- Creation and modification timestamps.

An incident is associated with one or more services. Each association records whether the incident counts as downtime for that service. This permits a degraded incident to be shown publicly without necessarily reducing uptime.

Incident updates contain:

- Incident ID.
- English and Italian message.
- Public status at that point.
- Effective timestamp.
- Publication timestamp.

### 5.4 Maintenance

- ID and public slug.
- English and Italian title and description.
- Status: scheduled, in progress, completed, or cancelled.
- Scheduled start and end.
- Actual start and end, when available.
- Draft and publication state.
- Publication timestamp.
- Creation and modification timestamps.

Maintenance is associated with one or more services. Each association records whether it counts as downtime for that service. The default should be controlled by a global `planned maintenance affects uptime` setting, while the administrator may override it for a particular maintenance event.

### 5.5 Persisted uptime metrics

Create one current uptime record per service containing:

- Service ID.
- Calculation interval in days used for this result.
- Effective window start.
- Effective window end.
- Total monitored seconds.
- Downtime seconds.
- Calculated uptime percentage.
- Calculation timestamp.
- Calculation status or error, if recalculation failed.

The public page reads this record directly. It must not scan incidents or recalculate uptime during a visitor request.

### 5.6 Subscriptions and notifications

Subscriptions contain:

- Channel: email, Telegram, or Webex.
- Channel destination, such as email address or chat/room ID.
- Confirmation state.
- Language preference.
- Optional selected services or categories.
- Incident and maintenance preferences.
- Creation, confirmation, and unsubscribe timestamps.

Notification jobs contain:

- Notification type and source event.
- Destination subscription.
- Scheduled send time.
- Current state and attempt count.
- Next retry timestamp.
- Last error.
- Sent timestamp.
- A unique idempotency key to prevent duplicate delivery.

### 5.7 Audit log

Record all admin changes to services, settings, incidents, maintenance, and imports, including the Cognito user ID, operation, timestamp, and relevant before/after values.

### 5.8 Appearance and brand assets

Store separate validated color palettes for light and dark mode in the singleton system settings record. Persist metadata for the current light logo, dark logo, and favicon in PostgreSQL while storing the image bytes on a dedicated VM volume. Theme preference is device-local and may use browser storage because it is not authoritative product data.

Only authenticated administrators may change appearance. Accept raster PNG, JPEG, and WebP logos plus PNG or ICO favicons; reject SVG and files larger than the configured limit. Back up the branding volume together with PostgreSQL.

## 6. Uptime calculation

### 6.1 Formula

For a service at calculation time `T`:

```text
configuredStart = T - configuredInterval
windowStart     = max(configuredStart, service.monitoringStartedAt)
windowEnd       = T

totalMonitoredTime = windowEnd - windowStart
downtime           = duration of the union of all qualifying downtime intervals
                     intersected with [windowStart, windowEnd)

uptimePercentage =
  (totalMonitoredTime - downtime) / totalMonitoredTime * 100
```

If `totalMonitoredTime` is zero or negative, uptime is unavailable and the public page displays `N/A`.

### 6.2 Downtime rules

- Store timestamps in UTC.
- Use half-open intervals: `[start, end)`.
- Include only incident and maintenance associations marked as affecting uptime.
- An active incident or maintenance interval uses the calculation time as its temporary end.
- Clip every downtime interval to the calculation window.
- Clip every downtime interval to the service monitoring start.
- Merge overlapping intervals before summing them so the same second is never counted twice.
- Retain full calculation precision in the database and round only for display.

### 6.3 When recalculation occurs

Recalculate affected services after any of the following operations:

- Create, publish, edit, resolve, unresolve, archive, restore, or delete an incident.
- Change an incident start or resolved timestamp.
- Add or remove an affected service.
- Change whether an incident-service association affects uptime.
- Create, publish, edit, start, complete, cancel, archive, restore, or delete maintenance.
- Change scheduled or actual maintenance timestamps.
- Add or remove a service from maintenance.
- Change whether maintenance affects uptime.
- Change a service monitoring start.
- Change the configured uptime interval.
- Complete a historical import.

For a normal event change, recalculate only the affected services. A monitoring-start change recalculates that service. An interval or global maintenance-policy change recalculates all active services.

The event mutation and its uptime result should be committed atomically when practical. If calculation fails, the mutation must not silently publish an old uptime value. The admin should see the failure and be able to retry.

### 6.4 Time-based refreshes

Mutation-time recalculation removes uptime computation from public requests, but a rolling interval can still change as time passes. Active downtime also continues to grow without another admin action. To keep the persisted value accurate:

- Refresh services with active uptime-affecting incidents or maintenance at a short interval, initially once per minute.
- Refresh all active services once per day so old downtime is removed correctly as it leaves the rolling window.
- Recalculate immediately when an active event is resolved, ensuring the final duration is exact.

These refreshes run in the local background process and require no external scheduler or cloud service. The public page continues to perform database reads only.

### 6.5 Public display

The public page displays:

- The persisted uptime percentage.
- The configured interval, for example `99.982% over the last 90 days`.
- The calculation timestamp.
- `N/A` if monitoring has not started or no valid calculation exists.

The UI should state that uptime is calculated from manually recorded incidents and qualifying maintenance.

## 7. Admin functionality

### 7.1 Dashboard

- Current overall system status.
- Active incidents.
- Upcoming and active maintenance.
- Current uptime values for every service.
- Failed uptime recalculations.
- Failed notification jobs.

### 7.2 Categories and services

- Create, edit, reorder, archive, and restore categories.
- Create, edit, reorder, archive, and restore services.
- Configure service monitoring start.
- Show the recalculated uptime immediately after relevant changes.

### 7.3 Incident management

- Create and edit drafts.
- Enter English and Italian public content.
- Choose affected services.
- Choose which service associations affect uptime.
- Set current or historical timestamps.
- Publish timeline updates.
- Resolve and reopen incidents.
- Preview public content before publication.

### 7.4 Maintenance management

- Create and edit scheduled maintenance.
- Choose affected services.
- Configure whether it affects uptime.
- Publish announcements and reminders.
- Start, complete, extend, or cancel maintenance.
- Record actual start and end timestamps.

### 7.5 Settings

- Rolling uptime interval in days.
- Default planned-maintenance uptime policy.
- Organisation name, branding, and public timezone.
- Notification sender information.
- Telegram and Webex enablement.

## 8. Historical migration

Administrators can create backdated incidents manually. A CSV importer should also be provided for bulk history.

Suggested import columns:

```text
external_id
type
title_en
title_it
started_at
ended_at
service_slugs
affects_uptime
```

The importer must provide a dry run that identifies:

- Unknown services.
- Missing or invalid timestamps.
- End times before start times.
- Duplicate external IDs.
- Open historical incidents.
- Events outside the relevant service monitoring period.

After a successful import, recalculate each affected service once rather than after every imported row.

## 9. Authentication and security

Use an AWS Cognito User Pool with:

- Public self-registration disabled.
- Accounts created or invited by administrators.
- MFA required.
- Cognito managed login.
- Secure, HTTP-only application session cookies.
- Server-side protection for every `/admin` route and data-changing API.

All authenticated administrators may initially have the same permissions. Additional roles should be added only when required.

Bot tokens, SES credentials, Cognito secrets, and database credentials must be stored as VM secrets or protected environment variables and must never be committed to the repository.

Public subscription and bot webhook endpoints require rate limiting and request validation. Telegram and Webex webhook secrets or signatures must be verified.

## 10. Notifications

When a public incident or maintenance change is committed:

1. Recalculate affected service uptime.
2. Insert notification jobs into PostgreSQL.
3. Return control to the administrator.
4. Let the local background process send pending jobs.
5. Retry temporary failures with increasing delays.
6. Expose permanent failures in the admin area.

Email subscriptions require double opt-in and a one-click unsubscribe mechanism. Permanent SES bounces and complaints should disable future sends to that address.

Telegram onboarding uses a language-specific `/start` deep link. Because Telegram authenticates webhook delivery and supplies the destination chat ID, the chat can opt in directly with `/start en` or `/start it` and opt out with `/stop`.

Webex should be implemented after email and Telegram. A user must start a conversation with the bot or add it to a space before that room can be registered for notifications.

## 11. Public page

The bilingual public page includes:

- Overall status derived from active incidents and maintenance.
- Services grouped by category.
- Current service status.
- Persisted uptime percentage and interval.
- Active incident and maintenance banners.
- Upcoming maintenance.
- Incident and maintenance history.
- Detailed event timelines.
- Email, Telegram, and Webex subscription controls.
- English/Italian language switcher.
- Timestamp of the latest status and uptime update.

## 12. Testing

The uptime module needs strong unit coverage for:

- Incidents fully inside, outside, and partially inside the calculation window.
- Monitoring starts inside the configured interval.
- Active incidents without an end timestamp.
- Overlapping incidents and maintenance.
- Multiple affected services.
- Planned maintenance included and excluded from uptime.
- Reopened incidents.
- Changes to the configured interval.
- Zero-duration monitoring periods.
- UTC storage and daylight-saving display boundaries.

Also include:

- Integration tests for admin mutations and persisted uptime updates.
- Integration tests proving that public requests only read persisted metrics.
- End-to-end tests for English and Italian public routes.
- Authentication and authorization tests.
- Notification retry and duplicate-prevention tests.
- Historical import validation tests.

## 13. Operations

- Use automatic HTTPS.
- Keep PostgreSQL private to the VM.
- Produce daily encrypted database backups outside the VM.
- Define and test a database restoration procedure.
- Rotate logs and alert on disk exhaustion.
- Restart application processes automatically after failure or reboot.
- Monitor the web process, worker process, database, notification failures, and age of uptime calculations.
- Show an admin warning when an uptime result is older than its expected refresh interval.

Hosting outside the main company infrastructure reduces correlated failures, but the single VM remains a single point of failure. This is an accepted simplicity tradeoff for the initial version and should be reviewed if the status page becomes business-critical.

## 14. Delivery phases

| Phase | Scope | Indicative duration |
|---|---|---:|
| 1 | Next.js foundation, PostgreSQL, Docker Compose, VM deployment | 1 week |
| 2 | Categories, services, settings, and Cognito authentication | 1–2 weeks |
| 3 | Incidents, maintenance, timelines, and audit log | 1–2 weeks |
| 4 | Persisted uptime engine and historical CSV import | 1–2 weeks |
| 5 | English and Italian public views | 1–2 weeks |
| 6 | Email subscriptions and database-backed notification jobs | 1 week |
| 7 | Telegram and optional Webex integrations | 1–2 weeks |
| 8 | Security, testing, backup verification, and launch | 1 week |

Estimated delivery is seven to nine weeks for one experienced engineer, or approximately five to seven weeks for two engineers, depending on design polish and Webex requirements.

## 15. Accepted product decisions

- The system is a monolith hosted on one external VM.
- Public and admin views are part of the same Next.js application.
- PostgreSQL runs with the application on the VM.
- AWS infrastructure is limited to Cognito and SES.
- Incidents and maintenance are entered manually.
- Uptime is derived only from manually recorded downtime.
- Uptime is persisted and recalculated on relevant mutations, not on public requests.
- A local scheduled refresh keeps rolling intervals and active downtime accurate.
- The public page supports English and Italian; the admin supports English only.
- Planned maintenance can be configured to affect or not affect uptime.
- Telegram is required; Webex is optional subject to integration validation.
- Light and dark mode use independently configurable palettes, while each visitor may keep a device-local theme preference.
- Light logo, dark logo, and favicon uploads are stored on a dedicated persistent VM volume.

## 16. Implementation status

The initial working monolith is now in place. It includes the Next.js public and admin views, PostgreSQL schema and migrations, Cognito login flow, category/service/event administration, mutation-triggered persisted uptime calculations, a rolling refresh worker, bilingual public pages and detail timelines, configurable light/dark themes and branding, email double opt-in, Telegram and Webex command onboarding, database-backed notification delivery with retries, Docker Compose, Caddy, and VM setup documentation.

The next implementation phase should focus on:

- Running the migration and mutation flows against a disposable PostgreSQL instance in CI.
- Adding historical CSV import with dry-run validation.
- Adding an email unsubscribe flow and SES bounce/complaint suppression.
- Adding public-endpoint rate limiting.
- Adding complete editing of event details, service associations, and per-service uptime-impact flags.
- Adding an admin audit-log page and manual notification retry controls.
- Exercising Cognito, SES, Telegram, and optional Webex with real non-production credentials.
- Automating encrypted off-VM backup and restore verification.
