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
          return;
        },
      },
    },
  },
});
