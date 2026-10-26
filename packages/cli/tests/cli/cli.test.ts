import { resolve } from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handleCliError, runCli } from '../../src/cli.js';
import { CLI_CONFIG } from '../../src/config.js';
import { GeneratePluginOptionsError } from '../../src/runner/errors.js';
import { generatePluginOptions } from '../../src/runner/index.js';

vi.mock('../../src/runner/index.js', () => ({
  generatePluginOptions: vi.fn(),
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  createLogger: vi.fn(() => logger),
}));

const summary = {
  pluginsDir: '/tmp/plugins',
  sharedCount: 5,
  vencordOnlyCount: 3,
  equicordOnlyCount: 2,
};

describe('CLI contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generatePluginOptions).mockReturnValue(Effect.succeed(summary));
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  test.each(['--help', '-h'])(
    'prints generated help for %s without running generation',
    async (flag) => {
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        await runCli(['node', 'cli.js', flag]);
        const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

        expect(output).toContain('Usage: generate-plugin-options');
        for (const name of [
          '--vencord',
          '--equicord',
          '--output',
          '--overrides',
          '--vencord-plugins',
          '--equicord-plugins',
          '--skip-git-migrations',
          '--verbose',
          '--version',
          'VENCORD-PATH',
        ]) {
          expect(output).toContain(name);
        }
        expect(generatePluginOptions).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
      } finally {
        stdout.mockRestore();
      }
    }
  );

  test.each(['--version', '-V'])(
    'prints the version for %s without running generation',
    async (flag) => {
      const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      try {
        await runCli(['node', 'cli.js', flag]);

        expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toBe(
          `${CLI_CONFIG.version}\n`
        );
        expect(generatePluginOptions).not.toHaveBeenCalled();
        expect(process.exitCode).toBeUndefined();
      } finally {
        stdout.mockRestore();
      }
    }
  );

  test.each([
    ['unknown option', ['--unknown']],
    ['missing option value', ['--output']],
    ['extra positional path', ['/first', '/second']],
    ['negated boolean', ['--no-verbose']],
    ...[
      '--vencord',
      '--equicord',
      '--output',
      '--overrides',
      '--vencord-plugins',
      '--equicord-plugins',
    ].map((name) => [`empty ${name}`, [name, '']]),
    ['empty positional path', ['']],
  ])('rejects %s before running generation', async (_label, args) => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await runCli(['node', 'cli.js', ...args]);

      expect(process.exitCode).toBe(1);
      expect(generatePluginOptions).not.toHaveBeenCalled();
      expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('Error:');
    } finally {
      stderr.mockRestore();
    }
  });

  test('preserves short aliases and camel-case option spellings', async () => {
    await runCli([
      'node',
      'cli.js',
      '-e',
      '/sources/equicord',
      '-o',
      '/output/plugins.nix',
      '-v',
      '--vencordPlugins',
      'custom/plugins',
      '--equicordPlugins',
      'custom/equicordplugins',
      '--skipGitMigrations',
    ]);

    expect(generatePluginOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        equicordPath: '/sources/equicord',
        outputPath: '/output/plugins.nix',
        verbose: true,
        vencordPluginsDir: 'custom/plugins',
        equicordPluginsDir: 'custom/equicordplugins',
        skipGitMigrations: true,
      })
    );
  });

  test('maps positional input and defaults to runner parameters', async () => {
    await runCli(['node', 'cli.js', '/sources/vencord']);

    expect(generatePluginOptions).toHaveBeenCalledWith({
      vencordPath: '/sources/vencord',
      equicordPath: CLI_CONFIG.sources.equicord,
      outputPath: resolve('modules/plugins-generated.nix'),
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
      skipGitMigrations: false,
      verbose: false,
      logger,
    });
  });

  test('uses packaged sources when no source arguments are supplied', async () => {
    await runCli(['node', 'cli.js']);

    expect(generatePluginOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        vencordPath: CLI_CONFIG.sources.vencord,
        equicordPath: CLI_CONFIG.sources.equicord,
      })
    );
  });

  test('maps all overrides and gives --vencord precedence over the positional path', async () => {
    await runCli([
      'node',
      'cli.js',
      '/ignored/positional',
      '--vencord',
      '/sources/vencord',
      '--equicord',
      '/sources/equicord',
      '--output',
      '/output/plugins.nix',
      '--overrides',
      '/output/overrides.json',
      '--vencord-plugins',
      'custom/plugins',
      '--equicord-plugins',
      'custom/equicordplugins',
      '--skip-git-migrations',
      '--verbose',
    ]);

    expect(generatePluginOptions).toHaveBeenCalledWith({
      vencordPath: '/sources/vencord',
      equicordPath: '/sources/equicord',
      outputPath: '/output/plugins.nix',
      overridesPath: '/output/overrides.json',
      vencordPluginsDir: 'custom/plugins',
      equicordPluginsDir: 'custom/equicordplugins',
      skipGitMigrations: true,
      verbose: true,
      logger,
    });
  });

  test('turns runner failures into a CLI failure exit code', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.mocked(generatePluginOptions).mockReturnValue(
      Effect.fail(
        new GeneratePluginOptionsError({
          stage: 'generation',
          message: 'Runner failed',
          cause: undefined,
        })
      )
    );

    await runCli(['node', 'cli.js']);

    expect(process.exitCode).toBe(1);
    expect(generatePluginOptions).toHaveBeenCalledOnce();
    stderr.mockRestore();
  });
});

describe('handleCliError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  test.each([
    ['ordinary errors', new Error('ordinary failure'), 'ordinary failure'],
    ['non-errors', 'string failure', 'string failure'],
  ])('reports %s and sets a failure exit code', (_label, error, message) => {
    handleCliError(error);

    expect(process.exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(message);
  });
});
