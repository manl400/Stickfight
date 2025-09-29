import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/relay': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  },
  define: {
    'process.env.VITE_SIGNALING_URL': JSON.stringify(
      process.env.VITE_SIGNALING_URL || 'ws://localhost:3000/ws'
    ),
    'process.env.VITE_RELAY_URL': JSON.stringify(
      process.env.VITE_RELAY_URL || 'ws://localhost:3000/relay'
    ),
  },
});
