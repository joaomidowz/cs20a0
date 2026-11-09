import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // O circuito do mundo da Carreira roda num Web Worker de módulo (circuitRunner.ts).
  worker: { format: 'es' },
  server: {
    watch: {
      ignored: ['**/build/**']
    }
  }
});
