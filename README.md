# StayFinder

A small booking app in the style of Airbnb, built for the Backend 2 (TypeScript)
course. It has a [Hono](https://hono.dev/) + TypeScript API, a PostgreSQL database
on [Supabase](https://supabase.com/) with Supabase Auth and Row Level Security,
and a plain TypeScript frontend (no framework) that Hono serves as static files.

## Features

- Browse properties with filtering (location, max price, guests) and sorting (price)
- Property pages with a photo, and a booking form with nights and total price
- Register, log in and log out with email confirmation (Supabase Auth)
- Hosts can create, edit and delete their own properties ("Host" page)
- Guests can create, change, cancel and delete their own bookings ("Bookings" page)
- Access rules are enforced in the database with Row Level Security, not only in the API

## Tech stack

- [Hono](https://hono.dev/) – web framework (API and static file serving)
- TypeScript in both backend and frontend
- [Zod](https://zod.dev/) + [@hono/zod-validator](https://github.com/honojs/middleware/tree/main/packages/zod-validator) – request validation
- [Supabase](https://supabase.com/) (PostgreSQL, Auth, Row Level Security) via [`@supabase/supabase-js`](https://github.com/supabase/supabase-js)
- Frontend: plain TypeScript compiled with `tsc` to `public/js/`, plain CSS, hash-based routing (no bundler or framework)

## Getting started

### Prerequisites

- Node.js 20.6+ (the scripts use `--env-file` for environment variables)
- A [Supabase](https://supabase.com/dashboard) project

### Install

```bash
npm install
```

### Set up Supabase

**1. Database.** In the Supabase dashboard, open **SQL Editor** and run these files,
each in a new query tab, in this order:

1. [`supabase/schema.sql`](./supabase/schema.sql): creates the `properties` and
   `bookings` tables and seeds them with sample data. Run it only once. Running it
   again can re-enable settings or overwrite rows.
2. [`supabase/step-b-ownership.sql`](./supabase/step-b-ownership.sql): adds the
   nullable ownership columns `properties.owner_id` and `bookings.user_id`.
3. [`supabase/step-b-rls.sql`](./supabase/step-b-rls.sql): enables Row Level
   Security and creates the policies (see "Access rules" below).
4. [`supabase/step-c-images.sql`](./supabase/step-c-images.sql): adds the optional
   `properties.image_url` column with a check constraint (https only, max 2048 characters).

The sample properties from `schema.sql` have no owner, so nobody can edit them
through the API. To make a user their owner, run this in the SQL Editor (the user id
is under **Authentication → Users**):

```sql
update properties
set owner_id = '<user-uuid>'
where property_id in ('property_1001', 'property_1002', 'property_1003', 'property_1004');
```

**2. Authentication.** In **Authentication** in the dashboard:

- Make sure the Email provider is enabled and **Confirm email** is on.
- Under **URL Configuration**, set **Site URL** to `http://localhost:3000` and add
  `http://localhost:3000/**` to **Redirect URLs**.

### Configure environment variables

Copy the example file and fill in your Supabase project's URL and `anon` key
(under **Project Settings → API** in the dashboard). Never commit `.env`.

```bash
cp .env.example .env
```

| Variable             | Description                                                                 | Default |
| -------------------- | --------------------------------------------------------------------------- | ------- |
| `HONO_PORT`          | Port the server listens on                                                  | `3000`  |
| `SUPABASE_URL`       | Your Supabase project URL (without `/rest/v1`)                              | –       |
| `SUPABASE_ANON_KEY`  | Supabase `anon` (public) key. Row Level Security applies to it              | –       |
| `EMAIL_REDIRECT_URL` | Optional. Where the confirmation link sends the user. Must be in Supabase's Redirect URLs; defaults to the project's Site URL | – |

The `service_role` key is never used by this project.

### Run in development

Use two terminals:

```bash
npm run dev            # backend with auto-restart on http://localhost:3000
npm run dev:frontend   # compiles frontend/ to public/js/ on every change
```

Open `http://localhost:3000` in the browser.

### Build and run for production

```bash
npm run build            # compiles the backend to dist/
npm run build:frontend   # compiles the frontend to public/js/
npm start
```

Start the server from the project root, because the static files are served from `./public`.

## Frontend

The frontend lives in `frontend/` (TypeScript) and is compiled to `public/js/`.
`public/index.html` loads it as an ES module, and Hono serves `public/` as static files.
The session (access and refresh token) is stored in `localStorage`, expired access
tokens are refreshed automatically, and all content from users and the API is inserted
with `textContent` or DOM methods, never with `innerHTML`.

Routes use the URL hash, so they work without server configuration:

| Route                         | Page                                             | Login required |
| ----------------------------- | ------------------------------------------------ | -------------- |
| `#/properties`                | Property list with search and filters            | No             |
| `#/properties/<id>`           | Property page with the booking form              | No (booking requires login) |
| `#/login`, `#/register`       | Log in and register                              | No             |
| `#/bookings`                  | My bookings (change, cancel, delete)             | Yes            |
| `#/bookings/<id>/edit`        | Change a booking                                 | Yes            |
| `#/host`                      | My properties                                    | Yes            |
| `#/properties/new`            | Create a property                                | Yes            |
| `#/properties/<id>/edit`      | Change a property (owner only)                   | Yes            |

Hiding buttons for non-owners in the interface is only a convenience. The actual
protection is in the API and in Row Level Security.

## Endpoints

### Properties

| Method | Path                | Auth   | Description                                                      | Status |
| ------ | ------------------- | ------ | ---------------------------------------------------------------- | ------ |
| GET    | `/properties`       | –      | List properties. Optional filters and sorting, see below         | `200`, `400` |
| GET    | `/properties/mine`  | Bearer | List the logged-in user's own properties                         | `200`, `401` |
| GET    | `/properties/:id`   | –      | Get a single property by id                                      | `200`, `404` |
| POST   | `/properties`       | Bearer | Create a property. `owner_id` is set from the logged-in user     | `201`, `400`, `401` |
| PUT    | `/properties/:id`   | Bearer | Replace a property's fields (owner only)                         | `200`, `400`, `401`, `404` |
| DELETE | `/properties/:id`   | Bearer | Delete a property (owner only)                                   | `200`, `401`, `404`, `409` if it still has bookings |

`POST` and `PUT` body: `{ title, description, location, price_per_night, max_guests, image_url? }`.
`property_id` and `owner_id` are never read from the body.

`image_url` is optional. It must be an `https://` link of at most 2048 characters (checked
by Zod and by a constraint in the database). An empty value is stored as `null`. The images
are loaded from the external site in the browser, so a link can stop working. The interface
falls back to a plain colour block when an image is missing or fails to load.

`/properties/mine` is registered before `/properties/:id`, because otherwise `mine` would
be treated as a property id.

#### Filtering and sorting `GET /properties`

All query parameters are optional and can be combined. Unknown parameters are ignored,
and an empty value (`?max_price=`) counts as not sent.

| Parameter   | Meaning                                                                      | Valid values |
| ----------- | ---------------------------------------------------------------------------- | ------------ |
| `location`  | Case-insensitive substring match on `location`                               | any text, max 100 characters |
| `max_price` | Only properties with `price_per_night <= max_price`                          | a number greater than 0 |
| `guests`    | Only properties that fit at least this many guests (`max_guests >= guests`)  | a whole number greater than 0 |
| `sort`      | Sort by `price_per_night`. Done by the database. Without it the order is unchanged | `price_asc` or `price_desc` |

Invalid values return `400` with `{ "errors": [...] }`. No match returns `200` with `[]`.
`%`, `_` and `\` in `location` are escaped, so they are matched as plain characters.

```bash
curl "http://localhost:3000/properties?location=stockholm"
curl "http://localhost:3000/properties?max_price=900"
curl "http://localhost:3000/properties?guests=4"
curl "http://localhost:3000/properties?sort=price_asc"
curl "http://localhost:3000/properties?location=sweden&guests=3&max_price=1000&sort=price_desc"
```

### Bookings

All booking routes require `Authorization: Bearer <access_token>` and return `401` without it.

| Method | Path            | Description                                                                 |
| ------ | --------------- | --------------------------------------------------------------------------- |
| GET    | `/bookings`     | List the logged-in user's bookings                                          |
| GET    | `/bookings/:id` | Get one of the user's bookings                                              |
| POST   | `/bookings`     | Create a booking. `booking_id` is generated, `user_id` is set from the logged-in user and `status` defaults to `"pending"` |
| PUT    | `/bookings/:id` | Replace a booking. The id always comes from the URL, never from the body    |
| PATCH  | `/bookings/:id` | Partially update a booking (any subset of fields)                           |
| DELETE | `/bookings/:id` | Delete a booking                                                            |

`GET /:id`, `PUT`, `PATCH` and `DELETE` return `404` if the booking does not exist
**or belongs to another user**. `user_id` is never read from the body and cannot be changed.

Booking body: `{ property_id, guest_name, guest_email, check_in, check_out, guests, status? }`.

Validation on `POST`, `PUT` and `PATCH` (a `PATCH` is merged with the existing booking before
it is validated):

- `check_in` and `check_out` must be real dates in `YYYY-MM-DD` format (`2026-02-31` is rejected)
- `check_out` must be after `check_in` (at least one night)
- `check_in` cannot be in the past
- `property_id` must exist, otherwise `404` with a readable message
- `guests` cannot exceed the property's `max_guests`

Validation errors return `400` with `{ "errors": [...] }`.

#### Example: create a booking

```bash
curl -X POST http://localhost:3000/bookings \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": "property_1001",
    "guest_name": "Anna",
    "guests": 2,
    "guest_email": "anna@example.com",
    "check_in": "2027-01-10",
    "check_out": "2027-01-12"
  }'
```

### Auth (Supabase Auth, email + password)

"Confirm email" is enabled in Supabase, so a new user must click the link in the
confirmation email before they can log in.

| Method | Path             | Auth                  | Body                  | Success | Errors |
| ------ | ---------------- | --------------------- | --------------------- | ------- | ------ |
| POST   | `/auth/register` | –                     | `{ email, password }` | `201` `{ message, email_confirmation_required }` (no tokens) | `400` invalid body, `409`/`422`/`429`/`500` |
| POST   | `/auth/login`    | –                     | `{ email, password }` | `200` `{ access_token, refresh_token, token_type, expires_in, expires_at, user }` | `400`, `401` wrong credentials, `403` email not confirmed, `429` |
| POST   | `/auth/refresh`  | –                     | `{ refresh_token }`   | `200` new session (same shape as login) | `400`, `401` invalid or expired refresh token |
| POST   | `/auth/logout`   | `Bearer` access token | `{ refresh_token }`   | `200` `{ message }` | `400`, `401` |
| GET    | `/auth/me`       | `Bearer` access token | –                     | `200` `{ id, email, email_confirmed_at, created_at }` | `401` |

Send the access token as `Authorization: Bearer <access_token>`. The `requireAuth`
middleware (`src/middleware/auth.ts`) verifies it with `supabase.auth.getUser(token)`
and puts the verified user and a per-request Supabase client on the context. That client
uses the anon key and forwards the user's JWT, so Row Level Security applies. The global
client is never used to log users in, because a client's session lives in memory and
would otherwise be shared between users.

## Access rules (Row Level Security)

The API forwards the user's JWT to the database, which enforces the rules itself
(`supabase/step-b-rls.sql`):

- `properties`: everyone can read. Only the owner (`owner_id = auth.uid()`) can insert, update or delete.
- `bookings`: logged-in users can only read and change rows where `user_id = auth.uid()`. `anon` has no access.
- `owner_id` and `user_id` are always set on the server from the verified user, never from the request body.
- Rows created before ownership existed have `owner_id` / `user_id = null`. Properties stay readable, but nobody can change them through the API, and old bookings are invisible.

## Project structure

```
supabase/
  schema.sql              # tables and seed data (run first, once)
  step-b-ownership.sql    # owner_id / user_id columns
  step-b-rls.sql          # Row Level Security and policies
  step-c-images.sql       # image_url column and constraint
src/
  lib/
    supabaseClient.ts     # shared Supabase client + per-request auth/user client factories
  middleware/
    auth.ts               # requireAuth: verifies the access token
  routes/
    auth.ts
    bookings.ts
    properties.ts
  types/
    auth.d.ts             # variables requireAuth puts on the Hono context
    booking.d.ts          # NewBooking / Booking
    property.d.ts         # NewProperty / Property
  index.ts                # app entry point
frontend/                 # TypeScript source for the browser (compiled to public/js/)
public/
  index.html
  style.css
  js/                     # compiled frontend
```

## Testing the API

The file [`stayfinder-tests.http`](./stayfinder-tests.http) contains test requests for the
[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension
in VS Code. It reads `EMAIL_OUTLOOK`, `PASSWORD_OUTLOOK`, `EMAIL_YAHOO` and `PASSWORD_YAHOO`
from `.env` (which is never committed). Run the two login requests at the top first, then the
rest from top to bottom. Each request states the expected HTTP status code in its heading.
The file creates and deletes its own test property and test booking, so no existing data is
changed.

## Known limitations

- **Double bookings are not prevented.** A user only sees their own bookings, so the API cannot
  tell whether a property is already booked by someone else. A real fix needs a database
  constraint (for example an `EXCLUDE` constraint on date ranges) or a database function.
- **Hosts cannot see bookings made on their properties.** That would need an extra RLS policy.
- **Access tokens stay valid until they expire after logout.** A JWT is signed and stateless,
  so `/auth/logout` ends the session at Supabase, but the client must also discard both tokens.
- **The total price is only calculated in the browser** (nights × price per night). It is not
  stored in the database.
- **Booking ids are random** (`booking_` plus four digits), so two bookings can very rarely
  collide and one of them fails with a server error. Retrying works.
- **A property that has bookings cannot be deleted** (`409`).
- **Image links are loaded from external sites** and can disappear. There is no file upload.
- **No custom rate limiting.** Supabase's own limits apply and `429` is passed on.
- The session is kept in `localStorage`, so the page must never insert untrusted content as HTML.