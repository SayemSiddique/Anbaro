const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...expoPreset,
  // Current Session 08 tests exercise the platform-independent queue/sync
  // state machine. Avoid loading React Native's Flow-typed runtime setup in
  // the Node test process; device/component coverage remains a later gate.
  setupFiles: [],
  testEnvironment: 'node',
};
