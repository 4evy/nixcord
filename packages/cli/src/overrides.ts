import { deepmergeCustom } from 'deepmerge-ts';
import fse from 'fs-extra';
import type { CategorySchemas } from './runner/outputs.js';

type JsonObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const merge = deepmergeCustom({ mergeArrays: false, filterValues: false });

const selectApplicableCommonPluginOverride = (
  generatedPlugin: unknown,
  pluginOverride: unknown
): unknown => {
  if (!isPlainObject(generatedPlugin) || !isPlainObject(pluginOverride)) return pluginOverride;

  const overrideSettings = pluginOverride.settings;
  if (!isPlainObject(overrideSettings)) return pluginOverride;

  const generatedSettings = generatedPlugin.settings;
  if (!isPlainObject(generatedSettings)) return undefined;

  const applicableSettings = Object.fromEntries(
    Object.entries(overrideSettings).filter(([name]) => Object.hasOwn(generatedSettings, name))
  );
  const { settings: _settings, ...result } = pluginOverride;
  if (Object.keys(applicableSettings).length > 0) result.settings = applicableSettings;

  return Object.keys(result).length > 0 ? result : undefined;
};

export const applyPluginOverrides = async (
  overridesPath: string,
  schemas: CategorySchemas
): Promise<CategorySchemas> => {
  const overrides = (await fse.readJson(overridesPath)) as unknown;
  if (!isPlainObject(overrides)) {
    throw new TypeError(`Plugin overrides must be a JSON object: ${overridesPath}`);
  }

  const commonOverride = overrides.all;
  if (commonOverride !== undefined && !isPlainObject(commonOverride)) {
    throw new TypeError('Plugin overrides category must be a JSON object: all');
  }

  const result = { ...schemas };
  for (const category of ['shared', 'vencord', 'equicord'] as const) {
    const override = overrides[category];
    if (override === undefined && commonOverride === undefined) continue;
    if (override !== undefined && !isPlainObject(override)) {
      throw new TypeError(`Plugin overrides category must be a JSON object: ${category}`);
    }

    const generated = schemas[category];

    const applicableCommonOverride: JsonObject = Object.create(null) as JsonObject;
    if (isPlainObject(commonOverride)) {
      for (const [pluginName, pluginOverride] of Object.entries(commonOverride)) {
        if (Object.hasOwn(generated, pluginName)) {
          const applicablePluginOverride = selectApplicableCommonPluginOverride(
            generated[pluginName],
            pluginOverride
          );
          if (applicablePluginOverride !== undefined) {
            applicableCommonOverride[pluginName] = applicablePluginOverride;
          }
        }
      }
    }

    const withCommonOverride = merge(generated, applicableCommonOverride);
    const merged =
      override === undefined ? withCommonOverride : merge(withCommonOverride, override);
    result[category] = merged as CategorySchemas[typeof category];
  }
  return result;
};
