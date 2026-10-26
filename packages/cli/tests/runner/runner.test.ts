import { dirname, join } from 'node:path';
import type { ParsedPluginsResult, PluginConfig } from '@nixcord/domain';
import { Effect } from 'effect';
import { createFixture } from 'fs-fixture';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CLI_CONFIG } from '../../src/config.js';
import { generatePluginOptions, validateParsedResults } from '../../src/runner/index.js';

const mocks = vi.hoisted(() => ({
  parsePluginsEffect: vi.fn(),
  categorizePlugins: vi.fn(),
  extractMigrations: vi.fn(async () => ({ renames: [], deletions: [] })),
  generatePluginSchema: vi.fn((plugins: Record<string, unknown>, label: string) => {
    return Object.fromEntries(
      Object.keys(plugins).map((name) => [
        name,
        { upstreamName: name, description: label, settings: {} },
      ])
    );
  }),
  generateParseRulesModule: vi.fn(() => 'rules'),
  generateMigrationsJson: vi.fn(() => '{"renames":[],"removals":[]}'),
  updateDeprecatedPlugins: vi.fn(async () => ({ renames: {}, removals: {}, settingRenames: {} })),
  applyPluginOverrides: vi.fn(async (_path: string, schemas: unknown) => schemas),
  withSpinner: vi.fn((effect: Effect.Effect<unknown>) => effect),
}));

vi.mock('@nixcord/parser', () => ({
  parsePluginsEffect: mocks.parsePluginsEffect,
  categorizePlugins: mocks.categorizePlugins,
  extractMigrations: mocks.extractMigrations,
}));

vi.mock('@nixcord/nix-generator', () => ({
  generatePluginSchema: mocks.generatePluginSchema,
  generateParseRulesModule: mocks.generateParseRulesModule,
  generateMigrationsJson: mocks.generateMigrationsJson,
  updateDeprecatedPlugins: mocks.updateDeprecatedPlugins,
  toNixIdentifier: (name: string) => name,
}));

vi.mock('../../src/runner/spinner.js', () => ({
  withSpinner: mocks.withSpinner,
}));

vi.mock('../../src/overrides.js', () => ({
  applyPluginOverrides: mocks.applyPluginOverrides,
}));

const basePlugin = {
  name: 'Sample',
  settings: {},
};

