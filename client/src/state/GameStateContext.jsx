import React, { createContext, useContext, useReducer, useCallback } from 'react';

// Game state machine: lobby -> connecting -> fighting -> post-match -> (back to lobby or fighting)
const GAME_STATES = {
  LOBBY: 'lobby',
  CONNECTING: 'connecting', 
  FIGHTING: 'fighting',
  POST_MATCH: 'post-match',
  ERROR: 'error',
};

const initialState = {
  gameState: GAME_STATES.LOBBY,
  role: null, // 'host' | 'guest'
  roomCode: null,
  isConnected: false,
  connectionType: null, // 'webrtc' | 'relay'
  error: null,
  matchResult: null, // { winner: 'p1' | 'p2', reason: string }
};

function gameStateReducer(state, action) {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    
    case 'SET_ROOM_CODE':
      return { ...state, roomCode: action.payload };
    
    case 'START_CONNECTING':
      return { 
        ...state, 
        gameState: GAME_STATES.CONNECTING,
        error: null 
      };
    
    case 'CONNECTION_ESTABLISHED':
      return { 
        ...state, 
        isConnected: true,
        connectionType: action.payload.type,
        gameState: GAME_STATES.FIGHTING 
      };
    
    case 'CONNECTION_LOST':
      return { 
        ...state, 
        isConnected: false,
        connectionType: null 
      };
    
    case 'MATCH_ENDED':
      return { 
        ...state, 
        gameState: GAME_STATES.POST_MATCH,
        matchResult: action.payload 
      };
    
    case 'START_REMATCH':
      return { 
        ...state, 
        gameState: GAME_STATES.FIGHTING,
        matchResult: null 
      };
    
    case 'RETURN_TO_LOBBY':
      return { 
        ...initialState 
      };
    
    case 'SET_ERROR':
      return { 
        ...state, 
        error: action.payload.message,
        gameState: action.payload.critical ? GAME_STATES.ERROR : state.gameState
      };
    
    case 'CLEAR_ERROR':
      return { 
        ...state, 
        error: null 
      };
    
    default:
      return state;
  }
}

const GameStateContext = createContext();

export function GameStateProvider({ children }) {
  const [state, dispatch] = useReducer(gameStateReducer, initialState);

  const setRole = useCallback((role) => {
    dispatch({ type: 'SET_ROLE', payload: role });
  }, []);

  const setRoomCode = useCallback((code) => {
    dispatch({ type: 'SET_ROOM_CODE', payload: code });
  }, []);

  const startConnecting = useCallback(() => {
    dispatch({ type: 'START_CONNECTING' });
  }, []);

  const connectionEstablished = useCallback((type) => {
    dispatch({ type: 'CONNECTION_ESTABLISHED', payload: { type } });
  }, []);

  const connectionLost = useCallback(() => {
    dispatch({ type: 'CONNECTION_LOST' });
  }, []);

  const matchEnded = useCallback((result) => {
    dispatch({ type: 'MATCH_ENDED', payload: result });
  }, []);

  const startRematch = useCallback(() => {
    dispatch({ type: 'START_REMATCH' });
  }, []);

  const returnToLobby = useCallback(() => {
    dispatch({ type: 'RETURN_TO_LOBBY' });
  }, []);

  const setError = useCallback((error, critical = false) => {
    dispatch({ type: 'SET_ERROR', payload: { message: error, critical } });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const value = {
    ...state,
    setRole,
    setRoomCode,
    startConnecting,
    connectionEstablished,
    connectionLost,
    matchEnded,
    startRematch,
    returnToLobby,
    setError,
    clearError,
  };

  return (
    <GameStateContext.Provider value={value}>
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState() {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  return context;
}
