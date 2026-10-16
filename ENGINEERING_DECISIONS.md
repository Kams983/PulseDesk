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

- Slots are never stored. They are generated from the doctor's weekly sessions, trimmed by breaks, then marked booked by overlaying active appointments. A stored grid would have to be rewritten every time a schedule changed and could disagree with the schedule it came from.
- `services/slotGenerator.js` is a pure function: no database, no `Date`, no clock reads. Every rule is a function of its arguments, so the unit tests need no fixtures and no in memory database, and the same maths can be reused anywhere without a connection.
- Time math runs in minutes since midnight with `utils/time.js`, and `HH:mm` strings are only parsed at the edges. A session that is not a multiple of the slot duration leaves the leftover tail unused rather than overrunning the session, which is why 09:00 to 10:00 with 25 minute slots gives two slots ending at 09:50.
- The grid is stepped from the start of each session, and a slot that would run into a break is dropped instead of shifting the rest of the grid. The generator sorts by start time and keeps one slot per start, so overlapping sessions can never produce overlapping or duplicated slots.
- One query fetches the active appointments for the whole day and a `Set` of booked start times marks the grid up. A per slot query would be dozens of round trips for a list that is always small, and the active only filter matches the partial unique index that actually guards booking.
- Booked outranks past. An appointment that already happened still has to appear on the day view, while only an unbooked slot in the past is useless to a receptionist.
- Appointment dates and times stay plain `YYYY-MM-DD` and `HH:mm` strings, and the weekday is read from the date in utc, so no timezone conversion can ever shift a booking to the previous or next day.
- Departure from the seeded doctors: the three of them share a session shape but get 15, 20 and 30 minute slots, so slot generation is visibly exercised with an even grid, an uneven one and a coarse one.
- "A doctor only sees themselves" lives in one place, `doctorService.assertCanViewDoctor`, which both the doctor routes and the slots route call. A doctor gets 403 for another doctor's id, and an empty list from `/doctors` rather than someone else's row.
- Creating a doctor writes a `User` and a `Doctor`, and a standalone mongod has no transactions, so a failed profile creation deletes the user again instead of leaving a login with no profile behind. A failed rollback is logged rather than swallowed by the rollback itself.
- Schedule validation is all zod, so a rejected schedule comes back as `400` with `meta.details` naming the exact path, for example `schedule.0.sessions.1.start`. The refinement guards against empty and unparsable input because an inner rule failing still runs it.
- Query filters treat an empty string as absent, because a filter widget sends its empty state as `?departmentId=&q=` rather than omitting the keys.

## Patients

- One search box serves a desk holding a patient card, a phone number or a name, so the shape of the term picks the field: a `PT-` value is an exact code match, digits are a mobile prefix, anything else is a name prefix. The name branch is anchored on `nameLower` so the index is used, and the term is escaped first so a typed dot or bracket cannot become a pattern of its own. That anchoring means a bare surname finds nobody when the stored name starts with a title, for example "Okafor" against "Dr. Ifeanyi Okafor"; the booking screen searches the same way, and a contains match would give that up for an index scan.
- A doctor may only open a patient they have at least one appointment with. That keeps the register private without inventing a permission table, and it reuses the appointment index rather than adding a grant per patient.
- Patient codes come from the shared counter through `patientService.nextPatientCode`, the same path the seed uses. A booking that fails after registering a patient deletes that patient again, so a rolled back booking leaves a gap in the code sequence rather than an orphan record. A gap is harmless; two patients sharing a code would not be.
- A new patient whose mobile already exists is a 409 carrying the existing patient in `meta.details[0].existingPatient` (id, code, name, mobile), so the desk can offer "use this patient" instead of merging two people. The check is a friendly one; the unique index on mobile is the guard, and its duplicate key is translated into the same answer.

## Appointments and audit

- The status workflow is defined once in `config/constants.js` and read from there, so no route can invent a transition. Invalid transitions are a 409, not a 400, and the message names both ends, for example "Cannot move an appointment from completed to cancelled". Every state change goes through one `assertTransition(from, to)` helper.
- The partial unique index over the active statuses is the real double booking guard, and no transaction is used because a standalone mongod has none. The service checks the slot first only to produce a readable error; when two requests pass that check at the same instant, one insert loses on the index and its duplicate key becomes a 409. Twenty parallel bookings leave exactly one appointment and nineteen refusals.
- A cancel is soft and only changes the status, which is what takes the row out of the partial index and frees the slot. The cancelled row stays as the record of what happened.
- `patientSnapshot` and `doctorSnapshot` are copied onto the appointment, so the list page searches, sorts and renders without a join. The trade is deliberate: a later rename does not rewrite history, and the snapshots are what the visit was booked against.
- Sorting accepts only the four whitelisted fields, so client input never reaches the sort itself, and `_id` is appended as a final key. Many appointments share a date and a start time across doctors, and without a total order `skip` and `limit` can repeat a row on page two and drop another.
- A doctor's scope is forced in the service, not in the route, so `?doctorId=` for someone else narrows nothing. The same rule covers reading one appointment and completing it.
- Arriving is refused for an appointment dated after today, because the status and the date would otherwise contradict each other.
- The dashboard is one aggregation grouped by status for the whole board, with a flag splitting today from what is still ahead. Six count queries would be six round trips for numbers that only add up if they describe the same moment.
- `today` in the dashboard response is the clinic's calendar date and the only clock the client trusts. A browser in another timezone, or one whose clock is a few minutes off, would otherwise decide for itself what is past, and the scheduler would grey out slots the server still considers bookable. For the same reason the counts moved one level down to `counts.today` and `counts.upcoming`: the field the client must never guess was worth the rename, and nothing consumed the old shape yet.
- The trend is one grouped query over the date range with the empty days filled in code, built from the clinic clock rather than from the rows that came back. Aggregating per day would be up to 31 round trips for a chart nobody reads precisely, and a day with no appointments has to appear as a zero, otherwise the line draws straight over it and the week looks busier than it was.
- Every state change records who did it in `AuditLog`, with the actor, the entity and the request metadata.
- The audit helper resolves the actor from an `id` or an `_id`, because `authenticate` attaches a plain object while a service logging its own work holds a document. Without that, a row written from a route stored a role and no user, which is exactly the kind of hole an audit trail cannot have.

