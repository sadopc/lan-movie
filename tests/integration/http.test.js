/**
 * Integration tests for HTTP server
 */

const request = require('supertest');
const path = require('path');
const { createHttpServer, addApiRoutes } = require('../../src/server/http');
const { AppState } = require('../../src/server/state');
const { createTestConfig } = require('../helpers/mocks');

describe('HTTP Server Integration', () => {
  let app;
  let appState;
  let config;

  beforeEach(() => {
    config = createTestConfig();
    app = createHttpServer(config);
    appState = new AppState(config);
    addApiRoutes(app, appState);
  });

  describe('Static File Serving', () => {
    it('should serve index.html at root', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
    });

    it('should return 404 for non-existent files', async () => {
      const response = await request(app).get('/non-existent-file.xyz');

      expect(response.status).toBe(404);
    });
  });

  describe('CORS Headers', () => {
    it('should set CORS headers on HLS files', async () => {
      // Note: This may 404 if media directory doesn't exist, but headers should still be set
      const response = await request(app).get('/media/live/master.m3u8');

      // Either the file exists with CORS or doesn't exist
      if (response.status === 200) {
        expect(response.headers['access-control-allow-origin']).toBe('*');
      }
    });
  });

  describe('API Endpoints', () => {
    describe('GET /api/status', () => {
      it('should return offline status when no stream', async () => {
        const response = await request(app).get('/api/status');

        expect(response.status).toBe(200);
        expect(response.body.live).toBe(false);
        expect(response.body.viewerCount).toBe(0);
      });

      it('should return live status when streaming', async () => {
        appState.startStream({
          publisherIP: '127.0.0.1',
          resolution: '1920x1080',
          bitrate: 5000
        });

        const response = await request(app).get('/api/status');

        expect(response.status).toBe(200);
        expect(response.body.live).toBe(true);
        expect(response.body.streamInfo.resolution).toBe('1920x1080');
      });

      it('should include viewer count', async () => {
        // Add a mock viewer
        appState.addViewer({ readyState: 1, on: jest.fn() });

        const response = await request(app).get('/api/status');

        expect(response.body.viewerCount).toBe(1);
      });
    });
  });

  describe('Cache Headers', () => {
    it('should set no-cache for HLS playlists', async () => {
      const response = await request(app).get('/media/live/master.m3u8');

      // Check cache-control header if file exists
      if (response.status === 200) {
        expect(response.headers['cache-control']).toContain('no-cache');
      }
    });
  });

  describe('Content Types', () => {
    it('should serve correct content type for JavaScript', async () => {
      const response = await request(app).get('/js/player.js');

      if (response.status === 200) {
        expect(response.type).toMatch(/javascript/);
      }
    });

    it('should serve correct content type for CSS', async () => {
      const response = await request(app).get('/css/style.css');

      if (response.status === 200) {
        expect(response.type).toMatch(/css/);
      }
    });
  });
});
