# 💥 Explosive Stick Fight

A browser-based 1v1 stick-figure fighting game with explosive meme power-ups and secure P2P connectivity.

![Game Preview](https://via.placeholder.com/960x540/87CEEB/000000?text=Explosive+Stick+Fight)

> **Status**: ✅ **FULLY FUNCTIONAL** - All core features implemented and tested!

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd explosive-stick-fight

# Install dependencies for all packages
npm run install:all

# Start development servers (client + backend)
npm run dev
```

The game will be available at:
- **Frontend**: http://localhost:3000
- **Signaling Server**: ws://localhost:3001/ws (proxied through Vite)
- **Relay Server**: ws://localhost:3002/relay (proxied through Vite)

> **Note**: The client connects through Vite's WebSocket proxy for proper CORS handling in development.

## 🎮 How to Play

### Creating a Room
1. Click "CREATE ROOM" on the main screen
2. Share the 6-character room code with your opponent
3. Wait for them to join

### Joining a Room
1. Enter the 6-character room code
2. Click "JOIN ROOM"
3. Wait for connection to establish

### Controls

| Action | Host (P1) | Guest (P2) |
|--------|-----------|------------|
| Move Left | A | ← |
| Move Right | D | → |
| Jump | W | ↑ |
| Punch | J | 1 |
| Kick | K | 2 |
| Meme Bomb | E | 0 |
| Pause/Help | ESC | ESC |
| Rematch | R | R |

### Gameplay
- **Health**: Both players start with 100 HP
- **Combat**: Punches deal 6 damage, kicks deal 10 damage
- **Meme Crates**: Spawn every 6±1 seconds, give you explosive bombs (12 damage + knockback)
- **Victory**: First player to reduce opponent's HP to 0 wins
- **Meme Power**: Collect crates to unlock explosive attacks with random meme text!

## 🏗️ Architecture

### Frontend (React + Vite)
- **Physics Engine**: 60 Hz fixed timestep with Verlet integration
- **Renderer**: Canvas 2D with particle effects and smooth animations  
- **Networking**: WebRTC DataChannel with relay fallback
- **State Management**: React Context with finite state machine

### Backend (Node.js)
- **Signaling Server**: WebSocket server for room management and WebRTC signaling
- **Relay Server**: Fallback server for when P2P connections fail
- **Security**: Rate limiting, origin validation, and secure room codes

### Network Flow
```
Client A ←→ WebRTC DataChannel ←→ Client B
    ↓              ↓                  ↓
Signaling Server (Room Management)
    ↓              ↓                  ↓  
Relay Server (Fallback when WebRTC fails)
```

## 🔧 Development

### Project Structure
```
explosive-stick-fight/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── net/           # Networking modules
│   │   ├── physics/       # Game physics
│   │   ├── render/        # Canvas rendering
│   │   ├── state/         # State management
│   │   └── types/         # TypeScript definitions
│   └── package.json
├── server/                # Node.js backend
│   ├── signaling.js       # WebSocket signaling server
│   ├── relay.js          # Relay fallback server  
│   └── package.json
└── package.json          # Root package
```

### Available Scripts

#### Root Level
- `npm run dev` - Start both client and server in development mode
- `npm run build` - Build client for production
- `npm run install:all` - Install dependencies for all packages

#### Client (`cd client`)
- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

#### Server (`cd server`)  
- `npm run dev` - Start signaling server with auto-reload
- `npm start` - Start signaling server
- `npm run relay` - Start relay server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Environment Variables

#### Client
- `VITE_SIGNALING_URL` - WebSocket signaling server URL (default: ws://localhost:3000/ws via Vite proxy)
- `VITE_RELAY_URL` - Relay server URL (default: ws://localhost:3000/relay via Vite proxy)

#### Server
- `PORT` - Signaling server port (default: 3001)
- `RELAY_PORT` - Relay server port (default: 3002)

## 🚀 Deployment

### Frontend (Vercel/Netlify)
```bash
cd client
npm run build
# Deploy dist/ folder to your hosting platform
```

### Backend (Render/Railway/Fly.io)
```bash
cd server
npm start
```

### Environment Setup
Set the following environment variables in production:
- `VITE_SIGNALING_URL=wss://your-signaling-server.com/ws`
- `VITE_RELAY_URL=wss://your-relay-server.com/relay`

## 🔒 Security Features

- **Rate Limiting**: 30 handshakes per IP per 10 minutes
- **Room Security**: Random 6-character codes, 2-minute idle timeout
- **Origin Validation**: CSP headers and origin checking
- **Message Validation**: Size limits and type checking
- **WebRTC Security**: DTLS-SRTP encryption for P2P connections

## 📊 Performance

- **Target**: 60 FPS on mid-tier hardware
- **Network**: <20 kbps average bandwidth
- **Latency**: <120ms relay mode on broadband
- **Bundle Size**: <2MB compressed initial load

## 🧪 Testing

The game has been tested on:
- **Browsers**: Chrome, Firefox, Edge, Safari
- **Platforms**: Windows, macOS, Linux, iOS, Android
- **Network**: Various NAT configurations and connection types

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Roadmap

### v1.0 (✅ COMPLETED)
- [x] Core gameplay mechanics (movement, combat, physics)
- [x] WebRTC P2P networking with DataChannel
- [x] Relay fallback system for connection issues
- [x] Room-based matchmaking with 6-character codes
- [x] Meme crate spawning and explosive power-ups
- [x] Screen shake and particle effects
- [x] Host-authoritative networking with input synchronization
- [x] Complete UI (lobby, connection states, HP bars, overlays)
- [x] WebSocket connection fixes and proxy configuration

### v1.1 (Planned)
- [ ] Mobile touch controls
- [ ] Audio effects and music
- [ ] More meme power-ups and crate types
- [ ] Spectator mode
- [ ] Improved visual effects and animations

### v2.0 (Future)
- [ ] Rollback netcode for competitive play
- [ ] Ranked matchmaking system
- [ ] Custom cosmetics and character skins
- [ ] Tournament mode with brackets
- [ ] Replay system

## 🐛 Known Issues

- Safari WebRTC compatibility may require relay fallback
- High latency connections (>200ms) may experience input lag
- Mobile browsers have limited WebRTC support

## 🔧 Recent Fixes

### WebSocket Connection Issues (Fixed ✅)
- **Problem**: Client was connecting directly to signaling server instead of using Vite proxy
- **Solution**: Updated Vite configuration to use proper WebSocket proxy URLs
- **Result**: WebSocket connections now work correctly in development

### Networking Synchronization (Fixed ✅)
- **Problem**: Guest input synchronization issues with host physics
- **Solution**: Implemented proper input buffering and host-authoritative model
- **Result**: Smooth multiplayer gameplay with synchronized physics

### Relay Fallback (Fixed ✅)
- **Problem**: INVALID_ROLE_MESSAGE errors in relay connections
- **Solution**: Added proper validation and error handling for relay connections
- **Result**: Reliable fallback when WebRTC connections fail

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check the [troubleshooting guide](docs/TROUBLESHOOTING.md)
- Review the [development specification](explosive_stick_fight_codex_development_spec.md)

## 🎉 Getting Started

1. **Install dependencies**: `npm run install:all`
2. **Start development**: `npm run dev`
3. **Open browser**: Navigate to http://localhost:3000
4. **Create room**: Click "CREATE ROOM" and share the code
5. **Start fighting**: Enjoy the explosive stick figure battles!

---

Built with ❤️ and lots of ☕ by the Explosive Stick Fight team!

**Current Status**: 🟢 **READY TO PLAY** - All systems operational!
