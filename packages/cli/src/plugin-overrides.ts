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

const selectApplicableCommonPluginOverride = (
  generatedPlugin: unknown,
  pluginOverride: unknown
): unknown => {
  if (!isPlainObject(generatedPlugin) || !isPlainObject(pluginOverride)) return pluginOverride;

  const overrideSettings = pluginOverride.settings;
  if (!isPlainObject(overrideSettings)) return pluginOverride;

  const generatedSettings = generatedPlugin.settings;
  if (!isPlainObject(generatedSettings)) return undefined;

  const applicableSettings: JsonObject = Object.create(null) as JsonObject;
  for (const [settingName, settingOverride] of Object.entries(overrideSettings)) {
    if (Object.hasOwn(generatedSettings, settingName)) {
      defineJsonProperty(applicableSettings, settingName, settingOverride);
    }
  }

  const result: JsonObject = Object.create(null) as JsonObject;
  for (const [key, value] of Object.entries(pluginOverride)) {
    if (key !== 'settings') defineJsonProperty(result, key, value);
  }
  if (Object.keys(applicableSettings).length > 0) {
    defineJsonProperty(result, 'settings', applicableSettings);
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

export const applyPluginOverrides = async (
  overridesPath: string,
  pluginsDir: string
): Promise<void> => {
  const overrides = (await fse.readJson(overridesPath)) as unknown;
  if (!isPlainObject(overrides)) {
    throw new TypeError(`Plugin overrides must be a JSON object: ${overridesPath}`);
  }

  const commonOverride = overrides.all;
  if (commonOverride !== undefined && !isPlainObject(commonOverride)) {
    throw new TypeError('Plugin overrides category must be a JSON object: all');
  }

  const files = {
    shared: CLI_CONFIG.filenames.shared,
    vencord: CLI_CONFIG.filenames.vencord,
    equicord: CLI_CONFIG.filenames.equicord,
  } as const;

  for (const [category, filename] of Object.entries(files)) {
    const override = overrides[category];
    if (override === undefined && commonOverride === undefined) continue;
    if (override !== undefined && !isPlainObject(override)) {
      throw new TypeError(`Plugin overrides category must be a JSON object: ${category}`);
    }

    const targetPath = resolve(pluginsDir, filename);
    const generated = (await fse.readJson(targetPath)) as unknown;
    if (!isPlainObject(generated)) {
      throw new TypeError(`Generated plugin metadata must be a JSON object: ${targetPath}`);
    }

    const applicableCommonOverride: JsonObject = Object.create(null) as JsonObject;
    if (isPlainObject(commonOverride)) {
      for (const [pluginName, pluginOverride] of Object.entries(commonOverride)) {
        if (Object.hasOwn(generated, pluginName)) {
          const applicablePluginOverride = selectApplicableCommonPluginOverride(
            generated[pluginName],
            pluginOverride
          );
          if (applicablePluginOverride !== undefined) {
            defineJsonProperty(applicableCommonOverride, pluginName, applicablePluginOverride);
          }
        }
      }
    }

    const withCommonOverride = merge(generated, applicableCommonOverride);
    const merged =
      override === undefined ? withCommonOverride : merge(withCommonOverride, override);
    await fse.writeFile(targetPath, `${JSON.stringify(merged, null, 2)}\n`);
  }
};
