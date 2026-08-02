import { CLI_CONFIG } from '@nixcord/shared';
import fse from 'fs-extra';
import { resolve } from 'pathe';

type JsonObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const merge = (base: unknown, override: unknown): unknown => {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;

  const result: JsonObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? merge(result[key], value) : value;
  }
  return result;
};

export const applyPluginOverrides = async (
  overridesPath: string,
  pluginsDir: string
): Promise<void> => {
  const overrides = (await fse.readJson(overridesPath)) as unknown;
  if (!isPlainObject(overrides)) {
    throw new TypeError(`Plugin overrides must be a JSON object: ${overridesPath}`);
  }

  const files = {
    shared: CLI_CONFIG.filenames.shared,
    vencord: CLI_CONFIG.filenames.vencord,
    equicord: CLI_CONFIG.filenames.equicord,
  } as const;

  for (const [category, filename] of Object.entries(files)) {
    const override = overrides[category];
    if (!override) continue;

    const targetPath = resolve(pluginsDir, filename);
    const generated = (await fse.readJson(targetPath)) as unknown;
    const merged = merge(generated, override);
    await fse.writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`);
  }
};
