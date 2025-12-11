/**
 * Integration tests for WebSocket server
 */

const http = require('http');
const WebSocket = require('ws');
const { createWebSocketServer, startHeartbeat, stopHeartbeat, closeAllConnections } = require('../../src/server/websocket');
const { AppState } = require('../../src/server/state');
const { createTestConfig } = require('../helpers/mocks');

describe('WebSocket Server Integration', () => {
  let httpServer;
  let wss;
  let appState;
  let config;
  let serverPort;

  beforeEach((done) => {
    config = createTestConfig({ limits: { maxViewers: 3 } });
    appState = new AppState(config);

    httpServer = http.createServer();
    wss = createWebSocketServer(httpServer, appState);

    httpServer.listen(0, () => {
      serverPort = httpServer.address().port;
      done();
    });
  });

  afterEach((done) => {
    closeAllConnections(wss);
    wss.close(() => {
      httpServer.close(done);
    });
  });

  function createClient() {
    return new WebSocket(`ws://localhost:${serverPort}/ws`);
  }

  describe('Connection Handling', () => {
    it('should accept new connections', (done) => {
      const client = createClient();

      client.on('open', () => {
        expect(appState.getViewerCount()).toBe(1);
        client.close();
        done();
      });
    });

    it('should send status on connect', (done) => {
      const client = createClient();
      let messageReceived = false;

      client.on('message', (data) => {
        if (messageReceived) return; // Only process first message
        messageReceived = true;

        const message = JSON.parse(data.toString());
        expect(message.type).toBe('status');
        expect(message.data).toHaveProperty('live');
        expect(message.data).toHaveProperty('viewerCount');
        client.close();
        done();
      });
    });

    it('should remove viewer on disconnect', (done) => {
      const client = createClient();

      client.on('open', () => {
        expect(appState.getViewerCount()).toBe(1);
        client.close();
      });

      client.on('close', () => {
        // Wait a tick for cleanup
        setTimeout(() => {
          expect(appState.getViewerCount()).toBe(0);
          done();
        }, 50);
      });
    });
  });

  describe('Room Capacity (Race Condition Fix)', () => {
    it('should reject connection when room is full', (done) => {
      const clients = [];
      let rejectedCount = 0;
      let connectedCount = 0;

      // Try to connect 4 clients to a room with max 3
      for (let i = 0; i < 4; i++) {
        const client = createClient();
        clients.push(client);

        client.on('open', () => {
          connectedCount++;
        });

        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'error' && message.data.code === 'ROOM_FULL') {
            rejectedCount++;
          }
        });

        client.on('close', (code) => {
          if (code === 1008) { // Policy Violation (room full)
            rejectedCount++;
          }
        });
      }

      // Wait for all connections to settle
      setTimeout(() => {
        expect(appState.getViewerCount()).toBeLessThanOrEqual(3);
        clients.forEach(c => c.close());
        done();
      }, 200);
    });

    it('should handle concurrent connections atomically', (done) => {
      config.limits.maxViewers = 2;
      appState = new AppState(config);

      // Close existing wss and create new one with updated appState
      closeAllConnections(wss);
      wss.close(() => {
        wss = createWebSocketServer(httpServer, appState);

        const clients = [];

        // Try to connect 5 clients simultaneously
        for (let i = 0; i < 5; i++) {
          clients.push(createClient());
        }

        setTimeout(() => {
          // Should never exceed maxViewers
          expect(appState.getViewerCount()).toBeLessThanOrEqual(2);
          clients.forEach(c => c.close());
          done();
        }, 300);
      });
    });
  });

  describe('Status Broadcasting', () => {
    it('should broadcast stream changes to all clients', (done) => {
      const client1 = createClient();
      const client2 = createClient();
      let messagesReceived = 0;

      const checkMessage = (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'status' && message.data.live === true) {
          messagesReceived++;
          if (messagesReceived >= 2) {
            client1.close();
            client2.close();
            done();
          }
        }
      };

      client1.on('message', checkMessage);
      client2.on('message', checkMessage);

      // Wait for both clients to connect, then start stream
      setTimeout(() => {
        appState.startStream({
          publisherIP: '127.0.0.1',
          resolution: '1920x1080',
          bitrate: 5000
        });
      }, 100);
    });

    it('should broadcast viewer count changes', (done) => {
      const client1 = createClient();
      let initialReceived = false;

      client1.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'status') {
          if (!initialReceived) {
            initialReceived = true;
            // Connect second client
            const client2 = createClient();
            client2.on('open', () => {
              // First client should receive updated count
            });
          } else if (message.data.viewerCount === 2) {
            client1.close();
            done();
          }
        }
      });
    });
  });

  describe('Heartbeat', () => {
    it('should start and stop heartbeat timer', () => {
      const timer = startHeartbeat(wss, appState, 100);
      expect(timer).toBeDefined();

      stopHeartbeat(timer);
      // Should not throw
    });

    it('should handle stopHeartbeat with null timer', () => {
      expect(() => stopHeartbeat(null)).not.toThrow();
    });
  });

  describe('Close All Connections', () => {
    it('should close all connected clients', (done) => {
      const client1 = createClient();
      const client2 = createClient();
      let closedCount = 0;
      let bothConnected = false;

      const onClose = () => {
        closedCount++;
        if (closedCount >= 2) {
          done();
        }
      };

      client1.on('close', onClose);
      client2.on('close', onClose);

      client1.on('open', () => {
        if (client2.readyState === WebSocket.OPEN) {
          closeAllConnections(wss);
        } else {
          bothConnected = true;
        }
      });

      client2.on('open', () => {
        if (bothConnected || client1.readyState === WebSocket.OPEN) {
          closeAllConnections(wss);
        }
      });
    });
  });
});
