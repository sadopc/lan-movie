# Quickstart: LANCast

**Feature**: 001-lancast-streaming
**Date**: 2025-12-11

## Prerequisites

### Required Software

1. **Node.js 18+** (LTS recommended)
   ```bash
   node --version  # Should show v18.x.x or higher
   ```

2. **FFmpeg 4.0+**
   ```bash
   ffmpeg -version  # Should show version 4.x or higher
   ```

   **Installation**:
   - macOS: `brew install ffmpeg`
   - Ubuntu/Debian: `sudo apt install ffmpeg`
   - Windows: Download from https://ffmpeg.org/download.html

3. **OBS Studio** (for streaming)
   - Download from https://obsproject.com/

## Installation

```bash
# Clone or navigate to project
cd lancast

# Install dependencies
npm install

# Start the server
npm start
```

## Configuration

Edit `config.json` to customize ports and settings:

```json
{
  "rtmp": {
    "port": 1935
  },
  "http": {
    "port": 8080
  },
  "transcoding": {
    "qualities": [
      { "name": "1080p", "width": 1920, "height": 1080, "bitrate": "5000k" },
      { "name": "720p", "width": 1280, "height": 720, "bitrate": "2500k" },
      { "name": "480p", "width": 854, "height": 480, "bitrate": "1000k" }
    ],
    "segmentDuration": 1,
    "playlistSize": 3
  },
  "limits": {
    "maxViewers": 10
  }
}
```

Environment variables override config file:
- `RTMP_PORT` - RTMP server port
- `HTTP_PORT` - Web server port
- `MAX_VIEWERS` - Maximum concurrent viewers

## Quick Start (5 minutes)

### 1. Start the Server

```bash
npm start
```

You should see:
```
LANCast server started
RTMP server listening on port 1935
HTTP server listening on port 8080
```

### 2. Find Your Server IP

```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr IPv4
```

Note the IP address (e.g., `192.168.1.100`).

### 3. Configure OBS

1. Open OBS Studio
2. Go to **Settings** → **Stream**
3. Set:
   - **Service**: Custom
   - **Server**: `rtmp://192.168.1.100:1935/live`
   - **Stream Key**: `stream`
4. Go to **Settings** → **Output**
5. Set:
   - **Output Mode**: Advanced
   - **Encoder**: x264 (or hardware encoder)
   - **Bitrate**: 5000-8000 kbps
   - **Keyframe Interval**: 1 second

### 4. Start Streaming

1. In OBS, click **Start Streaming**
2. Server console will show: `Stream started from 192.168.1.x`

### 5. Watch the Stream

Open a browser on any device on your LAN:

```
http://192.168.1.100:8080
```

The stream should start playing automatically.

## Verification Checklist

- [ ] Server starts without errors
- [ ] OBS connects successfully (no "failed to connect" error)
- [ ] Console shows "Stream started" message
- [ ] Viewer page shows "Live" status
- [ ] Video plays in browser
- [ ] Quality selector shows 1080p/720p/480p options
- [ ] Viewer count updates when opening new tabs
- [ ] Stopping OBS updates page to "Offline"

## Troubleshooting

### "FFmpeg not found"

FFmpeg is not installed or not in PATH.

**Solution**: Install FFmpeg and ensure it's in your system PATH.

### "RTMP connection failed" in OBS

Server is not running or wrong IP/port.

**Solution**:
1. Verify server is running (`npm start`)
2. Check RTMP port matches OBS settings
3. Verify IP address is correct
4. Check firewall allows port 1935

### "Stream already active" error

Another OBS instance is already streaming.

**Solution**: Only one streamer is allowed. Stop the other stream first.

### Video not playing in browser

HLS files may not be ready yet.

**Solution**:
1. Wait 3-5 seconds after starting OBS stream
2. Check browser console for errors
3. Try refreshing the page
4. Verify `media/live/` folder contains `.m3u8` and `.ts` files

### "Room full" error

Maximum viewer limit reached.

**Solution**: Close other browser tabs or wait for viewers to disconnect.

### High latency (>5 seconds)

HLS buffer is too large.

**Solution**:
1. Reduce `segmentDuration` in config (minimum 1)
2. Reduce `playlistSize` in config (minimum 2)
3. Use keyframe interval of 1 second in OBS

## Testing Without OBS

Use FFmpeg to send a test stream:

```bash
# Test pattern
ffmpeg -f lavfi -i testsrc=size=1920x1080:rate=30 \
       -f lavfi -i sine=frequency=1000 \
       -c:v libx264 -preset veryfast -tune zerolatency \
       -c:a aac -ar 44100 \
       -f flv rtmp://localhost:1935/live/test
```

## Network Diagram

```
┌─────────────┐     RTMP      ┌─────────────┐     HLS      ┌─────────────┐
│    OBS      │──────────────▶│  LANCast    │─────────────▶│   Browser   │
│  (Streamer) │   Port 1935   │   Server    │   Port 8080  │  (Viewer)   │
└─────────────┘               └─────────────┘              └─────────────┘
                                    │
                                    │ WebSocket
                                    ▼
                              ┌─────────────┐
                              │   Browser   │
                              │  (Viewer)   │
                              └─────────────┘
```

## Stopping the Server

Press `Ctrl+C` in the terminal. The server will:
1. Stop accepting new connections
2. Close existing streams
3. Clean up HLS files
4. Exit gracefully
