import { useCallback, useRef, useEffect } from 'react';
import { useGameState } from '../state/GameStateContext';

const SIGNALING_URL = process.env.VITE_SIGNALING_URL || 'ws://localhost:3001/ws';

export function useSignaling() {
  const wsRef = useRef(null);
  const { setError, connectionEstablished } = useGameState();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Attempting to connect to:', SIGNALING_URL);
        const ws = new WebSocket(SIGNALING_URL);
        wsRef.current = ws;

        const timeout = setTimeout(() => {
          console.log('WebSocket connection timeout');
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        ws.onopen = () => {
          console.log('WebSocket connected successfully, readyState:', ws.readyState);
          clearTimeout(timeout);
          resolve();
        };

        ws.onerror = (error) => {
          console.error('WebSocket connection error:', error);
          clearTimeout(timeout);
          reject(new Error('WebSocket connection failed'));
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason, 'wasClean:', event.wasClean);
          wsRef.current = null;
        };

        // Don't set up global message handler here - let room functions handle their own messages
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }, []);

  const handleSignalingMessage = useCallback((message) => {
    console.log('Handling signaling message:', message);
    switch (message.type) {
      case 'hello-ack':
        // Store room code and TURN credentials for WebRTC setup
        if (message.room && window.networkingHandler) {
          // Forward to networking system to start WebRTC flow
          window.networkingHandler(message);
        }
        break;
      
      case 'signal':
        // Handle WebRTC signaling (SDP/ICE)
        // Forward to networking system
        if (window.networkingHandler) {
          window.networkingHandler(message);
        }
        break;
      
      case 'error':
        setError(`Signaling error: ${message.message || message.code}`);
        break;
      
      default:
        console.warn('Unknown signaling message type:', message.type);
    }
  }, [setError]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not connected');
    }
  }, []);

  const setupGlobalMessageHandler = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleSignalingMessage(message);
        } catch (error) {
          console.error('Failed to parse signaling message:', error);
        }
      };
    }
  }, [handleSignalingMessage]);

  const createRoom = useCallback(async () => {
    try {
      console.log('Creating room...');
      await connect();
      console.log('Connected, sending hello message...');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('Room creation timeout');
          reject(new Error('Room creation timeout'));
        }, 10000);

        const handleMessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('Received signaling message in createRoom:', message);
            
            if (message.type === 'hello-ack' && message.room) {
              console.log('✅ Room created successfully:', message.room);
              clearTimeout(timeout);
              wsRef.current.removeEventListener('message', handleMessage);
              setupGlobalMessageHandler(); // Set up handler for WebRTC signaling
              resolve(message.room);
            } else if (message.type === 'error') {
              console.error('❌ Server error:', message);
              clearTimeout(timeout);
              wsRef.current.removeEventListener('message', handleMessage);
              reject(new Error(message.message || message.code));
            } else {
              console.log('Ignoring message type:', message.type);
            }
          } catch (error) {
            console.error('Error parsing signaling message:', error);
          }
        };

        // Remove any existing message handler and set up our specific one
        if (wsRef.current.onmessage) {
          wsRef.current.onmessage = null;
        }
        wsRef.current.addEventListener('message', handleMessage);
        
        // Send hello message
        console.log('Sending hello message for host, WebSocket readyState:', wsRef.current.readyState);
        const helloMessage = { type: 'hello', role: 'host' };
        console.log('Hello message:', helloMessage);
        wsRef.current.send(JSON.stringify(helloMessage));
      });
    } catch (error) {
      console.error('Error in createRoom:', error);
      throw error;
    }
  }, [connect, setupGlobalMessageHandler]);

  const joinRoom = useCallback(async (roomCode) => {
    try {
      console.log('Joining room:', roomCode);
      await connect();
      console.log('Connected, sending hello message...');
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('Room join timeout');
          reject(new Error('Room join timeout'));
        }, 10000);

        const handleMessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('Received signaling message in joinRoom:', message);
            
            if (message.type === 'hello-ack') {
              console.log('✅ Successfully joined room:', roomCode);
              clearTimeout(timeout);
              wsRef.current.removeEventListener('message', handleMessage);
              setupGlobalMessageHandler(); // Set up handler for WebRTC signaling
              resolve();
            } else if (message.type === 'error') {
              console.error('❌ Server error:', message);
              clearTimeout(timeout);
              wsRef.current.removeEventListener('message', handleMessage);
              reject(new Error(message.message || message.code));
            } else {
              console.log('Ignoring message type:', message.type);
            }
          } catch (error) {
            console.error('Error parsing signaling message:', error);
          }
        };

        // Remove any existing message handler and set up our specific one
        if (wsRef.current.onmessage) {
          wsRef.current.onmessage = null;
        }
        wsRef.current.addEventListener('message', handleMessage);
        
        // Send hello message
        console.log('Sending hello message for guest, room:', roomCode, 'WebSocket readyState:', wsRef.current.readyState);
        const helloMessage = { type: 'hello', role: 'guest', room: roomCode };
        console.log('Hello message:', helloMessage);
        wsRef.current.send(JSON.stringify(helloMessage));
      });
    } catch (error) {
      console.error('Error in joinRoom:', error);
      throw error;
    }
  }, [connect, setupGlobalMessageHandler]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    createRoom,
    joinRoom,
    sendMessage,
    setupGlobalMessageHandler,
    disconnect,
  };
}
