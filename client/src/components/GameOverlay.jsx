import React from 'react';

const GameOverlay = ({ children, className = '' }) => {
  return (
    <div className={`absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm ${className}`}>
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border border-gray-700">
        {children}
      </div>
    </div>
  );
};

export default GameOverlay;
