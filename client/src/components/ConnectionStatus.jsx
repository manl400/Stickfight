import React from 'react';
import { useGameState } from '../state/GameStateContext';

const ConnectionStatus = () => {
  const { isConnected, connectionType, roomCode } = useGameState();

  const getStatusColor = () => {
    if (!isConnected) return 'text-red-400';
    if (connectionType === 'webrtc') return 'text-green-400';
    if (connectionType === 'relay') return 'text-yellow-400';
    return 'text-gray-400';
  };

  const getStatusText = () => {
    if (!isConnected) return '❌ Disconnected';
    if (connectionType === 'webrtc') return '🔒 WebRTC';
    if (connectionType === 'relay') return '⚡ Relay';
    return '⏳ Connecting...';
  };

  return (
    <div className="absolute top-4 left-4 z-10">
      <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-sm">
        <div className="flex items-center space-x-4">
          {roomCode && (
            <div className="text-white">
              <span className="text-gray-300">Room:</span>{' '}
              <span className="font-mono font-bold text-blue-400">{roomCode}</span>
            </div>
          )}
          <div className={`font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionStatus;
