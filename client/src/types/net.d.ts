// Network message types as specified in the documentation

export interface HelloMessage {
  type: 'hello';
  role: 'host' | 'guest';
  room?: string;
}

export interface HelloAckMessage {
  type: 'hello-ack';
  room: string;
  role: 'host' | 'guest';
  turn?: {
    urls: string[];
    username: string;
    credential: string;
  };
}

export interface SignalMessage {
  type: 'signal';
  payload: {
    sdp?: RTCSessionDescriptionInit;
    ice?: RTCIceCandidateInit;
  };
}

export interface ErrorMessage {
  type: 'error';
  code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'BAD_ORIGIN' | 'RATE_LIMITED';
  message?: string;
}

export interface InputDelta {
  type: 'input';
  seq: number;
  ts: number;
  payload: Record<string, boolean>;
}

export interface Player {
  hp: number;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  facing: 1 | -1;
  bombReady: boolean;
  attacking?: boolean;
  attackType?: 'punch' | 'kick';
  attackTimer?: number;
}

export interface Crate {
  id: string;
  x: number;
  y: number;
  type: 'meme';
}

export interface Effect {
  id: string;
  kind: 'explosion' | 'hit' | 'meme_text';
  x?: number;
  y?: number;
  ttl: number;
  text?: string;
}

export interface HostSnapshot {
  type: 'state';
  seq: number;
  ts: number;
  payload: {
    players: {
      p1: Player;
      p2: Player;
    };
    crates: Crate[];
    effects: Effect[];
    winner: 'p1' | 'p2' | null;
  };
}

export interface RoleMessage {
  type: 'role';
  role: 'host' | 'guest';
  room: string;
}

export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

export type SignalingMessage = HelloMessage | HelloAckMessage | SignalMessage | ErrorMessage;
export type RelayMessage = RoleMessage | InputDelta | HostSnapshot | PingMessage | PongMessage;
export type GameMessage = InputDelta | HostSnapshot;
