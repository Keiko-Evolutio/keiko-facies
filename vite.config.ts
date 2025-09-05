import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { visualizer } from 'rollup-plugin-visualizer';
import svgr from 'vite-plugin-svgr';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';

// @ts-ignore
export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  const isProd = command === 'build';

  return {
    plugins: [
      react(),
      tailwindcss(),
      tsconfigPaths(),
      svgr(),
      isProd && visualizer({ open: true }),
    ].filter(Boolean) as any[],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        // Proxy für Worklet-Dateien im Dev-Modus: .js → .ts
        '/worklets': {
          target: 'http://localhost:5173',
          rewrite: (path) =>
            path.replace(/^\/worklets\/(.*)\.js$/, '/src/utils/audio-worklet/$1.ts'),
        },
      },
      hmr: true,
    },

    build: {
      target: 'ES2023',
      sourcemap: isDev,
      rollupOptions: {
        input: {
          main: 'index.html',
          'buffered-playback-worklet': './src/utils/audio-worklet/buffered-playback-worklet.ts',
          'pcm-converter-worklet': './src/utils/audio-worklet/pcm-converter-worklet.ts',
        },
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules/react')) return 'vendor-react';
            if (id.includes('node_modules')) return 'vendor';
          },
          entryFileNames: (assetInfo) => {
            if (
              assetInfo.name === 'buffered-playback-worklet' ||
              assetInfo.name === 'pcm-converter-worklet'
            ) {
              return 'worklets/[name].js';
            }
            return 'assets/[name]-[hash].js';
          },
        },
      },
    },

    optimizeDeps: {
      include: ['react', 'react-dom'],
    },

    envPrefix: 'VITE_',
  };
});
