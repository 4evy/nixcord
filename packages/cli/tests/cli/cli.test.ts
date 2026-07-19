import { resolve } from 'node:path';
import { CLI_CONFIG, Err, Ok } from '@nixcord/shared';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildCli, CliExecutionError, handleCliError, runCli } from '../../src/cli.js';
import { runGeneratePluginOptions } from '../../src/runner/index.js';

vi.mock('../../src/runner/index.js', () => ({
  runGeneratePluginOptions: vi.fn(),
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@nixcord/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nixcord/shared')>()),
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
    vi.mocked(runGeneratePluginOptions).mockResolvedValue(Ok(summary));
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  test('exposes the documented command, flags, and positional source path', () => {
    const cli = buildCli();
    const flags = Object.keys(cli.root.parameters.flags ?? {});
    const positional = cli.root.parameters.positional;

    expect(cli.config.name).toBe('generate-plugin-options');
    expect(cli.root.brief).toContain('Extract Vencord/Equicord plugin settings');
    expect(flags).toEqual(
      expect.arrayContaining([
        'vencord',
        'equicord',
        'output',
        'vencordPlugins',
        'equicordPlugins',
        'skipGitMigrations',
        'verbose',
        'version',
      ])
    );
    expect(cli.root.usesFlag('version')).toBe(true);
    expect(positional?.kind).toBe('tuple');
    if (positional?.kind === 'tuple') {
      expect(positional.parameters[0]?.placeholder).toBe('vencord-path');
    }
  });

  test('maps positional input and defaults to runner parameters', async () => {
    await runCli(['node', 'cli.js', '/sources/vencord']);

    expect(runGeneratePluginOptions).toHaveBeenCalledWith({
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

    expect(runGeneratePluginOptions).toHaveBeenCalledWith(
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
      '--vencord-plugins',
      'custom/plugins',
      '--equicord-plugins',
      'custom/equicordplugins',
      '--skip-git-migrations',
      '--verbose',
    ]);

    expect(runGeneratePluginOptions).toHaveBeenCalledWith({
      vencordPath: '/sources/vencord',
      equicordPath: '/sources/equicord',
      outputPath: '/output/plugins.nix',
      vencordPluginsDir: 'custom/plugins',
      equicordPluginsDir: 'custom/equicordplugins',
      skipGitMigrations: true,
      verbose: true,
      logger,
    });
  });

  test('turns runner failures into a CLI failure exit code', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.mocked(runGeneratePluginOptions).mockResolvedValue(Err(new Error('Runner failed')));

    await runCli(['node', 'cli.js']);

    expect(process.exitCode).toBe(1);
    expect(runGeneratePluginOptions).toHaveBeenCalledOnce();
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
    ['CLI errors', new CliExecutionError(new Error('CLI failed'), false), 'Error: CLI failed'],
    ['ordinary errors', new Error('ordinary failure'), 'ordinary failure'],
    ['non-errors', 'string failure', 'string failure'],
  ])('reports %s and sets a failure exit code', (_label, error, message) => {
    handleCliError(error);

    expect(process.exitCode).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(message);
  });
});
