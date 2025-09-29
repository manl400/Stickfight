import { useCallback, useRef, useEffect } from 'react';
import { useGameState } from '../state/GameStateContext';
import { useWebRTC } from './useWebRTC';
import { useRelay } from './useRelay';
import { useSignaling } from './useSignaling';

const WEBRTC_TIMEOUT = 6000; // 6 seconds timeout for WebRTC
const SNAPSHOT_RATE = 100; // 10 Hz (every 100ms)
const INPUT_RATE = 33; // ~30 Hz (every 33ms)

export function useNetworking() {
  const sequenceRef = useRef(0);
  const lastSnapshotRef = useRef(0);
  const lastInputRef = useRef(0);
  const webrtcTimeoutRef = useRef(null);
  const gameStateHandlerRef = useRef(null);
  const inputHandlerRef = useRef(null);

  const { role, roomCode, connectionType } = useGameState();
  const { sendMessage: sendSignalingMessage } = useSignaling();
  const webrtc = useWebRTC();
  const relay = useRelay();

  // Relay fallback function - defined first to avoid circular dependency
  const initiateRelayFallback = useCallback(async () => {
    if (connectionType === 'relay') return; // Already using relay

    console.log('Initiating relay fallback', { role, roomCode });
    
    if (!role || !roomCode) {
      console.error('Cannot initiate relay fallback: missing role or roomCode', { role, roomCode });
      return;
    }
    
    try {
      await relay.connect(role, roomCode);
      
      // Setup message handler for relay
      relay.setMessageHandler((message) => {
        if (message.type === 'input' && inputHandlerRef.current) {
          inputHandlerRef.current(message);
        } else if (message.type === 'state' && gameStateHandlerRef.current) {
          gameStateHandlerRef.current(message);
        }
      });
      
    } catch (error) {
      console.error('Relay fallback failed:', error);
    }
  }, [connectionType, relay, role, roomCode]);

  // Initialize WebRTC connection flow
  const initializeConnection = useCallback(async (turnCredentials) => {
    console.log('Initializing connection', { role, roomCode, turnCredentials });
    
    if (role === 'host') {
      // Host creates offer
      try {
        const offer = await webrtc.createOffer(turnCredentials);
        
        // Send offer via signaling
        sendSignalingMessage({
          type: 'signal',
          payload: { sdp: offer },
        });

        // Setup ICE candidate forwarding
        webrtc.onIceCandidate((candidate) => {
          sendSignalingMessage({
            type: 'signal',
            payload: { ice: candidate },
          });
        });

        // Set timeout for WebRTC connection
        webrtcTimeoutRef.current = setTimeout(() => {
          console.log('WebRTC timeout, falling back to relay');
          initiateRelayFallback();
        }, WEBRTC_TIMEOUT);

      } catch (error) {
        console.error('Failed to create offer:', error);
        initiateRelayFallback();
      }
    }
    // Guest waits for offer and will respond in handleSignalingMessage
  }, [role, roomCode, webrtc, sendSignalingMessage, initiateRelayFallback]);

  const handleSignalingMessage = useCallback(async (message) => {
    switch (message.type) {
      case 'hello-ack':
        // Connection established, start WebRTC flow
        if (message.turn) {
          await initializeConnection(message.turn);
        }
        break;

      case 'signal':
        if (message.payload.sdp) {
          // Handle SDP offer/answer
          if (message.payload.sdp.type === 'offer' && role === 'guest') {
            try {
              const answer = await webrtc.createAnswer(message.payload.sdp, null);
              
              // Send answer via signaling
              sendSignalingMessage({
                type: 'signal',
                payload: { sdp: answer },
              });

              // Setup ICE candidate forwarding
              webrtc.onIceCandidate((candidate) => {
                sendSignalingMessage({
                  type: 'signal',
                  payload: { ice: candidate },
                });
              });

              // Set timeout for WebRTC connection
              webrtcTimeoutRef.current = setTimeout(() => {
                console.log('WebRTC timeout, falling back to relay');
                initiateRelayFallback();
              }, WEBRTC_TIMEOUT);

            } catch (error) {
              console.error('Failed to create answer:', error);
              initiateRelayFallback();
            }
          } else if (message.payload.sdp.type === 'answer' && role === 'host') {
            try {
              await webrtc.handleAnswer(message.payload.sdp);
            } catch (error) {
              console.error('Failed to handle answer:', error);
              initiateRelayFallback();
            }
          }
        } else if (message.payload.ice) {
          // Handle ICE candidate
          try {
            await webrtc.handleIceCandidate(message.payload.ice);
          } catch (error) {
            console.error('Failed to handle ICE candidate:', error);
          }
        }
        break;

      default:
        console.warn('Unknown signaling message:', message.type);
    }
  }, [role, webrtc, sendSignalingMessage, initializeConnection]);

  // Send game state snapshot (host only)
  const sendSnapshot = useCallback((gameState) => {
    if (role !== 'host') return;

    const now = Date.now();
    if (now - lastSnapshotRef.current < SNAPSHOT_RATE) return;

    const snapshot = {
      type: 'state',
      seq: ++sequenceRef.current,
      ts: now,
      payload: {
        players: gameState.players,
        crates: gameState.crates,
        effects: gameState.effects,
        winner: gameState.winner,
      },
    };

    // Try WebRTC first, fallback to relay
    if (!webrtc.sendGameMessage(snapshot)) {
      relay.sendGameMessage(snapshot);
    }

    lastSnapshotRef.current = now;
  }, [role, webrtc, relay]);

  // Send input delta (guest only)
  const sendInput = useCallback((inputState) => {
    if (role !== 'guest') return;

    const now = Date.now();
    if (now - lastInputRef.current < INPUT_RATE) return;

    const inputDelta = {
      type: 'input',
      seq: ++sequenceRef.current,
      ts: now,
      payload: inputState,
    };

    // Try WebRTC first, fallback to relay
    if (!webrtc.sendGameMessage(inputDelta)) {
      relay.sendGameMessage(inputDelta);
    }

    lastInputRef.current = now;
  }, [role, webrtc, relay]);

  // Set handlers for incoming messages
  const setGameStateHandler = useCallback((handler) => {
    gameStateHandlerRef.current = handler;
  }, []);

  const setInputHandler = useCallback((handler) => {
    inputHandlerRef.current = handler;
  }, []);

  // Connection state change handling
  useEffect(() => {
    if (connectionType === 'webrtc' && webrtcTimeoutRef.current) {
      // WebRTC connected successfully, clear timeout
      clearTimeout(webrtcTimeoutRef.current);
      webrtcTimeoutRef.current = null;
    } else if (!connectionType && role && roomCode) {
      // Connection lost, try relay fallback (only if we have role and room)
      console.log('Connection lost, initiating relay fallback', { role, roomCode });
      initiateRelayFallback();
    }
  }, [connectionType, role, roomCode, initiateRelayFallback]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (webrtcTimeoutRef.current) {
        clearTimeout(webrtcTimeoutRef.current);
      }
      webrtc.close();
      relay.disconnect();
    };
  }, [webrtc, relay]);

  return {
    initializeConnection,
    handleSignalingMessage,
    sendSnapshot,
    sendInput,
    setGameStateHandler,
    setInputHandler,
    isWebRTCConnected: webrtc.isConnected,
    isRelayConnected: relay.isConnected,
  };
}
