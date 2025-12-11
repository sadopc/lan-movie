/**
 * WebSocket server for LANCast
 * Handles real-time status updates and viewer tracking
 */

const WebSocket = require('ws');

/**
 * Create and attach WebSocket server to HTTP server
 * @param {http.Server} httpServer - HTTP server instance
 * @param {AppState} appState - Application state manager
 * @returns {WebSocket.Server} WebSocket server instance
 */
function createWebSocketServer(httpServer, appState) {
  const wss = new WebSocket.Server({
    server: httpServer,
    path: '/ws'
  });

  // Handle new connections
  wss.on('connection', (ws, req) => {
    handleConnection(ws, req, appState);
  });

  // Set up state change listeners for broadcasting
  appState.on('streamChange', (streamInfo) => {
    broadcastStatus(wss, appState);
  });

  appState.on('viewerChange', (viewerCount) => {
    broadcastStatus(wss, appState);
  });

  console.log('WebSocket server attached');

  return wss;
}

/**
 * Handle a new WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @param {http.IncomingMessage} req - HTTP request
 * @param {AppState} appState - Application state manager
 */
function handleConnection(ws, req, appState) {
  const clientIP = req.socket.remoteAddress;

  // Add viewer to state (atomic check-and-add to prevent race conditions)
  const session = appState.addViewer(ws);
  if (!session) {
    sendError(ws, 'ROOM_FULL', 'Room full - maximum viewers reached');
    ws.close(1008, 'Room full'); // 1008 = Policy Violation
    return;
  }

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] VIEWER JOIN: ${session.id} from ${clientIP} (total: ${appState.getViewerCount()})`);

  // Send current status immediately
  sendStatus(ws, appState);

  // Handle ping/pong for connection health
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    appState.updateViewerPing(session.id);
  });

  // Handle disconnect
  ws.on('close', () => {
    appState.removeViewer(session.id);
    const disconnectTime = new Date().toISOString();
    console.log(`[${disconnectTime}] VIEWER LEAVE: ${session.id} (total: ${appState.getViewerCount()})`);
  });

  // Handle errors
  ws.on('error', (err) => {
    console.error(`WebSocket error for ${session.id}:`, err.message);
  });

  // Handle incoming messages (if needed in future)
  ws.on('message', (data) => {
    // Currently no client-to-server messages in MVP
    // Could be extended for quality change notifications, etc.
  });
}

/**
 * Send status message to a single client
 * @param {WebSocket} ws - WebSocket connection
 * @param {AppState} appState - Application state manager
 */
function sendStatus(ws, appState) {
  if (ws.readyState !== WebSocket.OPEN) return;

  const message = {
    type: 'status',
    data: appState.getStreamInfo()
  };

  ws.send(JSON.stringify(message));
}

/**
 * Send error message to a client
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} code - Error code
 * @param {string} message - Error message
 */
function sendError(ws, code, message) {
  if (ws.readyState !== WebSocket.OPEN) return;

  const errorMsg = {
    type: 'error',
    data: { code, message }
  };

  ws.send(JSON.stringify(errorMsg));
}

/**
 * Broadcast status to all connected clients
 * @param {WebSocket.Server} wss - WebSocket server
 * @param {AppState} appState - Application state manager
 */
function broadcastStatus(wss, appState) {
  const message = JSON.stringify({
    type: 'status',
    data: appState.getStreamInfo()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

/**
 * Start heartbeat interval to detect stale connections
 * @param {WebSocket.Server} wss - WebSocket server
 * @param {AppState} appState - Application state manager
 * @param {number} interval - Heartbeat interval in ms (default: 30000)
 * @returns {NodeJS.Timeout} Interval timer
 */
function startHeartbeat(wss, appState, interval = 30000) {
  return setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        // Connection is dead, terminate it
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, interval);
}

/**
 * Stop heartbeat interval
 * @param {NodeJS.Timeout} timer - Heartbeat timer
 */
function stopHeartbeat(timer) {
  if (timer) {
    clearInterval(timer);
  }
}

/**
 * Close all WebSocket connections gracefully
 * @param {WebSocket.Server} wss - WebSocket server
 */
function closeAllConnections(wss) {
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });
}

module.exports = {
  createWebSocketServer,
  broadcastStatus,
  startHeartbeat,
  stopHeartbeat,
  closeAllConnections
};
