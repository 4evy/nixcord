import {
  executeComponentSlice,
  type StaticValue,
  traceComponentSetting,
  traceStoreSetting,
} from '@nixcord/ast';
import type { PluginConfig, PluginSetting, SettingScalar, SettingType } from '@nixcord/shared';
import { type Node, type ObjectLiteralExpression, SyntaxKind } from 'ts-morph';
import { diagnostic, type PluginContext, type RawRecord } from '../context.js';
import type { SourceProfile } from '../profiles.js';
import { objectPropertyInitializer } from '../resolve.js';
import { isRecord, JsonValueSchema, propertyKey } from './extract.js';
import {
  enumValuesFromType,
  explicitTypeText,
  implicitDefaultForType,
  optionsFromNode,
  optionTypeFrom,
  rawOptions,
} from './infer.js';
import { applySettingRule, inferTypeFromValue } from './rules.js';

// Normalize definitions using component evidence and bounded execution fallback
const componentInitializer = (
  definitionNode: ObjectLiteralExpression | undefined
): Node | undefined => {
  const property = definitionNode?.getProperty('component');
  if (property?.isKind(SyntaxKind.MethodDeclaration)) return property;
  return property?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
};

const nestedConfigFromDefaults = (
  name: string,
  defaults: Readonly<Record<string, StaticValue>>,
  labels: Readonly<Record<string, string>> | undefined,
  profile: SourceProfile
): PluginConfig => ({
  name,
  settings: Object.fromEntries(
    Object.entries(defaults).map(([entryName, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const label = labels?.[entryName];
        const parentDescription = label
          ? `${label}${profile.structuredComponentDescriptions.parentSuffix}`
          : undefined;
        const children = Object.fromEntries(
          Object.entries(value).flatMap(([childName, childValue]) => {
            const converted = JsonValueSchema.safeParse(childValue);
            return converted.success
              ? [
                  [
                    childName,
                    {
                      name: childName,
                      type: inferTypeFromValue(converted.data),
                      default: converted.data,
                      ...(parentDescription &&
                      profile.structuredComponentDescriptions.childTemplates[childName]
                        ? {
                            description: profile.structuredComponentDescriptions.childTemplates[
                              childName
                            ].replace('{parent}', parentDescription),
                          }
                        : {}),
                    } satisfies PluginSetting,
                  ],
                ]
              : [];
          })
        );
        return [
          entryName,
          {
            name: entryName,
            ...(parentDescription ? { description: parentDescription } : {}),
            settings: children,
          } satisfies PluginConfig,
        ];
      }
      const converted = JsonValueSchema.safeParse(value);
      return [
        entryName,
        {
          name: entryName,
          type: inferTypeFromValue(converted.success ? converted.data : undefined),
          ...(converted.success ? { default: converted.data } : {}),
        } satisfies PluginSetting,
      ];
    })
  ),
});

const settingFromComponentTrace = (
  key: string,
  trace: ReturnType<typeof traceComponentSetting>,
  metadata: Pick<PluginSetting, 'description' | 'placeholder' | 'hidden' | 'restartNeeded'>,
  profile: SourceProfile,
  contextualType: string | undefined,
  allowImplicitDefault: boolean
): PluginSetting | PluginConfig | undefined => {
  if (trace.nestedDefaults)
    return nestedConfigFromDefaults(key, trace.nestedDefaults, trace.nestedLabels, profile);
  if (!trace.persistent) return undefined;
  const control = trace.controls[0];
  let type: SettingType;
  if (control?.kind === 'boolean') type = { kind: 'boolean' };
  else if (control?.kind === 'number') type = { kind: 'float' };
  else if (control?.kind === 'enum' && control.values?.length)
    type = { kind: 'enum', values: control.values };
  else if (trace.hasDefault) {
    const converted = JsonValueSchema.safeParse(trace.defaultValue);
    type = inferTypeFromValue(converted.success ? converted.data : undefined);
  } else type = inferTypeFromValue(undefined, contextualType);
  const converted = JsonValueSchema.safeParse(trace.defaultValue);
  return {
    name: key,
    type,
    ...metadata,
    ...(trace.hasDefault && converted.success
      ? { default: converted.data }
      : allowImplicitDefault
        ? implicitDefaultForType(type)
        : {}),
  };
};

