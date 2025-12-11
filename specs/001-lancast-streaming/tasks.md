# Tasks: LANCast - LAN Video Streaming Platform

**Input**: Design documents from `/specs/001-lancast-streaming/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/

**Tests**: Not explicitly requested in specification. Manual browser testing per quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root
- Backend: `src/server/`
- Frontend: `src/public/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create project directory structure per plan.md in src/server/, src/public/css/, src/public/js/, media/live/
- [X] T002 Initialize Node.js project with package.json including node-media-server, express, ws dependencies
- [X] T003 [P] Create default configuration file in src/config.json with RTMP port 1935, HTTP port 8080, quality presets
- [X] T004 [P] Add .gitignore with node_modules/, media/live/ entries
- [X] T005 [P] Download and vendor hls.js library to src/public/js/vendor/hls.min.js for offline operation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Implement configuration loader with environment variable overrides in src/server/config.js
- [X] T007 Implement application state management (Stream, ViewerSessions) in src/server/state.js
- [X] T008 [P] Create main entry point with graceful shutdown handling in src/server/index.js
- [X] T009 [P] Set up Express HTTP server skeleton in src/server/http.js
- [X] T010 Add npm start script to package.json that runs src/server/index.js

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Stream Broadcasting (Priority: P1) 🎯 MVP

**Goal**: Accept RTMP stream from OBS, transcode to HLS with 3 quality tiers

**Independent Test**: Connect OBS to rtmp://[server-ip]:1935/live/stream, verify HLS files appear in media/live/

### Implementation for User Story 1

- [X] T011 [US1] Configure Node-Media-Server for RTMP ingestion in src/server/rtmp.js
- [X] T012 [US1] Implement prePublish handler to reject second streamer in src/server/rtmp.js
- [X] T013 [US1] Implement postPublish handler to update stream state to live in src/server/rtmp.js
- [X] T014 [US1] Implement donePublish handler to update stream state to offline in src/server/rtmp.js
- [X] T015 [US1] Implement FFmpeg transcoder spawning for 1080p/720p/480p HLS output in src/server/transcoder.js
- [X] T016 [US1] Implement transcoder cleanup (kill FFmpeg, delete HLS files) on stream end in src/server/transcoder.js
- [X] T017 [US1] Wire RTMP events to transcoder start/stop in src/server/index.js
- [X] T018 [US1] Extract stream metadata (resolution, bitrate, publisher IP) from RTMP session in src/server/rtmp.js

**Checkpoint**: OBS can stream to server, HLS files are generated in media/live/

---

## Phase 4: User Story 2 - Watch Stream (Priority: P1) 🎯 MVP

**Goal**: Viewers can open web page and watch live stream with auto-play

**Independent Test**: Open http://[server-ip]:8080 in browser while streaming, verify video plays

### Implementation for User Story 2

- [X] T019 [US2] Create base HTML page structure in src/public/index.html
- [X] T020 [US2] Add video element with HLS.js initialization in src/public/js/player.js
- [X] T021 [US2] Implement Safari native HLS fallback detection in src/public/js/player.js
- [X] T022 [US2] Configure Express to serve static files from src/public/ in src/server/http.js
- [X] T023 [US2] Configure Express to serve HLS files from media/live/ with correct MIME types in src/server/http.js
- [X] T024 [US2] Implement "Waiting for stream" state display in src/public/js/player.js
- [X] T025 [US2] Implement auto-play when stream becomes available (muted for browser policy) in src/public/js/player.js
- [X] T026 [US2] Implement "Stream ended" state and return to waiting in src/public/js/player.js
- [X] T027 [P] [US2] Add responsive base CSS for video container in src/public/css/style.css

**Checkpoint**: Viewers can watch stream in browser, see waiting/live/ended states

---

## Phase 5: User Story 3 - Playback Controls (Priority: P2)

**Goal**: Viewers have play/pause, volume, mute, and fullscreen controls

**Independent Test**: Verify each control works during active stream playback

### Implementation for User Story 3

- [X] T028 [US3] Add control bar HTML with play/pause, volume, mute, fullscreen buttons in src/public/index.html
- [X] T029 [US3] Implement play/pause toggle (local playback only) in src/public/js/controls.js
- [X] T030 [US3] Implement volume slider (0-100%) in src/public/js/controls.js
- [X] T031 [US3] Implement mute button with visual state toggle in src/public/js/controls.js
- [X] T032 [US3] Implement fullscreen toggle with Fullscreen API in src/public/js/controls.js
- [X] T033 [US3] Style control bar with CSS (auto-hide, touch-friendly) in src/public/css/style.css
- [X] T034 [US3] Wire controls.js to player.js video element in src/public/index.html

