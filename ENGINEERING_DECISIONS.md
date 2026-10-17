# PulseDesk Engineering Decisions

Why the system looks the way it does, one short answer per question first, then the detail. Ambiguities that were resolved by picking the simplest reasonable option are listed under Assumptions in the [README](README.md).

## The short answers

| Question | Answer |
| --- | --- |
| Why this architecture? | Five thin layers: routes state the policy, controllers read and write, services hold every rule, validators parse input, models own the data. Keeping the rules in services is what lets the socket layer, the seed script and the tests call the same code the HTTP route calls. The cost is that following one request means opening several files. |
| How is the schema designed? | Seven collections, plus a counter for patient codes. References (patientId, doctorId, departmentId) keep the relationships real, small copies of the patient and doctor names sit on each appointment so the list page never has to join, and dates are plain `YYYY-MM-DD` and `HH:mm` strings because a `Date` is an instant in UTC that would move a booking a day. Slots are not stored at all: the grid is generated on read. |
| How is double booking prevented? | A partial unique index on doctor, date and start time covers only the active statuses, so the database itself rejects a second active booking in one slot with error 11000, which the service answers as a 409. The slot check in the service runs first only to give a better message; the index is the real guard. Cancelling a visit takes the row out of the index, which is what frees the slot. |
| Which indexes, and why? | One partial unique index is the booking guard. The rest serve queries the app actually makes: a doctor's day, a department's day, the default list order, the two snapshot searches, and one patient's history. Expired refresh tokens carry a TTL index so nothing has to delete them, and the unique indexes on email, patient code and mobile are what turn a duplicate into a readable 409. |
| What security measures? | Bcrypt at cost 10 with the hash never selected by default, a 15 minute access token held in the browser's memory only, and a rotating refresh token stored as its SHA-256 hash in an httpOnly cookie. Roles are enforced twice: a route guard states the policy, and the services re-derive scope from the signed in user, so a `doctorId` in the query cannot widen what a doctor sees. Zod parses every input at the edge, and login is limited to 10 tries per 15 minutes. |
| What performance work? | One query per screen wherever it was possible: the day's appointments mark the whole slot grid from a set of booked times, and the dashboard is one aggregation whose empty days are filled in code. Reads use `.lean()` with an explicit field list, sorts are whitelisted and page sizes capped, and the socket payload is five fields because the client refetches rather than receiving data it may not read. On the client, rows and slot buttons are memoised on primitives and the text filters are debounced. |
| How would it scale to millions of appointments? | Replace `skip`/`limit` with cursor pagination on the same compound index, shard on doctor and date, and move old appointments to an archive collection. Slot reads are a pure function of the schedule and the day's bookings, so they belong in Redis, invalidated by the socket events the app already emits. The socket layer already emits through rooms defined in one module, so adding the Redis adapter is the only change needed for a second API instance. |

## Why this architecture

The server is layered as routes, controllers, services, validators and models, and the split is enforced by what each file is allowed to import rather than by convention alone. A route file states the policy (which roles, which middleware, which schema) in one readable block, a controller reads the request and writes the response, and a service holds every rule. The services layer is the part that earns its keep: `appointmentService` is the only place that knows a completed visit cannot be cancelled, so the rule cannot be written in one place and forgotten in another. Services throw `AppError` instead of touching `res`, which is what lets a socket handler, a seeder or a test call the same function the HTTP route calls. Express 5 forwards rejected promises to the error middleware and `asyncHandler` wraps handlers anyway, so no controller carries a `try/catch` that only rethrows.

The trade this buys is indirection: a request for a doctor's day touches a route, a controller, a validator, a service and a model, and a newcomer has to open five files to follow one call. It was still the right call here because the alternative (fat controllers) makes the concurrency rules and the role scoping invisible, and those are exactly the parts that must be readable to be trusted.

The client mirrors the split: `api/` modules are the only place axios is touched, `context/` holds the session, the socket and the toasts, `components/ui/` is the design system, and `pages/` compose them. No component reads `error.response`; the axios interceptor normalises every failure to `{ message, code, details, status }` once.

## MongoDB schema design

