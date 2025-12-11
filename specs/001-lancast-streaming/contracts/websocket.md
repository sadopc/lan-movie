# WebSocket Protocol: LANCast

**Feature**: 001-lancast-streaming
**Date**: 2025-12-11

## Connection

**Endpoint**: `ws://{host}:{port}/ws`

Example: `ws://192.168.1.100:8080/ws`

## Message Format

All messages are JSON-encoded.

### Server → Client Messages

#### Status Update

Sent immediately on connection and whenever stream state changes.

```typescript
interface StatusMessage {
  type: 'status';
  data: {
    live: boolean;
    viewerCount: number;
    streamInfo?: {
      resolution: string;   // e.g., "1920x1080"
      bitrate: number;      // kbps
      startTime: string;    // ISO 8601
    };
  };
}
```

**Example - Stream Offline**:
```json
{
  "type": "status",
  "data": {
    "live": false,
    "viewerCount": 0
  }
}
```

**Example - Stream Live**:
```json
{
  "type": "status",
  "data": {
    "live": true,
    "viewerCount": 5,
    "streamInfo": {
      "resolution": "1920x1080",
      "bitrate": 5000,
      "startTime": "2025-12-11T15:30:00.000Z"
    }
  }
}
```

#### Error

Sent when connection is rejected.

```typescript
interface ErrorMessage {
  type: 'error';
  data: {
    code: string;
    message: string;
  };
}
```

**Error Codes**:

| Code | Message | Cause |
|------|---------|-------|
| `ROOM_FULL` | "Room full - maximum viewers reached" | Viewer limit (10) exceeded |

**Example**:
```json
{
  "type": "error",
  "data": {
    "code": "ROOM_FULL",
    "message": "Room full - maximum viewers reached"
  }
}
```

### Client → Server Messages

No client-to-server messages in MVP. The connection is primarily for receiving status updates.

## Connection Lifecycle

### Connect

1. Client opens WebSocket connection
2. Server checks viewer count
   - If at limit: Send error message, close connection
   - Otherwise: Add to viewers, send current status
3. Server broadcasts updated viewer count to all clients

### Disconnect

1. Client closes connection (or timeout after 30s no ping)
2. Server removes from viewers
3. Server broadcasts updated viewer count to all clients

### Reconnection

Client should implement exponential backoff:

```javascript
const reconnect = (attempt = 0) => {
  const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
  setTimeout(() => {
    const ws = new WebSocket(url);
    ws.onerror = () => reconnect(attempt + 1);
  }, delay);
};
```

## Broadcast Events

The server broadcasts to all connected viewers when:

| Event | Trigger | Message |
|-------|---------|---------|
| Stream starts | RTMP publish | `status` with `live: true` |
| Stream ends | RTMP disconnect | `status` with `live: false` |
| Viewer joins | WebSocket connect | `status` with updated `viewerCount` |
| Viewer leaves | WebSocket close | `status` with updated `viewerCount` |

## Example Client Implementation

```javascript
class StatusConnection {
  constructor(url) {
    this.url = url;
    this.reconnectAttempt = 0;
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        this.onStatus(msg.data);
      } else if (msg.type === 'error') {
        this.onError(msg.data);
      }
    };

    this.ws.onclose = () => {
      this.reconnect();
    };

    this.ws.onerror = () => {
      this.ws.close();
    };
  }

  reconnect() {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  onStatus(data) {
    // Override in application
    console.log('Status:', data);
  }

  onError(data) {
    // Override in application
    console.error('Error:', data);
  }
}
```
