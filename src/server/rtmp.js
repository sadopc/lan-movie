/**
 * RTMP Server for LANCast
 * Handles RTMP ingestion from OBS using Node-Media-Server
 */

const NodeMediaServer = require('node-media-server');
const EventEmitter = require('events');

/**
 * Create and configure the RTMP server
 * @param {Object} config - Server configuration
 * @param {AppState} appState - Application state manager
 * @returns {NodeMediaServer} Configured NMS instance
 */
function createRtmpServer(config, appState) {
  // Note: Omitting 'http' config entirely prevents NMS from starting its HTTP server
  // We use our own Express server for HTTP/WebSocket
  const nmsConfig = {
    rtmp: {
      port: config.rtmp.port,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60
    },
    logType: 3 // 0: no log, 1: error, 2: debug+error, 3: all
  };

  const nms = new NodeMediaServer(nmsConfig);

  // Store reference to appState for event handlers
  nms._appState = appState;
  nms._config = config;
  nms._events = new EventEmitter();

  // Register event handlers
  registerEventHandlers(nms);

  return nms;
}

/**
 * Register RTMP event handlers
 * @param {NodeMediaServer} nms - Node Media Server instance
 */
function registerEventHandlers(nms) {
  // prePublish: Called when a client attempts to publish
  // Reject if a stream is already active
  nms.on('prePublish', (id, streamPath, args) => {
    console.log(`[RTMP] prePublish: id=${id}, streamPath=${streamPath}`);

    const appState = nms._appState;

    // Validate stream path format: /live/{stream_key}
    const pathParts = streamPath.split('/');
    if (pathParts.length < 3 || pathParts[1] !== 'live' || !pathParts[2]) {
      console.log(`[RTMP] Rejecting stream: Invalid stream path`);
      const session = nms.getSession(id);
      if (session) {
        session.reject();
      }
      return;
    }

    // Check if stream is already active
    if (!appState.canStream()) {
      console.log(`[RTMP] Rejecting stream: Stream already active`);
      const session = nms.getSession(id);
      if (session) {
        session.reject();
      }
      return;
    }

    console.log(`[RTMP] Stream allowed: ${streamPath}`);
  });

  // postPublish: Called after a client successfully starts publishing
  nms.on('postPublish', (id, streamPath, args) => {
    console.log(`[RTMP] postPublish: id=${id}, streamPath=${streamPath}`);

    const appState = nms._appState;
    const session = nms.getSession(id);

    // Extract metadata from session
    const metadata = extractMetadata(session);

    console.log(`[RTMP] Stream started from ${metadata.publisherIP}`);
    console.log(`[RTMP] Resolution: ${metadata.resolution}, Bitrate: ${metadata.bitrate} kbps`);

    // Update application state to live
    try {
      appState.startStream(metadata);
    } catch (err) {
      console.error(`[RTMP] Failed to start stream:`, err.message);
    }

    // Emit event for transcoder (will be wired in index.js)
    nms._events.emit('streamStart', { id, streamPath, metadata });

    // Refresh metadata after video frames arrive (metadata may not be available at postPublish)
    // The session object gets updated with actual video parameters after first frames arrive
    setTimeout(() => {
      const currentSession = nms.getSession(id);
      if (currentSession && appState.stream.status === 'live') {
        const updatedMetadata = extractMetadata(currentSession);
        // Only update if we got better data
        if (updatedMetadata.resolution !== 'unknown' || updatedMetadata.bitrate > 0) {
          console.log(`[RTMP] Metadata refresh: ${updatedMetadata.resolution}, ${updatedMetadata.bitrate} kbps`);
          appState.updateStreamMetadata(updatedMetadata);
        }
      }
    }, 500);
  });

  // donePublish: Called when a client stops publishing
  nms.on('donePublish', (id, streamPath, args) => {
    console.log(`[RTMP] donePublish: id=${id}, streamPath=${streamPath}`);

    const appState = nms._appState;

    // Update application state to offline
    appState.stopStream();
    console.log(`[RTMP] Stream ended`);

    // Emit event for transcoder cleanup (will be wired in index.js)
    nms._events.emit('streamStop', { id, streamPath });
  });

  // Log connection events for debugging
  nms.on('preConnect', (id, args) => {
    console.log(`[RTMP] preConnect: id=${id}`);
  });

  nms.on('postConnect', (id, args) => {
    console.log(`[RTMP] postConnect: id=${id}`);
  });

  nms.on('doneConnect', (id, args) => {
    console.log(`[RTMP] doneConnect: id=${id}`);
  });
}

/**
 * Extract stream metadata from RTMP session
 * @param {Object} session - Node-Media-Server session object
 * @returns {Object} Extracted metadata
 */
function extractMetadata(session) {
  const metadata = {
    publisherIP: 'unknown',
    resolution: 'unknown',
    bitrate: 0
  };

  if (!session) {
    return metadata;
  }

  // Extract publisher IP from socket
  if (session.socket && session.socket.remoteAddress) {
    let ip = session.socket.remoteAddress;
    // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.x)
    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    metadata.publisherIP = ip;
  }

  // Extract video metadata if available
  // Note: Video metadata may not be immediately available on postPublish
  // It becomes available after the first video frames are received
  if (session.videoWidth && session.videoHeight) {
    metadata.resolution = `${session.videoWidth}x${session.videoHeight}`;
  }

  // Estimate bitrate from audio/video codec info if available
  if (session.audioBitrate) {
    metadata.bitrate += session.audioBitrate;
  }
  if (session.videoBitrate) {
    metadata.bitrate += session.videoBitrate;
  }

  return metadata;
}

/**
 * Start the RTMP server
 * @param {NodeMediaServer} nms - Node Media Server instance
 */
function startRtmpServer(nms) {
  nms.run();
  console.log(`RTMP server listening on port ${nms._config.rtmp.port}`);
}

/**
 * Stop the RTMP server
 * @param {NodeMediaServer} nms - Node Media Server instance
 */
function stopRtmpServer(nms) {
  if (nms) {
    nms.stop();
    console.log('RTMP server stopped');
  }
}

module.exports = {
  createRtmpServer,
  startRtmpServer,
  stopRtmpServer,
  extractMetadata
};
