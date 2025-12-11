/**
 * Test mock utilities for LANCast
 */

/**
 * Create a mock WebSocket
 */
function createMockWebSocket() {
  return {
    readyState: 1, // OPEN
    isAlive: true,
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    ping: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn()
  };
}

/**
 * Create a mock HTTP request
 */
function createMockRequest(overrides = {}) {
  return {
    socket: {
      remoteAddress: '127.0.0.1'
    },
    ...overrides
  };
}

/**
 * Create a mock Express response
 */
function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis()
  };
  return res;
}

/**
 * Create a test config
 */
function createTestConfig(overrides = {}) {
  return {
    rtmp: {
      port: 1935,
      ...overrides.rtmp
    },
    http: {
      port: 8080,
      ...overrides.http
    },
    transcoding: {
      qualities: [
        { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' },
        { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
        { name: '480p', width: 854, height: 480, bitrate: '1000k' }
      ],
      segmentDuration: 1,
      playlistSize: 3,
      ...overrides.transcoding
    },
    limits: {
      maxViewers: 10,
      ...overrides.limits
    }
  };
}

/**
 * Create a mock child process
 */
function createMockChildProcess() {
  const EventEmitter = require('events');
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  proc.pid = 12345;
  return proc;
}

/**
 * Wait for a condition to be true
 */
async function waitFor(condition, timeout = 1000, interval = 10) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

module.exports = {
  createMockWebSocket,
  createMockRequest,
  createMockResponse,
  createTestConfig,
  createMockChildProcess,
  waitFor
};