export async function normalizeSetting(
  key: string,
  raw: RawRecord,
  definitionNode: ObjectLiteralExpression | undefined,
  context: PluginContext,
  pluginName: string,
  settingPath: string,
  settingsBindings: readonly Node[] = []
): Promise<PluginSetting | PluginConfig | undefined> {
  const definitionKeys = new Set([
    'type',
    'default',
    'description',
    'name',
    'options',
    'component',
    'placeholder',
    'restartNeeded',
    'hidden',
  ]);
  const isDefinition =
    Object.keys(raw).some((name) => definitionKeys.has(name)) ||
    Boolean(
      definitionNode?.getProperties().some((property) => {
        if (
          !property.isKind(SyntaxKind.PropertyAssignment) &&
          !property.isKind(SyntaxKind.MethodDeclaration) &&
          !property.isKind(SyntaxKind.GetAccessor)
        )
          return false;
        const name = propertyKey(property.getNameNode(), context.evaluator);
        return name !== undefined && definitionKeys.has(name);
      })
    );
  if (!isDefinition) {
    const nestedEntries = await Promise.all(
      Object.entries(raw).map(async ([childKey, child]) =>
        isRecord(child)
          ? ([
              childKey,
              await normalizeSetting(
                childKey,
                child,
                undefined,
                context,
                pluginName,
                `${settingPath}.${childKey}`,
                settingsBindings
              ),
            ] as const)
          : ([childKey, undefined] as const)
      )
    );
    return {
      name: key,
      settings: Object.fromEntries(
        nestedEntries.filter(
          (entry): entry is readonly [string, PluginSetting | PluginConfig] =>
            entry[1] !== undefined
        )
      ),
    };
  }

  if (raw.hidden === true && !context.profile.includeHiddenSettings) {
    context.diagnostics.push(
      diagnostic(
        'hidden-setting-skipped',
        'info',
        'normalization',
        'Hidden setting omitted by source profile',
        {
          pluginName,
          settingPath,
          ...(definitionNode ? { node: definitionNode } : {}),
        }
      )
    );
    return undefined;
  }

  const metadata = {
    ...(typeof raw.description === 'string'
      ? { description: raw.description }
      : typeof raw.name === 'string'
        ? { description: raw.name }
        : {}),
    ...(typeof raw.placeholder === 'string' ? { placeholder: raw.placeholder } : {}),
    ...(raw.hidden === true ? { hidden: true } : {}),
    ...(raw.restartNeeded === true ? { restartNeeded: true } : {}),
  };
  const defaultNode = objectPropertyInitializer(definitionNode, 'default');
  const convertedDefault = JsonValueSchema.safeParse(raw.default);
  const hasDeclaredDefault = Object.hasOwn(raw, 'default');
  const hasDefault = hasDeclaredDefault && convertedDefault.success;
  if (hasDeclaredDefault && !convertedDefault.success) {
    context.diagnostics.push(
      diagnostic(
        'unsupported-default-value',
        'warning',
        'normalization',
        'Default value is not finite or JSON-serializable and was omitted',
        {
          pluginName,
          settingPath,
          ...(defaultNode ? { node: defaultNode } : {}),
        }
      )
    );
  }
  const typeNode = objectPropertyInitializer(definitionNode, 'type');
  const optionType = optionTypeFrom(typeNode, raw.type, context.profile);
  const component = componentInitializer(definitionNode);
  const contextualType = explicitTypeText(defaultNode, context.session.checker);
  const hasSourceDefault =
    Object.hasOwn(raw, 'default') || Boolean(definitionNode?.getProperty('default'));

  if ((optionType === 'COMPONENT' || optionType === 'CUSTOM') && !hasDefault && component) {
    let trace = traceComponentSetting(
      component,
      key,
      context.session.checker,
      context.evaluator,
      context.profile.controlComponents,
      context.pluginPath,
      settingsBindings
    );
    if (!trace.persistent) {
      const pluginTrace = traceStoreSetting(
        context.sourceFiles,
        key,
        context.session.checker,
        context.evaluator,
        settingsBindings
      );
      if (pluginTrace.persistent) trace = pluginTrace;
    }
    const traced = settingFromComponentTrace(
      key,
      trace,
      metadata,
      context.profile,
      contextualType,
      !hasSourceDefault
    );
    if (traced) return traced;

    if (context.executionMode === 'fallback' && trace.storeReferenced) {
      const executed = await context.executionLimit(() =>
        executeComponentSlice(component, context.session.checker, {
          settingKey: key,
          allowedRoot: context.pluginPath,
        })
      );
      if (executed.ok) {
        const readsSetting = executed.events.some(
          (event) => event.kind === 'read' && event.path?.[0] === key
        );
        const writes = executed.events.filter(
          (event) => event.kind === 'write' && event.path?.[0] === key
        );
        if (readsSetting && writes.length > 0) {
          const controlKind = executed.events.flatMap((event) => {
            if (event.kind !== 'control' || !event.component) return [];
            const component = event.component.split('.').at(-1);
            const kind = component ? context.profile.controlComponents[component] : undefined;
            return kind ? [kind] : [];
          })[0];
          const convertedDefault = JsonValueSchema.safeParse(executed.value);
          const convertedWrite = JsonValueSchema.safeParse(writes.at(-1)?.value);
          const type: SettingType =
            controlKind === 'boolean'
              ? { kind: 'boolean' }
              : controlKind === 'number'
                ? { kind: 'float' }
                : executed.hasDefault && convertedDefault.success
                  ? inferTypeFromValue(convertedDefault.data, contextualType)
                  : convertedWrite.success
                    ? inferTypeFromValue(convertedWrite.data, contextualType)
                    : inferTypeFromValue(undefined, contextualType);
          return {
            name: key,
            type,
            ...metadata,
            ...(executed.hasDefault && convertedDefault.success
              ? { default: convertedDefault.data }
              : !hasSourceDefault
                ? implicitDefaultForType(type)
                : {}),
          };
        }
      } else {
        context.diagnostics.push(
          diagnostic(executed.code, 'warning', 'execution', executed.message, {
            pluginName,
            settingPath,
            node: component,
            evidence: executed.evidence,
          })
        );
      }
    }

    context.diagnostics.push(
      diagnostic(
        'component-ui-only',
        'info',
        'normalization',
        'Component has no persistent store or recognized control evidence',
        {
          pluginName,
          settingPath,
          node: component,
          evidence: trace.evidence,
        }
      )
    );
    return undefined;
  }

  const options = rawOptions(raw.options);
  const optionsNode = objectPropertyInitializer(definitionNode, 'options');
  const resolvedOptions = options.length > 0 ? options : optionsFromNode(optionsNode, context);
  let contextualEnumValues: readonly SettingScalar[] | undefined;
  if (
    resolvedOptions.length === 0 &&
    defaultNode &&
    (optionType === 'CUSTOM' || optionType === 'COMPONENT')
  ) {
    try {
      contextualEnumValues = enumValuesFromType(
        defaultNode,
        context.session.checker,
        context.profile
      );
    } catch {}
  }
  const rule = applySettingRule({
    optionType,
    hasDefault,
    hasDeclaredDefault: hasSourceDefault,
    ...(hasDefault ? { defaultValue: convertedDefault.data } : {}),
    options:
      contextualEnumValues && contextualEnumValues.length > 1
        ? contextualEnumValues.map((value) => ({
            value,
            isDefault: hasDefault && convertedDefault.data === value,
          }))
        : resolvedOptions,
    contextualType,
  });
  return {
    name: key,
    type: rule.type,
    ...metadata,
    ...(rule.hasDefault && rule.defaultValue !== undefined ? { default: rule.defaultValue } : {}),
  };
}
