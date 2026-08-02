import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
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

  test('stubs React hooks imported from upstream webpack modules', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-hooks-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/component.tsx`,
        `
          import { React, Switch, useState } from "@webpack/common";
          import { definePluginSettings } from "@api/Settings";
          const settings = definePluginSettings({ flag: { type: 3 } });
          const Component = () => {
            const [value] = useState(settings.store.flag);
            const ref = React.useRef(value);
            return <Switch value={ref.current} onChange={next => settings.store.flag = next} />;
          };
        `
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'flag',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'read', path: ['flag'] }),
          expect.objectContaining({ kind: 'write', path: ['flag'] }),
        ])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('stubs common pure helpers used by upstream components', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-helpers-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/component.ts`,
        `
          import { definePluginSettings } from "@api/Settings";
          import { classNameFactory } from "@utils/css";
          import { Logger } from "@utils/Logger";
          const cl = classNameFactory("vc-test-");
          const logger = new Logger("test");
          const settings = definePluginSettings({ value: { type: 0 } });
          const Component = () => {
            logger.info(cl("component"));
            void settings.store.value;
          };
        `
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
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

  test('limits trace events for the requested setting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-events-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/events.ts`,
        `
          import { definePluginSettings } from "@api/Settings";
          const settings = definePluginSettings({ value: { type: 0 } });
          const Component = () => {
            for (let index = 0; index < 20; index++) settings.store.value = index;
          };
        `
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
        maxTraceEvents: 10,
      });

      expect(result).toMatchObject({ ok: false, code: 'execution-limit' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('keeps declarations from different source modules in separate scopes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-modules-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile(
        `${root}/first.ts`,
        'const shared = "first"; export const first = () => shared;'
      );
      project.createSourceFile(
        `${root}/second.ts`,
        'const shared = "second"; export const second = () => shared;'
      );
      const source = project.createSourceFile(
        `${root}/component.tsx`,
        `
          import { definePluginSettings } from "@api/Settings";
          import { first } from "./first";
          import { second } from "./second";
          const settings = definePluginSettings({ value: { type: 0 } });
          const Component = () => { first(); second(); void settings.store.value; };
        `
      );
      project.resolveSourceFileDependencies();
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('keeps component-local declarations inside their original function scope', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-locals-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/component.ts`,
        `
          import { definePluginSettings } from "@api/Settings";
          const settings = definePluginSettings({ value: { type: 0 } });
          const Component = () => {
            const repeated = "outer";
            const nested = async () => {
              const repeated = await Promise.resolve("inner");
              return repeated;
            };
            void nested();
            void repeated;
            void settings.store.value;
          };
        `
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('executes an imported component through a circular settings dependency', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-cycle-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile(
        `${root}/component.ts`,
        `
          import { settings } from "./settings";
          export function Component() { settings.use(["value"]); }
        `
      );
      const source = project.createSourceFile(
        `${root}/settings.ts`,
        `
          import { definePluginSettings } from "@api/Settings";
          import { Component } from "./component";
          export const settings = definePluginSettings({ value: { type: 6, component: Component } });
          const Target = Component;
        `
      );
      project.resolveSourceFileDependencies();
      const component = source.getVariableDeclarationOrThrow('Target').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('initializes a local component before its enclosing settings declaration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-settings-cycle-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/settings.ts`,
        `
          import { definePluginSettings } from "@api/Settings";
          function Component() { settings.use(["value"]); }
          const settings = definePluginSettings({ value: { type: 6, component: Component } });
          const Target = Component;
        `
      );
      const component = source.getVariableDeclarationOrThrow('Target').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('exports an enclosing settings stub before loading an imported component cycle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-inline-cycle-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile(
        `${root}/component.ts`,
        `
          import { settings } from "./settings";
          export function Child() {
            const { items } = settings.use(["value", "items"]);
            items.map(() => undefined);
          }
        `
      );
      const source = project.createSourceFile(
        `${root}/settings.ts`,
        `
          import { definePluginSettings } from "@api/Settings";
          import { Child } from "./component";
          export const settings = definePluginSettings({
            value: { type: 6, component: () => Child() },
            items: { type: 7, default: [] }
          });
        `
      );
      project.resolveSourceFileDependencies();
      const component = source
        .getVariableDeclarationOrThrow('settings')
        .getInitializerOrThrow()
        .getDescendantsOfKind(SyntaxKind.ArrowFunction)
        .find((node) => node.getText().includes('Child'));
      expect(component).toBeDefined();
      const result = await executeComponentSlice(component!, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('stubs an enclosing settings binding used by an inline component method', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-inline-settings-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/settings.ts`,
        `
          import { definePluginSettings } from "@api/Settings";
          const settings = definePluginSettings({
            value: {
              type: 6,
              component() { settings.use(["value"]); }
            }
          });
        `
      );
      const component = source
        .getDescendants()
        .find((node) => node.getKindName() === 'MethodDeclaration');
      expect(component).toBeDefined();
      const result = await executeComponentSlice(component!, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('loads JSX component imports used by an inline settings component', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nixcord-slice-inline-jsx-'));
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/settings.tsx`,
        `
          import { definePluginSettings } from "@api/Settings";
          import { Button } from "@webpack/common";
          const settings = definePluginSettings({
            value: {
              type: 6,
              component: () => <Button disabled={settings.store.value}>Open</Button>
            }
          });
        `
      );
      const component = source
        .getVariableDeclarationOrThrow('settings')
        .getInitializerOrThrow()
        .getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
      expect(component).toBeDefined();
      const result = await executeComponentSlice(component!, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.ok && result.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'read', path: ['value'] })])
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('does not treat a sibling path with the same prefix as part of the allowed root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nixcord-slice-boundary-'));
    const root = join(parent, 'plugin');
    const sibling = join(parent, 'plugin-escape');
    await Promise.all([mkdir(root), mkdir(sibling)]);
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      project.createSourceFile(
        `${sibling}/escape.ts`,
        'export const escape = () => { throw new Error("outside declaration executed"); };'
      );
      const source = project.createSourceFile(
        `${root}/component.ts`,
        'import { escape } from "../plugin-escape/escape"; const Component = () => { escape(); };'
      );
      project.resolveSourceFileDependencies();
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: true });
      expect(result.evidence).not.toEqual(
        expect.arrayContaining([expect.stringContaining('/plugin-escape/')])
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test('does not expose host filesystem globals to executed component code', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nixcord-slice-sandbox-'));
    const root = join(parent, 'plugin');
    const marker = join(parent, 'outside-root.txt');
    await mkdir(root);
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/component.ts`,
        `const Component = () => { Bun.write(${JSON.stringify(marker)}, "executed"); };`
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: false, code: 'execution-failed' });
      await expect(access(marker)).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test('blocks constructor-based escapes from the execution context', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'nixcord-slice-constructor-'));
    const root = join(parent, 'plugin');
    const marker = join(parent, 'constructor-escape.txt');
    await mkdir(root);
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile(
        `${root}/component.ts`,
        `
          const Component = () => {
            const hostProcess = (() => {}).constructor("return process")();
            hostProcess.getBuiltinModule("node:fs").writeFileSync(
              ${JSON.stringify(marker)},
              "escaped"
            );
          };
        `
      );
      const component = source.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
      const result = await executeComponentSlice(component, project.getTypeChecker(), {
        settingKey: 'value',
        allowedRoot: root,
      });

      expect(result).toMatchObject({ ok: false, code: 'execution-failed' });
      expect(!result.ok && result.message).toContain('Code generation from strings disallowed');
      await expect(access(marker)).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
