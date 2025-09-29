import { useCallback, useRef, useEffect } from 'react';
import { useGameState } from '../state/GameStateContext';

const RELAY_URL = process.env.VITE_RELAY_URL || 'ws://localhost:3002/relay';
const RECONNECT_DELAY_BASE = 1000; // Base delay for exponential backoff
const MAX_RECONNECT_DELAY = 30000; // Max 30 seconds
const HEARTBEAT_INTERVAL = 10000; // 10 seconds

export function useRelay() {
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const messageHandlerRef = useRef(null);

  const { connectionEstablished, connectionLost, setError } = useGameState();

  const calculateBackoffDelay = useCallback(() => {
    const delay = Math.min(
      RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttemptsRef.current),
      MAX_RECONNECT_DELAY
    );
    return delay + Math.random() * 1000; // Add jitter
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const connect = useCallback((role, roomCode) => {
    console.log('Relay connect called with:', { role, roomCode });
    
    if (!role || !roomCode) {
      const error = new Error(`Missing required parameters: role=${role}, roomCode=${roomCode}`);
      console.error('Relay connect error:', error);
      return Promise.reject(error);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(RELAY_URL);
        wsRef.current = ws;

        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Relay connection timeout'));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log('Relay WebSocket connected');
          
          // Send role message to identify this connection
          ws.send(JSON.stringify({
            type: 'role',
            role,
            room: roomCode,
          }));
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('Relay WebSocket error:', error);
          reject(new Error('Relay connection failed'));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleRelayMessage(message, resolve, reject);
          } catch (error) {
            console.error('Failed to parse relay message:', error);
          }
        };

        ws.onclose = () => {
          console.log('Relay WebSocket closed');
          stopHeartbeat();
          connectionLost();
          wsRef.current = null;
          
          // Attempt reconnection with exponential backoff
          const delay = calculateBackoffDelay();
          reconnectAttemptsRef.current++;
          
          reconnectTimerRef.current = setTimeout(() => {
            if (reconnectAttemptsRef.current < 10) { // Max 10 attempts
              connect(role, roomCode).catch(() => {
                // Failed to reconnect, will try again
              });
            } else {
              setError('Failed to maintain relay connection after multiple attempts');
            }
          }, delay);
        };
      } catch (error) {
        reject(error);
      }
    });
  }, [calculateBackoffDelay, stopHeartbeat, connectionLost, setError]);

  const handleRelayMessage = useCallback((message, resolve, reject) => {
    switch (message.type) {
      case 'role-ack':
        // Successfully connected to relay
        reconnectAttemptsRef.current = 0; // Reset backoff counter
        startHeartbeat();
        connectionEstablished('relay');
        if (resolve) resolve();
        break;
        
      case 'input':
      case 'state':
        // Forward game messages to the message handler
        if (messageHandlerRef.current) {
          messageHandlerRef.current(message);
        }
        break;
        
      case 'pong':
        // Heartbeat response - connection is alive
        break;
        
      case 'player_disconnected':
        setError(`Other player disconnected from relay`);
        break;
        
      case 'error':
        const errorMsg = message.message || message.code;
        setError(`Relay error: ${errorMsg}`);
        if (reject) reject(new Error(errorMsg));
        break;
        
      default:
        console.warn('Unknown relay message type:', message.type);
    }
  }, [startHeartbeat, connectionEstablished, setError]);

  const sendGameMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const setMessageHandler = useCallback((handler) => {
    messageHandlerRef.current = handler;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    stopHeartbeat();
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    reconnectAttemptsRef.current = 0;
    messageHandlerRef.current = null;
  }, [stopHeartbeat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    sendGameMessage,
    setMessageHandler,
    disconnect,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
