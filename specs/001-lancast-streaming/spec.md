# Feature Specification: LANCast - LAN Video Streaming Platform

**Feature Branch**: `001-lancast-streaming`
**Created**: 2025-12-11
**Status**: Draft
**Input**: Build a LAN-only video streaming platform called "LANCast" for watch parties

## Clarifications

### Session 2025-12-11

- Q: Should the system provide multi-quality transcoding? → A: Yes, multiple quality tiers (1080p, 720p, 480p) with adaptive selection

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stream Broadcasting (Priority: P1)

As a streamer, I want to broadcast video content from OBS to the LANCast server so that viewers on my local network can watch together in sync.

**Why this priority**: Without the ability to receive and serve a stream, the entire platform has no purpose. This is the foundational capability that enables all other features.

**Independent Test**: Can be fully tested by connecting OBS to the server's RTMP endpoint and verifying the stream is received and can be played back via the web interface.

**Acceptance Scenarios**:

1. **Given** the LANCast server is running, **When** I configure OBS with the server's RTMP URL (rtmp://[server-ip]:[port]/live) and start streaming, **Then** the server accepts the connection and begins receiving video data
2. **Given** a stream is active, **When** a second OBS instance attempts to connect, **Then** the connection is rejected with an appropriate error (single streamer only)
3. **Given** a stream is active, **When** the streamer stops OBS, **Then** the server detects the disconnect within 5 seconds and updates stream status to offline

---

### User Story 2 - Watch Stream (Priority: P1)

As a viewer, I want to open a web page and watch the live stream so that I can participate in the watch party with minimal setup.

**Why this priority**: Co-equal with broadcasting - viewers are the other essential half of the watch party experience. The stream must be viewable for the platform to deliver value.

**Independent Test**: Can be fully tested by opening the viewer URL in a browser while a stream is active and verifying video playback begins automatically.

**Acceptance Scenarios**:

1. **Given** a stream is live, **When** I navigate to http://[server-ip]:[port] in my browser, **Then** video playback begins automatically within 3 seconds
2. **Given** no stream is active, **When** I navigate to the viewer page, **Then** I see a "Waiting for stream..." message and the page automatically starts playing when a stream begins
3. **Given** I am watching a stream, **When** the streamer ends the broadcast, **Then** I see a "Stream ended" message and the page resumes waiting state

---

### User Story 3 - Playback Controls (Priority: P2)

As a viewer, I want basic playback controls so that I can adjust my viewing experience without disrupting others.

**Why this priority**: Essential for usability but the stream can technically be watched without controls. Volume and fullscreen significantly improve the experience.

**Independent Test**: Can be tested by verifying each control (play/pause, volume, mute, fullscreen) functions correctly during an active stream.

**Acceptance Scenarios**:

1. **Given** I am watching a stream, **When** I click the play/pause button, **Then** my local playback pauses/resumes (does not affect other viewers)
2. **Given** I am watching a stream, **When** I drag the volume slider, **Then** audio volume adjusts smoothly from 0-100%
3. **Given** I am watching a stream, **When** I click the mute button, **Then** audio is muted and the button shows muted state
4. **Given** I am watching a stream, **When** I click the fullscreen button, **Then** the video expands to fill my screen

---

### User Story 4 - Stream Status Dashboard (Priority: P2)

As a viewer, I want to see stream information so that I know the stream status and quality before and during viewing.

**Why this priority**: Improves user experience by providing feedback about stream state and quality, but not essential for core functionality.

**Independent Test**: Can be tested by verifying the landing page displays correct status (live/offline), viewer count, resolution, and bitrate.

**Acceptance Scenarios**:

1. **Given** no stream is active, **When** I view the landing page, **Then** I see "Offline" status clearly displayed
2. **Given** a stream is active, **When** I view the landing page, **Then** I see "Live" status, current viewer count, resolution (e.g., 1920x1080), and bitrate (e.g., 6 Mbps)
3. **Given** I am viewing the page, **When** another viewer joins or leaves, **Then** the viewer count updates within 2 seconds

---

### User Story 5 - Quality Selection (Priority: P3)

As a viewer, I want to select stream quality so that I can balance video quality against my device's capabilities.

**Why this priority**: Enables viewers on lower-powered devices or those experiencing network congestion to select an appropriate quality level.

**Independent Test**: Can be tested by verifying quality options (1080p, 720p, 480p) are displayed and switching between them changes the video stream quality.

**Acceptance Scenarios**:

