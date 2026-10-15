# EMR Appointment Management

Appointment module for a clinic: users and roles, doctor schedules, slot generation, booking with double booking protection, a status workflow, and an audit trail. Backend is Express and MongoDB, frontend is Vite and React.

## Stack

- Server: Node, Express 5, MongoDB through Mongoose, CommonJS, zod for validation, Luxon for clinic timezone handling, Jest and supertest with mongodb-memory-server, socket.io for realtime later.
- Client: Vite, React, React Router, TanStack Query, Tailwind, axios, socket.io-client.

## Layout

```
server/
  scripts/        seed.js, filled in with the demo data later
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
