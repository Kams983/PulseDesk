const http = require('http');
const app = require('./app');
const env = require('./config/env');
const connectDb = require('./config/db');
const { initSocket } = require('./sockets');
// registers every schema, so mongoose builds the indexes as soon as the connection opens
require('./models');

// the http server is created by hand so socket.io attaches to the same server, which keeps the api and
// the realtime channel on one port and one origin
async function start() {
  await connectDb();

  const server = http.createServer(app);

  initSocket(server);

  server.listen(env.port, () => {
    console.log(`api listening on http://localhost:${env.port}/api/v1`);
  });
}

start().catch((err) => {
  console.error('failed to start server:', err.message);
  process.exit(1);
});
