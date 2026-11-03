import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface BundleSpec {
  client: 'vencord' | 'equicord';
  settings: Record<string, unknown>;
  quickCss: string | null;
  themes: Record<string, string>;
}

type BootstrapConfig = Omit<BundleSpec, 'themes'> & {
  themes: [string, string][];
};

const [specPath, browserBuild, output] = process.argv.slice(2);
const spec: BundleSpec = JSON.parse(await readFile(specPath, 'utf8'));
const themes = await Promise.all(
  Object.entries(spec.themes).map(
    async ([name, path]): Promise<[string, string]> => [name, await readFile(path, 'utf8')]
  )
);

// Legcord runs this bundle in Discord's page. Apply managed values before loading
// the mod without discarding unrelated settings or CSS from the existing profile
async function bootstrap({ client, settings, quickCss, themes }: BootstrapConfig): Promise<void> {
  function mergeSettings(
    current: unknown,
    managed: Record<string, unknown>
  ): Record<string, unknown> {
    const result =
      current !== null && typeof current === 'object' && !Array.isArray(current)
        ? ({ ...current } as Record<string, unknown>)
        : {};
    for (const [key, value] of Object.entries(managed)) {
      result[key] =
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? mergeSettings(result[key], value as Record<string, unknown>)
          : value;
    }
    return result;
  }

  function writeStore(
    database: string,
    storeName: string,
    entries: [string, string][]
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(database);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        try {
          const transaction = database.transaction(storeName, 'readwrite');
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
          const store = transaction.objectStore(storeName);
          for (const [key, value] of entries) store.put(value, key);
        } catch (error) {
          database.close();
          reject(error);
        }
      };
    });
  }

  const settingsKey = client === 'vencord' ? 'VencordSettings' : 'EquicordSettings';
  try {
    let current: unknown = {};
    const stored = localStorage.getItem(settingsKey);
    if (stored !== null) {
      try {
        current = JSON.parse(stored);
        // Equicord also accepts settings encoded twice by older clients
        if (client === 'equicord' && typeof current === 'string') current = JSON.parse(current);
      } catch (error) {
        console.error('Failed to parse existing Legcord mod settings:', error);
      }
    }
    localStorage.setItem(settingsKey, JSON.stringify(mergeSettings(current, settings)));
  } catch (error) {
    console.error('Failed to apply Legcord mod settings:', error);
  }

  // Both browser mods use Vencord's IndexedDB names
  const writes: Promise<void>[] = [];
  if (quickCss !== null) {
    writes.push(writeStore('VencordData', 'VencordStore', [['VencordQuickCss', quickCss]]));
  }
  if (themes.length !== 0) {
    writes.push(writeStore('VencordThemes', 'VencordThemeData', themes));
  }
  await Promise.all(
    writes.map((write) =>
      write.catch((error) => {
        console.error('Failed to apply Legcord mod browser data:', error);
      })
    )
  );
}

const payload = JSON.stringify({ ...spec, themes });
const browserSource = await readFile(join(browserBuild, 'browser.js'), 'utf8');
await mkdir(output, { recursive: true });
await writeFile(
  join(output, 'browser.js'),
  `;(async () => {
await (${bootstrap.toString()})(${payload});
${browserSource}
;globalThis.Vencord = Vencord;
})()
`
);
await copyFile(join(browserBuild, 'browser.css'), join(output, 'browser.css'));
