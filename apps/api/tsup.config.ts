import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript source (no build step), so the API bundle
// inlines them; third-party deps stay external and load from node_modules.
// The result in dist/ runs with only the API's production dependencies installed.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'create-admin': 'src/scripts/create-admin.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  noExternal: [/^@estene\//],
});
