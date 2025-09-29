import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

const PORT = process.env.RELAY_PORT || 3002;
const MAX_MESSAGE_SIZE = 8 * 1024; // 8 KB
const MAX_MESSAGES_PER_SECOND = 60;
const HEARTBEAT_INTERVAL = 10 * 1000; // 10 seconds

// In-memory storage for relay sessions
const sessions = new Map();
const rateLimits = new Map();

class RelaySession {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.host = null;
    this.guest = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.messageCount = 0;
  }

  addPlayer(ws, role) {
    if (role === 'host') {
      if (this.host) {
        this.host.close(1000, 'Replaced by new host');
      }
      this.host = ws;
    } else if (role === 'guest') {
      if (this.guest) {
        this.guest.close(1000, 'Replaced by new guest');
      }
      this.guest = ws;
    }
    
    ws.role = role;
    ws.session = this.roomCode;
    this.lastActivity = Date.now();
  }

  removePlayer(ws) {
    if (this.host === ws) {
      this.host = null;
    } else if (this.guest === ws) {
      this.guest = null;
    }
    this.lastActivity = Date.now();
  }

  isEmpty() {
    return !this.host && !this.guest;
  }

  isExpired() {
    const now = Date.now();
    const idleTime = now - this.lastActivity;
    return idleTime > 5 * 60 * 1000; // 5 minutes idle
  }

  forwardMessage(fromWs, message) {
    const targetWs = fromWs === this.host ? this.guest : this.host;
    
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(JSON.stringify(message));
      this.messageCount++;
      this.lastActivity = Date.now();
      return true;
    }
    
    return false;
  }

  getStats() {
    return {
      roomCode: this.roomCode,
      hasHost: !!this.host,
      hasGuest: !!this.guest,
      messageCount: this.messageCount,
      uptime: Date.now() - this.createdAt,
    };
  }
}

function checkRateLimit(ws) {
  const ip = ws.remoteAddress;
  const now = Date.now();
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, {
      messages: [],
      lastReset: now,
    });
  }
  
  const limits = rateLimits.get(ip);
  
  // Reset counter every second
  if (now - limits.lastReset >= 1000) {
    limits.messages = [];
    limits.lastReset = now;
  }
  
  // Check rate
  if (limits.messages.length >= MAX_MESSAGES_PER_SECOND) {
    throw new Error('RATE_LIMITED');
  }
  
  limits.messages.push(now);
}

function handleMessage(ws, data) {
  try {
    // Check message size
    if (data.length > MAX_MESSAGE_SIZE) {
      throw new Error('MESSAGE_TOO_LARGE');
    }
    
    // Rate limiting
    checkRateLimit(ws);
    
    const message = JSON.parse(data);
    const ip = ws.remoteAddress;
    
    console.log(`[${new Date().toISOString()}] Relay message from ${ip}: ${message.type}`);
    
    switch (message.type) {
      case 'role':
        handleRoleMessage(ws, message);
        break;
        
      case 'input':
        handleInputMessage(ws, message);
        break;
        
      case 'state':
        handleStateMessage(ws, message);
        break;
        
      case 'ping':
        handlePingMessage(ws);
        break;
        
      default:
        console.warn(`Unknown relay message type: ${message.type}`);
    }
  } catch (error) {
    console.error('Error handling relay message:', error);
    sendError(ws, error.message || 'INTERNAL_ERROR');
  }
}

function handleRoleMessage(ws, message) {
  console.log('Handling role message:', JSON.stringify(message, null, 2));
  const { role, room } = message;
  
  if (!role || !room) {
    console.error('Invalid role message - missing fields:', { role, room, message });
    throw new Error('INVALID_ROLE_MESSAGE');
  }
  
  if (role !== 'host' && role !== 'guest') {
    throw new Error('INVALID_ROLE');
  }
  
  // Get or create session
  let session = sessions.get(room);
  if (!session) {
    session = new RelaySession(room);
    sessions.set(room, session);
    console.log(`Created relay session for room ${room}`);
  }
  
  // Add player to session
  session.addPlayer(ws, role);
  
  // Send acknowledgment
  ws.send(JSON.stringify({
    type: 'role-ack',
    role,
    room,
  }));
  
  console.log(`${role} connected to relay session ${room}`);
}

