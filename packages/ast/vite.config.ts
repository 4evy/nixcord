import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        'execution-runner': 'src/execution-runner.ts',
      },
      formats: ['es'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      external: [/^node:/, 'ts-morph'],
      output: { entryFileNames: '[name].js' },
    },
  },
  test: {
    testTimeout: 20_000,
    pool: 'threads',
    isolate: false,
  },
});
