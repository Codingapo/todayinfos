# Build Status — v0.9.6 Dual-Port VPS

This release changes deployment wiring only. Existing TodayInfo content, Import Inbox, Demand Queue, Source Hub, R2 publishing, Supabase/PostgreSQL tracking, public API, employee roles and publishing rules remain intact.

## Production listeners

- API / admin API: `127.0.0.1:3009`
- Public frontend + admin UI: `127.0.0.1:3011`
- Public site: `https://todayinfo.co.za`
- Admin UI: `https://todayinfo.co.za/admin/`
- API: `https://api.todayinfo.co.za`

## Changes

- Added `src/frontend-server.mjs`.
- Added `npm run start:api` and `npm run start:frontend`.
- Public frontend has server-side SPA fallback, so extension-free routes no longer depend on Nginx `try_files`.
- `/admin` is served by the frontend process on port 3011.
- Admin API calls switch to `https://api.todayinfo.co.za/admin/api` when the UI is on the public domain.
- Admin browser requests use `credentials: include`.
- API enables credentialed CORS only for configured admin origins.
- Local `localhost:3011 -> localhost:3009` admin development is supported.
- Added optional `todayinfo-frontend.service` systemd unit.
- Admin login no longer prefills a password.
- R2 settings and object structure are unchanged.

## Caching

- Frontend compression enabled.
- Strong ETags enabled.
- `frontend/assets/*` cache for one day with stale-while-revalidate.
- SPA HTML revalidates.
- Admin UI is no-store.
- Existing API cache policy stays in place.

## Release gate

Before merge:
- dependency install must pass;
- `npm run check` must pass;
- full `npm test` must pass.
