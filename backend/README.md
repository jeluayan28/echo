# ECHO backend

Laravel 12 · PHP 8.2+ · PostgreSQL 15+ · Laravel Sanctum (bearer tokens for the mobile app).

REST API under **`/api/v1`**. Every user-owned resource is private to its owner; another user's id answers `404`,
exactly like an id that doesn't exist.

## Setup on Windows (PowerShell)

Prerequisites: PHP 8.2+ with `pdo_pgsql`, Composer, PostgreSQL 15 or newer (`psql` on PATH).

```powershell
cd C:\Users\Jelli\Desktop\echo\backend

composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
```

Edit `.env` and set the database credentials (the file is git-ignored — never commit it):

```
DB_USERNAME=postgres          # or a dedicated role
DB_PASSWORD=<your PostgreSQL password>
```

Create the development database and the **test** database (the tests wipe `echo_test`; they refuse to run against
any database whose name does not end in `_test`):

```powershell
createdb -h 127.0.0.1 -U postgres echo
createdb -h 127.0.0.1 -U postgres echo_test
```

Create the tables and (optionally) demo data, then start the API:

```powershell
php artisan migrate
$env:DEMO_USER_PASSWORD = "choose-a-local-password"; php artisan db:seed   # demo@echo.test (omit the variable to get a generated password)
php artisan serve                                                          # http://127.0.0.1:8000
```

Smoke test (PowerShell):

```powershell
$login = Invoke-RestMethod -Method Post http://127.0.0.1:8000/api/v1/auth/login -ContentType application/json `
  -Body (@{ email = "demo@echo.test"; password = "choose-a-local-password" } | ConvertTo-Json)
Invoke-RestMethod http://127.0.0.1:8000/api/v1/search?q=notes -Headers @{ Authorization = "Bearer $($login.data.token)"; Accept = "application/json" }
```

## Verify

```powershell
php artisan test                       # 175 tests, PostgreSQL required (database echo_test)
php artisan migrate:status
php artisan route:list --path=api
vendor\bin\pint --test                 # code style
```

Housekeeping (`php artisan schedule:work` locally, or a cron entry running `php artisan schedule:run` every minute in production):
`echo:prune` deletes uploads never attached to a memory (after 24 h) and memories that have been in the trash for 30 days,
including their files.

## Endpoints

| Area | Routes |
|---|---|
| Auth | `POST auth/register` · `POST auth/login` · `POST auth/logout` |
| Account | `GET/PATCH/DELETE me` · `GET/PATCH me/preferences` |
| Memories | `GET/POST memories` · `GET/PATCH/DELETE memories/{id}` · `POST memories/{id}/open` · `GET memories/trashed` · `POST memories/{id}/restore` · `DELETE memories/{id}/force` |
| Collections | `GET/POST collections` · `GET/PATCH/DELETE collections/{id}` |
| Tags | `GET/POST tags` · `PATCH/DELETE tags/{id}` |
| Relationships | `GET links` (whole graph) · `GET/POST memories/{id}/links` · `DELETE memories/{id}/links/{otherId}` |
| Search | `GET search?q=…` (+ `type`, `collection_id`, `tag`, `favorite`, `pinned`) |
| Reminders | `GET reminders` · `GET/PUT/DELETE memories/{id}/reminder` · `POST reminders/{id}/complete` |
| Attachments | `POST attachments` · `GET/DELETE attachments/{id}` · `GET attachments/{id}/file` · `GET/POST memories/{id}/attachment` |

Conventions: JSON only · `data` / `links` / `meta` envelope with `?page=&per_page=` (max 100; the graph endpoint 500) ·
`201` create, `204` delete, `401` unauthenticated, `404` missing **or not yours**, `409` duplicate link, `422` validation
(`{message, errors}`), `429` rate limited.

## Design notes

- **Tenant isolation, twice.** Controllers only query through the authenticated user and policies check ownership
  (`404` for non-owners). Below that, the database refuses cross-user references: every child row carries `user_id` and
  points at its parent through a *composite* foreign key `(user_id, parent_id)`, so even a buggy query cannot put Alice's
  memory in Bob's collection, tag, or link.
- **Relationships** are undirected, stored once with the smaller id first: `CHECK (from < to)` forbids self-links and
  reversed duplicates, `UNIQUE (from, to)` forbids repeats. The API answers `422` (self / foreign / missing target) or `409` (exists).
- **Search**: a stored generated `tsvector` (`title` weight A, `body` weight B, `simple` config) with a GIN index; every
  word must match and the last word matches as a prefix; tags match too. Input is reduced to letters/digits, so no
  query syntax can be injected. List and search responses return a 200-char `excerpt`, never the full body.
- **Cascades**: deleting a user deletes their data; deleting a collection keeps its memories; soft-deleting a memory keeps
  its links/tags/reminder so *Undo* restores everything; permanently deleting removes them and the stored file.
- **Files**: bytes go to the disk named by `ECHO_ATTACHMENT_DISK` (private; S3-compatible in production), PostgreSQL stores
  metadata only. Type is sniffed from the file content, size is capped, names are generated server-side, `path`/`disk`
  are never returned. Playback uses a 10-minute signed URL issued only to the owner.
- **Auth**: Sanctum bearer tokens (hashed at rest, 30-day expiry, per-device, logout revokes one device, a password change
  revokes the others). Login is rate limited per account+IP; passwords are bcrypt-hashed; email/password changes and
  account deletion require the current password.
- **N+1 is a test failure**: outside production, lazy loading throws, and tests assert that query counts don't grow with row counts.

## Limits and open items

- Reminders are stored here; the notification itself is scheduled on the device (best-effort, no delivery guarantee).
  The server does not push notifications yet.
- The mobile app still uses its in-memory sample repository; switching it to this API is a separate step.
- Production needs: `APP_DEBUG=false`, `APP_ENV=production`, TLS, a least-privilege database role,
  `CORS_ALLOWED_ORIGINS` (if a web client is used), `TRUSTED_PROXIES` behind a load balancer, an S3 disk for files, and a scheduler.