## Realtime and frontend

- Socket.IO attaches to the same http server as the api, so one port, one origin and one CORS allowance cover both, and a client opens a connection with the access token it already holds instead of a second credential. The handshake middleware verifies that token and re-reads the user exactly like `authenticate` does, so a deactivated account is refused at connect rather than kept on a live board until its token expires.
- Rooms are per doctor and per date because that is the shape of the screen: a scheduler board is one doctor on one day, and a clinic has many doctors and many days, so one broadcast room would wake every client for every change and make each of them filter. `doctor-self:{doctorId}` and `staff` are joined on connect instead, because the appointment list page is scoped to a doctor or to the whole clinic rather than to a day; the two always-on rooms are what keep those pages live, and a per date room only ever narrows a screen further.
- A doctor's profile id, not the user id, is resolved during the handshake and stored on the socket, so the rooms are joined before the client sees a connect and no event can slip through the gap between connecting and being watchable. The same resolved id is what the join handler compares against, so a doctor asking for another doctor's board is refused by the same value the board itself is keyed by.
- `scheduler:join` and `scheduler:leave` validate their payload with the same zod helpers the http routes use and acknowledge with `{ ok }`, because a socket has no status code: without an ack a client that typed a bad date would sit on a silent board and never learn why. The ack is optional, so an emit without a callback still joins.
- Events carry only `{ id, doctorId, date, startTime, status }` and say nothing about the patient. A thin payload cannot leak a snapshot that the receiving user is not allowed to read, it cannot disagree with what a fresh `GET /appointments/:id` returns, and it keeps the authorization rules in one place: the api. The client refetches the row it already knows how to render, which it would do anyway to show the updated fields.
- `emitAppointmentEvent` is wrapped in try/catch and runs after the write has committed, so a broken socket or a missing io never turns a successful booking into a 500. The five appointment actions map onto three events: arriving and completing are updates to the same row, so `appointment:updated` is what a refetch would show.
- Multiple instances would need the Redis adapter (`@socket.io/redis-adapter`) so an emit on the instance that served the request reaches sockets connected to the others; Socket.IO's own Redis Streams adapter does the same and survives a disconnect. Nothing in the current code changes for it except the `initSocket` line that creates the server and adding a shared publishing client, because every emit already goes through `io.to(room)` and every room name comes from one module. The adapter is what the rooms are for: without it, `io.to()` only reaches clients of the local process.
- The client is a Vite and React app talking to `/api/v1` with cookies, proxied by Vite in development so the session cookie stays first party.
- The access token is kept in a module variable in `axiosClient`, never in `localStorage`. A value that was never persisted cannot be read by script on the page, and a reload re-derives the session from the `httpOnly` refresh cookie through one silent call. That call is also what `AuthContext` waits on before rendering, so a protected route shows a spinner rather than flashing the login page at a signed in user.
- Refresh is single flight: five requests that expire together await one promise, and each replays once through an `_retried` flag. Without the shared promise a dashboard that loads four queries at once would rotate the refresh token four times, and rotation deletes the row it just used, so three of them would fail and sign the user out.
- Errors are normalised in one interceptor to `{ message, code, details, status }`, so no component reads `error.response.data` and no status code or stack trace reaches the screen. The message shown is always the api's own sentence.
- Tailwind holds every token in one config and a status is defined once in `utils/constants.js` with literal class names, so a status cannot be one colour in a badge and another in a slot, and a class assembled at runtime cannot be purged away.
- The dashboard never trusts the browser clock: `today`, the past and the trend all come from the api, and the selected calendar day drives the list beside it. A browser in another timezone, or one a few minutes off, would otherwise grey out slots the server still considers bookable.
- The mini calendar is plain date maths over `YYYY-MM-DD` strings read in UTC, with no calendar library and no `Date` from the database. The grid is Sunday first, which is the one thing the weekday header has to agree with: a row built on Sunday under a Monday header shifts every date by one.
- Queries are keyed and disabled rather than fired and discarded: a doctor never requests the register, and the trend and day queries wait for the server's `today`. A disabled query is not loading, so the chart keys off its own data instead of a loading flag that is false before the query has ever run.
- A doctor sees their own board and the desk sees the register, and the switch is the same role list the rail and the route guard read. A blocked route redirects to the dashboard and explains itself with a toast, because a silent redirect looks like a broken link.


## Testing

- `tests/setup.js` starts an in-memory MongoDB per test file and wipes collections between tests, so a uniqueness assertion cannot leak into the next test.
- `tests/env.js` runs before any module loads, because `config/env.js` validates on import and the suite reads no `.env` file.
- The rate limiters are skipped when `NODE_ENV=test`, otherwise the suite would trip its own 429.
- mongodb-memory-server fetches its mongod binary on the first run rather than in a postinstall script, because npm 11 blocks dependency install scripts by default. The first run therefore spends a few minutes on a large download, later runs start in about two seconds.
- The test connection passes `runtimeAdapters: { os }` because jest cannot run the driver's dynamic `import('os')`, and the driver hides that failure, sends empty client metadata, and then mongod 8.2 refuses the handshake. Production boots normally, so this stays in the test setup.