Seven collections: `users`, `refreshtokens`, `departments`, `doctors`, `patients`, `appointments`, `auditlogs`, plus a `counters` collection that only exists to hand out sequential patient codes.

Appointment time is stored as plain `YYYY-MM-DD` and `HH:mm` strings, never as a `Date`. A `Date` in MongoDB is an instant in UTC, so a booking made at 00:30 Lagos time would store as the previous day in UTC and a query for "today" would have to reconstruct the clinic's timezone on every read. Strings that mean what a calendar says cannot drift through a conversion, and they sort correctly as strings because the format is fixed width.

References are used for identity and snapshots for display. An appointment holds `patientId`, `doctorId` and `departmentId` so the relationships stay real, and it also carries `patientSnapshot` (name, nameLower, mobile, patientCode) and `doctorSnapshot` (name, nameLower). Those copies are what the list page searches and renders, so the appointments table never joins or populates for a screen that shows twenty rows. The trade is deliberate and one-directional: a later rename does not rewrite history, and the snapshot is the record of what the visit was booked against.

Slots are not stored at all. The grid is generated on read from the doctor's weekly sessions, trimmed by breaks, and then marked booked by overlaying the day's active appointments. A stored grid would have to be rewritten on every schedule change, on every booking and on every cancel, and any bug in that rewrite would silently disagree with the schedule it came from. Generating is eight lines of arithmetic over a handful of windows, and it cannot go stale.

`nameLower` appears on both patients and doctors because MongoDB indexes are case sensitive and a text index is the wrong tool for a prefix search. Codes come from the `counters` collection through one `$inc` in a `findOneAndUpdate`, so two registrations at the same instant cannot share a patient code.

## How double booking is prevented

The guard is a partial unique index: `{ doctorId: 1, date: 1, startTime: 1 }` with `partialFilterExpression: { status: { $in: ['scheduled', 'arrived', 'completed'] } }`. Only rows in an active status are inside the index, so cancelling an appointment removes it from the index and frees the slot, while the cancelled row stays as the record of what happened.

The service checks the slot first, but only to produce a readable error before attempting a write. That check is not the protection: when two requests pass it at the same instant, both attempt the insert, MongoDB lets exactly one succeed, and the loser comes back with error code 11000, which the service translates into a 409. The index is therefore the real guard, and the check is a convenience that improves the common error message.

No transaction is used, because a standalone `mongod` does not have them and requiring a replica set to demo the project would have been a worse trade than relying on a unique index, which needs no transaction to be correct. The cost is one subtlety: `Patient` creation and the appointment insert are separate writes, so a booking that fails after registering a patient deletes that patient again, and a failed rollback is logged rather than swallowed.

`tests/concurrency.test.js` fires twenty simultaneous bookings for one slot through `supertest` and asserts the outcome: exactly one 201, exactly nineteen 409s, nothing else (a single 500 would mean the guard leaked), one active appointment in the database, one row total, and only the two patients that survived. The test calls `Appointment.init()` first, because on a fresh database the index may not exist yet and the test would otherwise pass for the wrong reason.

## Indexes and why

| Index | Collection | Query it serves |
| --- | --- | --- |
| `{ doctorId, date, startTime }` unique, partial on active statuses | appointments | the double booking guard, and the slot lookup that marks a grid booked |
| `{ doctorId, date, status }` | appointments | the doctor's day view and the arrival/completion transitions |
| `{ departmentId, date }` | appointments | the department queue for one day |
| `{ date, startTime }` | appointments | the default list order, newest filters first |
| `{ 'patientSnapshot.mobile' }` | appointments | the mobile search in the list filters |
| `{ 'patientSnapshot.nameLower' }` | appointments | the patient name search in the list filters |
| `{ patientId, date: -1 }` | appointments | one patient's history, newest first |
| `{ nameLower }` | patients | the anchored name prefix search |
| `{ departmentId }`, `{ nameLower }` | doctors | the doctor list, filtered by department and searched by name |
| `{ tokenHash }` unique, `{ userId }` | refreshtokens | refresh rotation, and revoking every session of one user |
| `{ expiresAt }` TTL | refreshtokens | deletes expired rows on its own, no cleanup job |
| `{ createdAt: -1 }`, `{ entity, entityId }`, `{ userId, createdAt: -1 }` | auditlogs | the audit list, one entity's trail, one actor's trail |

