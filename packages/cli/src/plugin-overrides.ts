import { CLI_CONFIG } from '@nixcord/shared';
import fse from 'fs-extra';
import { resolve } from 'pathe';

type JsonObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const defineJsonProperty = (target: JsonObject, key: string, value: unknown): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
};

const merge = (base: unknown, override: unknown): unknown => {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;

  const result: JsonObject = Object.create(null) as JsonObject;
  for (const [key, value] of Object.entries(base)) defineJsonProperty(result, key, value);
  for (const [key, value] of Object.entries(override)) {
    defineJsonProperty(result, key, key in result ? merge(result[key], value) : value);
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
    if (override === undefined) continue;
    if (!isPlainObject(override)) {
      throw new TypeError(`Plugin overrides category must be a JSON object: ${category}`);
    }

    const targetPath = resolve(pluginsDir, filename);
    const generated = (await fse.readJson(targetPath)) as unknown;
    if (!isPlainObject(generated)) {
      throw new TypeError(`Generated plugin metadata must be a JSON object: ${targetPath}`);
    }
    const merged = merge(generated, override);
    await fse.writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`);
  }
};
