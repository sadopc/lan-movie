/**
 * LANCast Video Player
 * Handles HLS.js initialization, Safari native HLS fallback,
 * and stream state management (waiting, live, ended)
 */

(function() {
  'use strict';

  const HLS_URL = '/media/live/master.m3u8';
  const POLL_INTERVAL = 2000; // Check for stream every 2 seconds

  // DOM elements
  const video = document.getElementById('video-player');
  const statusOverlay = document.getElementById('stream-status');
  const statusText = statusOverlay.querySelector('.status-text');
  const statusIcon = statusOverlay.querySelector('.status-icon');

  // State
  let hls = null;
  let pollTimer = null;
  let isPlaying = false;
  let destroyTimer = null; // Track setTimeout for cleanup
  let hlsInstanceId = 0; // Prevent stale HLS event handlers

  /**
   * Show the status overlay with a message
   * @param {string} message - Status message to display
   * @param {string} [state='waiting'] - State: 'waiting', 'loading', 'error', 'ended'
   */
  function showStatus(message, state = 'waiting') {
    statusText.textContent = message;
    statusOverlay.className = 'stream-status ' + state;
    statusOverlay.style.display = 'flex';
  }

  /**
   * Hide the status overlay
   */
  function hideStatus() {
    statusOverlay.style.display = 'none';
  }

  /**
   * Check if HLS.js is supported
   * @returns {boolean}
   */
  function isHlsSupported() {
    return typeof Hls !== 'undefined' && Hls.isSupported();
  }

  /**
   * Check if native HLS is supported (Safari)
   * @returns {boolean}
   */
  function isNativeHlsSupported() {
    return video.canPlayType('application/vnd.apple.mpegurl') !== '';
  }

  /**
   * Check if the stream is available by fetching the playlist
   * @returns {Promise<boolean>}
   */
  async function checkStreamAvailable() {
    try {
      const response = await fetch(HLS_URL, { method: 'HEAD' });
      return response.ok;
    } catch (err) {
      return false;
    }
  }

  /**
   * Start polling for stream availability
   */
  function startPolling() {
    if (pollTimer) return;

    showStatus('Waiting for stream...', 'waiting');

    pollTimer = setInterval(async () => {
      const available = await checkStreamAvailable();
      if (available) {
        stopPolling();
        startPlayback();
      }
    }, POLL_INTERVAL);

    // Also check immediately
    checkStreamAvailable().then(available => {
      if (available) {
        stopPolling();
        startPlayback();
      }
    });
  }

  /**
   * Stop polling for stream availability
   */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /**
   * Initialize HLS.js player
   */
  function initHlsPlayer() {
    if (hls) {
      hls.destroy();
    }

    // Increment instance ID to invalidate stale event handlers
    const currentInstanceId = ++hlsInstanceId;

    hls = new Hls({
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 5,
      liveDurationInfinity: true,
      lowLatencyMode: true,
      backBufferLength: 0
    });

    hls.loadSource(HLS_URL);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
      // Ignore if this is a stale instance
      if (currentInstanceId !== hlsInstanceId) {
        console.log('[Player] Ignoring stale MANIFEST_PARSED event');
        return;
      }

      hideStatus();
      playMuted();

      // Populate quality selector with available levels
      if (window.LANCastControls && window.LANCastControls.populateQualityMenu && hls.levels) {
        window.LANCastControls.populateQualityMenu(hls.levels);
      }
    });

    hls.on(Hls.Events.ERROR, function(event, data) {
      // Ignore if this is a stale instance
      if (currentInstanceId !== hlsInstanceId) {
        console.log('[Player] Ignoring stale ERROR event');
        return;
      }

      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
              // Stream not available yet or ended
              handleStreamEnded();
            } else {
              // Try to recover
              hls.startLoad();
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            handleStreamEnded();
            break;
        }
      }
    });
  }

  /**
   * Initialize native HLS player (Safari)
   */
  function initNativePlayer() {
    video.src = HLS_URL;

    video.addEventListener('loadedmetadata', function() {
      hideStatus();
      playMuted();
    });

    video.addEventListener('error', function() {
      handleStreamEnded();
    });
  }

  /**
   * Start playback of the stream
   */
  function startPlayback() {
    showStatus('Loading stream...', 'loading');
    isPlaying = true;

    if (isHlsSupported()) {
      initHlsPlayer();
    } else if (isNativeHlsSupported()) {
      initNativePlayer();
    } else {
      showStatus('HLS playback not supported in this browser', 'error');
    }
  }

  /**
   * Play video muted (for browser autoplay policy compliance)
   */
  function playMuted() {
    video.muted = true;
    video.play().catch(err => {
      console.log('Auto-play prevented:', err.message);
      // Show play button or message if needed
    });
  }

  /**
   * Handle stream ended or unavailable
   */
  function handleStreamEnded() {
    isPlaying = false;

    // Clean up HLS instance
    if (hls) {
      hls.destroy();
      hls = null;
    }

    // Reset video
    video.src = '';
    video.load();

    // Show ended message briefly, then start polling again
    showStatus('Stream ended', 'ended');

    // Clear any existing timer before setting new one
    if (destroyTimer) {
      clearTimeout(destroyTimer);
    }
    destroyTimer = setTimeout(() => {
      destroyTimer = null;
      startPolling();
    }, 2000);
  }

  /**
   * Handle visibility change - pause polling when tab is hidden
   */
  function handleVisibilityChange() {
    if (document.hidden) {
      if (!isPlaying) {
        stopPolling();
      }
    } else {
      if (!isPlaying) {
        startPolling();
      }
    }
  }

  /**
   * Clean up all resources on page unload
   */
  function destroy() {
    // Stop polling
    stopPolling();

    // Clear destroy timer
    if (destroyTimer) {
      clearTimeout(destroyTimer);
      destroyTimer = null;
    }

    // Destroy HLS instance
    if (hls) {
      hls.destroy();
      hls = null;
    }

    // Remove event listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', destroy);
  }

  // Initialize on page load
  function init() {
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Register cleanup on page unload
    window.addEventListener('beforeunload', destroy);

    // Start by polling for stream availability
    startPolling();
  }

  // Export for potential external use
  window.LANCastPlayer = {
    video: video,
    get hls() { return hls; },
    isPlaying: () => isPlaying,
    refresh: () => {
      if (isPlaying) {
        handleStreamEnded();
      }
      startPolling();
    },
    destroy
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
