# PulseDesk Engineering Decisions

A short explanation of why the project is built the way it is. The [README](README.md) covers how to run
it and what was left out.

## The short answers

| Question | Answer |
| --- | --- |
| How is the server organised? | Routes say who is allowed in and what the input must look like, controllers read the request, and services hold the rules. Keeping the rules in services means the tests, the seed script and the sockets all use the same code the api does. |
| Why strings for dates and times? | A visit stores `2026-10-19` and `09:00` as text. A date object is a moment in UTC, so a late night booking could turn into the day before. Text that a calendar would show cannot drift. |
| How is double booking stopped? | The database has a unique index on doctor, date and start time, but only for visits that are still active. Two people clicking at once means two inserts, and the database lets one through. The service checks the slot first, but only to give a nicer message. |
| Why are slots not stored? | A slot list is just the doctor's hours for that weekday minus breaks. Building it when it is asked for means it can never disagree with the schedule. |
| How do logins work? | Passwords are hashed with bcrypt. A short lived token is kept in the page's memory, and a refresh token in an httpOnly cookie keeps the session going. The cookie value is stored hashed on the server. |
| How are roles enforced? | Twice. The route says who may call it, and the service checks again using the signed in user. So a `doctorId` in the query cannot widen what a doctor sees. |
| How is the dashboard kept cheap? | Each answer is one query. The counts are grouped by status in the database, and days with no visits are filled in as zero in code. |
| How do live updates work? | The server sends a small event after a booking, cancel or update. Screens that are showing that doctor and day ask for the list again. Nothing private travels in the event. |
| What would change at a large clinic? | Give up offset paging for cursor paging, split old visits into an archive, cache the slot list in Redis, and add the Redis adapter so more than one api process can send live events. |

## The shape of a request

A request goes through five small steps: the route, the input check, the controller, the service, and the
model. If a rule is broken the service throws an error and one middleware turns it into the same response
shape every other endpoint uses.

The cost is that following one request means opening a few files. The benefit is that a rule like "a
completed visit cannot be cancelled" is written once, so no route can forget it.

On the client the same idea applies in a smaller way: only the files in `api/` call the server, only the
files in `context/` hold shared state, and pages put components together.

## The database

There are seven collections: users, refreshtokens, departments, doctors, patients, appointments and
auditlogs. A small counters collection hands out the patient codes.

A visit keeps `patientId`, `doctorId` and `departmentId` so the links are real. It also keeps a small copy
of the patient and doctor names, because the list page shows twenty rows and should not have to look up
each one. The copy is a snapshot: if a patient renames themselves, old visits still show the name they
were booked under.

Slots are not a collection. They are built from the doctor's weekly sessions, breaks are removed, and
then the day's active visits mark some of them as booked.

The indexes exist for the queries the app actually makes: one doctor's day, one department's day, the
default list order, the two name searches, and one patient's history. Expired refresh tokens are removed
by a TTL index, so nothing has to clean them up.

## Double booking

The real protection is the partial unique index on `{ doctorId, date, startTime }`, which only covers
visits that are scheduled, arrived or completed. Cancelling a visit takes it out of the index, which is
why the slot becomes free again while the cancelled row stays as a record.

The check in the service runs first so the normal case gets a clear message. When two requests pass that
check at the same moment, both try to insert, the database keeps one, and the other gets error 11000,
which becomes a 409.

No transaction is used, because a single MongoDB server does not have them and the unique index does not
need one. The one thing to be careful about is the new patient: if a booking fails after the patient was
created, the patient is deleted again, and a failed cleanup is logged instead of hidden.

## Security

Passwords are hashed with bcrypt at cost 10. The hash is never selected by default, so it cannot leak into
a response by accident.

The access token lasts 15 minutes and lives only in memory. The refresh token is a random value stored as
a hash in an httpOnly cookie, and it is replaced every time it is used, so signing out is one delete.
The cookie is `SameSite=Lax`, limited to the auth routes, and `Secure` in production.

Every input is checked with zod before it reaches a service. Login is limited to 10 tries per 15 minutes
and everything else to 300 requests per minute. A failed login always gets the same sentence, so the
endpoint cannot be used to find out which emails exist.

The server also refuses to start with a bad environment. One file reads `process.env`, checks it, and
prints exactly what is wrong, so a missing secret fails at boot rather than at the first login.

## Speed

- Lists use `.lean()` and ask only for the fields they show.
- The slot list is built from one query for the day, not one query per slot.
- The dashboard is one grouped query plus one for the trend, instead of a count per number.
- Sorting is limited to four known fields, page size is capped, and `_id` is added at the end so paging
  cannot repeat or skip a row.
- The client keeps filters in the URL, so the cache key is the same as the link. The old page stays on
  screen while the next one loads, and the three text boxes wait 300 ms before searching.

## Live updates

Socket.IO runs on the same server and port as the api, and it uses the same access token. The handshake
re-reads the user, so a deactivated account is refused straight away.

There are rooms for the front desk, for one doctor, and for one doctor's day. A board joins a day when it
opens and leaves when it closes, and it joins again after a reconnect, because a reconnected socket is in
no room at all.

The events are `appointment:created`, `appointment:updated` and `appointment:cancelled`, and they carry
only the id, doctor, date, start time and status. The screen fetches the rest itself, so patient details
never travel over a second path with its own permission rules.

## The demo data

`scripts/seedData.js` holds the made up names, hours and departments. `scripts/seed.js` only turns them
into records. That way the demo can be changed by editing one file.

No date is hardcoded. The window is built from the clinic's today, from 45 days back to 14 days ahead, and
a fixed random seed means two runs on the same day build the same diary. Statuses follow the clock: a
visit that ended this morning is completed, one happening now is arrived, and one next week is still
scheduled.

The thirteen patients on a regular review are booked before anything random, each about every three or
four weeks on the nearest day their doctor works, so a full diary can never crowd them out. Notes come
from the visit's own department, or from the general desk list, and never from another department.

## What was left out, and why

- **Consultation notes and prescriptions.** They bring rules about who may change a medical record and how
  long it is kept, and guessing those would be worse than leaving them out.
- **A generated API spec.** [api.http](api.http) has a real request for every route, which is easier to
  check than a second description that nothing keeps up to date.
- **TypeScript.** The input is already checked at runtime with zod, so a compile step would mostly change
  the look of every file.
- **Transactions.** The unique index is enough for the booking rule, and requiring a replica set would
  make the project harder to run for no gain.
- **A slot cache.** Building a slot list is cheap at this size, and a cache is one more thing that can be
  wrong.
- **Reuse detection for refresh tokens.** Replacing the token on every use already limits the damage of a
  stolen one. Spotting a replay and signing every device out is a next step.
- **A browser test suite.** The server has the Jest tests; the client was checked by hand.
