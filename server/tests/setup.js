const os = require('os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

// tests never touch a real database, the binary is downloaded once and reused
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();

  // the driver loads its os adapter with a dynamic import, which jest cannot run, and it swallows
  // that failure and then sends empty client metadata, which mongod 8.2 rejects with a handshake error
  await mongoose.connect(mongod.getUri(), { runtimeAdapters: { os } });
});

// wipe between tests so a unique index assertion cannot leak into the next one
afterEach(async () => {
  // if beforeAll never connected, skip the wipe so the real failure stays the visible one
  if (!mongoose.connection.db) return;

  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
