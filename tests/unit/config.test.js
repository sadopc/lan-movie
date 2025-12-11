/**
 * Unit tests for config.js
 */

const path = require('path');

// Mock fs before requiring config
jest.mock('fs');
const fs = require('fs');

// Now require the config module
const { loadConfig, DEFAULT_CONFIG } = require('../../src/server/config');

describe('Config Module', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.RTMP_PORT;
    delete process.env.HTTP_PORT;
    delete process.env.MAX_VIEWERS;
    delete process.env.SEGMENT_DURATION;
    delete process.env.PLAYLIST_SIZE;
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have default RTMP port 1935', () => {
      expect(DEFAULT_CONFIG.rtmp.port).toBe(1935);
    });

    it('should have default HTTP port 8080', () => {
      expect(DEFAULT_CONFIG.http.port).toBe(8080);
    });

    it('should have 3 quality tiers', () => {
      expect(DEFAULT_CONFIG.transcoding.qualities).toHaveLength(3);
    });

    it('should have default maxViewers of 10', () => {
      expect(DEFAULT_CONFIG.limits.maxViewers).toBe(10);
    });
  });

  describe('loadConfig', () => {
    it('should return defaults when config file does not exist', () => {
      fs.readFileSync.mockImplementation(() => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });

      const config = loadConfig();
      expect(config.rtmp.port).toBe(1935);
      expect(config.http.port).toBe(8080);
    });

    it('should merge file config with defaults', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        rtmp: { port: 2000 }
      }));

      const config = loadConfig();
      expect(config.rtmp.port).toBe(2000);
      expect(config.http.port).toBe(8080); // Default preserved
    });

    it('should apply environment variable overrides', () => {
      fs.readFileSync.mockImplementation(() => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });

      process.env.RTMP_PORT = '3000';
      process.env.HTTP_PORT = '9000';
      process.env.MAX_VIEWERS = '50';

      const config = loadConfig();
      expect(config.rtmp.port).toBe(3000);
      expect(config.http.port).toBe(9000);
      expect(config.limits.maxViewers).toBe(50);
    });

    it('should validate port range', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        rtmp: { port: 70000 }
      }));

      expect(() => loadConfig()).toThrow('rtmp.port must be between 1 and 65535');
    });

    it('should reject same port for RTMP and HTTP', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        rtmp: { port: 8080 },
        http: { port: 8080 }
      }));

      expect(() => loadConfig()).toThrow('rtmp.port and http.port must be different');
    });

    it('should validate maxViewers range', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        limits: { maxViewers: 200 }
      }));

      expect(() => loadConfig()).toThrow('limits.maxViewers must be between 1 and 100');
    });

    it('should validate segmentDuration range', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        transcoding: { segmentDuration: 20 }
      }));

      expect(() => loadConfig()).toThrow('transcoding.segmentDuration must be between 1 and 10');
    });

    it('should validate playlistSize range', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        transcoding: { playlistSize: 1 }
      }));

      expect(() => loadConfig()).toThrow('transcoding.playlistSize must be between 2 and 10');
    });

    it('should require at least one quality tier', () => {
      fs.readFileSync.mockReturnValue(JSON.stringify({
        transcoding: { qualities: [] }
      }));

      expect(() => loadConfig()).toThrow('transcoding.qualities must have at least 1 entry');
    });

    it('should handle invalid JSON gracefully', () => {
      fs.readFileSync.mockReturnValue('not valid json');

      // Should use defaults when JSON is invalid
      const config = loadConfig();
      expect(config.rtmp.port).toBe(1935);
    });

    it('should ignore invalid env values and use defaults', () => {
      fs.readFileSync.mockImplementation(() => {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      });

      process.env.RTMP_PORT = 'not-a-number';

      const config = loadConfig();
      expect(config.rtmp.port).toBe(1935); // Default
    });
  });
});
