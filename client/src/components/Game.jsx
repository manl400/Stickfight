import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGameState } from '../state/GameStateContext';
import { useRaf } from '../hooks/useRaf';
import { useInput } from '../hooks/useInput';
import { GameRenderer } from '../render/GameRenderer';
import { PhysicsEngine } from '../physics/PhysicsEngine';
import { useNetworking } from '../net/useNetworking';
import ConnectionStatus from './ConnectionStatus';
import GameOverlay from './GameOverlay';
import PauseOverlay from './PauseOverlay';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

const Game = () => {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const physicsRef = useRef(null);
  const gameStateRef = useRef({
    players: {
      p1: {
        hp: 100,
        pos: { x: 200, y: 420 },
        vel: { x: 0, y: 0 },
        facing: 1,
        bombReady: true,
        grounded: true,
      },
      p2: {
        hp: 100,
        pos: { x: 760, y: 420 },
        vel: { x: 0, y: 0 },
        facing: -1,
        bombReady: true,
        grounded: true,
      },
    },
    crates: [],
    effects: [],
    winner: null,
    lastCrateSpawn: Date.now(),
  });

  const [isPaused, setIsPaused] = useState(false);
  const { gameState, role, roomCode, connectionType, matchResult, matchEnded } = useGameState();
  const { keys, getInputState } = useInput();
  const networking = useNetworking();

  // Initialize renderer and physics engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    rendererRef.current = new GameRenderer(canvas);
    physicsRef.current = new PhysicsEngine();

    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
      }
    };
  }, []);

  // Setup networking handlers
  useEffect(() => {
    // Handle incoming state snapshots (guest only)
    networking.setGameStateHandler((message) => {
      if (role === 'guest' && message.type === 'state') {
        // Apply host state to local game state
        const hostState = message.payload;
        gameStateRef.current.players = hostState.players;
        gameStateRef.current.crates = hostState.crates;
        gameStateRef.current.effects = hostState.effects;
        gameStateRef.current.winner = hostState.winner;
      }
    });

    // Handle incoming input deltas (host only)
    networking.setInputHandler((message) => {
      if (role === 'host' && message.type === 'input' && physicsRef.current) {
        // Apply guest input to physics engine
        physicsRef.current.addGuestInput(message.payload);
      }
    });

    // Setup signaling message handler
    window.networkingHandler = networking.handleSignalingMessage;
    console.log('Networking handler set up', { role, roomCode });

    return () => {
      window.networkingHandler = null;
    };
  }, [networking, role, roomCode]);

  // Game loop
  const gameLoop = useCallback((deltaTime) => {
    if (gameState !== 'fighting' || isPaused || !physicsRef.current || !rendererRef.current) {
      return;
    }

    const physics = physicsRef.current;
    const renderer = rendererRef.current;
    const state = gameStateRef.current;

    // Fixed timestep physics (60 Hz)
    const fixedDelta = 1 / 60;
    
    // Update physics
    physics.update(state, keys, role, fixedDelta);

    // Network synchronization
    if (role === 'host') {
      // Send state snapshots to guest
      networking.sendSnapshot(state);
    } else if (role === 'guest' && physicsRef.current) {
      // Send input to host
      const inputState = physicsRef.current.getInputStateFromKeys(keys, role);
      networking.sendInput(inputState);
    }

    // Check for match end conditions
    if (state.players.p1.hp <= 0 && !state.winner) {
      state.winner = 'p2';
      matchEnded({ winner: 'p2', reason: 'Player 1 defeated' });
    } else if (state.players.p2.hp <= 0 && !state.winner) {
      state.winner = 'p1';
      matchEnded({ winner: 'p1', reason: 'Player 2 defeated' });
    }

    // Render frame
    renderer.render(state, {
      roomCode,
      connectionType,
      role,
      deltaTime: fixedDelta,
    });
  }, [gameState, isPaused, keys, role, roomCode, connectionType, matchEnded, networking, getInputState]);

  useRaf(gameLoop);

  // Handle rematch
  const handleRematch = useCallback(() => {
    if (gameState === 'post-match') {
      // Reset game state
      gameStateRef.current = {
        players: {
          p1: {
            hp: 100,
            pos: { x: 200, y: 420 },
            vel: { x: 0, y: 0 },
            facing: 1,
            bombReady: true,
            grounded: true,
          },
          p2: {
            hp: 100,
            pos: { x: 760, y: 420 },
            vel: { x: 0, y: 0 },
            facing: -1,
            bombReady: true,
            grounded: true,
          },
        },
        crates: [],
        effects: [],
        winner: null,
        lastCrateSpawn: Date.now(),
      };
    }
  }, [gameState]);

  // Keyboard event handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (gameState === 'fighting') {
          setIsPaused(!isPaused);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (gameState === 'post-match') {
          handleRematch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, isPaused, handleRematch]);

  return (
    <div className="relative w-screen h-screen bg-black flex items-center justify-center">
      {/* Connection Status */}
      <ConnectionStatus />

      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        className="bg-gradient-to-b from-sky-400 to-sky-200 rounded-lg shadow-2xl"
        style={{
          imageRendering: 'pixelated',
          maxWidth: '100vw',
          maxHeight: '100vh',
          objectFit: 'contain',
        }}
      />

      {/* Game Overlays */}
      {gameState === 'connecting' && (
        <GameOverlay>
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold mb-2">Connecting...</h2>
            <p className="text-gray-300">
              {role === 'host' 
                ? `Room Code: ${roomCode || '------'}`
                : `Joining room: ${roomCode}`
              }
            </p>
            {role === 'host' && roomCode && (
              <p className="text-sm text-gray-400 mt-2">
                Share this code with your opponent
              </p>
            )}
            <div className="mt-4 text-xs text-gray-500">
              <p>Establishing WebRTC connection...</p>
              <p>Will fallback to relay if needed</p>
            </div>
          </div>
        </GameOverlay>
      )}

      {isPaused && gameState === 'fighting' && (
        <PauseOverlay onResume={() => setIsPaused(false)} />
      )}

      {gameState === 'post-match' && matchResult && (
        <GameOverlay>
          <div className="text-center">
            <h2 className="text-4xl font-bold mb-4 text-yellow-400">
              {matchResult.winner === 'p1' ? '🏆 Player 1 Wins!' : '🏆 Player 2 Wins!'}
            </h2>
            <p className="text-xl mb-6 text-gray-300">{matchResult.reason}</p>
            <div className="space-y-4">
              <button
                onClick={handleRematch}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-green-500/50"
              >
                🔄 REMATCH (R)
              </button>
            </div>
          </div>
        </GameOverlay>
      )}
    </div>
  );
};

export default Game;