1. **Given** a stream is active, **When** I click the quality selector, **Then** I see available quality options (1080p, 720p, 480p)
2. **Given** I am watching at 1080p, **When** I select 720p, **Then** video switches to 720p quality with minimal interruption (<2 seconds)
3. **Given** I select a different quality, **When** the switch completes, **Then** video continues playing at the new quality without restarting from beginning

---

### Edge Cases

- What happens when a viewer's network connection drops temporarily?
  - Player should buffer and resume automatically when connection restores
  - If disconnected > 10 seconds, show reconnection message
- How does the system handle when the streamer's bitrate exceeds viewer bandwidth?
  - Video should buffer rather than drop frames; quality selector allows viewer to choose lower quality if available
- What happens when viewer count reaches the maximum (10)?
  - New connection attempts should be rejected with a friendly "Room full" message
- How does the system handle malformed RTMP streams?
  - Server should reject invalid streams and log the error
- What happens when a viewer opens multiple tabs to the same stream?
  - Each tab counts as a separate viewer; no special handling required

## Requirements *(mandatory)*

### Functional Requirements

**RTMP Ingestion**
- **FR-001**: System MUST accept RTMP connections on a configurable port (default: 1935)
- **FR-002**: System MUST support video up to 1920x1080 resolution at 60fps
- **FR-003**: System MUST reject additional RTMP connections while a stream is active (single streamer only)
- **FR-004**: System MUST detect stream disconnection within 5 seconds

**Web Playback**
- **FR-005**: System MUST serve a web page accessible via direct IP:port URL
- **FR-006**: System MUST auto-play video when a stream becomes available (respecting browser autoplay policies)
- **FR-007**: System MUST display "Waiting for stream" state when no stream is active
- **FR-008**: System MUST achieve playback latency under 1 second from broadcaster to viewer

**Transcoding**
- **FR-009**: System MUST transcode incoming stream to multiple quality tiers: 1080p, 720p, and 480p
- **FR-010**: System MUST perform transcoding in real-time with latency overhead under 200ms

**Viewer Controls**
- **FR-011**: System MUST provide play/pause toggle that affects only local playback
- **FR-012**: System MUST provide volume slider (0-100%) with mute button
- **FR-013**: System MUST provide fullscreen toggle
- **FR-014**: System MUST provide quality selector allowing viewers to choose between available quality tiers

**Status Information**
- **FR-015**: System MUST display stream status (live/offline) on the landing page
- **FR-016**: System MUST display current viewer count, updated in near real-time
- **FR-017**: System MUST display stream info (resolution, bitrate) when live

**Capacity & Compatibility**
- **FR-018**: System MUST support up to 10 simultaneous viewers
- **FR-019**: System MUST work in Chrome, Firefox, Safari, and Edge (desktop and mobile)
- **FR-020**: System MUST function entirely on local network without internet connectivity

**Exclusions (explicitly out of scope)**
- **FR-021**: System MUST NOT require authentication or login
- **FR-022**: System MUST NOT provide chat functionality
- **FR-023**: System MUST NOT provide recording capability
- **FR-024**: System MUST NOT provide stream discovery (direct URL access only)

### Key Entities

- **Stream**: Represents an active broadcast; includes source IP, resolution, bitrate, start time, status (live/offline)
- **Viewer Session**: Represents a connected viewer; includes connection time, selected quality, connection status
- **Server Configuration**: Runtime settings including RTMP port, HTTP port, maximum viewers, transcoding quality tiers (1080p, 720p, 480p)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Viewers can watch a stream within 3 seconds of opening the page (when stream is live)
- **SC-002**: Playback latency between broadcaster and viewers remains under 1 second during normal operation
- **SC-003**: System supports 10 simultaneous viewers without video degradation
- **SC-004**: Stream status updates (live/offline, viewer count) reflect actual state within 2 seconds
- **SC-005**: All viewer controls (play/pause, volume, mute, fullscreen) respond within 200ms
- **SC-006**: System operates correctly on all target browsers (Chrome, Firefox, Safari, Edge) on desktop and mobile
- **SC-007**: System functions without any external network connectivity (LAN-only operation verified)
- **SC-008**: UI controls remain accessible and functional on mobile devices (touch-friendly)

## Assumptions

- Viewers and streamer are on the same local network with sufficient bandwidth (typical LAN: 100+ Mbps)
- OBS is pre-configured by the streamer; no OBS setup guidance is in scope
- Browser autoplay policies may require user interaction before audio plays; muted autoplay is acceptable
- No persistent storage required; stream state is ephemeral
- Single server instance; no clustering or high-availability requirements
