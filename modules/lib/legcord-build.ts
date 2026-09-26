import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface BundleSpec {
  client: 'vencord' | 'equicord';
  settings: Record<string, unknown>;
  quickCss: string;
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

// Legcord runs this bundle in Discord's page. Seed settings and themes before
// loading the mod so a new profile uses the configured values on its first read.
async function bootstrap({ client, settings, quickCss, themes }: BootstrapConfig): Promise<void> {
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
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        for (const [key, value] of entries) store.put(value, key);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onabort = transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      };
    });
  }

  localStorage.setItem(
    client === 'vencord' ? 'VencordSettings' : 'EquicordSettings',
    JSON.stringify(settings)
  );
  // Both browser mods use Vencord's IndexedDB names.
  await Promise.all([
    writeStore('VencordData', 'VencordStore', [['VencordQuickCss', quickCss]]),
    writeStore('VencordThemes', 'VencordThemeData', themes),
  ]);
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
