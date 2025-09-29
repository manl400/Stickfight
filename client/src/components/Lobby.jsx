import React, { useState, useCallback } from 'react';
import { useGameState } from '../state/GameStateContext';
import { useSignaling } from '../net/useSignaling';
import { useNetworking } from '../net/useNetworking';

const Lobby = () => {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  const { setRole, setRoomCode, startConnecting, setError } = useGameState();
  const { createRoom, joinRoom } = useSignaling();
  const networking = useNetworking();

  const handleCreateRoom = useCallback(async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      setRole('host');
      startConnecting();
      const roomCode = await createRoom();
      setRoomCode(roomCode);
      
      // Initialize networking for host
      // Wait for guest to join before starting connection
      console.log('Host waiting for guest to join...');
    } catch (error) {
      setError(`Failed to create room: ${error.message}`);
      setIsCreating(false);
    }
  }, [isCreating, setRole, startConnecting, setRoomCode, setError, createRoom, networking]);

  const handleJoinRoom = useCallback(async () => {
    if (isJoining || !roomCodeInput.trim()) return;
    
    const code = roomCodeInput.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }

    setIsJoining(true);
    try {
      setRole('guest');
      setRoomCode(code);
      startConnecting();
      await joinRoom(code);
      
      // Initialize networking for guest
      // Guest joining should trigger the connection flow
      console.log('Guest joined, starting connection...');
    } catch (error) {
      setError(`Failed to join room: ${error.message}`);
      setIsJoining(false);
    }
  }, [isJoining, roomCodeInput, setRole, setRoomCode, startConnecting, setError, joinRoom, networking]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleJoinRoom();
    }
  }, [handleJoinRoom]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-500 mb-2">
            💥 EXPLOSIVE
          </h1>
          <h2 className="text-3xl font-bold text-white mb-4">STICK FIGHT</h2>
          <p className="text-gray-300 text-sm">
            1v1 stick-figure fighting with explosive meme power-ups!
          </p>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleCreateRoom}
            disabled={isCreating || isJoining}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 disabled:scale-100 focus:outline-none focus:ring-4 focus:ring-green-500/50"
          >
            {isCreating ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                Creating Room...
              </div>
            ) : (
              '🎮 CREATE ROOM'
            )}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-800 text-gray-400">OR</span>
            </div>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="Enter 6-character room code"
              maxLength={6}
              className="w-full bg-gray-700 text-white text-center text-xl font-mono tracking-widest py-3 px-4 rounded-xl border-2 border-gray-600 focus:border-blue-500 focus:outline-none transition-colors"
              disabled={isCreating || isJoining}
            />
            
            <button
              onClick={handleJoinRoom}
              disabled={isCreating || isJoining || !roomCodeInput.trim()}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 disabled:scale-100 focus:outline-none focus:ring-4 focus:ring-blue-500/50"
            >
              {isJoining ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                  Joining Room...
                </div>
              ) : (
                '🚀 JOIN ROOM'
              )}
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700">
          <div className="text-center text-sm text-gray-400">
            <p className="mb-2">🎯 Controls Preview:</p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-semibold text-green-400">Host (P1)</p>
                <p>A/D: Move | W: Jump</p>
                <p>J: Punch | K: Kick | E: Bomb</p>
              </div>
              <div>
                <p className="font-semibold text-blue-400">Guest (P2)</p>
                <p>←/→: Move | ↑: Jump</p>
                <p>1: Punch | 2: Kick | 0: Bomb</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
