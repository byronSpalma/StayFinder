# StayFinder API

A small backend built with [Hono](https://hono.dev/) and TypeScript for a
"StayFinder" style booking app. It is a school project for the Backend 2
(TypeScript) course.

Data is currently stored in JSON files (`src/data/properties.json` and
`src/data/bookings.json`) acting as a stand-in database. Later in the course
these files will be replaced by PostgreSQL via Supabase.

## Tech stack

- [Hono](https://hono.dev/) – web framework
- TypeScript
- [Zod](https://zod.dev/) + [@hono/zod-validator](https://github.com/honojs/middleware/tree/main/packages/zod-validator) – request validation
- JSON files as a temporary database

## Getting started

### Prerequisites

- Node.js 20.6+ (uses `--env-file` for environment variables)

### Install

```bash
npm install
```

### Configure environment variables

Copy the example file and adjust if needed:

```bash
cp .env.example .env
```

| Variable    | Description                  | Default |
| ----------- | ----------------------------- | ------- |
| `HONO_PORT` | Port the server listens on    | `3000`  |

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

### Properties (read-only)

| Method | Path              | Description                |
| ------ | ----------------- | --------------------------- |
| GET    | `/properties`     | List all properties         |
| GET    | `/properties/:id` | Get a single property by id |

### Bookings

| Method | Path            | Description                                                                 |
| ------ | --------------- | ---------------------------------------------------------------------------- |
| GET    | `/bookings`     | List all bookings                                                            |
| POST   | `/bookings`     | Create a booking. Body is validated with Zod; `booking_id` is generated and `status` defaults to `"pending"` if omitted |
| PUT    | `/bookings/:id` | Replace a booking. The id always comes from the URL, never from the body     |
| PATCH  | `/bookings/:id` | Partially update a booking (any subset of fields)                            |
| DELETE | `/bookings/:id` | Delete a booking                                                             |

`PUT`, `PATCH` and `DELETE` return `404` if the booking id does not exist.

### Example: create a booking

```bash
curl -X POST http://localhost:3000/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": "prop-1",
    "guest_name": "Anna",
    "guest_email": "anna@example.com",
    "check_in": "2026-01-10",
    "check_out": "2026-01-12"
  }'
```

## Project structure

```
src/
  data/
    properties.json
    bookings.json
  lib/
    storage.ts       # read/write helpers for the JSON data files
  routes/
    bookings.ts
    properties.ts
  types/
    booking.d.ts      # NewBooking / Booking types
  index.ts            # app entry point
```
