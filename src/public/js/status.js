/**
 * LANCast Status Client
 * Handles WebSocket connection for real-time status updates
 * with exponential backoff reconnection
 */

(function() {
  'use strict';

  // DOM elements
  const infoPanel = document.getElementById('info-panel');
  const liveBadge = document.getElementById('live-badge');
  const offlineBadge = infoPanel.querySelector('.offline-badge');
  const viewerCount = document.getElementById('viewer-count');
  const streamResolution = document.getElementById('stream-resolution');
  const streamBitrate = document.getElementById('stream-bitrate');
  const streamDetails = infoPanel.querySelectorAll('.stream-details');

  // WebSocket state
  let ws = null;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let fallbackPollTimer = null;
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds max

  /**
   * Build WebSocket URL based on current page location
   * @returns {string} WebSocket URL
   */
  function getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  /**
   * Connect to WebSocket server
   */
  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    const url = getWebSocketUrl();
    console.log('Connecting to WebSocket:', url);

    try {
      ws = new WebSocket(url);

      ws.onopen = handleOpen;
      ws.onmessage = handleMessage;
      ws.onclose = handleClose;
      ws.onerror = handleError;
    } catch (err) {
      console.error('WebSocket connection error:', err);
      scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket open event
   */
  function handleOpen() {
    console.log('WebSocket connected');
    reconnectAttempt = 0;
    infoPanel.classList.remove('disconnected');
    stopFallbackPolling(); // Stop REST polling when WS connects
  }

  /**
   * Handle incoming WebSocket message
   * @param {MessageEvent} event - Message event
   */
  function handleMessage(event) {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'status':
          updateStatusUI(message.data);
          break;
        case 'error':
          handleServerError(message.data);
          break;
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }

  /**
   * Handle WebSocket close event
   * @param {CloseEvent} event - Close event
   */
  function handleClose(event) {
    console.log('WebSocket closed:', event.code, event.reason);
    ws = null;
    infoPanel.classList.add('disconnected');

    // Don't reconnect if closed due to room being full
    if (event.code === 1008) {
      console.log('Connection rejected - room full');
      showRoomFull();
      return;
    }

    scheduleReconnect();
    startFallbackPolling(); // Resume REST polling while WS is down
  }

  /**
   * Handle WebSocket error event
   * @param {Event} event - Error event
   */
  function handleError(event) {
    console.error('WebSocket error:', event);
  }

  /**
   * Handle server error message
   * @param {Object} data - Error data {code, message}
   */
  function handleServerError(data) {
    console.error('Server error:', data.code, data.message);

    if (data.code === 'ROOM_FULL') {
      showRoomFull();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY);
    reconnectAttempt++;

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  /**
   * Update the status UI with new data
   * @param {Object} data - Status data {live, viewerCount, streamInfo?}
   */
  function updateStatusUI(data) {
    // Update live/offline badge
    if (data.live) {
      liveBadge.classList.remove('hidden');
      offlineBadge.classList.add('hidden');
      streamDetails.forEach(el => el.classList.remove('hidden'));
    } else {
      liveBadge.classList.add('hidden');
      offlineBadge.classList.remove('hidden');
      streamDetails.forEach(el => el.classList.add('hidden'));
    }

    // Update viewer count
    viewerCount.textContent = data.viewerCount;

    // Update stream info if available
    if (data.streamInfo) {
      streamResolution.textContent = data.streamInfo.resolution || '--';
      streamBitrate.textContent = formatBitrate(data.streamInfo.bitrate);
    } else {
      streamResolution.textContent = '--';
      streamBitrate.textContent = '--';
    }

    // Dispatch custom event for other components to react
    window.dispatchEvent(new CustomEvent('lancast:status', { detail: data }));
  }

  /**
   * Format bitrate for display
   * @param {number} bitrate - Bitrate in kbps
   * @returns {string} Formatted bitrate string
   */
  function formatBitrate(bitrate) {
    if (!bitrate) return '--';
    if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)} Mbps`;
    }
    return `${bitrate} kbps`;
  }

  /**
   * Show room full message
   */
  function showRoomFull() {
    viewerCount.textContent = 'FULL';
    viewerCount.classList.add('full');
  }

  /**
   * Fallback: fetch status via REST API
   */
  async function fetchStatusFallback() {
    try {
      const response = await fetch('/api/status');
      if (response.ok) {
        const data = await response.json();
        updateStatusUI(data);
      }
    } catch (err) {
      console.error('Status fetch failed:', err);
    }
  }

  /**
   * Start fallback REST polling (when WebSocket is unavailable)
   */
  function startFallbackPolling() {
    if (fallbackPollTimer) return; // Already running
    fallbackPollTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        fetchStatusFallback();
      }
    }, 5000);
  }

  /**
   * Stop fallback REST polling (when WebSocket connects)
   */
  function stopFallbackPolling() {
    if (fallbackPollTimer) {
      clearInterval(fallbackPollTimer);
      fallbackPollTimer = null;
    }
  }

  /**
   * Handle visibility change - reconnect when tab becomes visible
   */
  function handleVisibilityChange() {
    if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
      reconnectAttempt = 0; // Reset on visibility
      connect();
    }
  }

  /**
   * Clean up all resources on page unload
   */
  function destroy() {
    // Clear reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Stop fallback polling
    stopFallbackPolling();

    // Close WebSocket connection
    if (ws) {
      ws.onclose = null; // Prevent reconnect on intentional close
      ws.close(1000, 'Page unloading');
      ws = null;
    }

    // Remove event listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', destroy);
  }

  /**
   * Initialize status client
   */
  function init() {
    // Connect immediately
    connect();

    // Reconnect when tab becomes visible
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Start fallback polling (will be stopped when WebSocket connects)
    startFallbackPolling();

    // Register cleanup on page unload
    window.addEventListener('beforeunload', destroy);
  }

  // Export for potential external use
  window.LANCastStatus = {
    connect,
    destroy,
    getStatus: () => {
      return {
        connected: ws && ws.readyState === WebSocket.OPEN
      };
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
