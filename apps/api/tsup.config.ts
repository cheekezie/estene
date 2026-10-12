import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript source (no build step), so the API bundle
// inlines them; third-party deps stay external and load from node_modules.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  noExternal: [/^@estene\//],
});
