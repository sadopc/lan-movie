/**
 * Configuration loader for LANCast
 * Loads config.json and applies environment variable overrides
 */

const fs = require('fs');
const path = require('path');

// Default configuration (fallback if config.json is missing)
const DEFAULT_CONFIG = {
  rtmp: {
    port: 1935
  },
  http: {
    port: 8080
  },
  transcoding: {
    codec: 'hevc',  // 'h264' or 'hevc' - hevc provides better quality at lower bitrates
    qualities: [
      { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' },
      { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
      { name: '480p', width: 854, height: 480, bitrate: '1000k' }
    ],
    segmentDuration: 1,
    playlistSize: 3
  },
  limits: {
    maxViewers: 10
  }
};

/**
 * Deep merge two objects, with source overwriting target values
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Validate configuration values
 * @throws {Error} if validation fails
 */
function validateConfig(config) {
  const errors = [];

  // Port validation
  if (config.rtmp.port < 1 || config.rtmp.port > 65535) {
    errors.push('rtmp.port must be between 1 and 65535');
  }
  if (config.http.port < 1 || config.http.port > 65535) {
    errors.push('http.port must be between 1 and 65535');
  }
  if (config.rtmp.port === config.http.port) {
    errors.push('rtmp.port and http.port must be different');
  }

  // Transcoding validation
  const validCodecs = ['h264', 'hevc'];
  if (config.transcoding.codec && !validCodecs.includes(config.transcoding.codec)) {
    errors.push(`transcoding.codec must be one of: ${validCodecs.join(', ')}`);
  }
  if (!config.transcoding.qualities || config.transcoding.qualities.length === 0) {
    errors.push('transcoding.qualities must have at least 1 entry');
  }
  if (config.transcoding.segmentDuration < 1 || config.transcoding.segmentDuration > 10) {
    errors.push('transcoding.segmentDuration must be between 1 and 10');
  }
  if (config.transcoding.playlistSize < 2 || config.transcoding.playlistSize > 10) {
    errors.push('transcoding.playlistSize must be between 2 and 10');
  }

  // Limits validation
  if (config.limits.maxViewers < 1 || config.limits.maxViewers > 100) {
    errors.push('limits.maxViewers must be between 1 and 100');
  }

  if (errors.length > 0) {
    throw new Error('Configuration validation failed:\n  - ' + errors.join('\n  - '));
  }

  return config;
}

/**
 * Parse integer from string, returning default if invalid
 * @param {string} value - String to parse
 * @param {number} defaultValue - Default if parsing fails
 * @returns {number} Parsed integer or default
 */
function parseIntOrDefault(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Apply environment variable overrides to config
 */
function applyEnvOverrides(config) {
  const envConfig = { ...config };

  if (process.env.RTMP_PORT) {
    envConfig.rtmp = { ...envConfig.rtmp, port: parseIntOrDefault(process.env.RTMP_PORT, envConfig.rtmp.port) };
  }
  if (process.env.HTTP_PORT) {
    envConfig.http = { ...envConfig.http, port: parseIntOrDefault(process.env.HTTP_PORT, envConfig.http.port) };
  }
  if (process.env.MAX_VIEWERS) {
    envConfig.limits = { ...envConfig.limits, maxViewers: parseIntOrDefault(process.env.MAX_VIEWERS, envConfig.limits.maxViewers) };
  }
  if (process.env.SEGMENT_DURATION) {
    envConfig.transcoding = { ...envConfig.transcoding, segmentDuration: parseIntOrDefault(process.env.SEGMENT_DURATION, envConfig.transcoding.segmentDuration) };
  }
  if (process.env.PLAYLIST_SIZE) {
    envConfig.transcoding = { ...envConfig.transcoding, playlistSize: parseIntOrDefault(process.env.PLAYLIST_SIZE, envConfig.transcoding.playlistSize) };
  }

  return envConfig;
}

/**
 * Load configuration from file and environment
 * @returns {Object} Validated configuration object
 */
function loadConfig() {
  let fileConfig = {};

  // Try to load config.json from src/ directory
  const configPath = path.join(__dirname, '..', 'config.json');

  try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    fileConfig = JSON.parse(configFile);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Warning: Could not parse config.json: ${err.message}`);
      console.warn('Using default configuration');
    }
  }

  // Merge: defaults -> file config -> env overrides
  let config = deepMerge(DEFAULT_CONFIG, fileConfig);
  config = applyEnvOverrides(config);

  // Validate and return
  return validateConfig(config);
}

module.exports = {
  loadConfig,
  DEFAULT_CONFIG
};
