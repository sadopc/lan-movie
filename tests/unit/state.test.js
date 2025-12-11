/**
 * Unit tests for state.js - AppState class
 */

const { AppState } = require('../../src/server/state');
const { createMockWebSocket, createTestConfig } = require('../helpers/mocks');

describe('AppState', () => {
  let appState;
  let config;

  beforeEach(() => {
    config = createTestConfig();
    appState = new AppState(config);
  });

  describe('constructor', () => {
    it('should initialize with offline stream status', () => {
      expect(appState.stream.status).toBe('offline');
      expect(appState.stream.id).toBe('live');
    });

    it('should initialize with empty viewers map', () => {
      expect(appState.viewers.size).toBe(0);
    });
  });

  describe('Stream Operations', () => {
    describe('startStream', () => {
      it('should set stream to live with metadata', () => {
        const metadata = {
          publisherIP: '192.168.1.100',
          resolution: '1920x1080',
          bitrate: 5000
        };

        appState.startStream(metadata);

        expect(appState.stream.status).toBe('live');
        expect(appState.stream.publisherIP).toBe('192.168.1.100');
        expect(appState.stream.resolution).toBe('1920x1080');
        expect(appState.stream.bitrate).toBe(5000);
        expect(appState.stream.startTime).toBeInstanceOf(Date);
      });

      it('should throw if stream is already active', () => {
        appState.startStream({ publisherIP: '127.0.0.1' });

        expect(() => appState.startStream({ publisherIP: '127.0.0.1' }))
          .toThrow('Stream already active');
      });

      it('should emit streamChange event', () => {
        const callback = jest.fn();
        appState.on('streamChange', callback);

        appState.startStream({ publisherIP: '127.0.0.1' });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
          live: true
        }));
      });
    });

    describe('stopStream', () => {
      it('should set stream to offline', () => {
        appState.startStream({ publisherIP: '127.0.0.1' });
        appState.stopStream();

        expect(appState.stream.status).toBe('offline');
        expect(appState.stream.publisherIP).toBeUndefined();
      });

      it('should emit streamChange event', () => {
        appState.startStream({ publisherIP: '127.0.0.1' });

        const callback = jest.fn();
        appState.on('streamChange', callback);

        appState.stopStream();

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
          live: false
        }));
      });
    });

    describe('updateStreamMetadata', () => {
      it('should update metadata when stream is live', () => {
        appState.startStream({ publisherIP: '127.0.0.1', resolution: 'unknown', bitrate: 0 });

        appState.updateStreamMetadata({
          resolution: '1920x1080',
          bitrate: 5000
        });

        expect(appState.stream.resolution).toBe('1920x1080');
        expect(appState.stream.bitrate).toBe(5000);
      });

      it('should not update when stream is offline', () => {
        appState.updateStreamMetadata({
          resolution: '1920x1080',
          bitrate: 5000
        });

        expect(appState.stream.resolution).toBeUndefined();
      });

      it('should not update with unknown resolution', () => {
        appState.startStream({ publisherIP: '127.0.0.1', resolution: '1280x720', bitrate: 2500 });

        appState.updateStreamMetadata({
          resolution: 'unknown',
          bitrate: 0
        });

        expect(appState.stream.resolution).toBe('1280x720');
        expect(appState.stream.bitrate).toBe(2500);
      });

      it('should emit streamChange when updated', () => {
        appState.startStream({ publisherIP: '127.0.0.1' });

        const callback = jest.fn();
        appState.on('streamChange', callback);

        appState.updateStreamMetadata({
          resolution: '1920x1080',
          bitrate: 5000
        });

        expect(callback).toHaveBeenCalled();
      });
    });

    describe('canStream', () => {
      it('should return true when offline', () => {
        expect(appState.canStream()).toBe(true);
      });

      it('should return false when live', () => {
        appState.startStream({ publisherIP: '127.0.0.1' });
        expect(appState.canStream()).toBe(false);
      });
    });

    describe('getStreamInfo', () => {
      it('should return offline info when not live', () => {
        const info = appState.getStreamInfo();
        expect(info.live).toBe(false);
        expect(info.viewerCount).toBe(0);
        expect(info.streamInfo).toBeUndefined();
      });

      it('should return stream info when live', () => {
        appState.startStream({
          publisherIP: '127.0.0.1',
          resolution: '1920x1080',
          bitrate: 5000
        });

        const info = appState.getStreamInfo();
        expect(info.live).toBe(true);
        expect(info.streamInfo.resolution).toBe('1920x1080');
        expect(info.streamInfo.bitrate).toBe(5000);
        expect(info.streamInfo.duration).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Viewer Operations', () => {
    describe('addViewer', () => {
      it('should add a viewer and return session', () => {
        const ws = createMockWebSocket();
        const session = appState.addViewer(ws);

        expect(session).not.toBeNull();
        expect(session.id).toBeDefined();
        expect(session.websocket).toBe(ws);
        expect(appState.getViewerCount()).toBe(1);
      });

      it('should return null when at capacity (atomic check)', () => {
        config.limits.maxViewers = 2;
        appState = new AppState(config);

        appState.addViewer(createMockWebSocket());
        appState.addViewer(createMockWebSocket());
        const session = appState.addViewer(createMockWebSocket());

        expect(session).toBeNull();
        expect(appState.getViewerCount()).toBe(2);
      });

      it('should emit viewerChange event', () => {
        const callback = jest.fn();
        appState.on('viewerChange', callback);

        appState.addViewer(createMockWebSocket());

        expect(callback).toHaveBeenCalledWith(1);
      });

      it('should generate unique session IDs', () => {
        const session1 = appState.addViewer(createMockWebSocket());
        const session2 = appState.addViewer(createMockWebSocket());

        expect(session1.id).not.toBe(session2.id);
      });
    });

    describe('removeViewer', () => {
      it('should remove viewer by ID', () => {
        const session = appState.addViewer(createMockWebSocket());
        appState.removeViewer(session.id);

        expect(appState.getViewerCount()).toBe(0);
      });

      it('should emit viewerChange event', () => {
        const session = appState.addViewer(createMockWebSocket());

        const callback = jest.fn();
        appState.on('viewerChange', callback);

        appState.removeViewer(session.id);

        expect(callback).toHaveBeenCalledWith(0);
      });

      it('should not throw for non-existent ID', () => {
        expect(() => appState.removeViewer('non-existent')).not.toThrow();
      });
    });

    describe('isRoomFull', () => {
      it('should return false when under capacity', () => {
        config.limits.maxViewers = 5;
        appState = new AppState(config);

        appState.addViewer(createMockWebSocket());
        appState.addViewer(createMockWebSocket());

        expect(appState.isRoomFull()).toBe(false);
      });

      it('should return true when at capacity', () => {
        config.limits.maxViewers = 2;
        appState = new AppState(config);

        appState.addViewer(createMockWebSocket());
        appState.addViewer(createMockWebSocket());

        expect(appState.isRoomFull()).toBe(true);
      });
    });

    describe('updateViewerQuality', () => {
      it('should update viewer quality', () => {
        const session = appState.addViewer(createMockWebSocket());
        appState.updateViewerQuality(session.id, '720p');

        const viewer = appState.viewers.get(session.id);
        expect(viewer.quality).toBe('720p');
      });
    });

    describe('updateViewerPing', () => {
      it('should update viewer lastPing', () => {
        const session = appState.addViewer(createMockWebSocket());

        appState.updateViewerPing(session.id);

        const viewer = appState.viewers.get(session.id);
        expect(viewer.lastPing).toBeInstanceOf(Date);
      });
    });
  });

  describe('Event System', () => {
    it('should allow registering multiple listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      appState.on('streamChange', callback1);
      appState.on('streamChange', callback2);

      appState.startStream({ publisherIP: '127.0.0.1' });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should allow removing listeners', () => {
      const callback = jest.fn();

      appState.on('streamChange', callback);
      appState.off('streamChange', callback);

      appState.startStream({ publisherIP: '127.0.0.1' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const errorCallback = jest.fn(() => { throw new Error('Test error'); });
      const normalCallback = jest.fn();

      appState.on('streamChange', errorCallback);
      appState.on('streamChange', normalCallback);

      // Should not throw
      expect(() => appState.startStream({ publisherIP: '127.0.0.1' })).not.toThrow();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should close all WebSocket connections', () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      appState.addViewer(ws1);
      appState.addViewer(ws2);

      appState.cleanup();

      expect(ws1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(ws2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
    });

    it('should clear viewers map', () => {
      appState.addViewer(createMockWebSocket());
      appState.addViewer(createMockWebSocket());

      appState.cleanup();

      expect(appState.getViewerCount()).toBe(0);
    });

    it('should reset stream to offline', () => {
      appState.startStream({ publisherIP: '127.0.0.1' });
      appState.cleanup();

      expect(appState.stream.status).toBe('offline');
    });
  });
});
