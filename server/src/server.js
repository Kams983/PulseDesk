const http = require('http');
const app = require('./app');
const env = require('./config/env');
const connectDb = require('./config/db');

// http server is created by hand so socket.io can attach to it later without touching this file
async function start() {
  await connectDb();

  const server = http.createServer(app);

  server.listen(env.port, () => {
    console.log(`api listening on http://localhost:${env.port}/api/v1`);
  });
}

start().catch((err) => {
  console.error('failed to start server:', err.message);
  process.exit(1);
});
