import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import crypto from 'crypto';

const PORT = process.env.PORT || 3001;
const ROOM_TTL_IDLE = 2 * 60 * 1000; // 2 minutes idle
const ROOM_TTL_MAX = 30 * 60 * 1000; // 30 minutes max
const HEARTBEAT_INTERVAL = 20 * 1000; // 20 seconds

// In-memory storage for rooms and rate limiting
const rooms = new Map();
const rateLimits = new Map();

// Base32 alphabet for room codes (no 0, 1, 8, 9 to avoid confusion)
const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456';

class Room {
  constructor(code) {
    this.code = code;
    this.host = null;
    this.guest = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.heartbeatTimer = null;
  }

  addPlayer(ws, role) {
    if (role === 'host') {
      if (this.host) throw new Error('ROOM_FULL');
      this.host = ws;
      ws.role = 'host';
      ws.room = this.code;
      this.startHeartbeat();
    } else if (role === 'guest') {
      if (this.guest) throw new Error('ROOM_FULL');
      this.guest = ws;
      ws.role = 'guest';
      ws.room = this.code;
    }
    this.lastActivity = Date.now();
  }

  removePlayer(ws) {
    if (this.host === ws) {
      this.host = null;
      this.stopHeartbeat();
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
    const totalTime = now - this.createdAt;
    
    return idleTime > ROOM_TTL_IDLE || totalTime > ROOM_TTL_MAX;
  }

  startHeartbeat() {
    if (this.heartbeatTimer) return;
    
    this.heartbeatTimer = setInterval(() => {
      if (this.host && this.host.readyState === WebSocket.OPEN) {
        this.host.send(JSON.stringify({ type: 'ping' }));
      } else {
        this.stopHeartbeat();
      }
    }, HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  broadcast(message, excludeWs = null) {
    const messageStr = JSON.stringify(message);
    
    if (this.host && this.host !== excludeWs && this.host.readyState === WebSocket.OPEN) {
      this.host.send(messageStr);
    }
    
    if (this.guest && this.guest !== excludeWs && this.guest.readyState === WebSocket.OPEN) {
      this.guest.send(messageStr);
    }
  }
}

function generateRoomCode() {
  const bytes = crypto.randomBytes(4);
  let code = '';
  
  for (let i = 0; i < 6; i++) {
    const index = bytes[i % 4] % BASE32_ALPHABET.length;
    code += BASE32_ALPHABET[index];
  }
  
  return code;
}

function generateTurnCredentials(roomCode) {
  // Mock TURN credentials - in production, use a real TURN server
  return {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ],
    username: `user_${roomCode}`,
    credential: crypto.randomBytes(16).toString('hex'),
  };
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowSize = 10 * 60 * 1000; // 10 minutes
  const maxHandshakes = 30;
  const maxConcurrentRooms = 5;
  
  if (!rateLimits.has(ip)) {
    rateLimits.set(ip, {
      handshakes: [],
      rooms: 0,
    });
  }
  
  const limits = rateLimits.get(ip);
  
  // Clean old handshakes
  limits.handshakes = limits.handshakes.filter(time => now - time < windowSize);
  
  // Check handshake rate
  if (limits.handshakes.length >= maxHandshakes) {
    throw new Error('RATE_LIMITED');
  }
  
  // Check concurrent rooms
  if (limits.rooms >= maxConcurrentRooms) {
    throw new Error('RATE_LIMITED');
  }
  
  limits.handshakes.push(now);
}

function handleMessage(ws, data) {
  try {
    const message = JSON.parse(data);
    const ip = ws.remoteAddress;
    
    console.log(`[${new Date().toISOString()}] Message from ${ip}: ${message.type}`);
    
    switch (message.type) {
      case 'hello':
        handleHello(ws, message);
        break;
        
      case 'signal':
        handleSignal(ws, message);
        break;
        
      case 'pong':
        // Heartbeat response
        if (ws.room) {
          const room = rooms.get(ws.room);
          if (room) room.lastActivity = Date.now();
        }
        break;
        
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendError(ws, error.message || 'INTERNAL_ERROR');
  }
}

function handleHello(ws, message) {
  const { role, room: roomCode } = message;
  const ip = ws.remoteAddress;
  
  // Rate limiting
  checkRateLimit(ip);
  
  if (role === 'host') {
    // Create new room
    let code;
    let attempts = 0;
    
    do {
      code = generateRoomCode();
      attempts++;
      if (attempts > 10) throw new Error('ROOM_GENERATION_FAILED');
    } while (rooms.has(code));
    
    const room = new Room(code);
    room.addPlayer(ws, 'host');
    rooms.set(code, room);
    
    // Update rate limits
    const limits = rateLimits.get(ip);
    limits.rooms++;
    
    const turnCredentials = generateTurnCredentials(code);
    
    ws.send(JSON.stringify({
      type: 'hello-ack',
      room: code,
      role: 'host',
      turn: turnCredentials,
    }));
    
    console.log(`Room ${code} created by host ${ip}`);
    
  } else if (role === 'guest') {
    // Join existing room
    if (!roomCode) throw new Error('ROOM_CODE_REQUIRED');
    
    const room = rooms.get(roomCode);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.isExpired()) {
      rooms.delete(roomCode);
      throw new Error('ROOM_EXPIRED');
    }
    
    room.addPlayer(ws, 'guest');
    
    // Update rate limits
    const limits = rateLimits.get(ip);
    limits.rooms++;
    
    const turnCredentials = generateTurnCredentials(roomCode);
    
    ws.send(JSON.stringify({
      type: 'hello-ack',
      room: roomCode,
      role: 'guest',
      turn: turnCredentials,
    }));
    
    console.log(`Guest ${ip} joined room ${roomCode}`);
    
  } else {
    throw new Error('INVALID_ROLE');
  }
}

function handleSignal(ws, message) {
  if (!ws.room) throw new Error('NOT_IN_ROOM');
  
  const room = rooms.get(ws.room);
  if (!room) throw new Error('ROOM_NOT_FOUND');
  
  // Forward signal to the other player
  room.broadcast(message, ws);
  room.lastActivity = Date.now();
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

function cleanupExpiredRooms() {
  const expired = [];
  
  for (const [code, room] of rooms.entries()) {
    if (room.isEmpty() || room.isExpired()) {
      expired.push(code);
    }
  }
  
  expired.forEach(code => {
    const room = rooms.get(code);
    if (room) {
      room.stopHeartbeat();
      rooms.delete(code);
      console.log(`Room ${code} expired and removed`);
    }
  });
  
  // Clean up rate limit entries older than 1 hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [ip, limits] of rateLimits.entries()) {
    limits.handshakes = limits.handshakes.filter(time => time > oneHourAgo);
    if (limits.handshakes.length === 0 && limits.rooms === 0) {
      rateLimits.delete(ip);
    }
  }
}

// Create HTTP server for health checks
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      uptime: process.uptime(),
    }));
  } else if (req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      relayUrl: process.env.RELAY_URL || 'ws://localhost:3002/relay',
      turnServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
      ],
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/ws',
  verifyClient: (info) => {
    // Allow connections from localhost during development
    const origin = info.origin;
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'null', // For file:// protocol during development
    ];
    
    console.log('WebSocket connection attempt from origin:', origin);
    
    if (process.env.NODE_ENV === 'production') {
      // In production, validate origin more strictly
      return allowedOrigins.includes(origin);
    }
    
    // In development, allow all connections
    return true;
  },
});

