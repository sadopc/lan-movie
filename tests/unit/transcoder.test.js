/**
 * Unit tests for transcoder.js
 */

const path = require('path');
const { createTestConfig, createMockChildProcess } = require('../helpers/mocks');

describe('Transcoder Module', () => {
  let config;
  let transcoder;
  let spawn;
  let fs;

  beforeEach(() => {
    jest.resetModules(); // Reset module state between tests

    // Re-mock after resetModules
    jest.mock('child_process');
    jest.mock('fs');

    spawn = require('child_process').spawn;
    fs = require('fs');

    config = createTestConfig();

    // Default fs mocks
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.mkdirSync = jest.fn().mockReturnValue(undefined);
    fs.readdirSync = jest.fn().mockReturnValue([]);
    fs.statSync = jest.fn().mockReturnValue({ isDirectory: () => false });
    fs.unlinkSync = jest.fn();
    fs.rmdirSync = jest.fn();

    // Re-require the module to get fresh state
    transcoder = require('../../src/server/transcoder');
  });

  describe('validateFfmpeg', () => {
    it('should resolve when FFmpeg is available', async () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      const promise = transcoder.validateFfmpeg();

      // Simulate FFmpeg output
      mockProc.stdout.emit('data', 'ffmpeg version 5.1.2 Copyright (c) 2000-2022');
      mockProc.emit('close', 0);

      await expect(promise).resolves.toBeUndefined();
      expect(spawn).toHaveBeenCalledWith('ffmpeg', ['-version'], expect.any(Object));
    });

    it('should reject when FFmpeg is not found', async () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      const promise = transcoder.validateFfmpeg();

      // Simulate ENOENT error
      const error = new Error('spawn ffmpeg ENOENT');
      error.code = 'ENOENT';
      mockProc.emit('error', error);

      await expect(promise).rejects.toThrow('FFmpeg not found');
    });

    it('should reject when FFmpeg exits with non-zero code', async () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      const promise = transcoder.validateFfmpeg();
      mockProc.emit('close', 1);

      await expect(promise).rejects.toThrow('FFmpeg validation failed with exit code 1');
    });

    it('should extract and log version', async () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const promise = transcoder.validateFfmpeg();
      mockProc.stdout.emit('data', 'ffmpeg version 6.0 Copyright (c) 2000-2023');
      mockProc.emit('close', 0);

      await promise;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('version 6.0'));
      consoleSpy.mockRestore();
    });
  });

  describe('ensureOutputDirs', () => {
    it('should create main output directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);

      transcoder.ensureOutputDirs(config);

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should create quality subdirectories', () => {
      fs.existsSync.mockReturnValue(false);

      transcoder.ensureOutputDirs(config);

      // Should create directories for each quality
      expect(fs.mkdirSync).toHaveBeenCalledTimes(4); // main + 3 qualities
    });

    it('should throw on directory creation error', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => transcoder.ensureOutputDirs(config)).toThrow('Permission denied');
    });
  });

  describe('cleanupHlsFiles', () => {
    it('should remove all files in output directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValueOnce([
        { isFile: () => true, name: 'segment001.ts', parentPath: '/media/live/1080p' }
      ]).mockReturnValueOnce([]);
      fs.statSync.mockReturnValue({ isDirectory: () => false });

      transcoder.cleanupHlsFiles();

      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle missing directory gracefully', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => transcoder.cleanupHlsFiles()).not.toThrow();
    });

    it('should log errors but not throw', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => transcoder.cleanupHlsFiles()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('startTranscoder', () => {
    it('should spawn FFmpeg with correct arguments', () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      transcoder.startTranscoder(config, '/live/stream');

      expect(spawn).toHaveBeenCalledWith('ffmpeg', expect.any(Array), expect.any(Object));

      const args = spawn.mock.calls[0][1];
      expect(args).toContain('-i');
      expect(args.some(arg => arg.includes('rtmp://localhost'))).toBe(true);
    });

    it('should include quality settings in FFmpeg args', () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      transcoder.startTranscoder(config, '/live/stream');

      const args = spawn.mock.calls[0][1];
      expect(args).toContain('libx264');
      expect(args.some(arg => arg.includes('1920x1080'))).toBe(true);
      expect(args.some(arg => arg.includes('1280x720'))).toBe(true);
    });

    it('should return null if already running', () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      transcoder.startTranscoder(config, '/live/stream');
      const result = transcoder.startTranscoder(config, '/live/stream');

      expect(result).toBeNull();
    });
  });

  describe('stopTranscoder', () => {
    it('should send SIGTERM to FFmpeg process', () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      transcoder.startTranscoder(config, '/live/stream');
      transcoder.stopTranscoder();

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle cleanup when no process running', () => {
      // Just verify it doesn't throw
      expect(() => transcoder.stopTranscoder()).not.toThrow();
    });
  });

  describe('isTranscoderRunning', () => {
    it('should return false when not started', () => {
      expect(transcoder.isTranscoderRunning()).toBe(false);
    });

    it('should return true when running', () => {
      const mockProc = createMockChildProcess();
      spawn.mockReturnValue(mockProc);

      transcoder.startTranscoder(config, '/live/stream');

      expect(transcoder.isTranscoderRunning()).toBe(true);
    });
  });
});
