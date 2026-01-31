# Technology Stack

## Backend
- **Runtime**: Node.js with CommonJS modules
- **Framework**: Express.js for HTTP server and static file serving
- **Real-time Communication**: Socket.IO for WebSocket connections
- **WebRTC**: Peer-to-peer voice communication with STUN servers

## Frontend
- **Vanilla JavaScript**: No frameworks, pure DOM manipulation
- **CSS**: Custom styling with CSS Grid and Flexbox layouts
- **WebRTC API**: Native browser APIs for voice streaming
- **Socket.IO Client**: Real-time bidirectional communication

## Architecture Patterns
- **Event-driven**: Socket.IO event handlers for all real-time features
- **Modular Backend**: Separate matchmaking logic in dedicated module
- **Simple Matching**: Country and gender-based algorithm with timezone optimization
- **State Management**: In-memory user state and queue management
- **WebRTC Signaling**: Server-mediated peer connection establishment
- **Conversation Enhancement**: Random conversation starters and quick message system

## Key Dependencies
```json
{
  "express": "^5.2.1",
  "socket.io": "^4.8.1"
}
```

## Common Commands
- **Start Server**: `npm start` (runs `node server/server.js`)
- **Development**: Server runs on port 4000 by default
- **Static Files**: Served from `/public` directory
- **Admin Dashboard**: Available at `/admin.html`

## Configuration
- **Port**: 4000 (configurable via PORT constant)
- **STUN Server**: `stun:stun.l.google.com:19302`
- **File Structure**: CommonJS with `require()` imports