wss.on('connection', (ws, req) => {
  ws.remoteAddress = req.socket.remoteAddress;
  
  console.log(`[${new Date().toISOString()}] New connection from ${ws.remoteAddress}`);
  
  ws.on('message', (data) => {
    console.log(`[${new Date().toISOString()}] Received message from ${ws.remoteAddress}:`, data.toString());
    handleMessage(ws, data);
  });
  
  ws.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] WebSocket error from ${ws.remoteAddress}:`, error);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`[${new Date().toISOString()}] Connection closed: ${ws.remoteAddress}, code: ${code}, reason: ${reason}`);
    
    if (ws.room) {
      const room = rooms.get(ws.room);
      if (room) {
        room.removePlayer(ws);
        
        // Notify other player
        room.broadcast({
          type: 'player_disconnected',
          role: ws.role,
        });
        
        // Update rate limits
        const ip = ws.remoteAddress;
        const limits = rateLimits.get(ip);
        if (limits) {
          limits.rooms = Math.max(0, limits.rooms - 1);
        }
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error from ${ws.remoteAddress}:`, error);
  });
});

// Cleanup timer
setInterval(cleanupExpiredRooms, 30000); // Every 30 seconds

httpServer.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Signaling server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Config endpoint: http://localhost:${PORT}/config`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    process.exit(0);
  });
});
