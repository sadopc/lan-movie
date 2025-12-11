/**
 * FFmpeg Transcoder for LANCast
 * Spawns FFmpeg to transcode RTMP input to HLS with multiple quality tiers
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Active FFmpeg process reference
let ffmpegProcess = null;

// Cached detected encoder
let detectedEncoder = null;

// Guard flag to prevent race condition in stopTranscoder
let isStoppingTranscoder = false;

// Application state reference for crash recovery
let appStateRef = null;
let onCrashCallback = null;

/**
 * Set application state reference for crash recovery
 * @param {Object} appState - Application state instance
 * @param {Function} [onCrash] - Optional callback when FFmpeg crashes
 */
function setAppState(appState, onCrash) {
  appStateRef = appState;
  onCrashCallback = onCrash || null;
}

// Default maximum stderr buffer size to prevent memory growth during long streams
const DEFAULT_STDERR_BUFFER = 10000; // 10KB

/**
 * Validate FFmpeg is installed and accessible
 * @returns {Promise<void>} Resolves if FFmpeg is available, rejects with error otherwise
 */
async function validateFfmpeg() {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('FFmpeg not found. Please install FFmpeg and ensure it is in your PATH.'));
      } else {
        reject(new Error(`FFmpeg validation error: ${err.message}`));
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        // Extract version from output (first line typically)
        const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';
        console.log(`[Transcoder] FFmpeg validated: version ${version}`);
        resolve();
      } else {
        reject(new Error(`FFmpeg validation failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Detect best available hardware encoder
 * @param {string} codec - Codec to use ('h264' or 'hevc')
 * @returns {string} Encoder name
 */
function detectHardwareEncoder(codec = 'h264') {
  const cacheKey = codec;
  if (detectedEncoder && detectedEncoder.codec === cacheKey) {
    return detectedEncoder.encoder;
  }

  const platform = os.platform();
  const encodersToTry = [];

  if (codec === 'hevc') {
    // HEVC/H.265 encoders
    if (platform === 'darwin') {
      encodersToTry.push('hevc_videotoolbox');
    } else if (platform === 'win32') {
      encodersToTry.push('hevc_nvenc', 'hevc_qsv', 'hevc_amf');
    } else {
      encodersToTry.push('hevc_vaapi', 'hevc_nvenc', 'hevc_qsv');
    }
    // HEVC software fallback
    encodersToTry.push('libx265');
  } else {
    // H.264 encoders
    if (platform === 'darwin') {
      encodersToTry.push('h264_videotoolbox');
    } else if (platform === 'win32') {
      encodersToTry.push('h264_nvenc', 'h264_qsv', 'h264_amf');
    } else {
      encodersToTry.push('h264_vaapi', 'h264_nvenc', 'h264_qsv');
    }
    // H.264 software fallback
    encodersToTry.push('libx264');
  }

  // Test each encoder
  for (const encoder of encodersToTry) {
    if (testEncoder(encoder)) {
      console.log(`[Transcoder] Hardware encoder detected: ${encoder}`);
      detectedEncoder = { codec: cacheKey, encoder };
      return encoder;
    }
  }

  // Final fallback
  const fallback = codec === 'hevc' ? 'libx265' : 'libx264';
  console.log(`[Transcoder] No hardware encoder found, using ${fallback} (CPU)`);
  detectedEncoder = { codec: cacheKey, encoder: fallback };
  return fallback;
}

/**
 * Test if an encoder is available
 * @param {string} encoder - Encoder name to test
 * @returns {boolean} True if encoder is available
 */
function testEncoder(encoder) {
  try {
    // Use FFmpeg to list encoders and check if our encoder is in the output
    const output = execSync('ffmpeg -hide_banner -encoders', {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      encoding: 'utf8'
    });
    return output.includes(encoder);
  } catch {
    return false;
  }
}

/**
 * Get encoder-specific FFmpeg arguments
 * @param {string} encoder - Encoder name
 * @param {number} index - Stream index
 * @returns {string[]} Encoder-specific arguments
 */
function getEncoderArgs(encoder, index) {
  switch (encoder) {
    // H.264 hardware encoders
    case 'h264_videotoolbox':
      return [
        `-c:v:${index}`, 'h264_videotoolbox',
        '-realtime', 'true',
        '-allow_sw', '1'
      ];

    case 'h264_nvenc':
      return [
        `-c:v:${index}`, 'h264_nvenc',
        '-preset', 'p4',
        '-tune', 'll',
        '-rc', 'vbr',
        '-rc-lookahead', '0'
      ];

    case 'h264_qsv':
      return [
        `-c:v:${index}`, 'h264_qsv',
        '-preset', 'faster',
        '-look_ahead', '0'
      ];

    case 'h264_amf':
      return [
        `-c:v:${index}`, 'h264_amf',
        '-quality', 'speed',
        '-rc', 'vbr_latency'
      ];

    case 'h264_vaapi':
      return [
        `-c:v:${index}`, 'h264_vaapi',
        '-rc_mode', 'VBR'
      ];

    // HEVC/H.265 hardware encoders
    case 'hevc_videotoolbox':
      return [
        `-c:v:${index}`, 'hevc_videotoolbox',
        '-realtime', 'true',
        '-allow_sw', '1'
      ];

    case 'hevc_nvenc':
      return [
        `-c:v:${index}`, 'hevc_nvenc',
        '-preset', 'p4',
        '-tune', 'll',
        '-rc', 'vbr',
        '-rc-lookahead', '0'
      ];

    case 'hevc_qsv':
      return [
        `-c:v:${index}`, 'hevc_qsv',
        '-preset', 'faster',
        '-look_ahead', '0'
      ];

    case 'hevc_amf':
      return [
        `-c:v:${index}`, 'hevc_amf',
        '-quality', 'speed',
        '-rc', 'vbr_latency'
      ];

    case 'hevc_vaapi':
      return [
        `-c:v:${index}`, 'hevc_vaapi',
        '-rc_mode', 'VBR'
      ];

    case 'libx265':
      return [
        `-c:v:${index}`, 'libx265',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-x265-params', 'log-level=error'
      ];

    default:
      // libx264 software encoder
      return [
        `-c:v:${index}`, 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency'
      ];
  }
}

// HLS output directory
const HLS_OUTPUT_DIR = path.join(__dirname, '..', '..', 'media', 'live');

/**
 * Build FFmpeg command arguments for multi-quality HLS transcoding
 * @param {Object} config - Server configuration with transcoding settings
 * @param {string} rtmpUrl - Source RTMP URL
 * @returns {string[]} FFmpeg command arguments
 */
function buildFfmpegArgs(config, rtmpUrl) {
  const { codec = 'h264', qualities, segmentDuration, playlistSize } = config.transcoding;

  // Detect best available encoder for the configured codec
  const encoder = detectHardwareEncoder(codec);
  const isHevc = codec === 'hevc';

  const args = [
    // Input
    '-i', rtmpUrl,

    // Low latency settings
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',

    // Avoid transcoding errors on stream start
    '-err_detect', 'ignore_err'
  ];

  // Build mapping and output for each quality
  // For each quality tier, we create a separate variant stream
  qualities.forEach((quality, index) => {
    // Map video stream
    args.push('-map', '0:v:0');
    args.push('-map', '0:a:0?'); // Audio is optional (? makes it non-fatal if missing)

    // Video encoding settings - use detected encoder
    const encoderArgs = getEncoderArgs(encoder, index);
    args.push(...encoderArgs);

    // Resolution and bitrate (applies to all encoders)
    args.push(`-s:v:${index}`, `${quality.width}x${quality.height}`);
    args.push(`-b:v:${index}`, quality.bitrate);

    // Profile: main for H.264, main for HEVC
    args.push(`-profile:v:${index}`, 'main');

    // Tag for HEVC in HLS (required for compatibility)
    if (isHevc) {
      args.push(`-tag:v:${index}`, 'hvc1');
    }

    // Audio encoding settings (same for all variants)
    args.push(`-c:a:${index}`, 'aac');
    args.push(`-b:a:${index}`, '128k');
    args.push(`-ar:${index}`, '44100');
  });

  // Build var_stream_map for HLS variants
  const varStreamMap = qualities.map((q, i) => `v:${i},a:${i},name:${q.name}`).join(' ');

  // HLS output settings
  // Use fmp4 for HEVC (better compatibility), mpegts for H.264
  const segmentType = isHevc ? 'fmp4' : 'mpegts';
  const segmentExt = isHevc ? 'm4s' : 'ts';

  args.push(
    '-f', 'hls',
    '-hls_time', String(segmentDuration),
    '-hls_list_size', String(playlistSize),
    '-hls_flags', 'delete_segments+independent_segments',
    '-hls_segment_type', segmentType,
    '-hls_segment_filename', path.join(HLS_OUTPUT_DIR, '%v', `segment%03d.${segmentExt}`),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', varStreamMap,
    path.join(HLS_OUTPUT_DIR, '%v', 'stream.m3u8')
  );

  // Add init segment for fmp4
  if (isHevc) {
    args.splice(args.indexOf('-hls_segment_type'), 0, '-hls_fmp4_init_filename', 'init.mp4');
  }

  return args;
}

/**
 * Ensure HLS output directories exist
 * @param {Object} config - Server configuration
 * @throws {Error} if directories cannot be created
 */
function ensureOutputDirs(config) {
  try {
    // Create main output directory
    if (!fs.existsSync(HLS_OUTPUT_DIR)) {
      fs.mkdirSync(HLS_OUTPUT_DIR, { recursive: true });
    }

    // Create quality subdirectories
    for (const quality of config.transcoding.qualities) {
      const qualityDir = path.join(HLS_OUTPUT_DIR, quality.name);
      if (!fs.existsSync(qualityDir)) {
        fs.mkdirSync(qualityDir, { recursive: true });
      }
    }
  } catch (err) {
    console.error('[Transcoder] Failed to create output directories:', err.message);
    throw err; // Re-throw to prevent transcoder from starting with invalid dirs
  }
}

/**
 * Clean up HLS files from output directory
 */
function cleanupHlsFiles() {
  try {
    if (fs.existsSync(HLS_OUTPUT_DIR)) {
      // Remove all files recursively
      const files = fs.readdirSync(HLS_OUTPUT_DIR, { recursive: true, withFileTypes: true });

      // Delete files first, then directories
      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(file.parentPath || file.path, file.name);
          fs.unlinkSync(filePath);
        }
      }

      // Remove empty quality directories
      for (const item of fs.readdirSync(HLS_OUTPUT_DIR)) {
        const itemPath = path.join(HLS_OUTPUT_DIR, item);
        if (fs.statSync(itemPath).isDirectory()) {
          try {
            fs.rmdirSync(itemPath);
          } catch (err) {
            // Directory not empty, that's ok
          }
        }
      }

      console.log('[Transcoder] HLS files cleaned up');
    }
  } catch (err) {
    console.error('[Transcoder] Error cleaning up HLS files:', err.message);
  }
}

// Minimum valid segment size (1KB - arbitrary but reasonable for any video)
const MIN_SEGMENT_SIZE = 1024;

/**
 * Validate an HLS segment file
 * @param {string} segmentPath - Path to the segment file
 * @returns {boolean} true if segment appears valid
 */
function validateSegment(segmentPath) {
  try {
    const stats = fs.statSync(segmentPath);
    // Segments should be at least MIN_SEGMENT_SIZE bytes
    return stats.size >= MIN_SEGMENT_SIZE;
  } catch (err) {
    return false;
  }
}

/**
 * Validate all HLS segments in output directory
 * @param {Object} config - Server configuration
 * @returns {Object} Validation result with valid/invalid counts per quality
 */
function validateAllSegments(config) {
  const results = {
    valid: 0,
    invalid: 0,
    byQuality: {}
  };

  try {
    for (const quality of config.transcoding.qualities) {
      const qualityDir = path.join(HLS_OUTPUT_DIR, quality.name);
      results.byQuality[quality.name] = { valid: 0, invalid: 0 };

      if (!fs.existsSync(qualityDir)) {
        continue;
      }

      const files = fs.readdirSync(qualityDir);
      for (const file of files) {
        // Check both .ts (H.264) and .m4s (HEVC) segments
        if (file.endsWith('.ts') || file.endsWith('.m4s')) {
          const segmentPath = path.join(qualityDir, file);
          if (validateSegment(segmentPath)) {
            results.valid++;
            results.byQuality[quality.name].valid++;
          } else {
            results.invalid++;
            results.byQuality[quality.name].invalid++;
            console.warn(`[Transcoder] Invalid segment detected: ${segmentPath}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Transcoder] Error validating segments:', err.message);
  }

  return results;
}

