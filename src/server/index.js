/**
 * LANCast - LAN Video Streaming Platform
 * Main entry point with graceful shutdown handling
 */

const { loadConfig } = require('./config');
const { AppState } = require('./state');
const { createHttpServer, startHttpServer, addApiRoutes } = require('./http');
const { createRtmpServer, startRtmpServer, stopRtmpServer } = require('./rtmp');
const { validateFfmpeg, startTranscoder, stopTranscoder, setAppState } = require('./transcoder');
const { createWebSocketServer, startHeartbeat, stopHeartbeat, closeAllConnections } = require('./websocket');

// Server instances for cleanup
let httpServer = null;
let rtmpServer = null;
let appState = null;
let wss = null;
let heartbeatTimer = null;

/**
 * Main application startup
 */
async function main() {
  console.log('LANCast server starting...');

  // Load configuration
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('Configuration error:', err.message);
    process.exit(1);
  }

  // Validate FFmpeg is available before starting servers
  try {
    await validateFfmpeg();
  } catch (err) {
    console.error('FFmpeg validation failed:', err.message);
    process.exit(1);
  }

  // Initialize application state
  appState = new AppState(config);

  // Wire transcoder crash recovery to app state
  setAppState(appState, (exitCode) => {
    console.log(`[Main] Transcoder crashed with exit code ${exitCode}`);
  });

  // Create and start HTTP server
  const app = createHttpServer(config);

  // Add API routes that need state
  addApiRoutes(app, appState);

  try {
    httpServer = await startHttpServer(app, config);
  } catch (err) {
    console.error('Failed to start HTTP server:', err.message);
    process.exit(1);
  }

  // Create WebSocket server attached to HTTP server
  wss = createWebSocketServer(httpServer, appState);
  heartbeatTimer = startHeartbeat(wss, appState, 30000);

  // Create and configure RTMP server
  rtmpServer = createRtmpServer(config, appState);

  // Wire RTMP events to transcoder with detailed logging
  rtmpServer._events.on('streamStart', ({ id, streamPath, metadata }) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] STREAM START: ${streamPath}`);
    if (metadata) {
      console.log(`  Resolution: ${metadata.resolution || 'unknown'}`);
      console.log(`  Bitrate: ${metadata.bitrate || 0} kbps`);
      console.log(`  Publisher: ${metadata.publisherIP || 'unknown'}`);
    }
    startTranscoder(config, streamPath);
  });

  rtmpServer._events.on('streamStop', ({ id, streamPath }) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] STREAM STOP: ${streamPath}`);
    stopTranscoder();
  });

  // Start RTMP server
  startRtmpServer(rtmpServer);

  console.log('LANCast server started');
  console.log(`RTMP server listening on port ${config.rtmp.port}`);
  console.log(`HTTP server listening on port ${config.http.port}`);
  console.log(`Open http://localhost:${config.http.port} in your browser`);
  console.log(`Stream to rtmp://localhost:${config.rtmp.port}/live/stream`);
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  // Stop RTMP server first (prevents new streams)
  if (rtmpServer) {
    stopRtmpServer(rtmpServer);
    rtmpServer = null;
  }

  // Stop transcoder (handles its own HLS cleanup internally)
  stopTranscoder();

  // Stop heartbeat timer
  if (heartbeatTimer) {
    stopHeartbeat(heartbeatTimer);
    heartbeatTimer = null;
  }

  // Close all WebSocket connections via wss (don't use appState.cleanup() to avoid double-close)
  if (wss) {
    closeAllConnections(wss);
    wss.close();
    wss = null;
    console.log('WebSocket server closed');
  }

  // Reset application state without closing websockets (already done above)
  if (appState) {
    appState.viewers.clear();
    appState.stream = { id: 'live', status: 'offline' };
    console.log('Application state cleaned up');
  }

  // Close HTTP server
  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    });
  }

  console.log('Shutdown complete');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start the application
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
