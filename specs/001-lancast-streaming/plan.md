# Implementation Plan: LANCast - LAN Video Streaming Platform

**Branch**: `001-lancast-streaming` | **Date**: 2025-12-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-lancast-streaming/spec.md`

## Summary

LANCast is a LAN-only video streaming platform for watch parties. A single streamer broadcasts via OBS using RTMP, and up to 10 viewers watch simultaneously through any web browser. The system uses Node.js with Node-Media-Server for RTMP ingestion, FFmpeg for HLS transcoding to three quality tiers (1080p, 720p, 480p), Express.js for the web server, and vanilla HTML/CSS/JavaScript with HLS.js for playback. WebSocket provides real-time viewer count and stream status updates. Target latency is under 1 second.

## Technical Context

**Language/Version**: Node.js 18+ (LTS)
**Primary Dependencies**: Node-Media-Server, FFmpeg, Express.js, ws (WebSocket), HLS.js (client)
**Storage**: N/A (ephemeral stream state, HLS segments stored temporarily in filesystem)
**Testing**: Jest for unit tests, manual browser testing
**Target Platform**: Linux/macOS/Windows server, all modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: Single project (unified server + static frontend)
**Performance Goals**: <1s end-to-end latency, 10 concurrent viewers, 1080p60 support
**Constraints**: <100MB server memory, <50KB client JS bundle, LAN-only (no internet required)
**Scale/Scope**: Single server, 1 streamer, up to 10 viewers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Compliance Notes |
|-----------|--------|------------------|
| I. Ultra-Low Latency First | PASS | HLS with 1-2s segments targets <1s latency; WebSocket for instant status updates |
| II. Simplicity Over Features | PASS | Minimal dependencies; single npm install + run; no auth, chat, recording |
| III. Universal Browser Compatibility | PASS | HLS.js + native Safari HLS; responsive vanilla CSS; no WebRTC |
| IV. Minimal Resource Usage | PASS | Target <100MB memory; <50KB client bundle; Node.js efficient for I/O |
| V. Self-Hosted LAN Operation | PASS | Zero external calls; all assets local; works with IP addresses only |
| VI. Graceful Degradation | PASS | WebSocket auto-reconnect; HLS buffering handles brief interruptions |

**Gate Status**: PASS - All principles satisfied. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-lancast-streaming/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── index.js         # Main entry point
│   ├── config.js        # Configuration loader
│   ├── rtmp.js          # RTMP server setup (Node-Media-Server)
│   ├── transcoder.js    # FFmpeg transcoding to HLS
│   ├── http.js          # Express.js web server
│   ├── websocket.js     # WebSocket for real-time updates
│   └── state.js         # Stream state management
├── public/
│   ├── index.html       # Main viewer page
│   ├── css/
│   │   └── style.css    # Responsive styles
│   └── js/
│       ├── player.js    # HLS.js player setup
│       ├── controls.js  # Playback controls
│       └── status.js    # WebSocket status updates
└── config.json          # Default configuration

media/                   # HLS output directory (gitignored)
└── live/
    ├── 1080p/
    ├── 720p/
    ├── 480p/
    └── master.m3u8

tests/
├── unit/
│   ├── state.test.js
│   └── config.test.js
└── integration/
    └── server.test.js
```

**Structure Decision**: Single project structure chosen. The server and static frontend are tightly coupled (single deployment unit), and the project scope is small enough that separation adds unnecessary complexity. All source code lives under `src/`, with `server/` for backend and `public/` for frontend assets.

## Complexity Tracking

No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| FFmpeg external dependency | Required for real-time transcoding to HLS | Pure JS solutions cannot transcode video at 1080p60 in real-time |
| Three quality tiers | User-requested feature for adaptive streaming | Single quality would be simpler but conflicts with explicit requirement |
