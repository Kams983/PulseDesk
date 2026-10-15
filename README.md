# EMR Appointment Management

Appointment module for a clinic: users and roles, doctor schedules, slot generation, booking with double booking protection, a status workflow, and an audit trail. Backend is Express and MongoDB, frontend is Vite and React.

## Stack

- Server: Node, Express 5, MongoDB through Mongoose, CommonJS, zod for validation, Luxon for clinic timezone handling, Jest and supertest with mongodb-memory-server, socket.io for realtime later.
- Client: Vite, React, React Router, TanStack Query, Tailwind, axios, socket.io-client.

## Layout

```
server/
  scripts/        seed.js, wipes and recreates the demo data
  src/
    config/       env.js, db.js, constants.js
    controllers/  one thin function per route
    middlewares/  authenticate, authorize, validate, errorHandler, notFound, rateLimiters
    models/       User, RefreshToken, Department, Doctor, Patient, Appointment, AuditLog
    routes/       index.js plus one file per feature
    services/     all business logic
    sockets/      realtime handlers
    utils/        AppError, response, asyncHandler, sequence, time
    validators/   zod schemas
  tests/          jest suites, in-memory MongoDB
client/           vite app, features land in a later phase
```

## Running locally

Prerequisites: Node 20 or newer, and MongoDB reachable at `MONGO_URI` (or docker compose, added last).

```
cd server
cp .env.example .env
npm install
npm run dev
```

The api listens on http://localhost:5000, health check at `/api/v1/health`. A missing or malformed variable, for example a short `JWT_ACCESS_SECRET`, makes the server exit immediately with the exact problem printed.

Load the demo data (it wipes the collections it owns, so never point it at real data):

```
cd server
npm run seed
```

| Role | Email | Password |
| --- | --- | --- |
| super_admin | admin@emr.test | Password123! |
| receptionist | reception@emr.test | Password123! |
| doctor | dr.okafor@emr.test | Password123! |
| doctor | dr.bello@emr.test | Password123! |
| doctor | dr.adeyemi@emr.test | Password123! |

The three doctors get General Medicine with 15 minute slots, Pediatrics with 20 and Cardiology with 30, all on a Monday to Friday 09:00 to 12:00 and 13:00 to 17:00 schedule with a lunch break, so the slot logic has something uneven to work with. Seven appointments are placed on the next working day in every status, which gives the list page something to show.

```
cd client
npm install
npm run dev
```

The ui runs on http://localhost:5173 and proxies `/api` to the server, so the session cookie stays first party in development.

## Tests

```
cd server
npm test
```

Jest runs against an in-memory MongoDB, so no local database is needed and no real data is touched. The first run downloads the mongod binary once and takes a few minutes, later runs are a few seconds.

## Trying the api

[api.http](api.http) at the repo root holds every request as a clickable block for the VS Code REST client, each with the equivalent curl command in a comment. It grows with each phase.

## Endpoints so far

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | public | liveness plus database state |
| POST | `/api/v1/auth/login` | public | strict rate limiter, returns the access token and sets the refresh cookie |
| POST | `/api/v1/auth/refresh` | refresh cookie | rotates the pair, the used token is deleted |
| POST | `/api/v1/auth/logout` | refresh cookie | clears the cookie, always succeeds |
| GET | `/api/v1/auth/me` | bearer token | the signed in user, safe fields only |

## API conventions

- Base path `/api/v1`
- Every response is `{ success, message, data, meta }`. Errors set `success: false` and `data: null`, with `meta.code` for the client to branch on and `meta.details` for field level problems.
- Status codes: 200, 201, 400 validation, 401, 403, 404, 409 conflicts and invalid transitions, 429, 500.
- Stack traces, password hashes and token hashes never leave the server.

## Assumptions

- Only these phases were provided, so anything not stated is resolved the simplest way and noted here.
- API port 5000 and client port 5173 are the defaults, both configurable through env vars and the Vite config.
- The client scaffold was created early and stays in place for the frontend phase, it holds no feature code yet.
- Clinic timezone defaults to Africa/Lagos and all past checks run against it, never the machine timezone.