**Checkpoint**: All playback controls functional during stream

---

## Phase 6: User Story 4 - Stream Status Dashboard (Priority: P2)

**Goal**: Display live/offline status, viewer count, stream info in real-time

**Independent Test**: Verify status updates within 2 seconds when stream starts/stops or viewers join/leave

### Implementation for User Story 4

- [X] T035 [US4] Implement WebSocket server attached to Express in src/server/websocket.js
- [X] T036 [US4] Implement viewer session tracking (add/remove on connect/disconnect) in src/server/websocket.js
- [X] T037 [US4] Implement viewer limit enforcement (max 10, reject with ROOM_FULL) in src/server/websocket.js
- [X] T038 [US4] Implement status broadcast on stream state change in src/server/websocket.js
- [X] T039 [US4] Implement status broadcast on viewer count change in src/server/websocket.js
- [X] T040 [US4] Implement GET /api/status REST endpoint as WebSocket fallback in src/server/http.js
- [X] T041 [US4] Add status display HTML elements (live badge, viewer count, resolution, bitrate) in src/public/index.html
- [X] T042 [US4] Implement WebSocket client with auto-reconnect in src/public/js/status.js
- [X] T043 [US4] Update UI on status message receive in src/public/js/status.js
- [X] T044 [US4] Style status display (live badge, info panel) in src/public/css/style.css

**Checkpoint**: Real-time status updates working, viewer count accurate

---

## Phase 7: User Story 5 - Quality Selection (Priority: P3)

**Goal**: Viewers can select stream quality (1080p, 720p, 480p)

**Independent Test**: Switch quality mid-stream, verify quality changes without restart

### Implementation for User Story 5

- [X] T045 [US5] Add quality selector UI element in src/public/index.html
- [X] T046 [US5] Implement quality level switching via HLS.js API in src/public/js/controls.js
- [X] T047 [US5] Display current quality and available options in src/public/js/controls.js
- [X] T048 [US5] Style quality selector (dropdown or buttons) in src/public/css/style.css

**Checkpoint**: Quality switching works with <2 second transition

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T049 [P] Add graceful shutdown to close WebSocket connections and kill FFmpeg in src/server/index.js
- [X] T050 [P] Add console logging for stream events (start, stop, viewer join/leave) in src/server/index.js
- [X] T051 [P] Mobile-responsive CSS refinements (touch targets, landscape mode) in src/public/css/style.css
- [X] T052 Verify LAN-only operation (no external network calls) by testing with internet disabled
- [X] T053 Run quickstart.md verification checklist end-to-end
- [X] T054 [P] Add README.md with setup instructions and OBS configuration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - Core streaming capability
- **User Story 2 (Phase 4)**: Depends on User Story 1 - Needs HLS output to display
- **User Stories 3-5 (Phases 5-7)**: Depend on User Story 2 - Need player to enhance
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (Stream Broadcasting)**: Foundation only - Independent
- **User Story 2 (Watch Stream)**: Requires US1 (needs HLS files to play)
- **User Story 3 (Playback Controls)**: Requires US2 (needs player to control)
- **User Story 4 (Status Dashboard)**: Can run parallel to US3 after US2
- **User Story 5 (Quality Selection)**: Requires US2 (needs player with HLS.js)

### Parallel Opportunities

**Within Phase 1 (Setup)**:
```
T003, T004, T005 can run in parallel
```

**Within Phase 2 (Foundational)**:
```
T008, T009 can run in parallel (after T006, T007)
```

**Within Phase 4 (US2)**:
```
T027 can run in parallel with other US2 tasks
```

**After Phase 4 (US2) completes**:
```
US3 (Playback Controls) and US4 (Status Dashboard) can run in parallel
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Stream Broadcasting)
4. Complete Phase 4: User Story 2 (Watch Stream)
5. **STOP and VALIDATE**: Stream from OBS, watch in browser
6. Deploy/demo if ready - this is a functional MVP!

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Broadcasting) → OBS can stream
3. Add US2 (Watch Stream) → **MVP complete!** Viewers can watch
4. Add US3 (Controls) → Better UX with play/pause/volume/fullscreen
5. Add US4 (Status) → Real-time status and viewer count
6. Add US5 (Quality) → Quality selection for varied devices
7. Polish → Production-ready

### Sequential Execution (Single Developer)

Execute phases 1-8 in order. Within each phase, execute tasks sequentially unless marked [P].

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- US1 and US2 together form the MVP (basic streaming works)
- US3-US5 are enhancements that improve UX
- Commit after each task or logical group
- Test with OBS after completing US1, add browser testing after US2
- HLS.js must be vendored locally for LAN-only operation (T005)
