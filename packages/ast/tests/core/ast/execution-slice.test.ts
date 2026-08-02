import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { executeComponentSlice } from '../../../src/execution-slice.js';

describe('executed component slices', () => {
  test('captures persistent settings reads without executing unrelated plugin initialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/component.tsx`,
        `
          import { definePluginSettings } from "@api/Settings";
          const settings = definePluginSettings({ soundId: { type: 0 } });
          const unrelated = () => { throw new Error("must not run"); };
          const Component = () => { void settings.store.soundId; return null; };
        `
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'soundId',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true, hasDefault: false });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['soundId'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('kills a non-terminating slice and reports a diagnostic result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/timeout.ts`,
        'const Component = () => { while (true) {} };'
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
        timeoutMs: 50,
      });
      expect(result).toMatchObject({ ok: false, code: 'execution-timeout' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
