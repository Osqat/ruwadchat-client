Ruwad Chat — Client (React + Vite + Tailwind)

Overview
- Modern, Discord-like voice chat client with text chat on the right.
- Technologies: React 18, Vite, TailwindCSS, Socket.IO client, WebRTC (P2P audio).
- Clean architecture with Context Providers for Socket, Media (audio), and Peer connections.

Server Compatibility
- Relies only on existing backend features:
  - REST: GET /api/messages?room=ROOM
  - Socket events: join, chat-message, typing, stop-typing, mic-status, speaking-status
  - WebRTC signaling: offer, answer, ice-candidate (targeted by socket id)

Quick Start
1) Set environment:
   - Copy .env.example to .env and adjust `VITE_SERVER_URL` if needed.
2) Install deps and run:
   - npm install
   - npm run dev

Env
- VITE_SERVER_URL=http://localhost:3001
- VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
- VITE_TURN_USERNAME=yourTurnUsername
- VITE_TURN_CREDENTIAL=yourTurnCredential

How It Works
- SocketProvider: Manages Socket.IO connection, user join/leave, room state, mic/speaking/typing events.
- MediaProvider: Manages local microphone stream, mute, and speaking detection.
- PeerProvider: Creates/manages RTCPeerConnections and remote audio streams using signaling via Socket.IO.

Joining Rooms
- The join screen asks for username and room. Changing rooms is implemented by disconnecting and rejoining; the backend does not expose a dedicated “leave room” or “switch room” event.

Extending
- Add video: extend MediaProvider to capture video and PeerProvider to add video tracks.
- Room list: add an API to fetch rooms server‑side, then update JoinScreen to present a list.
- Persist settings: store mute state and last room in localStorage.

Production Notes
- Mobile browsers require a user gesture to play audio; this app initializes audio on the join button.
- For NAT traversal at scale, consider TURN servers in PeerProvider’s `iceServers`.
  - Configure via env: `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`.
  - Use your own TURN; public/free relays are unreliable.
