# Data Model: LANCast

**Feature**: 001-lancast-streaming
**Date**: 2025-12-11

## Overview

LANCast uses an ephemeral, in-memory data model. No persistent storage is required. All state is reset when the server restarts.

## Entities

### Stream

Represents the current broadcast state.

```typescript
interface Stream {
  // Identity
  id: string;              // Always "live" (single stream)

  // State
  status: 'offline' | 'live';

  // Metadata (populated when live)
  publisherIP?: string;    // IP address of OBS streamer
  resolution?: string;     // e.g., "1920x1080"
  bitrate?: number;        // Incoming bitrate in kbps
  startTime?: Date;        // When stream started

  // Derived
  duration?: number;       // Seconds since startTime (computed)
}
```

**State Transitions**:
```
offline → live    (RTMP publish event)
live → offline    (RTMP unpublish/disconnect event)
```

**Validation Rules**:
- Only one stream can be `live` at a time
- `publisherIP`, `resolution`, `bitrate`, `startTime` MUST be set when `status` is `live`
- `publisherIP`, `resolution`, `bitrate`, `startTime` MUST be cleared when `status` is `offline`

### ViewerSession

Represents a connected viewer's session.

```typescript
interface ViewerSession {
  // Identity
  id: string;              // UUID generated on connection

  // Connection
  connectedAt: Date;
  lastPing: Date;          // For detecting stale connections

  // Playback state
  quality: '1080p' | '720p' | '480p';  // Currently selected quality

  // Transport
  websocket: WebSocket;    // Reference to WebSocket connection
}
```

**Lifecycle**:
- Created on WebSocket connection
- Updated on quality change (via HLS.js level switch)
- Destroyed on WebSocket close or timeout (no ping for 30s)

**Validation Rules**:
- `id` MUST be unique across all sessions
- `quality` defaults to highest available quality on connect

### ServerConfig

Runtime configuration loaded at startup.

```typescript
interface ServerConfig {
  rtmp: {
    port: number;          // Default: 1935
  };
  http: {
    port: number;          // Default: 8080
  };
  transcoding: {
    qualities: QualityPreset[];
    segmentDuration: number;  // Seconds, default: 1
    playlistSize: number;     // Segments to keep, default: 3
  };
  limits: {
    maxViewers: number;    // Default: 10
  };
}

interface QualityPreset {
  name: string;            // e.g., "1080p"
  width: number;           // e.g., 1920
  height: number;          // e.g., 1080
  bitrate: string;         // e.g., "5000k"
}
```

**Validation Rules**:
- `rtmp.port` MUST be between 1 and 65535
- `http.port` MUST be between 1 and 65535
- `rtmp.port` MUST NOT equal `http.port`
- `qualities` MUST have at least 1 entry
- `segmentDuration` MUST be between 1 and 10
- `playlistSize` MUST be between 2 and 10
- `maxViewers` MUST be between 1 and 100

## In-Memory State Structure

```typescript
interface AppState {
  stream: Stream;
  viewers: Map<string, ViewerSession>;
  config: ServerConfig;
}
```

## State Operations

### Stream Operations

| Operation | Trigger | Side Effects |
|-----------|---------|--------------|
| `startStream(metadata)` | RTMP publish | Broadcast status to all viewers |
| `stopStream()` | RTMP disconnect | Broadcast status to all viewers; cleanup HLS files |
| `rejectStream(reason)` | Second RTMP connect | Return error to publisher |

### Viewer Operations

| Operation | Trigger | Side Effects |
|-----------|---------|--------------|
| `addViewer(ws)` | WebSocket connect | If at limit, reject with "room full" |
| `removeViewer(id)` | WebSocket close | Broadcast updated viewer count |
| `updateViewerQuality(id, quality)` | Quality switch | None (local state only) |
| `getViewerCount()` | Status request | None |

## Relationships

```
ServerConfig (1) ←── loads ──→ (1) AppState
AppState (1) ←── contains ──→ (1) Stream
AppState (1) ←── contains ──→ (0..10) ViewerSession
```

## Data Flow

```
OBS → RTMP → Node-Media-Server → Stream entity updated
                    ↓
              FFmpeg spawned → HLS files written to disk
                    ↓
         WebSocket broadcasts status → ViewerSession clients notified
                    ↓
         Browser requests HLS → Express serves files → Video plays
```

## Cleanup

On stream end:
1. Set `stream.status` to `offline`
2. Clear stream metadata
3. Kill FFmpeg process
4. Delete HLS segment files from `media/live/`
5. Broadcast offline status to all viewers

On server shutdown:
1. Stop RTMP server
2. Kill FFmpeg process (if running)
3. Close all WebSocket connections
4. Delete HLS files
