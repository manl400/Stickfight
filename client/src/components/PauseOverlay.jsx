import React from 'react';
import GameOverlay from './GameOverlay';
import { useGameState } from '../state/GameStateContext';

const PauseOverlay = ({ onResume }) => {
  const { role, connectionType } = useGameState();

  return (
    <GameOverlay>
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-6 text-yellow-400">⏸️ Game Paused</h2>
        
        <div className="space-y-6">
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-blue-400">🎮 Controls</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-green-400 mb-2">Host (Player 1)</p>
                <div className="space-y-1 text-left">
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">A</kbd> / <kbd className="bg-gray-600 px-2 py-1 rounded text-xs">D</kbd> Move</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">W</kbd> Jump</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">J</kbd> Punch (6 damage)</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">K</kbd> Kick (10 damage)</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">E</kbd> Meme Bomb (12 damage)</p>
                </div>
              </div>
              <div>
                <p className="font-semibold text-blue-400 mb-2">Guest (Player 2)</p>
                <div className="space-y-1 text-left">
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">←</kbd> / <kbd className="bg-gray-600 px-2 py-1 rounded text-xs">→</kbd> Move</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">↑</kbd> Jump</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">1</kbd> Punch (6 damage)</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">2</kbd> Kick (10 damage)</p>
                  <p><kbd className="bg-gray-600 px-2 py-1 rounded text-xs">0</kbd> Meme Bomb (12 damage)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-purple-400">🎯 Gameplay</h3>
            <div className="text-sm text-left space-y-2">
              <p>• Both players start with <span className="text-green-400 font-semibold">100 HP</span></p>
              <p>• <span className="text-yellow-400 font-semibold">Meme crates</span> spawn every 6±1 seconds</p>
              <p>• Collect crates to get explosive <span className="text-red-400 font-semibold">meme bombs</span></p>
              <p>• Bombs deal damage + knockback + meme text!</p>
              <p>• First player to reach 0 HP loses</p>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-cyan-400">🌐 Connection</h3>
            <div className="text-sm">
              <p>You are playing as: <span className="font-semibold text-yellow-400">{role === 'host' ? 'Host (P1)' : 'Guest (P2)'}</span></p>
              <p>Connection type: <span className={`font-semibold ${connectionType === 'webrtc' ? 'text-green-400' : 'text-yellow-400'}`}>
                {connectionType === 'webrtc' ? '🔒 WebRTC (P2P)' : '⚡ Relay Server'}
              </span></p>
              {connectionType === 'relay' && (
                <p className="text-yellow-300 text-xs mt-1">Using relay fallback for optimal connectivity</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onResume}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-500/50"
            >
              ▶️ RESUME GAME (ESC)
            </button>
            
            <div className="text-xs text-gray-400 space-y-1">
              <p><kbd className="bg-gray-600 px-2 py-1 rounded">ESC</kbd> Resume/Pause</p>
              <p><kbd className="bg-gray-600 px-2 py-1 rounded">R</kbd> Rematch (after game ends)</p>
            </div>
          </div>
        </div>
      </div>
    </GameOverlay>
  );
};

export default PauseOverlay;
