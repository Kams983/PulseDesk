# EMR Appointment Management

Appointment module for a clinic: users and roles, doctor schedules, slot generation, booking with double booking protection, a status workflow, and an audit trail. Backend is Express and MongoDB, frontend is Vite and React.

## Stack

- Server: Node, Express 5, MongoDB through Mongoose, CommonJS, zod for validation, Luxon for clinic timezone handling, socket.io for realtime, Jest and supertest with mongodb-memory-server and socket.io-client.
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
    sockets/      socket.io wiring: index.js (auth, rooms) and appointmentEvents.js (emits)
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

Jest runs against an in-memory MongoDB, so no local database is needed and no real data is touched. The first run downloads the mongod binary once and takes a few minutes, later runs are a few seconds. `tests/realtime.test.js` starts a real http server with socket.io attached and drives it with socket.io-client: it checks the handshake against a missing, a malformed and an expired token, then joins a room, books through the api and waits for the event, and it checks that a doctor cannot join another doctor's board.

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
| GET | `/api/v1/departments` | any role | the department list, used as a filter |
| GET | `/api/v1/doctors?departmentId=&q=` | any role | a doctor sees only their own record |
| GET | `/api/v1/doctors/:id` | any role | a doctor may only read their own id |
| POST | `/api/v1/doctors` | super_admin | creates the login and the profile together |
| PUT | `/api/v1/doctors/:id/schedule` | super_admin | replaces slot duration and the weekly schedule |
| POST | `/api/v1/users/receptionists` | super_admin | creates a receptionist login |
| GET | `/api/v1/slots?doctorId=&date=` | any role | a doctor only for their own id |
| GET | `/api/v1/patients?q=` | receptionist, super_admin | one box for a code, a mobile number or a name |
| GET | `/api/v1/patients/:id` | receptionist, super_admin, doctor | a doctor only for a patient they have seen |
| POST | `/api/v1/appointments` | receptionist, super_admin | books a slot, for a known or a brand new patient |
| GET | `/api/v1/appointments` | any role | filters, sorting, pagination, a doctor sees only their own |
| GET | `/api/v1/appointments/:id` | any role | a doctor only for their own |
| PUT | `/api/v1/appointments/:id` | receptionist, super_admin | purpose and notes only |
| DELETE | `/api/v1/appointments/:id` | receptionist, super_admin | soft cancel, takes an optional reason |
| POST | `/api/v1/appointments/:id/arrive` | receptionist, super_admin | scheduled to arrived, on the day only |
| POST | `/api/v1/appointments/:id/complete` | doctor, super_admin | arrived to completed, by the doctor on the visit |
| GET | `/api/v1/dashboard` | any role | today for the desk, own today and upcoming for a doctor |

## Appointments

An appointment moves `scheduled` to `arrived` to `completed`, and any live state may be `cancelled`. The transitions live in one map, so an illegal move is a 409 that names both ends. A cancel is soft: the row stays as the record and simply leaves the active statuses.

The active statuses also carry the partial unique index over `{ doctorId, date, startTime }`, which is what actually prevents a double booking. Working in parallel against one slot, exactly one request can win; the rest get a 409. Cancelling frees the slot again, because the row is no longer inside the index.

The time is checked against the generated grid, not against the doctor's hours, so a Sunday, a lunch break and an off grid time like 09:07 all fail with the same clear 400.

## Slots

Slots are never stored. `GET /api/v1/slots` takes a doctor and a calendar date, builds the grid from that weekday's sessions, trims the windows that fall inside a break, then marks each slot `booked` when an active appointment already holds it, `past` when the date or the time has gone, or `available`. A booked slot stays `booked` even after its time passes, so the day view still shows the appointment.

The doctor's slot duration drives the step, which is why the seed gives the three doctors 15, 20 and 30 minutes: the same session shape produces grids of 28, 21 and 14 slots for tomorrow.

## Realtime

The socket.io server rides on the same http server and port as the api, and a connection is opened with the same access token: `io(url, { auth: { token } })`. A missing, malformed or expired token is refused with a `connect_error`, and the account behind it is re-read from the database, so a deactivated account loses its live board at the same moment it loses its requests.

Rooms are `doctor:{doctorId}:{date}` for one doctor's day, `doctor-self:{doctorId}` for everything a doctor owns and `staff` for the desk. A receptionist or super admin is in `staff` from the moment they connect, a doctor is in their own `doctor-self` room, so both list screens are live without asking for anything. A scheduler screen narrows to one day with `scheduler:join { doctorId, date }` and drops it again with `scheduler:leave`; both acknowledge with `{ ok }`, and a doctor asking for another doctor's board is refused.

| Event | Payload | When |
| --- | --- | --- |
| `appointment:created` | `{ id, doctorId, date, startTime, status }` | a slot was booked |
| `appointment:updated` | same | purpose or notes changed, a visit arrived or was completed |
| `appointment:cancelled` | same | a visit was cancelled |

The payload deliberately carries nothing but those five fields. The client refetches the row it already knows how to read, so no patient data travels over a second channel with its own authorization rules. Emitting is best effort: a socket failure is logged and never fails the api request that caused it.

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
