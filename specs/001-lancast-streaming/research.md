# Research: LANCast - LAN Video Streaming Platform

**Feature**: 001-lancast-streaming
**Date**: 2025-12-11

## Technology Decisions

### 1. RTMP Ingestion: Node-Media-Server

**Decision**: Use Node-Media-Server for RTMP ingestion from OBS.

**Rationale**:
- Pure Node.js implementation, no native dependencies
- Well-documented API for handling RTMP events (connect, publish, disconnect)
- Supports stream key validation and connection rejection
- Active maintenance and npm ecosystem integration
- Lightweight compared to alternatives like nginx-rtmp-module

**Alternatives Considered**:
- **nginx-rtmp-module**: More mature but requires nginx compilation; adds operational complexity
- **MediaMTX (formerly rtsp-simple-server)**: Go-based, excellent but requires separate binary
- **Custom RTMP implementation**: Too complex for scope; protocol is non-trivial

**Configuration Approach**:
```javascript
const config = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  }
};
```

### 2. Transcoding: FFmpeg via Child Process

**Decision**: Spawn FFmpeg as child process for RTMP-to-HLS transcoding.

**Rationale**:
- Industry standard for video transcoding; highly optimized
- Supports all required codecs (H.264, AAC) and containers (HLS/MPEG-TS)
- Can produce multiple quality variants simultaneously
- Node.js child_process provides clean spawn/kill lifecycle management

**Alternatives Considered**:
- **fluent-ffmpeg**: Wrapper library adds abstraction but no real benefit for our simple pipeline
- **WebCodecs API**: Browser-only; cannot transcode server-side
- **GStreamer**: More complex setup; FFmpeg is more widely available

**FFmpeg Command Template**:
```bash
ffmpeg -i rtmp://localhost:1935/live/stream \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -c:a aac -ar 44100 \
  -f hls -hls_time 1 -hls_list_size 3 -hls_flags delete_segments \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  -map 0:v -map 0:a -s:v:0 1920x1080 -b:v:0 5000k \
  -map 0:v -map 0:a -s:v:1 1280x720 -b:v:1 2500k \
  -map 0:v -map 0:a -s:v:2 854x480 -b:v:2 1000k \
  -master_pl_name master.m3u8 \
  media/live/%v/stream.m3u8
```

**Low-Latency Tuning**:
- `-hls_time 1`: 1-second segments (minimum practical for HLS)
- `-hls_list_size 3`: Keep only 3 segments in playlist (reduces buffer requirements)
- `-hls_flags delete_segments`: Clean up old segments automatically
- `-tune zerolatency`: FFmpeg preset optimized for streaming
- `-preset veryfast`: Balance between CPU usage and quality

### 3. Video Delivery: HLS (HTTP Live Streaming)

**Decision**: Use HLS for video delivery to browsers.

**Rationale**:
- Native support in Safari (iOS and macOS)
- HLS.js provides support for Chrome, Firefox, Edge
- HTTP-based delivery works through any firewall/proxy
- Adaptive bitrate switching built into protocol
- Simple to serve (just static files via Express)

**Alternatives Considered**:
- **DASH (MPEG-DASH)**: Similar capabilities but no native Safari support
- **WebRTC**: Lower latency possible but complex NAT traversal; violates constitution
- **Low-Latency HLS (LL-HLS)**: Requires Apple's implementation; adds complexity
- **FLV over HTTP**: Flash-era technology; declining support

**HLS.js Configuration for Low Latency**:
```javascript
const hls = new Hls({
  lowLatencyMode: true,
  liveSyncDurationCount: 1,
  liveMaxLatencyDurationCount: 3,
  liveDurationInfinity: true,
  highBufferWatchdogPeriod: 1
});
```

### 4. Web Server: Express.js

**Decision**: Use Express.js for HTTP server and static file serving.

**Rationale**:
- De facto standard for Node.js web servers
- Minimal overhead for serving static files
- Easy middleware integration
- Well-understood by Node.js developers

**Alternatives Considered**:
- **Fastify**: Faster but overkill for our simple use case
- **Koa**: Similar to Express; no compelling advantage here
- **http.Server directly**: Too low-level; would reinvent Express features

**Routes Required**:
- `GET /` - Serve index.html (viewer page)
- `GET /css/*` - Static CSS files
- `GET /js/*` - Static JavaScript files
- `GET /media/*` - HLS segments and playlists
- `GET /api/status` - Current stream status (REST fallback)

### 5. Real-time Updates: WebSocket (ws library)

**Decision**: Use the `ws` library for WebSocket communication.

**Rationale**:
- Pure JavaScript, no native dependencies
- Lightweight (~3KB)
- Well-tested and maintained
- Can be attached to Express HTTP server (shared port)

**Alternatives Considered**:
- **Socket.IO**: Heavier (~40KB client); unnecessary features for our use case
- **Server-Sent Events (SSE)**: One-way only; WebSocket allows future bidirectional needs
- **uWebSockets.js**: Faster but native dependencies complicate installation

**Message Protocol**:
```typescript
// Server → Client
{
  type: 'status',
  data: {
    live: boolean,
    viewerCount: number,
    streamInfo?: {
      resolution: string,
      bitrate: number,
      startTime: string
    }
  }
}

// Connection events only; no client→server messages in MVP
```

### 6. Client Player: HLS.js

**Decision**: Use HLS.js for video playback in non-Safari browsers.

**Rationale**:
- Standard solution for HLS in browsers without native support
- Feature detection allows native HLS in Safari
- Supports quality switching API
- ~40KB gzipped (within budget)

**Browser Strategy**:
```javascript
if (Hls.isSupported()) {
  // Chrome, Firefox, Edge: use HLS.js
  const hls = new Hls();
  hls.loadSource('/media/live/master.m3u8');
  hls.attachMedia(video);
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  // Safari: native HLS
  video.src = '/media/live/master.m3u8';
}
```

### 7. Configuration Management

**Decision**: Use JSON configuration file with environment variable overrides.

**Rationale**:
- Simple to edit for non-technical users
- Environment variables allow Docker/container deployment
- No build step required

**Configuration Schema**:
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

## External Dependencies

### Runtime Requirements

| Dependency | Version | Purpose | Installation |
|------------|---------|---------|--------------|
| Node.js | 18+ LTS | Runtime | System package manager |
| FFmpeg | 4.0+ | Transcoding | System package manager |

### npm Dependencies

| Package | Version | Purpose | Size (gzipped) |
|---------|---------|---------|----------------|
| node-media-server | ^2.6.0 | RTMP ingestion | ~150KB |
| express | ^4.18.0 | Web server | ~35KB |
| ws | ^8.14.0 | WebSocket | ~3KB |

### Client Dependencies (served locally)

| Package | Version | Purpose | Size (gzipped) |
|---------|---------|---------|----------------|
| hls.js | ^1.4.0 | HLS playback | ~40KB |

**Total client bundle estimate**: ~45KB (within 50KB limit)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| FFmpeg not installed | Medium | High | Clear error message with installation instructions |
| HLS latency exceeds 1s | Medium | Medium | Tune segment duration; document expected latency |
| Browser autoplay blocked | High | Low | Start muted; show play button; document limitation |
| WebSocket reconnection fails | Low | Medium | Exponential backoff; REST fallback for status |
| Node-Media-Server memory leak | Low | Medium | Monitor memory; restart on threshold |

## Open Questions Resolved

All technical decisions have been made. No NEEDS CLARIFICATION items remain.
