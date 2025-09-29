import { useState, useEffect, useCallback } from 'react';

// Key mappings for host (P1) and guest (P2)
const HOST_KEYS = {
  moveLeft: 'KeyA',
  moveRight: 'KeyD', 
  jump: 'KeyW',
  punch: 'KeyJ',
  kick: 'KeyK',
  memeBomb: 'KeyE',
};

const GUEST_KEYS = {
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  jump: 'ArrowUp', 
  punch: 'Digit1',
  kick: 'Digit2',
  memeBomb: 'Digit0',
};

export function useInput() {
  const [keys, setKeys] = useState({});
  const [inputBuffer, setInputBuffer] = useState([]);

  const handleKeyDown = useCallback((event) => {
    const { code } = event;
    
    // Prevent default for game keys to avoid browser shortcuts
    const gameKeys = [...Object.values(HOST_KEYS), ...Object.values(GUEST_KEYS), 'Escape', 'Enter', 'KeyR'];
    if (gameKeys.includes(code)) {
      event.preventDefault();
    }

    setKeys(prev => {
      if (prev[code]) return prev; // Already pressed
      
      const newKeys = { ...prev, [code]: true };
      
      // Add to input buffer for networking
      setInputBuffer(buffer => [...buffer, {
        type: 'keydown',
        code,
        timestamp: Date.now(),
      }]);
      
      return newKeys;
    });
  }, []);

  const handleKeyUp = useCallback((event) => {
    const { code } = event;
    
    setKeys(prev => {
      if (!prev[code]) return prev; // Already released
      
      const newKeys = { ...prev };
      delete newKeys[code];
      
      // Add to input buffer for networking
      setInputBuffer(buffer => [...buffer, {
        type: 'keyup',
        code,
        timestamp: Date.now(),
      }]);
      
      return newKeys;
    });
  }, []);

  // Clear input buffer and return buffered inputs
  const flushInputBuffer = useCallback(() => {
    const buffer = inputBuffer;
    setInputBuffer([]);
    return buffer;
  }, [inputBuffer]);

  // Get processed input state for a specific role
  const getInputState = useCallback((role) => {
    const keyMap = role === 'host' ? HOST_KEYS : GUEST_KEYS;
    
    return {
      moveLeft: !!keys[keyMap.moveLeft],
      moveRight: !!keys[keyMap.moveRight],
      jump: !!keys[keyMap.jump],
      punch: !!keys[keyMap.punch],
      kick: !!keys[keyMap.kick],
      memeBomb: !!keys[keyMap.memeBomb],
    };
  }, [keys]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Clear keys when window loses focus
    const handleBlur = () => {
      setKeys({});
    };
    
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleKeyDown, handleKeyUp]);

  return {
    keys,
    inputBuffer,
    flushInputBuffer,
    getInputState,
  };
}
