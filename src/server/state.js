/**
 * Application state management for LANCast
 * Manages Stream and ViewerSession entities (in-memory, ephemeral)
 */

const crypto = require('crypto');

/**
 * Stream entity - represents the current broadcast state
 * @typedef {Object} Stream
 * @property {string} id - Always "live" (single stream)
 * @property {'offline'|'live'} status - Current stream status
 * @property {string} [publisherIP] - IP address of OBS streamer (when live)
 * @property {string} [resolution] - e.g., "1920x1080" (when live)
 * @property {number} [bitrate] - Incoming bitrate in kbps (when live)
 * @property {Date} [startTime] - When stream started (when live)
 */

/**
 * ViewerSession entity - represents a connected viewer
 * @typedef {Object} ViewerSession
 * @property {string} id - UUID generated on connection
 * @property {Date} connectedAt - When the viewer connected
 * @property {Date} lastPing - Last ping time
 * @property {string} quality - Currently selected quality ('1080p', '720p', '480p')
 * @property {WebSocket} websocket - WebSocket connection reference
 */

/**
 * Application state manager
 */
class AppState {
  constructor(config) {
    this.config = config;

    // Initialize stream state (always offline at start)
    this.stream = {
      id: 'live',
      status: 'offline'
    };

    // Viewer sessions map: id -> ViewerSession
    this.viewers = new Map();

    // Event listeners for state changes
    this._listeners = {
      streamChange: [],
      viewerChange: []
    };
  }

  // ==================== Stream Operations ====================

  /**
   * Start the stream with metadata
   * @param {Object} metadata - Stream metadata
   * @param {string} metadata.publisherIP - Publisher's IP address
   * @param {string} metadata.resolution - Stream resolution
   * @param {number} metadata.bitrate - Stream bitrate in kbps
   */
  startStream(metadata) {
    if (this.stream.status === 'live') {
      throw new Error('Stream already active');
    }

    this.stream = {
      id: 'live',
      status: 'live',
      publisherIP: metadata.publisherIP,
      resolution: metadata.resolution || 'unknown',
      bitrate: metadata.bitrate || 0,
      startTime: new Date()
    };

    this._emit('streamChange', this.getStreamInfo());
  }

  /**
   * Stop the stream and clear metadata
   */
  stopStream() {
    this.stream = {
      id: 'live',
      status: 'offline'
    };

    this._emit('streamChange', this.getStreamInfo());
  }

  /**
   * Update stream metadata (called after video frames arrive with actual metadata)
   * @param {Object} metadata - Updated stream metadata
   * @param {string} [metadata.resolution] - Stream resolution
   * @param {number} [metadata.bitrate] - Stream bitrate in kbps
   */
  updateStreamMetadata(metadata) {
    if (this.stream.status !== 'live') {
      return; // Only update if stream is active
    }

    let updated = false;

    if (metadata.resolution && metadata.resolution !== 'unknown') {
      this.stream.resolution = metadata.resolution;
      updated = true;
    }

    if (metadata.bitrate && metadata.bitrate > 0) {
      this.stream.bitrate = metadata.bitrate;
      updated = true;
    }

    if (updated) {
      this._emit('streamChange', this.getStreamInfo());
    }
  }

  /**
   * Check if a new stream can be started
   * @returns {boolean} true if no stream is active
   */
  canStream() {
    return this.stream.status === 'offline';
  }

  /**
   * Get current stream info for broadcasting
   * @returns {Object} Stream information
   */
  getStreamInfo() {
    const info = {
      live: this.stream.status === 'live',
      viewerCount: this.viewers.size
    };

    if (this.stream.status === 'live') {
      info.streamInfo = {
        resolution: this.stream.resolution,
        bitrate: this.stream.bitrate,
        startTime: this.stream.startTime.toISOString(),
        duration: Math.floor((Date.now() - this.stream.startTime.getTime()) / 1000)
      };
    }

    return info;
  }

  // ==================== Viewer Operations ====================

  /**
   * Add a new viewer session
   * @param {WebSocket} ws - WebSocket connection
   * @returns {ViewerSession|null} The created session, or null if at limit
   */
  addViewer(ws) {
    if (this.viewers.size >= this.config.limits.maxViewers) {
      return null; // Room full
    }

    const session = {
      id: crypto.randomUUID(),
      connectedAt: new Date(),
      lastPing: new Date(),
      quality: '1080p', // Default to highest quality
      websocket: ws
    };

    this.viewers.set(session.id, session);
    this._emit('viewerChange', this.getViewerCount());

    return session;
  }

  /**
   * Remove a viewer session by ID
   * @param {string} id - Session ID
   */
  removeViewer(id) {
    if (this.viewers.has(id)) {
      this.viewers.delete(id);
      this._emit('viewerChange', this.getViewerCount());
    }
  }

  /**
   * Update a viewer's selected quality
   * @param {string} id - Session ID
   * @param {string} quality - New quality level
   */
  updateViewerQuality(id, quality) {
    const session = this.viewers.get(id);
    if (session) {
      session.quality = quality;
    }
  }

  /**
   * Update a viewer's last ping time
   * @param {string} id - Session ID
   */
  updateViewerPing(id) {
    const session = this.viewers.get(id);
    if (session) {
      session.lastPing = new Date();
    }
  }

  /**
   * Get current viewer count
   * @returns {number} Number of connected viewers
   */
  getViewerCount() {
    return this.viewers.size;
  }

  /**
   * Get all viewer sessions (for iteration)
   * @returns {IterableIterator<ViewerSession>}
   */
  getViewers() {
    return this.viewers.values();
  }

  /**
   * Check if room is at capacity
   * @returns {boolean} true if at max viewers
   */
  isRoomFull() {
    return this.viewers.size >= this.config.limits.maxViewers;
  }

  // ==================== Event System ====================

  /**
   * Register an event listener
   * @param {'streamChange'|'viewerChange'} event - Event name
   * @param {Function} callback - Event handler
   */
  on(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event].push(callback);
    }
  }

  /**
   * Remove an event listener
   * @param {'streamChange'|'viewerChange'} event - Event name
   * @param {Function} callback - Event handler to remove
   */
  off(event, callback) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit an event to all listeners
   * @private
   */
  _emit(event, data) {
    if (this._listeners[event]) {
      for (const callback of this._listeners[event]) {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in ${event} listener:`, err);
        }
      }
    }
  }

  // ==================== Cleanup ====================

  /**
   * Clean up all state (for shutdown)
   */
  cleanup() {
    // Close all WebSocket connections
    for (const session of this.viewers.values()) {
      try {
        session.websocket.close(1001, 'Server shutting down');
      } catch (err) {
        // Ignore errors during shutdown
      }
    }
    this.viewers.clear();

    // Reset stream state
    this.stream = {
      id: 'live',
      status: 'offline'
    };
  }
}

module.exports = { AppState };
