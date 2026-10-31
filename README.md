# StayFinder API

A small backend built with [Hono](https://hono.dev/) and TypeScript for a
"StayFinder" style booking app. It is a school project for the Backend 2
(TypeScript) course.

Data is stored in PostgreSQL via [Supabase](https://supabase.com/). The
original JSON files (`src/data/properties.json` and `src/data/bookings.json`)
are kept only as a reference for the seed data in `supabase/schema.sql`; the
app itself no longer reads or writes them.

## Tech stack

- [Hono](https://hono.dev/) – web framework
- TypeScript
- [Zod](https://zod.dev/) + [@hono/zod-validator](https://github.com/honojs/middleware/tree/main/packages/zod-validator) – request validation
- [Supabase](https://supabase.com/) (PostgreSQL) via [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) – database

## Getting started

### Prerequisites

- Node.js 20.6+ (uses `--env-file` for environment variables)
- A [Supabase](https://supabase.com/dashboard) project

### Install

```bash
npm install
```

### Set up the database

In the Supabase dashboard, open **SQL Editor** and run these files, in this order:

1. [`supabase/schema.sql`](./supabase/schema.sql): creates the `properties` and
   `bookings` tables and seeds them with the same sample data that used to live in
   the JSON files.
2. [`supabase/step-b-ownership.sql`](./supabase/step-b-ownership.sql): adds the
   nullable ownership columns `properties.owner_id` and `bookings.user_id`.
3. [`supabase/step-b-rls.sql`](./supabase/step-b-rls.sql): enables Row Level
   Security and creates the policies (see "Access rules" below).

### Configure environment variables

Copy the example file and fill in your Supabase project's URL and
`anon` key (found under **Project Settings → API** in the dashboard):

```bash
cp .env.example .env
```

| Variable                    | Description                                          | Default |
| ---------------------------- | ----------------------------------------------------- | ------- |
| `HONO_PORT`                  | Port the server listens on                             | `3000`  |
| `SUPABASE_URL`                | Your Supabase project URL                               | —       |
| `SUPABASE_ANON_KEY`           | Supabase `anon` (public) key; Row Level Security applies | —       |
| `EMAIL_REDIRECT_URL`          | Optional. Where the email confirmation link sends the user. Must be in Supabase's Redirect URLs; defaults to the project's Site URL | — |

### Run in development

```bash
npm run dev
```

The server starts on `http://localhost:3000` (or the port set in `.env`).

### Build & run for production

```bash
npm run build
npm start
```

## Endpoints

### Properties

| Method | Path              | Auth   | Description                                                  | Status |
| ------ | ----------------- | ------ | ------------------------------------------------------------ | ------ |
| GET    | `/properties`     | –      | List all properties                                          | `200` |
| GET    | `/properties/:id` | –      | Get a single property by id                                  | `200`, `404` |
| POST   | `/properties`     | Bearer | Create a property. `owner_id` is set from the logged-in user | `201`, `400`, `401` |
| PUT    | `/properties/:id` | Bearer | Replace a property's fields (owner only)                     | `200`, `400`, `401`, `404` |
| DELETE | `/properties/:id` | Bearer | Delete a property (owner only)                               | `200`, `401`, `404`, `409` if it still has bookings |

`POST` and `PUT` body: `{ title, description, location, price_per_night, max_guests }`.
`property_id` and `owner_id` are never read from the body.

### Bookings

All booking routes require `Authorization: Bearer <access_token>` and return `401` without it.

| Method | Path            | Description                                                                 |
| ------ | --------------- | ---------------------------------------------------------------------------- |
| GET    | `/bookings`     | List the logged-in user's bookings                                           |
| GET    | `/bookings/:id` | Get one of the user's bookings                                               |
| POST   | `/bookings`     | Create a booking. Body is validated with Zod; `booking_id` is generated, `user_id` is set from the logged-in user and `status` defaults to `"pending"` |
| PUT    | `/bookings/:id` | Replace a booking. The id always comes from the URL, never from the body     |
| PATCH  | `/bookings/:id` | Partially update a booking (any subset of fields)                            |
| DELETE | `/bookings/:id` | Delete a booking                                                             |

`GET /:id`, `PUT`, `PATCH` and `DELETE` return `404` if the booking does not exist
**or belongs to another user**. `user_id` is never read from the body and cannot be changed.

### Access rules (Row Level Security)

The API forwards the user's JWT to the database, which enforces the rules itself
(`supabase/step-b-rls.sql`):

- `properties`: everyone can read; only the owner (`owner_id = auth.uid()`) can insert, update or delete.
- `bookings`: logged-in users can only read and change rows where `user_id = auth.uid()`.
- Rows created before ownership existed have `owner_id`/`user_id = null`. Properties stay readable, but nobody can change them through the API, and old bookings are invisible.

### Auth (Supabase Auth, email + password)

"Confirm email" is enabled in Supabase, so a new user must click the link in the
confirmation email before they can log in.

| Method | Path             | Auth             | Body                          | Success | Errors |
| ------ | ---------------- | ---------------- | ----------------------------- | ------- | ------ |
| POST   | `/auth/register` | –                | `{ email, password }`         | `201` `{ message, email_confirmation_required }` (no tokens) | `400` invalid body, `409`/`422`/`429`/`500` |
| POST   | `/auth/login`    | –                | `{ email, password }`         | `200` `{ access_token, refresh_token, token_type, expires_in, expires_at, user }` | `400`, `401` wrong credentials, `403` email not confirmed, `429` |
| POST   | `/auth/refresh`  | –                | `{ refresh_token }`           | `200` new session (same shape as login) | `400`, `401` invalid/expired refresh token |
| POST   | `/auth/logout`   | `Bearer` access token | `{ refresh_token }`      | `200` `{ message }` | `400`, `401` |
| GET    | `/auth/me`       | `Bearer` access token | –                        | `200` `{ id, email, email_confirmed_at, created_at }` | `401` |

Send the access token as `Authorization: Bearer <access_token>`. The `requireAuth`
middleware (`src/middleware/auth.ts`) verifies it with `supabase.auth.getUser(token)`.

Limitations: `/auth/logout` ends the session on Supabase's side, but the access
token is a signed JWT and stays valid until it expires, so the client must also
discard both tokens.

### Example: create a booking

```bash
curl -X POST http://localhost:3000/bookings \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": "property_1001",
    "guest_name": "Anna",
    "guests": 2,
    "guest_email": "anna@example.com",
    "check_in": "2026-01-10",
    "check_out": "2026-01-12"
  }'
```

## Project structure

```
supabase/
  schema.sql              # table definitions + seed data for Supabase (run first in the SQL Editor)
  step-b-ownership.sql    # adds owner_id / user_id columns
  step-b-rls.sql          # enables Row Level Security and creates policies
src/
  data/
    properties.json    # reference-only; mirrors the seed data in supabase/schema.sql
    bookings.json       # reference-only; mirrors the seed data in supabase/schema.sql
  lib/
    supabaseClient.ts   # shared Supabase client + per-request auth/user client factories
  middleware/
    auth.ts             # requireAuth: verifies the access token
  routes/
    auth.ts
    bookings.ts
    properties.ts
  types/
    auth.d.ts           # variables requireAuth puts on the Hono context
    booking.d.ts        # NewBooking / Booking types
    property.d.ts        # NewProperty / Property types
  index.ts              # app entry point
```