const emptyResultFields = {
  settingRenames: [],
  pluginRenames: [],
  diagnostics: [],
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

describe('generatePluginOptions', () => {
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
      ...emptyResultFields,
    };
    const equicordResult = {
      vencordPlugins: {},
      equicordPlugins: { Shared: basePlugin, SoloE: basePlugin },
      ...emptyResultFields,
    };

    mocks.parsePluginsEffect
      .mockReturnValueOnce(Effect.succeed(vencordResult))
      .mockReturnValueOnce(Effect.succeed(equicordResult));
    mocks.categorizePlugins.mockReturnValue({
      generic: { Shared: basePlugin },
      vencordOnly: { SoloV: basePlugin },
      equicordOnly: { SoloE: basePlugin },
    });

    const outputPath = fixture.getPath('result', 'modules.nix');
    const overridesPath = fixture.getPath('overrides.json');
    const result = await Effect.runPromise(
      generatePluginOptions({
        vencordPath: vencordRepo,
        equicordPath: equicordRepo,
        vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
        equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
        outputPath,
        metadataPath: fixture.getPath('result', 'metadata.json'),
        overridesPath,
        verbose: false,
        logger,
      })
    );

    expect(result).toEqual({
      pluginsDir: join(dirname(outputPath), CLI_CONFIG.directories.output),
      sharedCount: 1,
      vencordOnlyCount: 1,
      equicordOnlyCount: 1,
    });

    const outputDir = join('result', CLI_CONFIG.directories.output);
    await expect(fixture.readJson(join('result', 'metadata.json'))).resolves.toMatchObject({
      shared: { Shared: { settings: {} } },
      vencord: { SoloV: { settings: {} } },
      equicord: { SoloE: { settings: {} } },
    });
    await expect(
      fixture.readFile(join(outputDir, 'options/options.nix'), 'utf8')
    ).resolves.toContain('"Shared" =');
    await expect(fixture.readFile(join(outputDir, 'schema/schema.nix'), 'utf8')).resolves.toContain(
      '"shared" ='
    );
    await expect(
      fixture.readFile(join(outputDir, CLI_CONFIG.filenames.parseRules), 'utf8')
    ).resolves.toBe('rules');
    await expect(
      fixture.readFile(join(outputDir, CLI_CONFIG.filenames.migrations), 'utf8')
    ).resolves.toBe('{"renames":[],"removals":[]}');

    expect(mocks.parsePluginsEffect).toHaveBeenNthCalledWith(1, vencordRepo, {
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
    });
    expect(mocks.parsePluginsEffect).toHaveBeenNthCalledWith(2, equicordRepo, {
      vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
      equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
    });
    expect(mocks.applyPluginOverrides).toHaveBeenCalledWith(
      overridesPath,
      expect.objectContaining({
        shared: expect.any(Object),
        vencord: expect.any(Object),
        equicord: expect.any(Object),
      })
    );
  });

  test('returns parser diagnostic summary when parsed sources report diagnostics', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const vencordRepo = fixture.getPath('vencord');
    mocks.parsePluginsEffect.mockReturnValue(
      Effect.succeed({
        vencordPlugins: { Only: basePlugin },
        equicordPlugins: {},
        settingRenames: [],
        pluginRenames: [],
        diagnostics: [
          {
            code: 'component-only-setting-skipped',
            severity: 'info',
            stage: 'normalization',
            pluginName: 'Only',
            location: { file: '/tmp/only/index.ts', line: 1, column: 1 },
            message: 'Skipped component-only setting',
          },
          {
            code: 'component-only-setting-skipped',
            severity: 'info',
            stage: 'normalization',
            pluginName: 'Only',
            location: { file: '/tmp/only/index.ts', line: 1, column: 1 },
            message: 'Skipped component-only setting',
          },
          {
            code: 'unsupported-generated-settings-pattern',
            severity: 'warning',
            stage: 'evaluation',
            pluginName: 'Other',
            location: { file: '/tmp/other/index.ts', line: 1, column: 1 },
            message: 'Unsupported generated settings pattern',
          },
        ],
      })
    );
    mocks.categorizePlugins.mockReturnValue({
      generic: {},
      vencordOnly: { Only: basePlugin },
      equicordOnly: {},
    });

    const result = await Effect.runPromise(
      generatePluginOptions({
        vencordPath: vencordRepo,
        vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
        equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
        outputPath: fixture.getPath('out.nix'),
        logger,
      })
    );

    expect(result.diagnosticSummary).toEqual({
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

  test('rejects when validation fails', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const vencordRepo = fixture.getPath('vencord');
    mocks.parsePluginsEffect.mockReturnValue(
      Effect.succeed({
        vencordPlugins: { Broken: { name: 'Broken' } as unknown as PluginConfig },
        equicordPlugins: {},
        ...emptyResultFields,
      })
    );

    const result = Effect.runPromise(
      generatePluginOptions({
        vencordPath: vencordRepo,
        vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
        equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
        outputPath: fixture.getPath('out.nix'),
        logger,
      })
    );

    await expect(result).rejects.toThrow('settings');
  });

  test('fails fast when vencord path is invalid', async () => {
    await using fixture = await createRepos();
    const logger = createLogger();
    const result = Effect.runPromise(
      generatePluginOptions({
        vencordPath: fixture.getPath('missing'),
        vencordPluginsDir: CLI_CONFIG.directories.vencordPlugins,
        equicordPluginsDir: CLI_CONFIG.directories.equicordPlugins,
        outputPath: fixture.getPath('out.nix'),
        logger,
      })
    );

    await expect(result).rejects.toThrow('Vencord source path does not exist');
    expect(mocks.parsePluginsEffect).not.toHaveBeenCalled();
  });
});

describe('validateParsedResults', () => {
  test('throws when either result violates schema', () => {
    const valid = {
      vencordPlugins: { Demo: basePlugin },
      equicordPlugins: {},
      ...emptyResultFields,
    };
    const invalid = {
      vencordPlugins: { Broken: { name: 'Broken' } as unknown as PluginConfig },
      equicordPlugins: {},
      ...emptyResultFields,
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
