import { describe, expect, test } from 'vitest';
import { compilePluginOptions } from '../../src/runner/schema.js';

describe('compilePluginOptions', () => {
  test('emits empty enum domains and preserves sentinel-shaped attribute defaults', () => {
    const options = compilePluginOptions([
      {
        Demo: {
          upstreamName: 'Demo',
          description: 'Plugin option schema validation',
          settings: {
            emptyEnum: {
              upstreamName: 'emptyEnum',
              upstreamType: { kind: 'enum', values: [] },
              type: 'types.enum',
              enumValues: [],
            },
            sentinelAttrs: {
              upstreamName: 'sentinelAttrs',
              upstreamType: { kind: 'attrs', nullable: false },
              type: 'types.attrs',
              default: { __nixRaw: 'ordinary plugin data' },
            },
          },
        },
      },
    ]);

    expect(options).toContain('type = lib.types.enum [  ];');
    expect(options).toContain('jsonAttrs = lib.types.attrsOf lib.types.json;');
    expect(options).toContain('default = { "__nixRaw" = "ordinary plugin data"; };');
    expect(options).not.toContain('builtins.fromJSON');
  });
});
