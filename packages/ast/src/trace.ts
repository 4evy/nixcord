import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import type { StaticValue } from './evaluator.js';
import { StaticEvaluator } from './evaluator.js';
import { CONTROL_KINDS, jsxControl } from './tracing/controls.js';
import { forEachNestedDefaults, storeDefault } from './tracing/defaults.js';
import { referencesSettingsStore, type StoreEvidence, storeEvidence } from './tracing/evidence.js';
import { collectTargets } from './tracing/targets.js';

export interface ComponentControlEvidence {
  readonly component: string;
  readonly kind: 'boolean' | 'string' | 'number' | 'enum';
  readonly values?: readonly (string | number | boolean)[];
}

export interface ComponentTrace {
  readonly persistent: boolean;
  // Includes the current setting, unresolved keys, and whole-store access
  readonly storeReferenced: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: StaticValue;
  readonly nestedDefaults?: Readonly<Record<string, StaticValue>>;
  readonly nestedLabels?: Readonly<Record<string, string>>;
  readonly controls: readonly ComponentControlEvidence[];
  readonly evidence: readonly string[];
}

// Combine traversal, store evidence, defaults, and controls into the public trace
export function traceStoreSetting(
  roots: readonly Node[],
  settingKey: string,
  checker: TypeChecker,
  evaluator: StaticEvaluator,
  settingsBindings: readonly Node[] = []
): ComponentTrace {
  const combinedStoreEvidence = roots.reduce<StoreEvidence>(
    (combined, root) => {
      const evidence = storeEvidence(root, settingKey, evaluator, checker, settingsBindings);
      return {
        read: combined.read || evidence.read,
        write: combined.write || evidence.write,
      };
    },
    { read: false, write: false }
  );
  const persistent = combinedStoreEvidence.read && combinedStoreEvidence.write;
  const { hasDefault, defaultValue } = storeDefault(
    roots,
    settingKey,
    evaluator,
    checker,
    settingsBindings,
    true
  );

  return {
    persistent,
    storeReferenced: roots.some((root) =>
      referencesSettingsStore(root, settingKey, evaluator, checker, settingsBindings)
    ),
    hasDefault,
    ...(hasDefault ? { defaultValue } : {}),
    controls: [],
    evidence: persistent ? [`settings.store.${settingKey} has paired read/write evidence`] : [],
  };
}

export function traceComponentSetting(
  component: Node,
  settingKey: string,
  checker: TypeChecker,
  evaluator = new StaticEvaluator(checker),
  controlKinds: Readonly<Record<string, ComponentControlEvidence['kind']>> = CONTROL_KINDS,
  allowedRoot?: string,
  settingsBindings: readonly Node[] = []
): ComponentTrace {
  const targets = collectTargets(component, checker, allowedRoot);
  const allControls = targets.flatMap((target) =>
    [
      ...(target.isKind(SyntaxKind.JsxSelfClosingElement) ||
      target.isKind(SyntaxKind.JsxOpeningElement)
        ? [target]
        : []),
      ...target.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...target.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ]
      .map((jsx) =>
        jsxControl(
          jsx,
          settingKey,
          evaluator,
          checker,
          settingsBindings,
          false,
          false,
          controlKinds
        )
      )
      .filter((value): value is ComponentControlEvidence => value !== undefined)
  );
  const controls = allControls.filter(
    (control, index) =>
      allControls.findIndex(
        (candidate) =>
          candidate.component === control.component &&
          candidate.kind === control.kind &&
          JSON.stringify(candidate.values) === JSON.stringify(control.values)
      ) === index
  );
  const hasLiteralKey = targets.some((target) =>
    [
      ...(target.isKind(SyntaxKind.CallExpression) ? [target] : []),
      ...target.getDescendantsOfKind(SyntaxKind.CallExpression),
    ].some((call) =>
      call.getArguments().some((argument) => {
        const value = evaluator.evaluate(argument);
        return value.known && value.value === settingKey;
      })
    )
  );
  const dynamicKeyNames = hasLiteralKey
    ? new Set(
        targets.flatMap((target) =>
          target.getDescendantsOfKind(SyntaxKind.ElementAccessExpression).flatMap((access) => {
            if (access.getExpression().getText() !== 'settings.store') return [];
            const argument = access.getArgumentExpression();
            return argument?.isKind(SyntaxKind.Identifier) ? [argument.getText()] : [];
          })
        )
      )
    : new Set<string>();
  const dynamicBindings = new Map<string, StaticValue>(
    [...dynamicKeyNames].map((name) => [name, settingKey])
  );
  const combinedStoreEvidence = targets.reduce<StoreEvidence>(
    (combined, target) => {
      const evidence = storeEvidence(
        target,
        settingKey,
        evaluator,
        checker,
        settingsBindings,
        dynamicBindings
      );
      return {
        read: combined.read || evidence.read,
        write: combined.write || evidence.write,
      };
    },
    { read: false, write: false }
  );
  const referenced = combinedStoreEvidence.read && combinedStoreEvidence.write;
  const nestedResults = targets.map((target) =>
    forEachNestedDefaults(target, settingKey, evaluator, checker, settingsBindings)
  );
  const nestedDefaults = Object.assign(
    {},
    ...nestedResults.map((result) => result.defaults)
  ) as Record<string, StaticValue>;
  const nestedLabels = Object.assign({}, ...nestedResults.map((result) => result.labels)) as Record<
    string,
    string
  >;
  const hasNestedDefaults = Object.keys(nestedDefaults).length > 0;
  const hasNestedLabels = Object.keys(nestedLabels).length > 0;

  const { hasDefault, defaultValue } = storeDefault(
    targets,
    settingKey,
    evaluator,
    checker,
    settingsBindings,
    true
  );
  const storeReferenced = targets.some((target) =>
    referencesSettingsStore(target, settingKey, evaluator, checker, settingsBindings)
  );

  const evidence = [
    ...(referenced ? [`settings.store.${settingKey} has paired read/write evidence`] : []),
    ...controls.map((control) => `${control.component} binds the setting`),
    ...(hasNestedDefaults ? ['component initializes nested store values'] : []),
  ];
  return {
    persistent: referenced || controls.length > 0 || hasNestedDefaults,
    storeReferenced,
    hasDefault,
    ...(hasDefault ? { defaultValue } : {}),
    ...(hasNestedDefaults ? { nestedDefaults } : {}),
    ...(hasNestedLabels ? { nestedLabels } : {}),
    controls,
    evidence,
  };
}
