import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Source maps are off in production so our code isn't trivially readable,
    // and so nothing in the build output can leak file contents.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the big, rarely-changing libraries in their own chunk so a code
        // change doesn't force every returning user to re-download React.
        // Regex on both slash styles so this behaves the same on Windows and
        // on Vercel's Linux builders.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          // Supabase and TanStack Query must NOT share a chunk. Query is
          // imported by the providers and so is on the critical path; the
          // Supabase client is loaded lazily so the public landing page never
          // downloads a database client it has no use for. Bundling them
          // together silently undoes that.
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) {
            return 'supabase-vendor';
          }
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) {
            return 'query-vendor';
          }
          /*
           * MOTION, IN ONE PIECE AND UNDER ITS OWN NAME.
           *
           * `motion/react` is on the critical path — `app/providers.tsx`
           * mounts `LazyMotion` and `MotionConfig` for the whole tree — but it
           * was arriving as three separate chunks, one of which the splitter
           * had named `react-*.js` after an internal directory. So the build
           * log showed a 36 KB "react" chunk that is not React, next to the
           * real `react-vendor`, which is a good way to misread every future
           * measurement. One chunk, three fewer requests, honest name.
           *
           * It is kept OUT of `react-vendor` deliberately: Motion ships far
           * more often than React does, and sharing the chunk would throw away
           * the React cache entry on every Motion bump.
           */
          if (/[\\/]node_modules[\\/]motion(-dom|-utils)?[\\/]/.test(id)) {
            return 'motion-vendor';
          }
          /*
           * THREE.JS AND VANTA, PINNED AWAY FROM EVERYTHING ELSE.
           *
           * 607 KB raw / 153 KB gzipped between them, measured 2026-10-16 —
           * larger than the rest of the application put together. `WavesField`
           * reaches them through a dynamic `import()` and they must stay
           * behind it, so naming the chunk here is a tripwire as much as a
           * grouping: if either package ever acquires a static importer, it
           * lands in the entry chunk and this name makes that obvious in the
           * build log instead of invisible inside a 160 KB `index`.
           */
          if (/[\\/]node_modules[\\/](three|vanta)[\\/]/.test(id)) {
            return 'webgl-vendor';
          }
          return;
        },
      },
    },
  },
});