/**
 * Start the FFmpeg transcoder
 * @param {Object} config - Server configuration
 * @param {string} streamPath - RTMP stream path (e.g., '/live/stream')
 * @returns {ChildProcess|null} FFmpeg process or null if already running
 */
function startTranscoder(config, streamPath) {
  if (ffmpegProcess) {
    console.log('[Transcoder] Transcoder already running');
    return null;
  }

  // Clean any existing HLS files and ensure output directories exist
  cleanupHlsFiles();
  ensureOutputDirs(config);

  // Build RTMP input URL
  const rtmpUrl = `rtmp://localhost:${config.rtmp.port}${streamPath}`;

  // Build FFmpeg arguments
  const args = buildFfmpegArgs(config, rtmpUrl);

  const codec = config.transcoding.codec || 'h264';
  const encoder = detectHardwareEncoder(codec);
  console.log('[Transcoder] Starting FFmpeg...');
  console.log('[Transcoder] Codec:', codec.toUpperCase());
  console.log('[Transcoder] Encoder:', encoder);
  console.log('[Transcoder] RTMP source:', rtmpUrl);
  console.log('[Transcoder] Output directory:', HLS_OUTPUT_DIR);

  // Spawn FFmpeg process
  ffmpegProcess = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Handle stdout (progress info)
  ffmpegProcess.stdout.on('data', (data) => {
    // FFmpeg typically outputs progress to stderr, stdout is usually empty
  });

  // Handle stderr (FFmpeg logs all output here)
  // Use configurable buffer size or default
  const maxStderrBuffer = config.transcoding?.stderrBufferSize || DEFAULT_STDERR_BUFFER;
  let stderrBuffer = '';
  ffmpegProcess.stderr.on('data', (data) => {
    stderrBuffer += data.toString();

    // Prevent unbounded buffer growth during long streams
    if (stderrBuffer.length > maxStderrBuffer) {
      stderrBuffer = stderrBuffer.slice(-maxStderrBuffer / 2);
    }

    // Log significant messages (not every frame)
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      // Only log important messages, not frame-by-frame stats
      if (line.includes('Error') || line.includes('error') ||
          line.includes('Opening') || line.includes('Output') ||
          line.includes('Stream mapping')) {
        console.log('[FFmpeg]', line.trim());
      }

      // Log frame drops for performance diagnostics
      if (line.includes('frame=') && line.includes('drop=')) {
        const dropMatch = line.match(/drop=(\d+)/);
        if (dropMatch && parseInt(dropMatch[1], 10) > 0) {
          console.warn(`[Transcoder] Frame drops detected: ${dropMatch[1]}`);
        }
      }
    }
  });

  // Handle process exit
  ffmpegProcess.on('close', (code) => {
    const wasExpectedStop = isStoppingTranscoder;
    console.log(`[Transcoder] FFmpeg exited with code ${code}`);
    ffmpegProcess = null;

    // If FFmpeg crashed (not stopped intentionally), update app state
    if (!wasExpectedStop && code !== 0) {
      console.log('[Transcoder] FFmpeg crashed unexpectedly, updating app state');
      if (appStateRef && appStateRef.stream && appStateRef.stream.status === 'live') {
        appStateRef.stopStream();
      }
      cleanupHlsFiles();
      if (onCrashCallback) {
        onCrashCallback(code);
      }
    }
  });

  ffmpegProcess.on('error', (err) => {
    const wasExpectedStop = isStoppingTranscoder;
    console.error('[Transcoder] FFmpeg error:', err.message);
    if (err.code === 'ENOENT') {
      console.error('[Transcoder] FFmpeg not found. Please install FFmpeg and ensure it is in your PATH.');
    }
    ffmpegProcess = null;

    // Update app state on error if not stopping intentionally
    if (!wasExpectedStop) {
      if (appStateRef && appStateRef.stream && appStateRef.stream.status === 'live') {
        appStateRef.stopStream();
      }
      cleanupHlsFiles();
      if (onCrashCallback) {
        onCrashCallback(-1);
      }
    }
  });

  return ffmpegProcess;
}

