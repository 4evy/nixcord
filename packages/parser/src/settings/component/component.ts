import type { PluginConfig, PluginSetting, SettingType } from '@nixcord/domain';
import { traceComponentSetting, traceStoreSetting } from '@nixcord/setting-analysis';
import type { SliceExecutionResult } from '@nixcord/slice-executor';
import type { StaticValue } from '@nixcord/typescript-analysis';
import { type Node, type ObjectLiteralExpression, SyntaxKind } from '@nixcord/typescript-analysis';
import * as v from 'valibot';
import { diagnostic, type PluginContext } from '../../context.js';
import type { SourceProfile } from '../../profiles.js';
import { JsonValueSchema } from '../extract.js';
import { implicitDefaultForType } from '../infer.js';
import { type DefaultEvidence, inferTypeFromValue } from '../rules.js';
import type { TypeContext } from '../type-context.js';

export const componentInitializer = (
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
            const converted = v.safeParse(JsonValueSchema, childValue);
            return converted.success
              ? [
                  [
                    childName,
                    {
                      name: childName,
                      type: inferTypeFromValue(converted.output),
                      default: converted.output,
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
      const converted = v.safeParse(JsonValueSchema, value);
      return [
        entryName,
        {
          name: entryName,
          type: inferTypeFromValue(converted.success ? converted.output : undefined),
          ...(converted.success ? { default: converted.output } : {}),
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
  contextualType: TypeContext | undefined,
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
    const converted = v.safeParse(JsonValueSchema, trace.defaultValue);
    type = inferTypeFromValue(converted.success ? converted.output : undefined);
  } else type = inferTypeFromValue(undefined, contextualType);
  const converted = v.safeParse(JsonValueSchema, trace.defaultValue);
  return {
    name: key,
    type,
    ...metadata,
    ...(trace.hasDefault && converted.success
      ? { default: converted.output }
      : allowImplicitDefault
        ? implicitDefaultForType(type)
        : {}),
  };
};

type ComponentSettingOptions = {
  key: string;
  component: Node;
  context: PluginContext;
  pluginName: string;
  settingPath: string;
  settingsBindings: readonly Node[];
  metadata: Pick<PluginSetting, 'description' | 'placeholder' | 'hidden' | 'restartNeeded'>;
  contextualType: TypeContext | undefined;
  defaultEvidence: Exclude<DefaultEvidence, { kind: 'known' }>;
};

export async function normalizeComponentSetting(
  options: ComponentSettingOptions
): Promise<PluginSetting | PluginConfig | undefined> {
  const {
    key,
    component,
    context,
    pluginName,
    settingPath,
    settingsBindings,
    metadata,
    contextualType,
    defaultEvidence,
  } = options;
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
    defaultEvidence.kind === 'absent'
  );
  if (traced) return traced;

  if (context.executionMode === 'fallback' && trace.storeReferenced) {
    const executed = await context.executeSlice(component, {
      settingKey: key,
      allowedRoot: context.pluginPath,
    });
    if (executed.ok) {
      const setting = settingFromExecution(options, executed);
      if (setting) return setting;
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

function settingFromExecution(
  options: ComponentSettingOptions,
  executed: Extract<SliceExecutionResult, { ok: true }>
): PluginSetting | undefined {
  const { key, context, metadata, contextualType, defaultEvidence } = options;
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
    const convertedDefault = v.safeParse(JsonValueSchema, executed.value);
    const convertedWrite = v.safeParse(JsonValueSchema, writes.at(-1)?.value);
    const type: SettingType =
      controlKind === 'boolean'
        ? { kind: 'boolean' }
        : controlKind === 'number'
          ? { kind: 'float' }
          : executed.hasDefault && convertedDefault.success
            ? inferTypeFromValue(convertedDefault.output, contextualType)
            : convertedWrite.success
              ? inferTypeFromValue(convertedWrite.output, contextualType)
              : inferTypeFromValue(undefined, contextualType);
    return {
      name: key,
      type,
      ...metadata,
      ...(executed.hasDefault && convertedDefault.success
        ? { default: convertedDefault.output }
        : defaultEvidence.kind === 'absent'
          ? implicitDefaultForType(type)
          : {}),
    };
  }
}
