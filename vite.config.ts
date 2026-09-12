import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest })
  ],
  base: './', // Use relative paths for Chrome extension
  resolve: {
    alias: {
      // ppu-paddle-ocr imports the default onnxruntime-web build, which bundles
      // its WebAssembly glue and makes Rollup emit both the 14 MB plain and the
      // 28 MB jsep binaries into dist/. This alias points every importer at the
      // extern-wasm build instead: it loads the runtime from `wasmPaths` at
      // run time, so nothing is emitted and the copy vendored into public/ocr/
      // is the only one shipped. Aliasing rather than importing it directly in
      // src/ocr/engine.ts also keeps the library and our own configuration on a
      // single ORT instance — two copies would mean `ort.env` settings applied
      // to one that the other never reads.
      'onnxruntime-web': fileURLToPath(
        new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url),
      ),
    },
  },
  css: {
    preprocessorOptions: {
      // Vite 5 still drives Sass through the legacy JS API, which Dart Sass
      // deprecated and removes in 2.0. The modern compiler is already bundled;
      // opting in now silences the warning and is what Vite 6 defaults to.
      scss: { api: 'modern-compiler' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // TypeScript entry points
        background: 'src/service-worker.ts',
        content: 'src/popup/content.ts',
        stats: 'src/stats/stats.html',
        'stats-script': 'src/stats/stats.ts',
        flashcards: 'src/flashcards/flashcards.html',
        'flashcards-script': 'src/flashcards/flashcards.ts',
        offscreen: 'src/offscreen/offscreen.html'
      },
    },
  },
  publicDir: 'public'
});

