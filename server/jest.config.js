module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // env.js has to run before any module loads, because config/env.js validates on import
  setupFiles: ['<rootDir>/tests/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  clearMocks: true,
  // the first run downloads the in-memory mongo binary, later runs are fast
  testTimeout: 30000,
};
