import { describe, expect, test } from 'vitest';
import { StaticEvaluator } from '../../../src/evaluator.js';
import { traceComponentSetting } from '../../../src/trace.js';
import { NativeFixture } from '../../fixtures/native.js';

const trace = async (source: string, settingKey: string) => {
  const project = new NativeFixture();
  const file = await project.openFile('/component.tsx', source);
  const component = file.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
  const checker = project.checker;
  return traceComponentSetting(component, settingKey, checker, new StaticEvaluator(checker));
};

describe('component setting traces', () => {
  test('recognizes persistent store reads and declarative controls', async () => {
    const result = await trace(
      `
        const Component = () => (
          <TextInput value={settings.store.soundId} onChange={value => settings.store.soundId = value} />
        );
      `,
      'soundId'
    );
    expect(result).toMatchObject({
      persistent: true,
      storeReferenced: true,
      controls: [{ component: 'TextInput', kind: 'string' }],
    });
  });

  test('retains store provenance when a computed key needs execution fallback', async () => {
    const result = await trace(
      `
        const keys = ["flag"];
        const Component = () => {
          const key = keys.at(0);
          return <Switch value={settings.store[key]} onChange={value => settings.store[key] = value} />;
        };
      `,
      'flag'
    );
    expect(result).toMatchObject({ persistent: false, storeReferenced: true, controls: [] });
  });

  test('captures nested store initialization from data-driven loops and aliases', async () => {
    const result = await trace(
      `
        const tags = [
          { id: "first", displayName: "First", defaults: { text: "hello", showInChat: true } },
          { id: "second", displayName: "Second", defaults: { text: "bye", showInChat: false } },
        ];
        const Component = () => {
          const tagStore = settings.store.tags;
          tags.forEach(tag => { tagStore[tag.id] ??= tag.defaults; });
          return null;
        };
      `,
      'tags'
    );
    expect(result).toMatchObject({
      persistent: true,
      nestedDefaults: {
        first: { text: 'hello', showInChat: true },
        second: { text: 'bye', showInChat: false },
      },
      nestedLabels: { first: 'First', second: 'Second' },
    });
  });

  test('does not classify action-only UI as a persistent setting', async () => {
    const result = await trace(
      'const Component = () => <Button onClick={() => alert("hi")} />;',
      'value'
    );
    expect(result).toMatchObject({ persistent: false, storeReferenced: false, controls: [] });
  });

  test('ignores generic action callbacks even when they write a settings store', async () => {
    const result = await trace(
      'const Component = () => <Button onClick={() => settings.store.token = "new"} />;',
      'token'
    );
    expect(result).toMatchObject({ persistent: false, storeReferenced: true, controls: [] });
  });

  test('does not follow components rendered from generic action callbacks', async () => {
    const result = await trace(
      `
        let timezones = {};
        const Modal = () => <SearchableSelect value={timezones} onChange={() => {
          DataStore.set("timezones", timezones);
        }} />;
        const Component = () => <Button onClick={() => openModal(() => <Modal />)} />;
      `,
      'setDatabaseTimezone'
    );
    expect(result).toMatchObject({ persistent: false, storeReferenced: false, controls: [] });
  });

  test('does not classify less common event handlers as persistent settings', async () => {
    const result = await trace(
      `
        const Component = () => (
          <Button
            label={settings.store.token}
            onDoubleClick={() => settings.store.token = "new"}
          />
        );
      `,
      'token'
    );
    expect(result).toMatchObject({
      persistent: false,
      storeReferenced: true,
      hasDefault: false,
      controls: [],
    });
  });

  test('does not infer reset actions as component defaults', async () => {
    const result = await trace(
      `
        const Component = () => (
          <>
            <Switch
              value={settings.store.flag}
              onChange={value => settings.store.flag = value}
            />
            <Button onClick={() => settings.store.flag = true} />
          </>
        );
      `,
      'flag'
    );
    expect(result).toMatchObject({ persistent: true, hasDefault: false });
  });

  test('does not expose values persisted only through an external data API', async () => {
    const result = await trace(
      `
        let triggerWords = [""];
        const Child = () => <TextInput value={triggerWords[0]} onChange={value => {
          triggerWords[0] = value;
          DataStore.set("words", triggerWords);
        }} />;
        const Component = () => <Child />;
      `,
      'flagged'
    );
    expect(result).toMatchObject({ persistent: false, storeReferenced: false, controls: [] });
  });

  test('follows a store-backed component returned by an imported factory', async () => {
    const project = new NativeFixture();
    await project.openFile(
      '/folder-input.tsx',
      `
        function createDirSelector(settingKey: "logsDir" | "imageCacheDir") {
          return function DirSelector() {
            const path = settings.store[settingKey];
            settings.store[settingKey] = path;
            return null;
          };
        }
        export const ImageCacheDir = createDirSelector("imageCacheDir");
      `
    );
    const file = await project.openFile(
      '/settings.tsx',
      `
        import { ImageCacheDir } from "./folder-input";
        const Component = ErrorBoundary.wrap(ImageCacheDir);
      `
    );
    const component = file.getVariableDeclarationOrThrow('Component').getInitializerOrThrow();
    const checker = project.checker;
    const result = traceComponentSetting(
      component,
      'imageCacheDir',
      checker,
      new StaticEvaluator(checker)
    );
    expect(result).toMatchObject({ persistent: true });
  });
});
