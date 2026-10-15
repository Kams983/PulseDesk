# Engineering Decisions

Short notes per area, newest line at the bottom of each section. Ambiguities resolved by picking the simplest option are listed under Assumptions in the README.

## Architecture

- Controllers stay thin: read the request, call one service function, write the response. Rules live in services and services throw `AppError` instead of touching `res`.
- Middleware order in `app.js`: helmet, cors, json, cookies, rate limiter, `/api/v1` routes, notFound, errorHandler. Everything sits under one versioned path so a v2 can be added beside it.
- Express 5 forwards rejected promises to the error middleware, and `asyncHandler` wraps handlers anyway, so no controller needs a try/catch.
- `server.js` creates the http server by hand so socket.io attaches to the same server later without editing boot code.
- `config/env.js` is the only file that reads `process.env`. It validates with zod, refuses to start on a bad value, and exports a frozen object, so a missing secret fails at boot with the fix printed.
- Handlers, models and helpers are registered at boot through `models/index.js`, so mongoose builds indexes as soon as it connects.

## Data model

- Appointment time is stored as plain strings, `YYYY-MM-DD` and `HH:mm`, never a `Date`, so nothing can drift through a timezone conversion in the database.
- The partial unique index on `{ doctorId, date, startTime }` over the active statuses is the real double booking guard. The service layer only translates the resulting 11000 into a 409.
- `patientSnapshot` and `doctorSnapshot` copy the searchable and displayable fields onto the appointment, so the list page filters and renders without a join or a populate.
- Every non obvious index carries a comment naming the query it serves: doctor day view, department queue, default listing sort, patient search, patient history.
- `RefreshToken` stores only a hash, so a database leak does not hand out sessions, and its `expiresAt` TTL index deletes expired rows without a cleanup job.
- Patient codes come from the `counters` collection through `utils/sequence.js`: one `$inc` in a `findOneAndUpdate`, so two registrations at the same moment cannot share a number.

## API conventions

- Every response is written by `sendSuccess` or `sendError`, so the envelope cannot drift between features.
- `meta.code` is the stable part clients branch on: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `DUPLICATE_KEY`, `RATE_LIMITED`, `INTERNAL_ERROR`.
- `errorHandler` maps `AppError`, zod issues, mongoose validation and cast errors, jwt errors and duplicate keys, and turns anything else into a 500 whose message is hidden in production.
- `validate(schema, source)` parses and replaces the chosen source. For `query` it defines an own property, because express 5 exposes `req.query` as a getter and a plain assignment silently does nothing.

## Auth

- The refresh token is a random 64 byte hex string rather than a JWT. A JWT would have to be signed, unrevocable until it expires, and would need a second secret (`JWT_REFRESH_SECRET`, since removed) that buys nothing: the server has to store a row for it either way to support logout. A random value has no payload to forge and only one meaning, a row lookup.
- Only the SHA-256 hash of that value is stored, so a database dump does not hand out live sessions. A fast hash is right here where bcrypt is right for passwords: the input is 512 bits of server generated entropy, so there is nothing to brute force, and bcrypt on every refresh would only add latency.
- Refresh rotates: using a token deletes its row and issues a brand new pair. A stolen refresh token is therefore only good until the real client next refreshes, after which the thief holds a dead value and the client still works. Revocation, replay detection and logout then all become the same one line delete instead of a blocklist.
- Access token lives in the response body and stays in the client's memory, refresh token lives in an `httpOnly`, `SameSite=Lax` cookie scoped to `path=/api/v1/auth` and is `Secure` only in production. Script on the page cannot read the cookie, the browser sends it solely to the auth routes, and a short access token lifetime bounds what a leaked body token is worth. The refresh token never appears in a JSON response.
- `bcrypt` cost 10 through `authService.hashPassword`, which the seed script calls too, so no second place can disagree about the cost or the algorithm.
- A failed sign in always answers the same generic `Invalid email or password`, whether the email is unknown, the account is inactive or the password is wrong, so the endpoint cannot be used to enumerate accounts. The audit row records the attempted email for the operator.
- `authenticate` verifies the token and then re-reads the user, so a deactivated account loses access immediately instead of waiting out the token lifetime. `authorize(...roles)` is a separate guard, so each route states its own policy and a missing role is a 403 rather than a 401.
- The 403 probe route used to prove the role guard was temporary and has been removed; the check now belongs to the first real role guarded route.

## Scheduling and slots

- Slots are never stored. They are generated from the doctor's weekly sessions, trimmed by breaks, then marked booked by overlaying active appointments.
- Time math runs in minutes since midnight with `utils/time.js`, which keeps slot stepping in integers instead of Date objects.

## Appointments and audit

- The status workflow is defined once in `config/constants.js` and read from there, so no route can invent a transition. Invalid transitions are a 409, not a 400.
- Every state change records who did it in `AuditLog`, with the actor, the entity and the request metadata.

## Realtime and frontend

- Socket.IO attaches to the same http server as the api and broadcasts appointment changes on room channels, so the board updates without polling.
- The client is a Vite and React app talking to `/api/v1` with cookies, proxied by Vite in development so the session cookie stays first party.

## Testing

- `tests/setup.js` starts an in-memory MongoDB per test file and wipes collections between tests, so a uniqueness assertion cannot leak into the next test.
- `tests/env.js` runs before any module loads, because `config/env.js` validates on import and the suite reads no `.env` file.
- The rate limiters are skipped when `NODE_ENV=test`, otherwise the suite would trip its own 429.
- mongodb-memory-server fetches its mongod binary on the first run rather than in a postinstall script, because npm 11 blocks dependency install scripts by default. The first run therefore spends a few minutes on a large download, later runs start in about two seconds.
- The test connection passes `runtimeAdapters: { os }` because jest cannot run the driver's dynamic `import('os')`, and the driver hides that failure, sends empty client metadata, and then mongod 8.2 refuses the handshake. Production boots normally, so this stays in the test setup.
