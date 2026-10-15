# EMR Appointment Management

Appointment module for a clinic: user roles, doctor schedules, slot generation, booking, and a status workflow. Backend is Express and MongoDB, frontend is Vite and React.

## Layout

- `server`: express api, mongoose models, services, jest tests
- `client`: react app
- `docker-compose.yml` is added last, as the brief asks, so the api and database can be started together

## Running locally

Prerequisites: Node 20 or newer, and a MongoDB instance (or the docker compose file once it exists).

Server:

```
cd server
cp .env.example .env
npm install
npm run dev
```

The api listens on http://localhost:5000, health check at /api/v1/health.

Client:

```
cd client
npm install
npm run dev
```

The ui runs on http://localhost:5173 and proxies /api to the server, so the session cookie stays first party.

## Tests

```
cd server
npm test
```

Jest runs against an in-memory MongoDB, so no local database is needed and no data is touched.

## API conventions

- Base path `/api/v1`
- Every response is `{ success, message, data, meta }`, errors set `success: false`, `data: null` and `meta.code`
- Status codes: 200, 201, 400 for validation, 401, 403, 404, 409 for conflicts and invalid transitions, 429, 500
- Stack traces, password hashes and token hashes never leave the server

## Assumptions

- Only the preamble was provided so far, so this is the Phase 0 scaffold and later phases append to this section.
- API and client ports are 5000 and 5173, both overridable through env vars and the Vite config.
