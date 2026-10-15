# Engineering Decisions

Short notes per area. Newest line goes at the bottom of its section.

## Environment and layout

- CommonJS on the server, ESM only inside the client where Vite requires it, so jest needs no transform step.
- Express 5 is what npm installs today, and it forwards rejected promises to the error middleware, so controllers do not need try/catch wrappers.
- One `.env.example` documents every variable the server reads, and all of them have a working default so the api boots with no `.env` at all.
- The http server is created by hand in `server.js` so socket.io can attach to the same server later without touching the boot code.

## API envelope

- `sendSuccess` and `sendError` in `utils/apiResponse.js` are the only places the envelope is built, so the shape cannot drift between features.
- `middleware/errorHandler.js` maps AppError, zod errors, mongoose validation errors and duplicate key errors, and converts anything else into a 500 with the stack kept in the server log.

## Testing

- `tests/setup.js` starts an in-memory MongoDB for every test file and wipes collections between tests, so a uniqueness assertion cannot leak into the next test.
- The global rate limiter is skipped when `NODE_ENV=test`, otherwise the suite would trip its own 429.
- mongodb-memory-server fetches its mongod binary on the first test run rather than in a postinstall script, npm 11 blocks dependency install scripts by default, and the binary is then cached under `node_modules/.cache`.
