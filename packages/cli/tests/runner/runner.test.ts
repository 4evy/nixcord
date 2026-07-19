import { dirname, join } from 'node:path';
import type { ParsedPluginsResult, PluginConfig, Result } from '@nixcord/shared';
import { CLI_CONFIG } from '@nixcord/shared';
import { createFixture } from 'fs-fixture';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { GeneratePluginOptionsSummary } from '../../src/runner/index.js';
import { runGeneratePluginOptions, validateParsedResults } from '../../src/runner/index.js';

const mocks = vi.hoisted(() => ({
  parsePlugins: vi.fn(),
  categorizePlugins: vi.fn(),
  extractMigrations: vi.fn(async () => ({ renames: [], deletions: [] })),
  generatePluginModule: vi.fn((plugins: Record<string, unknown>, label: string) => {
    return `${label}:${Object.keys(plugins).join(',')}`;
  }),
  generateParseRulesModule: vi.fn(() => 'rules'),
  generateMigrationsJson: vi.fn(() => '{"renames":[],"removals":[]}'),
  updateDeprecatedPlugins: vi.fn(async () => ({ renames: {}, removals: {}, settingRenames: {} })),
  oraPromise: vi.fn((promise: Promise<unknown>) => promise),
}));

vi.mock('@nixcord/parser', () => ({
  parsePlugins: mocks.parsePlugins,
  categorizePlugins: mocks.categorizePlugins,
  extractMigrations: mocks.extractMigrations,
}));

vi.mock('@nixcord/nix-generator', () => ({
  generatePluginModule: mocks.generatePluginModule,
  generateParseRulesModule: mocks.generateParseRulesModule,
  generateMigrationsJson: mocks.generateMigrationsJson,
  updateDeprecatedPlugins: mocks.updateDeprecatedPlugins,
  toNixIdentifier: (name: string) => name,
}));

vi.mock('../../src/runner/spinner.js', () => ({
  oraPromise: mocks.oraPromise,
}));

const basePlugin = {
  name: 'Sample',
  settings: {},
};

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  };
}

const createRepos = () =>
  createFixture({
    vencord: {
      'package.json': '{}',
      [CLI_CONFIG.directories.vencordPlugins]: {},
    },
    equicord: {
      'package.json': '{}',
      [CLI_CONFIG.directories.equicordPlugins]: {},
    },
  });

function unwrapOk<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

function unwrapErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) return result.error;
  throw new Error('Expected Err result');
}

