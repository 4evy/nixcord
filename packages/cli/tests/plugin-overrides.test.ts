import { createFixture } from 'fs-fixture';
import { describe, expect, test } from 'vitest';
import { applyPluginOverrides } from '../src/overrides.js';
import type { CategorySchemas } from '../src/runner/outputs.js';

const emptySchemas = (): CategorySchemas => ({ shared: {}, vencord: {}, equicord: {} });

describe('applyPluginOverrides', () => {
  test('deep-merges overrides in memory without mutating the generated schema', async () => {
    await using fixture = await createFixture({
      'overrides.json': JSON.stringify({
        shared: {
          Demo: {
            settings: {
              list: { default: ['new'] },
              nested: { default: { added: 4, right: 3 } },
            },
          },
        },
      }),
    });
    const schemas = emptySchemas();
    schemas.shared.Demo = {
      upstreamName: 'Demo',
      description: '',
      settings: {
        list: {
          upstreamName: 'list',
          upstreamType: { kind: 'list', element: 'string' },
          type: 'types.listOf types.str',
          default: ['old'],
        },
        nested: {
          upstreamName: 'nested',
          upstreamType: { kind: 'attrs', nullable: false },
          type: 'types.attrs',
          default: { left: 1, right: 2 },
        },
      },
    };

    const result = await applyPluginOverrides(fixture.getPath('overrides.json'), schemas);
    expect(result.shared.Demo.settings.list).toMatchObject({ default: ['new'] });
    expect(result.shared.Demo.settings.nested).toMatchObject({
      default: { left: 1, right: 3, added: 4 },
    });
    expect(schemas.shared.Demo.settings.list).toMatchObject({ default: ['old'] });
    expect(result.equicord).toBe(schemas.equicord);
  });

  test('applies all overrides only to existing settings in each category', async () => {
    await using fixture = await createFixture({
      'overrides.json': JSON.stringify({
        all: { MovedPlugin: { settings: { dynamicDefault: { default: false } } } },
      }),
    });
    const schemas = emptySchemas();
    schemas.shared.MovedPlugin = {
      upstreamName: 'MovedPlugin',
      description: '',
      settings: {
        dynamicDefault: {
          upstreamName: 'dynamicDefault',
          upstreamType: { kind: 'boolean' },
          type: 'types.bool',
        },
      },
    };
    schemas.vencord.MovedPlugin = { upstreamName: 'MovedPlugin', description: '', settings: {} };

    const result = await applyPluginOverrides(fixture.getPath('overrides.json'), schemas);
    expect(result.shared.MovedPlugin.settings.dynamicDefault).toMatchObject({ default: false });
    expect(result.vencord.MovedPlugin.settings).toEqual({});
    expect(result.equicord).toEqual({});
  });

  test.each([
    ['[]', 'Plugin overrides must be a JSON object'],
    ['{"shared":[]}', 'Plugin overrides category must be a JSON object: shared'],
    ['{"all":[]}', 'Plugin overrides category must be a JSON object: all'],
  ])('rejects invalid override documents: %s', async (document, message) => {
    await using fixture = await createFixture({ 'overrides.json': document });
    await expect(
      applyPluginOverrides(fixture.getPath('overrides.json'), emptySchemas())
    ).rejects.toThrow(message);
  });

  test('keeps prototype-shaped keys as ordinary data', async () => {
    await using fixture = await createFixture({
      'overrides.json':
        '{"shared":{"__proto__":{"description":"ordinary plugin data","settings":{}}}}',
    });
    const result = await applyPluginOverrides(fixture.getPath('overrides.json'), emptySchemas());
    expect(Object.hasOwn(result.shared, '__proto__')).toBe(true);
    expect(Reflect.get(result.shared, '__proto__')).toEqual({
      description: 'ordinary plugin data',
      settings: {},
    });
    expect(Object.prototype).not.toHaveProperty('description');
  });
});
