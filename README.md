# toxiclean-backend

NestJS API backed by PostgreSQL (TypeORM).

## Setup

```bash
npm install
cp .env.example .env   # then set DATABASE_URL
createdb toxiclean
npm run start:dev      # http://localhost:3001/api
```

## API

All routes are prefixed with `/api`. Request bodies are validated (`class-validator`); unknown fields are rejected.

| Method | Path                  | Description                                                        |
| ------ | --------------------- | ------------------------------------------------------------------ |
| GET    | `/api`                | Health check                                                       |
| POST   | `/api/quote-requests` | Create a bulk quote request. Returns `{ reference: "TX-PR-000001" }` |
| POST   | `/api/auth/signup`           | Create an account; returns `{ token, expiresAt, user }` |
| POST   | `/api/auth/login`            | Log in; returns `{ token, expiresAt, user }` |
| POST   | `/api/auth/logout`           | Revoke the session (Bearer token) |
| GET    | `/api/auth/me`               | The signed-in user (Bearer token) |
| POST   | `/api/auth/forgot-password`  | Email a reset link (always 204; never reveals if the email exists) |
| POST   | `/api/auth/reset-password`   | Set a new password with a reset token; signs out all sessions |
| GET    | `/api/quote-requests/mine`   | The signed-in user's quote requests (Bearer token) |
| PATCH  | `/api/account/profile`       | Update name, phone, country (Bearer token) |
| PATCH  | `/api/account/language`      | Update preferred language (Bearer token) |
| POST   | `/api/account/password`      | Change password; signs out other sessions (Bearer token) |
| GET/POST | `/api/addresses`           | List / add saved addresses (Bearer token) |
| PATCH/DELETE | `/api/addresses/:id`   | Edit / delete one of your saved addresses (Bearer token) |
| POST   | `/api/contact-messages`      | Contact form message (5/min per IP) |
| POST   | `/api/bookings`              | Book a service: multipart fields + up to 5 `photos` (PNG/JPG, 5MB each). Links to the account when a Bearer token is sent. Returns `{ reference: "TX-BK-000001" }` |
| GET    | `/api/bookings/mine`         | The signed-in user's bookings (Bearer token) |
| POST   | `/api/bookings/:id/reschedule` | Ask to move a scheduled booking: `{ preferredDate, preferredTime }`; the team is emailed (Bearer token) |
| POST   | `/api/bookings/:id/cancel`   | Ask to cancel a requested or scheduled booking: `{ reason? }`; the team is emailed (Bearer token) |
| GET    | `/api/bookings/:id/photos/:index` | Stream one of your booking photos (Bearer token) |
| GET    | `/api/documents/mine`        | The signed-in user's documents (certificates, records, invoices, receipts) (Bearer token) |
| GET    | `/api/documents/:id/file`    | Stream one of your documents; `?download=1` sends it as an attachment (Bearer token) |

Auth details: passwords are hashed with scrypt; session and reset tokens are random
32-byte values stored only as SHA-256 hashes; sessions last 30 days, reset links 1 hour
and are single-use. Auth routes are rate limited per client IP (the webapp forwards it;
see `TRUST_PROXY`).

Email goes through [Brevo](https://www.brevo.com) (`src/mail`). Set `BREVO_API_KEY` and a
verified `MAIL_FROM_EMAIL`; until then emails are logged to the console. Customers get a
confirmation for product requests, bulk quotes, bookings and contact messages, in the
language they were browsing in (the webapp forwards it as `Accept-Language`); password
resets use the account's language. `MAIL_TEAM_EMAIL` receives a notification for each
one, with Reply-To set to the customer. Sending happens in the background and a failed
email is logged without failing the request.

Booking photos are checked by their file signature (not the client's MIME type) and
stored under `bookings/` with random names; they are never served publicly. Storage
(`src/storage`) uses local disk under `UPLOADS_DIR` by default and switches to S3 when
`S3_BUCKET` is set (see `.env.example`; keep the bucket private). Each file records
which one it was saved to, so older local files stay readable after switching.

Customer documents (PDF, PNG or JPG, up to 20MB) are stored under `documents/` the same
way and only served to their owner. Until the admin exists, issue one from the command
line (after `npm run build`):

```bash
npm run documents:add -- --email ada@example.com --type invoice \
  --title "Fumigation Service Invoice" --reference TX-BK-000001 \
  --issued 2026-08-12 --file ./invoice.pdf
```

`--type` is one of `certificate`, `record`, `invoice`, `receipt`; `--issued` defaults to
today.

Bookings move through `requested → scheduled → on_the_way → in_progress → completed`,
or `closed` (cancelled or otherwise ended). Customers can ask to reschedule a scheduled
booking or cancel one that hasn't started; the request waits for the team. Until the
admin exists, the team updates bookings from the command line:

```bash
npm run bookings:update -- --reference TX-BK-000001 --status scheduled \
  --date 2026-08-12 --time 10:00 --fumigator "Michael Adeyemi"
npm run bookings:update -- --reference TX-BK-000001 --status in_progress
npm run bookings:update -- --reference TX-BK-000001 --confirm-reschedule --time 09:00
npm run bookings:update -- --reference TX-BK-000001 --confirm-cancellation   # closes it
npm run bookings:update -- --reference TX-BK-000001 --decline-request
```

Completed bookings show "View Certificate" once a `certificate` document with the
booking's reference has been added (`npm run documents:add`).

## Deployment (Coolify)

Coolify builds the `Dockerfile` on each push to `main`. The container runs
`node dist/main.js` on port 3001 and, with `NODE_ENV=production` (set in the image),
applies pending migrations from `src/database/migrations` on startup. Don't give this
app a public domain: the webapp reaches it over Coolify's private network.

Environment variables (Coolify → app → Environment Variables):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Internal URL of the Coolify PostgreSQL database |
| `WEBAPP_URL` | `https://toxicleanservices.com` |
| `TRUST_PROXY` | `uniquelocal` (the webapp calls from the private Docker network) |
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `MAIL_TEAM_EMAIL` | See `.env.example` |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | See `.env.example` |

Schema changes: after editing an entity, run `npm run build` then
`npm run migration:generate -- src/database/migrations/DescribeTheChange` against a
database that matches production, and commit the new file. Development keeps using
auto-sync.

Team commands in production: open the backend's Terminal in Coolify and run
`node dist/scripts/update-booking.js …` or `node dist/scripts/add-document.js …`
(same options as the `npm run` versions above).
