import type { PluginConfig, PluginSetting, SettingScalar } from '@nixcord/domain';
import { type Node, type ObjectLiteralExpression, SyntaxKind } from '@nixcord/typescript-analysis';
import * as v from 'valibot';
import { diagnostic, type PluginContext, type RawRecord } from '../context.js';
import { objectPropertyInitializer } from '../resolve.js';
import { componentInitializer, normalizeComponentSetting } from './component/component.js';
import { isRecord, JsonValueSchema, propertyKey } from './extract.js';
import {
  enumValuesFromType,
  explicitTypeContext,
  optionsFromNode,
  optionTypeFrom,
  rawOptions,
} from './infer.js';
import { applySettingRule, type DefaultEvidence } from './rules.js';

// Normalize definitions using component evidence and bounded execution fallback
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
  const convertedDefault = v.safeParse(JsonValueSchema, raw.default);
  const hasDeclaredDefault = Object.hasOwn(raw, 'default');
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
  const contextualType = await explicitTypeContext(defaultNode, context.session.checker);
  const defaultEvidence: DefaultEvidence =
    hasDeclaredDefault && convertedDefault.success
      ? { kind: 'known', value: convertedDefault.output }
      : hasDeclaredDefault || definitionNode?.getProperty('default')
        ? { kind: 'unresolved' }
        : { kind: 'absent' };

  if (
    (optionType === 'COMPONENT' || optionType === 'CUSTOM') &&
    defaultEvidence.kind !== 'known' &&
    component
  )
    return normalizeComponentSetting({
      key,
      component,
      context,
      pluginName,
      settingPath,
      settingsBindings,
      metadata,
      contextualType,
      defaultEvidence,
    });

  const options = rawOptions(raw.options);
  const optionsNode = objectPropertyInitializer(definitionNode, 'options');
  const inferredOptions = options.length > 0 ? undefined : optionsFromNode(optionsNode, context);
  // A dynamic spread must not turn a known subset into a closed enum
  const resolvedOptions =
    inferredOptions?.complete === false ? [] : (inferredOptions?.options ?? options);
  let ruleDefaultEvidence = defaultEvidence;
  if (
    defaultEvidence.kind === 'absent' &&
    inferredOptions &&
    (optionType === 'SELECT' || optionType === 'CUSTOM')
  ) {
    ruleDefaultEvidence = inferredOptions.defaultEvidence;
    if (!inferredOptions.complete && ruleDefaultEvidence.kind === 'absent')
      ruleDefaultEvidence = { kind: 'unresolved' };
  }
  let contextualEnumValues: readonly SettingScalar[] | undefined;
  if (
    resolvedOptions.length === 0 &&
    defaultNode &&
    (optionType === 'CUSTOM' || optionType === 'COMPONENT')
  ) {
    try {
      contextualEnumValues = await enumValuesFromType(
        defaultNode,
        context.session.checker,
        context.profile
      );
    } catch {}
  }
  const rule = applySettingRule({
    optionType,
    defaultEvidence: ruleDefaultEvidence,
    options:
      contextualEnumValues && contextualEnumValues.length > 1
        ? contextualEnumValues.map((value) => ({
            value,
            isDefault: defaultEvidence.kind === 'known' && defaultEvidence.value === value,
          }))
        : resolvedOptions,
    contextualType,
  });
  return {
    name: key,
    type: rule.type,
    ...metadata,
    ...(rule.defaultValue !== undefined ? { default: rule.defaultValue } : {}),
  };
}