describe('runGeneratePluginOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('writes all output files and returns summary when both sources are provided', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const vencordRepo = fixture.getPath('vencord');
    const equicordRepo = fixture.getPath('equicord');
    const vencordResult = {
      vencordPlugins: { Shared: basePlugin, SoloV: basePlugin },
      equicordPlugins: {},
    };
    const equicordResult = {
      vencordPlugins: {},
      equicordPlugins: { Shared: basePlugin, SoloE: basePlugin },
    };

    mocks.parsePlugins.mockResolvedValueOnce(vencordResult).mockResolvedValueOnce(equicordResult);
    mocks.categorizePlugins.mockReturnValue({
      generic: { Shared: basePlugin },
      vencordOnly: { SoloV: basePlugin },
      equicordOnly: { SoloE: basePlugin },
    });

    const outputPath = fixture.getPath('result', 'modules.nix');
    const result = await runGeneratePluginOptions({
      vencordPath: vencordRepo,
      equicordPath: equicordRepo,
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
      outputPath,
      verbose: false,
      logger,
    });

    expect(result.ok).toBe(true);
    const summary = unwrapOk<GeneratePluginOptionsSummary, Error>(result);
    expect(summary).toEqual({
      pluginsDir: join(dirname(outputPath), CLI_CONFIG.directories.output),
      sharedCount: 1,
      vencordOnlyCount: 1,
      equicordOnlyCount: 1,
    });

    const outputDir = join('result', CLI_CONFIG.directories.output);
    await expect(
      fixture.readFile(join(outputDir, CLI_CONFIG.filenames.shared), 'utf8')
    ).resolves.toBe('shared:Shared');
    await expect(
      fixture.readFile(join(outputDir, CLI_CONFIG.filenames.vencord), 'utf8')
    ).resolves.toBe('vencord:SoloV');
    await expect(
      fixture.readFile(join(outputDir, CLI_CONFIG.filenames.equicord), 'utf8')
    ).resolves.toBe('equicord:SoloE');
    await expect(
      fixture.readFile(join(outputDir, CLI_CONFIG.filenames.parseRules), 'utf8')
    ).resolves.toBe('rules');
    await expect(
      fixture.readFile(join(outputDir, CLI_CONFIG.filenames.migrations), 'utf8')
    ).resolves.toBe('{"renames":[],"removals":[]}');

    expect(mocks.parsePlugins).toHaveBeenNthCalledWith(1, vencordRepo, {
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
    });
    expect(mocks.parsePlugins).toHaveBeenNthCalledWith(2, equicordRepo, {
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
    });
    expect(mocks.oraPromise).toHaveBeenCalledTimes(2);
  });

  test('skips ora spinner when verbose logging is enabled', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const vencordRepo = fixture.getPath('vencord');
    mocks.parsePlugins.mockResolvedValue({
      vencordPlugins: { Only: basePlugin },
      equicordPlugins: {},
    });
    mocks.categorizePlugins.mockReturnValue({
      generic: {},
      vencordOnly: { Only: basePlugin },
      equicordOnly: {},
    });

    const result = await runGeneratePluginOptions({
      vencordPath: vencordRepo,
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
      outputPath: fixture.getPath('out.nix'),
      verbose: true,
      logger,
    });

    expect(result.ok).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Found 1 plugins in Vencord src/plugins')
    );
    expect(mocks.oraPromise).not.toHaveBeenCalled();
  });

  test('returns parser diagnostic summary when parsed sources report diagnostics', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const vencordRepo = fixture.getPath('vencord');
    mocks.parsePlugins.mockResolvedValue({
      vencordPlugins: { Only: basePlugin },
      equicordPlugins: {},
      diagnostics: [
        {
          pluginName: 'Only',
          filePath: '/tmp/only/index.ts',
          kind: 'component-only-setting-skipped',
          message: 'Skipped component-only setting',
        },
        {
          pluginName: 'Only',
          filePath: '/tmp/only/index.ts',
          kind: 'component-only-setting-skipped',
          message: 'Skipped component-only setting',
        },
        {
          pluginName: 'Other',
          filePath: '/tmp/other/index.ts',
          kind: 'unsupported-generated-settings-pattern',
          message: 'Unsupported generated settings pattern',
        },
      ],
    });
    mocks.categorizePlugins.mockReturnValue({
      generic: {},
      vencordOnly: { Only: basePlugin },
      equicordOnly: {},
    });

    const result = await runGeneratePluginOptions({
      vencordPath: vencordRepo,
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
      outputPath: fixture.getPath('out.nix'),
      logger,
    });

    expect(result.ok).toBe(true);
    const summary = unwrapOk<GeneratePluginOptionsSummary, Error>(result);
    expect(summary.diagnosticSummary).toEqual({
      total: 3,
      byKind: [
        { name: 'component-only-setting-skipped', count: 2 },
        { name: 'unsupported-generated-settings-pattern', count: 1 },
      ],
      topPlugins: [
        { name: 'Only', count: 2 },
        { name: 'Other', count: 1 },
      ],
      topFiles: [
        { name: '/tmp/only/index.ts', count: 2 },
        { name: '/tmp/other/index.ts', count: 1 },
      ],
    });
  });

  test('returns error result when validation fails', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const vencordRepo = fixture.getPath('vencord');
    mocks.parsePlugins.mockResolvedValue({
      vencordPlugins: { Broken: { name: 'Broken' } as unknown as PluginConfig },
      equicordPlugins: {},
    });

    const result = await runGeneratePluginOptions({
      vencordPath: vencordRepo,
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
      outputPath: fixture.getPath('out.nix'),
      logger,
    });

    expect(!result.ok).toBe(true);
    expect(unwrapErr(result).message).toContain('settings');
  });

  test('fails fast when vencord path is invalid', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const result = await runGeneratePluginOptions({
      vencordPath: fixture.getPath('missing'),
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
      outputPath: fixture.getPath('out.nix'),
      logger,
    });

    expect(!result.ok).toBe(true);
    expect(unwrapErr(result).message).toContain('Vencord source path does not exist');
    expect(mocks.parsePlugins).not.toHaveBeenCalled();
  });
});

describe('validateParsedResults', () => {
  test('throws when either result violates schema', () => {
    const valid = {
      vencordPlugins: { Demo: basePlugin },
      equicordPlugins: {},
    };
    const invalid = {
      vencordPlugins: { Broken: { name: 'Broken' } as unknown as PluginConfig },
      equicordPlugins: {},
    };

    expect(() => validateParsedResults(valid, valid)).not.toThrow();
    expect(() => validateParsedResults(invalid as unknown as ParsedPluginsResult)).toThrow(
      /settings/i
    );
    expect(() => validateParsedResults(valid, invalid as unknown as ParsedPluginsResult)).toThrow(
      /settings/i
    );
  });
});
