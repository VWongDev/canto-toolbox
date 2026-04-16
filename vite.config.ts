import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],
  base: './', // Use relative paths for Chrome extension
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // TypeScript entry points
        background: 'src/background/background.ts',
        content: 'src/popup/content.ts',
        stats: 'src/stats/stats.html',
        'stats-script': 'src/stats/stats.ts'
      }
    },
    copyPublicDir: false
  },
  publicDir: 'src/data' // Pre-processed dictionary files
});

