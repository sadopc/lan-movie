/**
 * Express HTTP server for LANCast
 * Serves static files and HLS segments
 */

const express = require('express');
const path = require('path');

/**
 * Create and configure the Express application
 * @param {Object} config - Server configuration
 * @returns {express.Application} Configured Express app
 */
function createHttpServer(config) {
  const app = express();

  // Disable x-powered-by header for security
  app.disable('x-powered-by');

  // Serve static files from public directory
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  // Serve HLS files from media/live directory with correct MIME types
  const mediaPath = path.join(__dirname, '..', '..', 'media', 'live');
  app.use('/media/live', express.static(mediaPath, {
    setHeaders: (res, filePath) => {
      // Set correct MIME types for HLS files
      if (filePath.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (filePath.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      }
      // Enable CORS for local network access
      res.setHeader('Access-Control-Allow-Origin', '*');
      // Disable caching for live content
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

/**
 * Add API routes that require AppState
 * @param {express.Application} app - Express application
 * @param {AppState} appState - Application state manager
 */
function addApiRoutes(app, appState) {
  // Stream status endpoint (WebSocket fallback)
  app.get('/api/status', (req, res) => {
    res.json(appState.getStreamInfo());
  });
}

/**
 * Start the HTTP server
 * @param {express.Application} app - Express application
 * @param {Object} config - Server configuration
 * @returns {Promise<http.Server>} HTTP server instance
 */
function startHttpServer(app, config) {
  return new Promise((resolve, reject) => {
    const server = app.listen(config.http.port, () => {
      console.log(`HTTP server listening on port ${config.http.port}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${config.http.port} is already in use`));
      } else {
        reject(err);
      }
    });
  });
}

module.exports = {
  createHttpServer,
  startHttpServer,
  addApiRoutes
};
