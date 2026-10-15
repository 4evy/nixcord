import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type UserConfig } from 'vite';

type ViteConfigOptions = {
  mode: 'lib' | 'ssr';
  packageDirectory: string;
  entries?: Record<string, string>;
  banner?: string;
  testTimeout?: number;
  testPool?: 'threads' | 'forks';
  testIsolate?: boolean;
  coverage?: UserConfig['test'] extends object ? UserConfig['test']['coverage'] : never;
};

export function createViteConfig(options: ViteConfigOptions): UserConfig {
  const { mode, packageDirectory, entries, banner, testTimeout, testPool, testIsolate, coverage } =
    options;
  const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const dependencies = Object.keys(manifest.dependencies ?? {});
  const external = (id: string): boolean =>
    id.startsWith('node:') || dependencies.some((name) => id === name || id.startsWith(`${name}/`));

  const build: UserConfig['build'] =
    mode === 'ssr'
      ? {
          ssr: 'src/index.ts',
          outDir: 'dist',
          emptyOutDir: true,
          minify: false,
          sourcemap: true,
          rolldownOptions: {
            output: {
              format: 'esm',
              entryFileNames: 'index.js',
              ...(banner ? { banner } : {}),
            },
          },
        }
      : {
          lib: {
            entry: entries ?? 'src/index.ts',
            formats: ['es'],
            ...(entries ? {} : { fileName: 'index' }),
          },
          outDir: 'dist',
          emptyOutDir: true,
          minify: false,
          sourcemap: true,
          rolldownOptions: {
            external,
            ...(entries ? { output: { entryFileNames: '[name].js' } } : {}),
          },
        };

  const test: UserConfig['test'] = {
    globals: true,
    include: ['tests/**/*.test.ts'],
    ...(testTimeout !== undefined ? { testTimeout } : {}),
    ...(testPool !== undefined ? { pool: testPool } : {}),
    ...(testIsolate !== undefined ? { isolate: testIsolate } : {}),
    ...(coverage !== undefined ? { coverage } : {}),
  };

  return defineConfig({
    build,
    ...(mode === 'ssr' ? { ssr: { target: 'node', external: dependencies } } : {}),
    test,
  });
}