function handleInputMessage(ws, message) {
  if (!ws.session) {
    throw new Error('NOT_IN_SESSION');
  }
  
  const session = sessions.get(ws.session);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }
  
  // Only guests should send input messages
  if (ws.role !== 'guest') {
    console.warn(`Host attempting to send input message in session ${ws.session}`);
    return;
  }
  
  // Forward to host
  const forwarded = session.forwardMessage(ws, message);
  if (!forwarded) {
    console.warn(`Failed to forward input message in session ${ws.session} - no host connected`);
  }
}

function handleStateMessage(ws, message) {
  if (!ws.session) {
    throw new Error('NOT_IN_SESSION');
  }
  
  const session = sessions.get(ws.session);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }
  
  // Only hosts should send state messages
  if (ws.role !== 'host') {
    console.warn(`Guest attempting to send state message in session ${ws.session}`);
    return;
  }
  
  // Forward to guest
  const forwarded = session.forwardMessage(ws, message);
  if (!forwarded) {
    console.warn(`Failed to forward state message in session ${ws.session} - no guest connected`);
  }
}

function handlePingMessage(ws) {
  ws.send(JSON.stringify({ type: 'pong' }));
  
  if (ws.session) {
    const session = sessions.get(ws.session);
    if (session) {
      session.lastActivity = Date.now();
    }
  }
}

function sendError(ws, code, message = null) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'error',
      code,
      message,
    }));
  }
}

function cleanupExpiredSessions() {
  const expired = [];
  
  for (const [roomCode, session] of sessions.entries()) {
    if (session.isEmpty() || session.isExpired()) {
      expired.push(roomCode);
    }
  }
  
  expired.forEach(roomCode => {
    sessions.delete(roomCode);
    console.log(`Relay session ${roomCode} expired and removed`);
  });
  
  // Clean up rate limit entries
  const oneMinuteAgo = Date.now() - 60 * 1000;
  for (const [ip, limits] of rateLimits.entries()) {
    if (limits.lastReset < oneMinuteAgo) {
      rateLimits.delete(ip);
    }
  }
}

// Create HTTP server for health checks
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    const sessionStats = Array.from(sessions.values()).map(s => s.getStats());
    
    res.end(JSON.stringify({
      status: 'ok',
      sessions: sessions.size,
      totalMessages: sessionStats.reduce((sum, s) => sum + s.messageCount, 0),
      uptime: process.uptime(),
      sessionDetails: sessionStats,
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/relay',
});

wss.on('connection', (ws, req) => {
  ws.remoteAddress = req.socket.remoteAddress;
  
  console.log(`[${new Date().toISOString()}] New relay connection from ${ws.remoteAddress}`);
  
  ws.on('message', (data) => {
    handleMessage(ws, data);
  });
  
  ws.on('close', () => {
    console.log(`[${new Date().toISOString()}] Relay connection closed: ${ws.remoteAddress}`);
    
    if (ws.session) {
      const session = sessions.get(ws.session);
      if (session) {
        session.removePlayer(ws);
        
        // Notify other player about disconnection
        const otherWs = ws === session.host ? session.guest : session.host;
        if (otherWs && otherWs.readyState === WebSocket.OPEN) {
          otherWs.send(JSON.stringify({
            type: 'player_disconnected',
            role: ws.role,
          }));
        }
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error(`Relay WebSocket error from ${ws.remoteAddress}:`, error);
  });
});

// Cleanup timer
setInterval(cleanupExpiredSessions, 30000); // Every 30 seconds

httpServer.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Relay server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/relay`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down relay server gracefully');
  httpServer.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down relay server gracefully');
  httpServer.close(() => {
    process.exit(0);
  });
});
