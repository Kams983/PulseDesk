# PulseDesk

PulseDesk is a small appointment system for a clinic. Staff can book patients in, move a visit along
from scheduled to arrived to completed, and see the day update live on other screens.

The api is Express and MongoDB. The website is Vite and React.

## What you can do

There are three kinds of account.

- **Super admin** adds departments, doctors and receptionists, and edits each doctor's weekly hours.
- **Receptionist** books a visit for a patient already on the list or for a new one, searches and sorts
  the list, and marks people as arrived.
- **Doctor** opens their own board, sees only their own visits, and completes them.

Every role also gets a dashboard with today's numbers, and the pages refresh themselves when someone
else books, cancels or updates a visit.

## Built with

- **Server:** Node 20, Express 5, MongoDB with Mongoose, zod for input checks, Luxon for the clinic
  timezone, Socket.IO for live updates, Jest with an in-memory MongoDB for tests.
- **Client:** Vite, React 19, React Router, TanStack Query, Tailwind CSS, axios, react-hook-form and zod.

## Folder map

```
server/
  scripts/    seed.js builds the demo data, seedData.js holds the made up names and hours
  src/        config, controllers, middlewares, models, routes, services, sockets, utils, validators
  tests/      Jest tests, run against a temporary database
client/
  src/        api, components, context, hooks, pages, routes, utils
```

Both `src` folders follow one simple idea: the `server/src/services` files hold the rules, and the
`client/src/api` files are the only ones that talk to the server.

## Running it locally

You need Node 20 or newer and MongoDB (a local `mongod`, an Atlas cluster, or the Docker setup below).

```bash
# server
cd server
cp .env.example .env        # then put a long random string in JWT_ACCESS_SECRET
npm install

# client, in a second terminal
cd client
cp .env.example .env        # optional, the defaults work
npm install
```

Then, from the project root:

```bash
npm run dev:server    # http://localhost:5000
npm run dev:client    # http://localhost:5173
```

The root `package.json` also has `npm run install:all`, `npm run seed` and `npm test`.

If the server prints an environment error and stops, it is usually one of these:

- `JWT_ACCESS_SECRET` is missing or shorter than 32 characters.
- `MONGO_URI` points at a database that is not running.
- Something in your shell has already set `PORT` (some tools set it to `0`). In that case run
  `env -u PORT npm run dev`, because the shell wins over the `.env` file.

### Environment variables

`server/.env`

| Variable | Needed | Default | What it is |
| --- | --- | --- | --- |
| `MONGO_URI` | yes | none | the database address |
| `JWT_ACCESS_SECRET` | yes | none | at least 32 characters, signs the login token |
| `PORT` | no | `5000` | api and sockets share it |
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `ACCESS_TOKEN_TTL` | no | `15m` | how long a login token lasts |
| `REFRESH_TOKEN_TTL_DAYS` | no | `7` | how long a session lasts |
| `CLIENT_ORIGIN` | no | `http://localhost:5173` | the one site allowed to call the api |
| `CLINIC_TIMEZONE` | no | `Africa/Lagos` | the clock every "today" check uses |

`client/.env`

| Variable | Needed | Default | What it is |
| --- | --- | --- | --- |
| `VITE_API_TARGET` | no | `http://localhost:5000` | where the dev server sends api calls |

## Demo data

```bash
npm run seed
```

This empties the collections it owns and writes a fresh clinic: six departments, ten accounts, seven
doctors with their own hours, and a few weeks of visits around today. It refuses to run when
`NODE_ENV=production` unless you pass `--force`.

| Role | Email | Password |
| --- | --- | --- |
| super admin | admin@emr.test | Password123! |
| receptionist | reception@emr.test | Password123! |
| receptionist | reception2@emr.test | Password123! |
| doctor | dr.okafor@emr.test | Password123! |
| doctor | dr.ibrahim@emr.test | Password123! |
| doctor | dr.bello@emr.test | Password123! |
| doctor | dr.adeyemi@emr.test | Password123! |
| doctor | dr.sani@emr.test | Password123! |
| doctor | dr.etim@emr.test | Password123! |
| doctor | dr.williams@emr.test | Password123! |

The sign in page has a button for each of these, so you can try a role without typing.

## The api in one minute

Every endpoint starts with `/api/v1`. Every answer has the same shape: `{ success, message, data, meta }`.
Errors use `success: false`, and `meta.code` tells the client what went wrong.

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET | `/health` | anyone | is the server awake |
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` | anyone / signed in | sign in, keep the session, sign out |
| GET | `/doctors`, `/doctors/:id` | signed in | the doctor list, or one doctor |
| POST | `/doctors` | super admin | add a doctor and their login |
| PUT | `/doctors/:id/schedule` | super admin | replace a doctor's weekly hours |
| GET | `/slots?doctorId=&date=` | signed in | the free and taken times for one day |
| GET | `/patients?q=` | desk and doctors | find a patient |
| POST | `/appointments` | desk | book a visit |
| GET | `/appointments`, `/appointments/:id` | signed in | the list, or one visit |
| PUT | `/appointments/:id` | desk | change the purpose or notes |
| DELETE | `/appointments/:id` | desk | cancel a visit |
| POST | `/appointments/:id/arrive`, `/complete` | desk / doctor | move the visit on |
| GET | `/dashboard`, `/dashboard/trend`, `/dashboard/calendar` | signed in | the numbers behind the board |

[api.http](api.http) has a runnable request for every route, including the ones that should fail.

Two rules are worth knowing:

- A slot can only be booked once. If someone was faster, the second request gets a `409`.
- Only the doctor on the visit, or a super admin, can complete it. The desk can mark someone as arrived.

## Live updates

The api and the live connection share one port. When a visit is booked, updated or cancelled, the server
tells the screens that care, and those screens simply ask for the list again. A booking made at the front
desk therefore shows up on the doctor's board without anyone reloading the page.

## Tests

```bash
npm test
```

The tests run against a temporary MongoDB, so they never touch your own data. The first run downloads
that database once, which takes a few minutes.

The 57 tests cover the health check, the error handling, the models and their indexes, the slot
generator, the dashboard, the socket handshake and events, and a burst of twenty people trying to book
the same slot at the same moment. That last one is the important one: exactly one booking wins, the
other nineteen are told the slot is taken, and the database is left with one appointment.

## Docker

```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)" > .env
docker compose up --build
```

The api is on http://localhost:5000 and the site on http://localhost:8080, with nginx passing `/api` and
`/socket.io` through to the api. Seed it with `docker compose exec server npm run seed`.

This setup has not been run, because the machine it was written on has no Docker. The two `npm run dev`
terminals above are the path that was actually used.

## Choices and limits

- **Times are strings.** A visit stores `2026-10-19` and `09:00` instead of a date object, so a booking
  cannot slip a day when someone converts a timezone.
- **Slots are not saved.** They are worked out from the doctor's hours each time they are asked for, then
  marked booked using that day's visits.
- **One mobile number, one patient.** Signing up a number that already exists offers you that patient
  instead of creating a second one.
- **Cancelling keeps the row.** The visit stays in the database as a record, and the slot becomes free.
- **Search looks at the beginning of a name**, so a bare surname does not find "Dr. Ifeanyi Okafor".
- **Not built:** prescriptions, billing, patient files, password reset, e-mail, TypeScript and a browser
  test suite. The client was checked by hand.
- **One server process.** Running a second api instance would need the Redis adapter for live updates.

[ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md) explains why a few of these choices were made.

## License

Not licensed for redistribution. Built as a practice project.
