import React, { useState, useCallback } from 'react';
import Game from './components/Game';
import Lobby from './components/Lobby';
import { GameStateProvider, useGameState } from './state/GameStateContext';
import Toast from './components/Toast';

function AppContent() {
  const { gameState, error, clearError } = useGameState();
  
  return (
    <div className="w-screen h-screen bg-gray-900 text-white relative overflow-hidden">
      {error && (
        <Toast
          message={error}
          type="error"
          onClose={clearError}
        />
      )}
      
      {gameState === 'lobby' && <Lobby />}
      {(gameState === 'connecting' || gameState === 'fighting' || gameState === 'post-match') && <Game />}
      
      <div className="absolute bottom-4 right-4 text-xs text-gray-500">
        <div>ESC: Pause/Help | R: Rematch</div>
        <div>Host: A/D/W/J/K/E | Guest: ←/→/↑/1/2/0</div>
      </div>
    </div>
  );
}

function App() {
  return (
    <GameStateProvider>
      <AppContent />
    </GameStateProvider>
  );
}

export default App;
