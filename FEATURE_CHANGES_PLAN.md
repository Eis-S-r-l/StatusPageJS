# Category, History, and Theme Improvements

## Summary

- Replace the large category/service creation forms with compact lists and modal workflows.
- Allow full editing of every existing category and service field.
- Add localized, paginated incident and maintenance index pages.
- Add an independent light/dark theme color for service-status label text.

## Implementation Changes

### Category and service administration

- Reuse the existing custom dialog, slug, datetime, form, button, and list components; extract the event dialog wrapper into a shared admin component.
- Show `Add category` and `Add service` buttons above separate compact lists. Each row displays its names, category/order metadata, and `Edit`/`Archive` actions.
- Category create/edit modals expose slug, English/Italian names, and numeric display order.
- Service create/edit modals expose category, slug, English/Italian names and descriptions, browser-local monitoring start, and numeric display order.
- Preserve ascending numeric ordering with name as the deterministic tie-breaker. Service order is scoped visually within its category.
- Add action-state based create/edit server actions so validation errors stay inside the open modal and successful saves close it and refresh the list.
- Validate unique slugs, required names, non-negative order, valid category, and UTC monitoring timestamps.
- Perform edits, audit logging, and uptime recalculation transactionally. Recalculate a service when its monitoring start changes.
- Revalidate the admin list and both localized public pages after mutations. Keep existing archive behavior.

### Public incident and maintenance indexes

- Add `/{locale}/incidents` and `/{locale}/maintenance` pages, each showing every published, non-archived record regardless of lifecycle state.
- Sort newest first by incident start or scheduled maintenance start, with a stable ID tie-breaker.
- Use 20-item server-side pagination through `?page=N`; missing or invalid values use page 1, while values beyond the result set clamp to the last page.
- Add localized metadata, empty states, previous/next controls, page counts, and locale switching that retains the current page.
- Extract the existing dashboard event card into a reusable public component.
- Add `View all incidents` and `View all maintenance` links beside Recent history. Add cross-links between both index pages.
- Keep the dashboard's current active, upcoming, and recent sections unchanged.
- Enrich public events with localized affected-service summaries so index and detail pages display services even if those services were later archived.
- Replace `StatusEvent.affectedServiceIds` with `affectedServices`, and add:
  - `PaginatedStatusEvents`
  - `PublicStatusRepository.listIncidents(page, pageSize)`
  - `PublicStatusRepository.listMaintenances(page, pageSize)`
- Update database and fixture repositories consistently. Add compound public-history indexes if query-plan verification shows the existing indexes cannot serve filtered chronological pagination efficiently.

### Theme

- Add `serviceStatusText` to both palette definitions and expose it as `Service status text` in the existing appearance editor.
- Add `--color-service-status-text` and apply it to every service-status label.
- Keep markers semantic: operational uses success, degraded uses warning, outage uses danger, and maintenance uses primary.
- Backfill existing JSON palettes from their current primary color so appearance does not change immediately, and update database defaults for new installations.
- Update palette normalization, CSS variable generation, previews, audit payloads, and README documentation.

## Test Plan

- Test category/service validation, edit payload preservation, audit data, category moves, ordering, and uptime recalculation after monitoring-start changes.
- Test history filtering, stable ordering, all lifecycle states, archived/draft exclusion, pagination boundaries, affected archived-service names, and fixture parity.
- Test English/Italian routes, detail links, cross-links, metadata, empty pages, and locale-preserving pagination.
- Test missing and customized `serviceStatusText` values, CSS-variable generation, and independent label/marker colors in both themes.
- Manually verify modal focus/cancel behavior, retained validation errors, mobile layouts, and public ordering.
- Run migrations, tests, lint, typecheck, and production build. The current global `npm` launcher is missing `npm-cli.js`, so validation requires a repaired or alternate Node/npm runtime.

## Assumptions

- Editing includes all fields currently available during creation.
- Duplicate numeric order values are allowed and resolved by localized-name ordering.
- Public history includes active, upcoming, resolved, completed, and cancelled published events, but never drafts or archived records.
- Pagination defaults to 20 records per page.
- No new test-only frontend component will be created.
