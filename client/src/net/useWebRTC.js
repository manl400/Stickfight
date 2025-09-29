import { useCallback, useRef, useEffect } from 'react';
import { useGameState } from '../state/GameStateContext';

const WEBRTC_TIMEOUT = 6000; // 6 seconds as per spec
const RECONNECT_TIMEOUT = 5000; // 5 seconds stable before closing relay

export function useWebRTC() {
  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const turnCredentialsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  
  const { connectionEstablished, connectionLost, setError } = useGameState();

  const createPeerConnection = useCallback((turnCredentials) => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    // Add TURN servers if provided
    if (turnCredentials) {
      config.iceServers.push({
        urls: turnCredentials.urls,
        username: turnCredentials.username,
        credential: turnCredentials.credential,
      });
    }

    const pc = new RTCPeerConnection(config);
    
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        connectionEstablished('webrtc');
        
        // Set reconnect timer - if stable for 5 seconds, we can close relay
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          // Signal that WebRTC is stable and relay can be closed
          // This would be handled by the networking orchestrator
        }, RECONNECT_TIMEOUT);
        
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        connectionLost();
        
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      }
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      setupDataChannel(channel);
    };

    return pc;
  }, [connectionEstablished, connectionLost]);

  const setupDataChannel = useCallback((channel) => {
    dataChannelRef.current = channel;
    
    channel.onopen = () => {
      console.log('DataChannel opened');
      connectionEstablished('webrtc');
    };
    
    channel.onclose = () => {
      console.log('DataChannel closed');
      connectionLost();
    };
    
    channel.onerror = (error) => {
      console.error('DataChannel error:', error);
      setError('DataChannel error occurred');
    };
    
    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // Handle incoming game messages (state snapshots or input deltas)
        handleGameMessage(message);
      } catch (error) {
        console.error('Failed to parse DataChannel message:', error);
      }
    };
  }, [connectionEstablished, connectionLost, setError]);

  const handleGameMessage = useCallback((message) => {
    // This will be integrated with the game state management
    switch (message.type) {
      case 'state':
        // Handle host snapshot for guest
        break;
      case 'input':
        // Handle guest input for host
        break;
      default:
        console.warn('Unknown game message type:', message.type);
    }
  }, []);

  const createOffer = useCallback(async (turnCredentials) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    turnCredentialsRef.current = turnCredentials;
    const pc = createPeerConnection(turnCredentials);
    pcRef.current = pc;

    // Create data channel (host creates, guest receives)
    const dataChannel = pc.createDataChannel('gameData', {
      ordered: true,
      maxPacketLifeTime: 1000, // 1 second max age for game data
    });
    
    setupDataChannel(dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    return offer;
  }, [createPeerConnection, setupDataChannel]);

  const createAnswer = useCallback(async (offer, turnCredentials) => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    turnCredentialsRef.current = turnCredentials;
    const pc = createPeerConnection(turnCredentials);
    pcRef.current = pc;

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    return answer;
  }, [createPeerConnection]);

  const handleAnswer = useCallback(async (answer) => {
    if (!pcRef.current) {
      throw new Error('No peer connection available');
    }
    
    await pcRef.current.setRemoteDescription(answer);
  }, []);

  const handleIceCandidate = useCallback(async (candidate) => {
    if (!pcRef.current) {
      console.warn('Received ICE candidate but no peer connection available');
      return;
    }
    
    try {
      await pcRef.current.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }, []);

  const sendGameMessage = useCallback((message) => {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const close = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  // Setup ICE candidate forwarding
  const onIceCandidate = useCallback((callback) => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          callback(event.candidate);
        }
      };
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      close();
    };
  }, [close]);

  return {
    createOffer,
    createAnswer,
    handleAnswer,
    handleIceCandidate,
    onIceCandidate,
    sendGameMessage,
    close,
    isConnected: dataChannelRef.current?.readyState === 'open',
  };
}