Uniqueness is also relied on implicitly: `users.email`, `patients.patientCode`, `patients.mobile` and `departments.name`/`code` each carry a unique index, and the service layer turns the resulting duplicate key into a 409 with a sentence a desk can act on. That is why the "does this mobile already exist" check in `patientService` says so in its own comment: it is a friendliness check, and the index is what actually enforces the rule.

## Security measures

Passwords are hashed with bcrypt at cost 10 through one `authService.hashPassword` helper, which the seed script calls too, so no second place can disagree about the algorithm or the cost. `passwordHash` is declared `select: false` on the schema, so a stray `findOne` cannot put a hash into a response even by accident.

Sessions are a short lived JWT access token (15 minutes by default, held in the client's memory only) plus a rotating refresh token. The refresh token is a random 64 byte hex string, not a JWT: it has no payload to forge, and the server has to store a row for it either way to support logout. Only the SHA-256 hash of that value is stored, so a database dump does not hand out live sessions; a fast hash is safe here because the token is 64 random bytes, so there is nothing to guess. Rotation deletes a token the moment it is used and issues a new pair, so revoking a session, resisting a replay and logging out are all one delete. The cookie is `httpOnly`, `SameSite=Lax`, scoped to `/api/v1/auth` and `Secure` in production, so script on the page cannot read it and the browser sends it only to the auth routes.

Authorization is two layers. `authorize(...roles)` is a route level guard that states the policy where a reader can see it, and the service layer re-derives scope from the authenticated user rather than trusting a query parameter: `?doctorId=` for another doctor narrows nothing, and a doctor completing another doctor's appointment is a 403 from the service, not from the route. `authenticate` re-reads the user on every request, so a deactivated account loses access immediately instead of waiting out a token lifetime, and the socket handshake does the same thing for the live board.

Input is validated with zod at the edge (`validate(schema, 'query' | 'params' | 'body')`) and the parsed result replaces the raw input, so nothing downstream sees an unparsed string. Helmet sets the response headers, CORS names the one client origin (never a wildcard, because the refresh cookie is sent on the request) and JSON bodies are capped at 100 kB. `express-rate-limit` runs a 300 per minute limiter on everything and a 10 per 15 minutes limiter on login, both skipped under `NODE_ENV=test` so the suite does not trip its own 429.

Failed sign ins answer with one generic sentence whether the email is unknown, the account inactive or the password wrong, so the endpoint cannot be used to enumerate accounts; the attempted email goes into the audit row for the operator instead. `config/env.js` is the only file that reads `process.env`, it validates with zod and exits with the exact problem printed, so a missing secret fails at boot rather than at the first login. Responses never carry a stack trace, a password hash or a token hash: `errorHandler` maps known errors to their status and turns anything unexpected into a 500 whose message is replaced in production.

## Performance optimizations

Reads use `.lean()` and an explicit field selection wherever the document is only going to be serialised, which skips building Mongoose documents and hides fields (including `passwordHash`) that no response needs.

The slot endpoint fetches every active appointment for the day in one query and marks the grid from a `Set` of booked start times, rather than querying per slot: a 28 slot day would otherwise be 28 round trips for data that is always small. The alternative, storing the grid, was rejected in the schema section for correctness reasons and would not have been faster anyway at this size.

The dashboard is one aggregation grouped by status with a flag splitting today from what is still ahead, plus one grouped query for the trend with the empty days filled in code. Six count queries would be six round trips for numbers that only add up if they describe the same moment, and aggregating the trend per day would be up to 31 round trips for a chart nobody reads precisely. The per doctor breakdown on the super admin board, and the month behind the calendar dots, are each one more grouped query for the same reason: the alternative is a query per doctor and a query per cell.

Two answers on the board are computed on the server even though the data is already on the client, because both are questions about the clock rather than about the data. "Who is my next patient" needs to know whether a slot has already finished, and "how long has this patient been waiting" needs the arrival stamp; a browser with a wrong clock would answer both differently, while the server has one clock that every other rule already uses. The client's own minute tick only repaints the waiting times it was handed, and the four chart and axis colours live in one constants file so a chart cannot introduce a colour the design system does not have.

The list endpoint whitelists the sortable fields (`date`, `startTime`, `createdAt`, `status`), appends `_id` as a final key so `skip`/`limit` cannot repeat or drop a row, and caps the page size, so no client input reaches the sort and no request can ask for the whole collection.

Errors are normalised in one axios interceptor to `{ message, code, details, status }`, so no component reads `error.response.data` and nothing branches on a status code. When the api answers, the sentence shown is the api's own. When the request never reached the api at all, such as a proxy whose upstream is down, there is no body to read and axios's fallback message is `Request failed with status code 502`, which is a status code and a library name on a clinic desk's screen, so that case now gets one of three sentences of ours, chosen by status.

On the client, every filter, the sort and the page live in the query string, so one request is sent per change and TanStack Query caches the result under that key; `keepPreviousData` keeps the old page on screen while the next one loads, so paging does not flash a skeleton. The three text filters are debounced 300 ms and only a settled value is pushed to the URL, which is what stops a clear from being undone by the debounce a moment later. The appointment row and the slot button are `React.memo`, given primitives plus one stable `useCallback` rather than objects, so typing in a filter box does not redraw twenty rows that did not change. This is applied where it matters and not everywhere: memoising a header would be noise.

Socket events carry `{ id, doctorId, date, startTime, status }` and nothing else, so the payload stays small and cannot leak a patient snapshot the receiver is not allowed to read; the client refetches the row it already knows how to render.

## Scaling to millions of appointments

The first change is that `skip`/`limit` has to go. Pagination by offset costs the database a scan of every skipped row, so a list 40,000 deep would read 40,000 documents to return 20. Keyset pagination (`date` plus `startTime` plus `_id` as the cursor, since that is exactly the append-only order of the compound index) makes every page one index seek regardless of depth. The list API already sorts by the fields that compound index covers and already appends `_id` as a tiebreaker, so the cursor is the shape it currently returns, not a new design.

Sharding would key on `{ doctorId, date }` because almost every hot query is scoped to one doctor or one day, which keeps a doctor's day on a single shard and lets the dashboard fan out across shards in parallel rather than scatter-gather one global query. The partial unique index that prevents double booking only enforces uniqueness within a shard, so the shard key has to contain `doctorId`, and even then the guard needs the slot check to live in the same shard as the doctor; that constraint is the main reason the shard key is chosen for correctness rather than only for spread.

Old appointments are the bulk of the collection and are read rarely and never updated, so they belong in a separate archive collection or a cold tier after a retention window, with the operational collection holding only the current and near-future window. `auditlogs` is the other collection that grows without bound, and it is a pure append workload: it moves to a queue behind the request (Kafka, SQS, or a capped collection read by a worker), which also stops an audit write from ever slowing a booking.

Slot reads are the highest volume and the most cacheable thing in the system, because a grid is a pure function of the doctor's schedule, the date and the day's booked times. They belong in Redis keyed by doctor and date, invalidated by exactly the events the socket layer already emits, so one signal invalidates both the cache and the live boards.

The socket layer is already written for a clustered deployment: every emit goes through `io.to(room)` and every room name comes from one module, so adding `@socket.io/redis-adapter` (or the Redis Streams adapter, which survives a reconnect) is the only change needed for an emit on one instance to reach sockets connected to another. Reports read from a replica, rate limiting moves to the gateway where it can be shared across instances, and the API itself is stateless, which is what makes horizontal scaling behind a load balancer a deployment change rather than a code change.

## Real-time implementation approach

Socket.IO attaches to the same HTTP server as the API, so one port, one origin and one CORS rule cover both, and a client opens a connection with the access token it already holds instead of a second credential. The handshake middleware verifies that token and re-reads the user exactly like `authenticate` does, so a deactivated account is refused at connect rather than kept on a live board until its token expires. A doctor's profile id (not the user id) is resolved during the handshake and stored on the socket, so rooms are joined before the client sees `connect` and no event can slip through the gap between connecting and being watchable.

Rooms are shaped like the screens. `staff` holds every receptionist and super admin, `doctor-self:{doctorId}` holds one doctor, and those two are joined on connect because the appointments list is scoped to a doctor or to the whole clinic rather than to a day. A day board narrows further with `scheduler:join { doctorId, date }` and asks for `{ ok }` back, because a socket has no status code and a client that typed a bad date would otherwise sit on a silent board; a doctor asking for another doctor's board is refused by the same resolved id the board itself is keyed by. Joining is repeated on `connect`, not only on mount, because a dropped connection comes back as a socket in no room at all and without the re-join a board that survived a network blip would look live and silently stop updating.

Events are `appointment:created`, `appointment:updated` and `appointment:cancelled`, each carrying only `{ id, doctorId, date, startTime, status }`. Five appointment actions map onto three events because arriving and completing are updates to the same row. The client filters every incoming event against the doctor and date it is showing, so one booking wakes every board in the clinic and each board decides whether the event is about the day it has open. Emitting is best effort and wrapped in `try/catch`, so a broken socket never turns a successful booking into a 500.

## The demo data

The demo is split in two files: `scripts/seedData.js` holds the fictional facts and `scripts/seed.js` holds only the way they become rows. A seed that mixes the two goes stale the moment a schedule changes, and a reviewer cannot tell which numbers are rules and which are decoration.

No appointment date is written down anywhere. The window is built from the clinic's today, so the demo is never a museum piece: 21 days back to 10 days ahead, with statuses derived from the clock. That makes the seed's own output time dependent, which is exactly why the randomness runs off a fixed seed (mulberry32) and every random draw is taken even when the branch it belongs to does not use it. Without that second part a clock driven status change would consume a different number of draws, and two runs minutes apart would produce two different clinics. With it, two runs on the same day differ only in today's own statuses, which is what the board is supposed to show changing.

Indexes are built with `syncIndexes()` between the wipe and the first insert. Seeding data the API would have refused is worse than seeding nothing, and the partial unique index that prevents double booking is also what makes five deliberately rebooked slots interesting rather than an accident waiting to happen.

The script inserts with the models directly instead of calling `appointmentService.createAppointment`. The service is the right gate for a request, and it rejects a past date on purpose, which is a rule the demo needs to break to have any history at all. Everything else is shared with the request path: the slot grid comes from the same pure `generateSlots`, the patient codes come from the same counter, and the passwords from the same `hashPassword`.

## Trade-offs

Consultation notes and prescriptions were left out. The brief stops at the appointment lifecycle, and a clinical record brings its own requirements (immutability, authorship, retention rules) that would have been guesswork dressed up as a feature.

No Swagger or OpenAPI file. The API is documented as a table plus a runnable [api.http](api.http) with every endpoint and every failure case annotated, which a reviewer can actually execute; a generated spec would have been a second description of the same routes that nothing verifies stays true.

No TypeScript. The project is plain JavaScript on both sides because the API contract is enforced at runtime by zod on input and by the response envelope on output, and adding a compile step would have changed the shape of every file for a benefit the validators already provide at the boundary.

No transactions and no replica set. The double booking guard is a unique index, which does not need a transaction to be correct; requiring a replica set would have made `npm run seed` and the demo dependent on more infrastructure than the guard is worth.

Slots are not cached. Correct generation is cheap at this size and a cache would add an invalidation path that could disagree with the schedule; the section on scaling says where that changes.

Search is anchored (prefix) rather than contains. A bare surname does not find "Dr. Ifeanyi Okafor", which is a real limitation, accepted because an unanchored search cannot use the index and would degrade with collection size.

The audit trail is fire and forget from the request path. An audit write that fails is logged and does not fail the operation it describes, which is the right behaviour for a clinic desk that cannot be blocked by telemetry, and the scaling section covers moving it to a queue.

No refresh token reuse detection. Rotation already narrows the window: a stolen token works only until the real client refreshes, after which the thief holds a dead value. Detecting the replay and revoking every session of that user is a next step, not a claim made here.
