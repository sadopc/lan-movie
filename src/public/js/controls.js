/**
 * LANCast Playback Controls
 * Handles play/pause, volume, mute, and fullscreen controls
 */

(function() {
  'use strict';

  // DOM elements
  const videoContainer = document.querySelector('.video-container');
  const video = document.getElementById('video-player');
  const controlBar = document.getElementById('control-bar');

  // Control buttons
  const btnPlay = document.getElementById('btn-play');
  const btnMute = document.getElementById('btn-mute');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const volumeSlider = document.getElementById('volume-slider');

  // Quality selector elements
  const qualitySelector = document.getElementById('quality-selector');
  const btnQuality = document.getElementById('btn-quality');
  const qualityMenu = document.getElementById('quality-menu');
  const qualityLabel = btnQuality ? btnQuality.querySelector('.quality-label') : null;

  // State
  let hideControlsTimer = null;
  let lastVolume = 1; // Remember volume before muting
  let qualityMenuOpen = false;
  let currentQualityLevel = -1; // -1 = Auto
  let qualityOptionCleanups = []; // Store cleanup functions for quality option listeners
  let isInitialized = false; // Track initialization state for cleanup
  let cachedQualityKey = ''; // Cache key to avoid unnecessary menu rebuilds
  let isIOSFullscreen = false; // Track iOS fullscreen state separately

  // iOS detection - includes iPadOS (which reports as MacIntel with touch)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /**
   * T029: Play/Pause Toggle
   * Controls local playback only - does not affect the stream itself
   */
  function togglePlayPause() {
    if (video.paused) {
      video.play().catch(err => {
        console.log('Play prevented:', err.message);
      });
    } else {
      video.pause();
    }
  }

  /**
   * Update play/pause button visual state
   */
  function updatePlayPauseState() {
    if (video.paused) {
      btnPlay.classList.remove('playing');
    } else {
      btnPlay.classList.add('playing');
    }
  }

  /**
   * T030: Volume Slider (0-100%)
   * Updates video volume based on slider value
   */
  function setVolume(value) {
    const normalizedValue = Math.max(0, Math.min(100, value));
    video.volume = normalizedValue / 100;
    volumeSlider.value = normalizedValue;

    // Update mute state visual if needed
    if (normalizedValue > 0 && video.muted) {
      video.muted = false;
    }
    updateMuteState();
  }

  /**
   * Handle volume slider input
   */
  function handleVolumeChange(e) {
    const value = parseInt(e.target.value, 10);
    setVolume(value);
    if (value > 0) {
      lastVolume = value / 100;
    }
  }

  /**
   * T031: Mute Button
   * Toggles mute with visual state
   */
  function toggleMute() {
    if (video.muted || video.volume === 0) {
      // Unmute
      video.muted = false;
      if (lastVolume === 0) {
        lastVolume = 1; // Default to 100% if was at 0
      }
      video.volume = lastVolume;
      volumeSlider.value = lastVolume * 100;
    } else {
      // Mute
      lastVolume = video.volume;
      video.muted = true;
    }
    updateMuteState();
  }

  /**
   * Update mute button visual state
   */
  function updateMuteState() {
    if (video.muted || video.volume === 0) {
      btnMute.classList.add('muted');
    } else {
      btnMute.classList.remove('muted');
    }
  }

  /**
   * T032: Fullscreen Toggle
   * Uses Fullscreen API for cross-browser support
   * iOS requires video.webkitEnterFullscreen() on the video element directly
   */
  function toggleFullscreen() {
    if (isIOS) {
      // iOS: Use video element's native fullscreen API
      // iOS doesn't support Fullscreen API on containers, only on video elements
      if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
      // Note: iOS handles exit fullscreen via native controls
      return;
    }

    // Desktop/Android: Use container fullscreen for custom controls overlay
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      // Enter fullscreen
      if (videoContainer.requestFullscreen) {
        videoContainer.requestFullscreen();
      } else if (videoContainer.webkitRequestFullscreen) {
        // Safari desktop support
        videoContainer.webkitRequestFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        // Safari desktop support
        document.webkitExitFullscreen();
      }
    }
  }

  /**
   * Update fullscreen button visual state
   */
  function updateFullscreenState() {
    if (document.fullscreenElement || document.webkitFullscreenElement || isIOSFullscreen) {
      btnFullscreen.classList.add('fullscreen');
    } else {
      btnFullscreen.classList.remove('fullscreen');
    }
  }

  /**
   * Handle iOS entering fullscreen
   */
  function handleIOSFullscreenEnter() {
    isIOSFullscreen = true;
    updateFullscreenState();
  }

  /**
   * Handle iOS exiting fullscreen
   */
  function handleIOSFullscreenExit() {
    isIOSFullscreen = false;
    updateFullscreenState();
  }

  /**
   * Show control bar
   */
  function showControls() {
    controlBar.classList.add('visible');
    videoContainer.classList.add('controls-visible');
    resetHideTimer();
  }

  /**
   * Hide control bar
   */
  function hideControls() {
    if (!video.paused) {
      controlBar.classList.remove('visible');
      videoContainer.classList.remove('controls-visible');
    }
  }

  /**
   * Reset the auto-hide timer
   */
  function resetHideTimer() {
    if (hideControlsTimer) {
      clearTimeout(hideControlsTimer);
    }
    hideControlsTimer = setTimeout(hideControls, 3000);
  }

  /**
   * Handle mouse/touch activity
   */
  function handleActivity() {
    showControls();
  }

  /**
   * Handle keyboard shortcuts
   */
  function handleKeydown(e) {
    // Only handle if not typing in an input
    if (e.target.tagName === 'INPUT') return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        togglePlayPause();
        showControls();
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        showControls();
        break;
      case 'f':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(video.volume * 100 + 5);
        showControls();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(video.volume * 100 - 5);
        showControls();
        break;
    }
  }

  /**
   * T046: Quality Level Switching via HLS.js API
   * Gets the HLS instance from the player and switches quality
   */
  function setQualityLevel(level) {
    // Access HLS instance from player.js
    if (window.LANCastPlayer && window.LANCastPlayer.hls) {
      const hls = window.LANCastPlayer.hls;
      hls.currentLevel = level;
      currentQualityLevel = level;
      updateQualityLabel(level);
      closeQualityMenu();
    }
  }

  /**
   * T047: Update quality label to show current selection
   */
  function updateQualityLabel(level) {
    if (!qualityLabel) return;

    if (level === -1) {
      qualityLabel.textContent = 'Auto';
    } else if (window.LANCastPlayer && window.LANCastPlayer.hls) {
      const hls = window.LANCastPlayer.hls;
      const levels = hls.levels;
      if (levels && levels[level]) {
        const height = levels[level].height;
        qualityLabel.textContent = height + 'p';
      }
    }
  }

  /**
   * T047: Populate quality menu with available levels
   */
  function populateQualityMenu(levels) {
    if (!qualityMenu) return;

    // Check if levels have changed - skip rebuild if same
    const newKey = levels.map(l => l.height).join(',');
    if (newKey === cachedQualityKey) {
      return; // No change in quality levels, skip rebuild
    }
    cachedQualityKey = newKey;

    // Clean up old event listeners before repopulating
    qualityOptionCleanups.forEach(cleanup => cleanup());
    qualityOptionCleanups = [];

    // Clear existing options
    qualityMenu.innerHTML = '';

    // Helper to add option with tracked listener
    function addOption(element, handler) {
      element.addEventListener('click', handler);
      qualityOptionCleanups.push(() => element.removeEventListener('click', handler));
    }

    // Add Auto option first
    const autoOption = document.createElement('div');
    autoOption.className = 'quality-option' + (currentQualityLevel === -1 ? ' active' : '');
    autoOption.dataset.level = '-1';
    autoOption.textContent = 'Auto';
    addOption(autoOption, () => setQualityLevel(-1));
    qualityMenu.appendChild(autoOption);

    // Add quality levels (sorted by height, highest first)
    const sortedLevels = levels
      .map((level, index) => ({ ...level, index }))
      .sort((a, b) => b.height - a.height);

    sortedLevels.forEach(level => {
      const option = document.createElement('div');
      option.className = 'quality-option' + (currentQualityLevel === level.index ? ' active' : '');
      option.dataset.level = level.index;
      option.textContent = level.height + 'p';
      addOption(option, () => setQualityLevel(level.index));
      qualityMenu.appendChild(option);
    });

    // Show quality selector once we have levels
    if (qualitySelector && levels.length > 0) {
      qualitySelector.classList.remove('hidden');
    }
  }

  /**
   * Toggle quality menu visibility
   */
  function toggleQualityMenu() {
    if (qualityMenuOpen) {
      closeQualityMenu();
    } else {
      openQualityMenu();
    }
  }

  /**
   * Open quality menu
   */
  function openQualityMenu() {
    if (!qualityMenu) return;
    qualityMenu.classList.add('open');
    qualityMenuOpen = true;

    // Update active state on options
    const options = qualityMenu.querySelectorAll('.quality-option');
    options.forEach(opt => {
      const level = parseInt(opt.dataset.level, 10);
      opt.classList.toggle('active', level === currentQualityLevel);
    });
  }

  /**
   * Close quality menu
   */
  function closeQualityMenu() {
    if (!qualityMenu) return;
    qualityMenu.classList.remove('open');
    qualityMenuOpen = false;
  }

  /**
   * Handle click outside quality menu to close it
   */
  function handleClickOutside(e) {
    if (qualityMenuOpen && qualitySelector && !qualitySelector.contains(e.target)) {
      closeQualityMenu();
    }
  }

  /**
   * Handle video click for play/pause toggle
   */
  function handleVideoClick(e) {
    if (e.target === video) {
      togglePlayPause();
    }
  }

  /**
   * Handle video double-click for fullscreen toggle
   */
  function handleVideoDblClick(e) {
    if (e.target === video) {
      toggleFullscreen();
    }
  }

  /**
   * Handle control bar mouse enter (keep controls visible)
   */
  function handleControlBarMouseEnter() {
    if (hideControlsTimer) {
      clearTimeout(hideControlsTimer);
    }
  }

  /**
   * Clean up all event listeners and timers
   * Called on page unload to prevent memory leaks
   */
  function destroy() {
    if (!isInitialized) return;

    // Clear the hide controls timer
    if (hideControlsTimer) {
      clearTimeout(hideControlsTimer);
      hideControlsTimer = null;
    }

    // Clean up quality option listeners
    qualityOptionCleanups.forEach(cleanup => cleanup());
    qualityOptionCleanups = [];

    // Remove button click handlers
    btnPlay.removeEventListener('click', togglePlayPause);
    btnMute.removeEventListener('click', toggleMute);
    btnFullscreen.removeEventListener('click', toggleFullscreen);
    volumeSlider.removeEventListener('input', handleVolumeChange);

    // Remove quality selector handler
    if (btnQuality) {
      btnQuality.removeEventListener('click', toggleQualityMenu);
    }

    // Remove document-level listeners
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('fullscreenchange', updateFullscreenState);
    document.removeEventListener('webkitfullscreenchange', updateFullscreenState);
    document.removeEventListener('keydown', handleKeydown);

    // Remove iOS-specific fullscreen listeners
    if (isIOS) {
      video.removeEventListener('webkitbeginfullscreen', handleIOSFullscreenEnter);
      video.removeEventListener('webkitendfullscreen', handleIOSFullscreenExit);
    }

    // Remove video element listeners
    video.removeEventListener('play', updatePlayPauseState);
    video.removeEventListener('pause', updatePlayPauseState);
    video.removeEventListener('volumechange', updateMuteState);
    video.removeEventListener('click', handleVideoClick);
    video.removeEventListener('dblclick', handleVideoDblClick);

    // Remove video container listeners
    videoContainer.removeEventListener('mousemove', handleActivity);
    videoContainer.removeEventListener('mouseenter', handleActivity);
    videoContainer.removeEventListener('touchstart', handleActivity);
    videoContainer.removeEventListener('click', handleActivity);

    // Remove control bar listeners
    controlBar.removeEventListener('mouseenter', handleControlBarMouseEnter);
    controlBar.removeEventListener('mouseleave', resetHideTimer);

    // Remove beforeunload listener
    window.removeEventListener('beforeunload', destroy);

    isInitialized = false;
  }

  /**
   * Initialize controls
   */
  function init() {
    // Button click handlers
    btnPlay.addEventListener('click', togglePlayPause);
    btnMute.addEventListener('click', toggleMute);
    btnFullscreen.addEventListener('click', toggleFullscreen);
    volumeSlider.addEventListener('input', handleVolumeChange);

    // Quality selector click handler
    if (btnQuality) {
      btnQuality.addEventListener('click', toggleQualityMenu);
    }

    // Close quality menu on click outside
    document.addEventListener('click', handleClickOutside);

    // Video state event listeners
    video.addEventListener('play', updatePlayPauseState);
    video.addEventListener('pause', updatePlayPauseState);
    video.addEventListener('volumechange', updateMuteState);

    // Fullscreen change listeners
    document.addEventListener('fullscreenchange', updateFullscreenState);
    document.addEventListener('webkitfullscreenchange', updateFullscreenState);

    // iOS-specific fullscreen events (fired on the video element)
    if (isIOS) {
      video.addEventListener('webkitbeginfullscreen', handleIOSFullscreenEnter);
      video.addEventListener('webkitendfullscreen', handleIOSFullscreenExit);
    }

    // Mouse/touch activity for auto-hide
    videoContainer.addEventListener('mousemove', handleActivity);
    videoContainer.addEventListener('mouseenter', handleActivity);
    videoContainer.addEventListener('touchstart', handleActivity);
    videoContainer.addEventListener('click', handleActivity);

    // Keep controls visible when interacting with control bar
    controlBar.addEventListener('mouseenter', handleControlBarMouseEnter);
    controlBar.addEventListener('mouseleave', resetHideTimer);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);

    // Click on video to toggle play/pause
    video.addEventListener('click', handleVideoClick);

    // Double-click on video to toggle fullscreen
    video.addEventListener('dblclick', handleVideoDblClick);

    // Initialize states
    updatePlayPauseState();
    updateMuteState();
    updateFullscreenState();

    // Sync volume slider with video initial state
    volumeSlider.value = video.muted ? 0 : video.volume * 100;

    // Show controls initially
    showControls();

    // Mark as initialized and register cleanup on page unload
    isInitialized = true;
    window.addEventListener('beforeunload', destroy);
  }

  // Export for potential external use
  window.LANCastControls = {
    togglePlayPause,
    toggleMute,
    toggleFullscreen,
    setVolume,
    showControls,
    hideControls,
    setQualityLevel,
    populateQualityMenu,
    updateQualityLabel,
    destroy
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