/**
 * Stop the FFmpeg transcoder and clean up
 */
function stopTranscoder() {
  // Guard against double-call race condition
  if (!ffmpegProcess || isStoppingTranscoder) {
    if (!isStoppingTranscoder) {
      // No process running, just clean up files
      cleanupHlsFiles();
    }
    return;
  }

  isStoppingTranscoder = true;
  console.log('[Transcoder] Stopping FFmpeg...');

  // Send SIGTERM for graceful shutdown
  ffmpegProcess.kill('SIGTERM');

  // Force kill after timeout if still running
  const killTimeout = setTimeout(() => {
    if (ffmpegProcess) {
      console.log('[Transcoder] Force killing FFmpeg...');
      ffmpegProcess.kill('SIGKILL');
    }
  }, 5000);

  ffmpegProcess.once('close', () => {
    clearTimeout(killTimeout);
    ffmpegProcess = null;
    isStoppingTranscoder = false; // Reset flag for next stream

    // Clean up HLS files after process exits
    cleanupHlsFiles();
  });
}

/**
 * Check if transcoder is currently running
 * @returns {boolean}
 */
function isTranscoderRunning() {
  return ffmpegProcess !== null;
}

/**
 * Get the HLS output directory path
 * @returns {string}
 */
function getOutputDir() {
  return HLS_OUTPUT_DIR;
}

module.exports = {
  validateFfmpeg,
  detectHardwareEncoder,
  startTranscoder,
  stopTranscoder,
  isTranscoderRunning,
  cleanupHlsFiles,
  getOutputDir,
  ensureOutputDirs,
  setAppState,
  validateSegment,
  validateAllSegments
};
