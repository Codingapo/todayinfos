# Build Status — v0.9.5 VPS 3009 Alignment

This release fixes the VPS deployment configuration without changing TodayInfo content, R2, database, Import Inbox, Source Hub or publishing behavior.

## Canonical VPS layout

- Project folder: `/opt/filebrowser/today`
- Node listener: `127.0.0.1:3009`
- Frontend: `https://todayinfo.co.za`
- Admin: `https://todayinfo.co.za/admin/`
- API: `https://api.todayinfo.co.za/api/v1`

## Fixes

- Nginx upstream changed from port 3011 to 3009.
- Nginx frontend root changed from `/var/www/today/frontend` to `/opt/filebrowser/today/frontend`.
- systemd WorkingDirectory, EnvironmentFile and ExecStart now use `/opt/filebrowser/today`.
- Node default port changed to 3009.
- production environment examples use port 3009 and the actual VPS directory.
- `deploy/install-vps.sh` installs/generates systemd + Nginx from `APP_DIR` and `APP_PORT`.
- `deploy/update-vps.sh` no longer requires Git: when Git is unavailable it downloads the GitHub `main` archive while preserving `.env`, local data, uploads and runtime state.
- Update/install health checks use the configured port instead of a hard-coded 3011.

## Existing storage

Cloudflare R2 remains unchanged and continues to hold published JSON/files. This release only fixes the VPS serving/deployment layer.

## Why the previous public URL returned 502

A Node process had been started manually on port 3009, while the checked-in Nginx deployment still proxied to port 3011. Stopping the manual process with Ctrl+C also left no backend listening. The production service now uses systemd so it stays running and restarts automatically.
