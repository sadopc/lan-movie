# RTMP Protocol: LANCast

**Feature**: 001-lancast-streaming
**Date**: 2025-12-11

## Connection Details

**Endpoint**: `rtmp://{host}:{port}/live/{stream_key}`

- **Host**: Server IP address (e.g., `192.168.1.100`)
- **Port**: Configurable, default `1935`
- **Application**: `live`
- **Stream Key**: Any non-empty string (e.g., `stream`, `mystream`)

## OBS Configuration

### Stream Settings

| Setting | Value |
|---------|-------|
| Service | Custom |
| Server | `rtmp://192.168.1.100:1935/live` |
| Stream Key | `stream` (or any string) |

### Output Settings (Recommended)

| Setting | Value | Notes |
|---------|-------|-------|
| Encoder | x264 or NVENC | Hardware encoding preferred |
| Rate Control | CBR | Constant bitrate for predictable bandwidth |
| Bitrate | 5000-8000 kbps | For 1080p60 |
| Keyframe Interval | 1 second | Required for low-latency HLS |
| Preset | veryfast/Performance | Balance quality vs CPU |
| Profile | high | H.264 profile |
| Tune | zerolatency | Optional, reduces encoding latency |

### Audio Settings

| Setting | Value |
|---------|-------|
| Audio Bitrate | 128-192 kbps |
| Sample Rate | 44.1 kHz |
| Channels | Stereo |

## Server Behavior

### Connection Handling

| Event | Condition | Action |
|-------|-----------|--------|
| `prePublish` | No active stream | Allow connection |
| `prePublish` | Stream already active | Reject with error |
| `postPublish` | Connection accepted | Start transcoding, update state |
| `donePublish` | Publisher disconnects | Stop transcoding, cleanup |

### Validation

- Stream key can be any non-empty string (no authentication)
- Only one publisher allowed at a time
- Maximum resolution: 1920x1080
- Maximum framerate: 60fps

### Error Responses

| Condition | Error Code | Message |
|-----------|------------|---------|
| Stream already active | `NetStream.Publish.BadName` | "Stream already active" |
| Invalid stream key | `NetStream.Publish.BadName` | "Invalid stream key" |

## Node-Media-Server Events

```javascript
// Connection attempt
nms.on('prePublish', (id, streamPath, args) => {
  // streamPath: '/live/stream'
  // Check if stream already active
  // Return reject to deny
});

// Stream started
nms.on('postPublish', (id, streamPath, args) => {
  // Extract metadata from session
  // Start FFmpeg transcoding
  // Update stream state to 'live'
  // Broadcast to WebSocket clients
});

// Stream ended
nms.on('donePublish', (id, streamPath, args) => {
  // Stop FFmpeg
  // Update stream state to 'offline'
  // Cleanup HLS files
  // Broadcast to WebSocket clients
});
```

## Stream Metadata

Extracted from RTMP connection:

| Field | Source | Example |
|-------|--------|---------|
| Publisher IP | Session | `192.168.1.50` |
| Resolution | Video metadata | `1920x1080` |
| Bitrate | Calculated from data rate | `5000` kbps |
| Start Time | Connection timestamp | `2025-12-11T15:30:00Z` |

## Testing with FFmpeg

For testing without OBS:

```bash
# Stream test pattern
ffmpeg -f lavfi -i testsrc=size=1920x1080:rate=30 \
       -f lavfi -i sine=frequency=1000 \
       -c:v libx264 -preset veryfast -tune zerolatency \
       -c:a aac -ar 44100 \
       -f flv rtmp://localhost:1935/live/test

# Stream video file
ffmpeg -re -i video.mp4 \
       -c:v libx264 -preset veryfast \
       -c:a aac \
       -f flv rtmp://localhost:1935/live/stream
```
