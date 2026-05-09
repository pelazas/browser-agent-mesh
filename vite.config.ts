import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@agents': resolve(__dirname, 'src/agents'),
      '@webllm': resolve(__dirname, 'src/webllm'),
      '@workers': resolve(__dirname, 'src/workers'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    proxy: {
      '/signaling': {
        target: 'ws://localhost:4444',
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          yjs: ['yjs', 'y-webrtc'],
          libp2p: ['libp2p', '@libp2p/webrtc', '@chainsafe/libp2p-gossipsub'],
          webllm: ['@mlc-ai/web-llm'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
