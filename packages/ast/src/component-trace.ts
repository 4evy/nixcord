import { type BinaryExpression, type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import type { StaticValue } from './evaluator.js';
import { StaticEvaluator } from './evaluator.js';
import { resolvedDeclaration } from './node-helpers.js';

export interface ComponentControlEvidence {
  readonly component: string;
  readonly kind: 'boolean' | 'string' | 'number' | 'enum';
  readonly values?: readonly (string | number | boolean)[];
}

export interface ComponentTrace {
  readonly persistent: boolean;
  readonly storeReferenced: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: StaticValue;
  readonly nestedDefaults?: Readonly<Record<string, StaticValue>>;
  readonly nestedLabels?: Readonly<Record<string, string>>;
  readonly controls: readonly ComponentControlEvidence[];
  readonly evidence: readonly string[];
}

const CONTROL_KINDS: Readonly<Record<string, ComponentControlEvidence['kind']>> = {
  Checkbox: 'boolean',
  Switch: 'boolean',
  TextInput: 'string',
  TextArea: 'string',
  FormsFormText: 'string',
  Slider: 'number',
  NumberInput: 'number',
  Select: 'enum',
  RadioGroup: 'enum',
  SearchableSelect: 'enum',
  FormSwitch: 'boolean',
};

const callableBody = (declaration: Node | undefined): Node | undefined => {
  if (
    declaration?.isKind(SyntaxKind.FunctionDeclaration) ||
    declaration?.isKind(SyntaxKind.MethodDeclaration)
  )
    return declaration.getBody();
  const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration)
    ? declaration.getInitializer()
    : declaration;
  if (
    initializer?.isKind(SyntaxKind.ArrowFunction) ||
    initializer?.isKind(SyntaxKind.FunctionExpression)
  )
    return initializer.getBody();
  return initializer;
};

const collectTargets = (root: Node, checker: TypeChecker, allowedRoot?: string): Node[] => {
  const queue: Node[] = [root];
  const output: Node[] = [];
  const seen = new Set<string>();
  const sourceMarker = '/src/';
  const sourceMarkerIndex = allowedRoot?.lastIndexOf(sourceMarker) ?? -1;
  const allowedSourceSuffix =
    allowedRoot && sourceMarkerIndex >= 0 ? allowedRoot.slice(sourceMarkerIndex) : undefined;
  const isAllowedSource = (filePath: string): boolean =>
    !allowedRoot ||
    filePath === allowedRoot ||
    filePath.startsWith(`${allowedRoot}/`) ||
    Boolean(
      allowedSourceSuffix &&
        (filePath.endsWith(allowedSourceSuffix) || filePath.includes(`${allowedSourceSuffix}/`))
    );
  const enqueue = (node: Node | undefined): void => {
    if (!node) return;
    if (!isAllowedSource(node.getSourceFile().getFilePath())) return;
    queue.push(node);
  };
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const key = `${current.getSourceFile().getFilePath()}:${current.getStart()}:${current.getEnd()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(current);

    if (
      current.isKind(SyntaxKind.Identifier) ||
      current.isKind(SyntaxKind.PropertyAccessExpression)
    ) {
      const resolvedBody = callableBody(resolvedDeclaration(current, checker));
      if (resolvedBody !== current) enqueue(resolvedBody);
    }
    if (current.isKind(SyntaxKind.ConditionalExpression)) {
      for (const branch of [current.getWhenTrue(), current.getWhenFalse()]) {
        const body = callableBody(resolvedDeclaration(branch, checker));
        enqueue(body);
      }
    }

    for (const jsx of [
      ...current.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...current.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ]) {
      if (isActionCallback(jsx)) continue;
      const tag = jsx.getTagNameNode();
      const body = callableBody(resolvedDeclaration(tag, checker));
      enqueue(body);
    }
    const calls = [
      ...(current.isKind(SyntaxKind.CallExpression) ? [current] : []),
      ...current.getDescendantsOfKind(SyntaxKind.CallExpression),
    ];
    for (const call of calls) {
      if (isActionCallback(call)) continue;
      const expression = call.getExpression();
      const body = callableBody(resolvedDeclaration(expression, checker));
      enqueue(body);
      for (const argument of call.getArguments()) {
        if (
          argument.isKind(SyntaxKind.ArrowFunction) ||
          argument.isKind(SyntaxKind.FunctionExpression)
        )
          enqueue(argument.getBody());
        else {
          const argumentBody = callableBody(resolvedDeclaration(argument, checker));
          enqueue(argumentBody);
        }
      }
    }
  }
  return output;
};

const staticKey = (
  node: Node | undefined,
  evaluator: StaticEvaluator,
  bindings: ReadonlyMap<string, StaticValue>
): string | undefined => {
  if (!node) return undefined;
  const result = evaluator.evaluate(node, bindings);
  return result.known && (typeof result.value === 'string' || typeof result.value === 'number')
    ? String(result.value)
    : undefined;
};

const nodeKey = (node: Node): string =>
  `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;

const isSettingsObject = (
  node: Node,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  visited = new Set<string>()
): boolean => {
  if (settingsBindings.length === 0) return node.getText() === 'settings';
  const bindingKeys = new Set(settingsBindings.map(nodeKey));
  const key = nodeKey(node);
  if (visited.has(key)) return false;
  visited.add(key);
  if (bindingKeys.has(key)) return true;
  const declaration = resolvedDeclaration(node, checker);
  if (!declaration) return false;
  if (bindingKeys.has(nodeKey(declaration))) return true;
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    return initializer ? isSettingsObject(initializer, checker, settingsBindings, visited) : false;
  }
  return false;
};

const storePath = (
  node: Node,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  bindings: ReadonlyMap<string, StaticValue> = new Map(),
  aliases: ReadonlyMap<string, readonly string[]> = new Map()
): string[] | undefined => {
  const parts: string[] = [];
  let current: Node = node;
  while (true) {
    if (
      current.isKind(SyntaxKind.ParenthesizedExpression) ||
      current.isKind(SyntaxKind.AsExpression) ||
      current.isKind(SyntaxKind.TypeAssertionExpression) ||
      current.isKind(SyntaxKind.NonNullExpression) ||
      current.isKind(SyntaxKind.SatisfiesExpression)
    ) {
      current = current.getExpression();
      continue;
    }
    const storeProperty = current.asKind(SyntaxKind.PropertyAccessExpression);
    if (
      storeProperty?.getName() === 'store' &&
      isSettingsObject(storeProperty.getExpression(), checker, settingsBindings)
    )
      return parts;
    const storeElement = current.asKind(SyntaxKind.ElementAccessExpression);
    if (
      storeElement &&
      staticKey(storeElement.getArgumentExpression(), evaluator, bindings) === 'store' &&
      isSettingsObject(storeElement.getExpression(), checker, settingsBindings)
    )
      return parts;
    if (current.isKind(SyntaxKind.PropertyAccessExpression)) {
      parts.unshift(current.getName());
      current = current.getExpression();
      continue;
    }
    if (current.isKind(SyntaxKind.ElementAccessExpression)) {
      const key = staticKey(current.getArgumentExpression(), evaluator, bindings);
      if (key === undefined) return undefined;
      parts.unshift(key);
      current = current.getExpression();
      continue;
    }
    break;
  }
  const alias = current.asKind(SyntaxKind.Identifier) ? aliases.get(current.getText()) : undefined;
  return alias ? [...alias, ...parts] : undefined;
};

const storeAliases = (
  node: Node,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  bindings: ReadonlyMap<string, StaticValue> = new Map()
): Map<string, readonly string[]> => {
  const aliases = new Map<string, readonly string[]>();
  for (const declaration of node.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    let unwrapped = initializer;
    while (
      unwrapped.isKind(SyntaxKind.ParenthesizedExpression) ||
      unwrapped.isKind(SyntaxKind.AsExpression) ||
      unwrapped.isKind(SyntaxKind.TypeAssertionExpression) ||
      unwrapped.isKind(SyntaxKind.NonNullExpression) ||
      unwrapped.isKind(SyntaxKind.SatisfiesExpression)
    )
      unwrapped = unwrapped.getExpression();
    const assignment = unwrapped.asKind(SyntaxKind.BinaryExpression);
    const source =
      assignment &&
      [
        SyntaxKind.EqualsToken,
        SyntaxKind.QuestionQuestionEqualsToken,
        SyntaxKind.BarBarEqualsToken,
      ].includes(assignment.getOperatorToken().getKind())
        ? assignment.getLeft()
        : unwrapped;
    const path = storePath(source, evaluator, checker, settingsBindings, bindings, aliases);
    if (path) aliases.set(declaration.getName(), path);
  }
  return aliases;
};

interface StoreEvidence {
  readonly read: boolean;
  readonly write: boolean;
}

const referencesSettingsStore = (
  node: Node,
  checker: TypeChecker,
  settingsBindings: readonly Node[]
): boolean =>
  [node, ...node.getDescendants()].some((candidate) => {
    const store = candidate.asKind(SyntaxKind.PropertyAccessExpression);
    if (
      store?.getName() === 'store' &&
      isSettingsObject(store.getExpression(), checker, settingsBindings)
    )
      return true;
    const call = candidate.asKind(SyntaxKind.CallExpression);
    const property = call?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    return Boolean(
      property?.getName() === 'use' &&
        isSettingsObject(property.getExpression(), checker, settingsBindings)
    );
  });

const jsxCallbackAttribute = (node: Node): string | undefined => {
  const expression = node.getFirstAncestorByKind(SyntaxKind.JsxExpression);
  const attribute = expression?.getParentIfKind(SyntaxKind.JsxAttribute);
  return attribute?.getNameNode().getText();
};

const SETTING_BINDING_CALLBACKS = new Set([
  'onChange',
  'onInput',
  'onSelect',
  'onValueChange',
  'select',
]);

const isActionCallback = (node: Node): boolean => {
  const attribute = jsxCallbackAttribute(node);
  if (!attribute || SETTING_BINDING_CALLBACKS.has(attribute)) return false;
  return attribute === 'action' || /^on[A-Z]/.test(attribute);
};

const isJsxCallback = (node: Node): boolean => jsxCallbackAttribute(node) !== undefined;

const storeEvidence = (
  node: Node,
  settingKey: string,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  bindings: ReadonlyMap<string, StaticValue> = new Map()
): StoreEvidence => {
  const aliases = storeAliases(node, evaluator, checker, settingsBindings, bindings);
  let read = false;
  let write = false;
  for (const candidate of [node, ...node.getDescendants()]) {
    if (isActionCallback(candidate)) continue;
    if (
      storePath(candidate, evaluator, checker, settingsBindings, bindings, aliases)?.[0] !==
      settingKey
    )
      continue;
    const assignment = candidate.getFirstAncestorByKind(SyntaxKind.BinaryExpression);
    const assignmentKind = assignment?.getOperatorToken().getKind();
    const isAssignment =
      assignment &&
      [
        SyntaxKind.EqualsToken,
        SyntaxKind.QuestionQuestionEqualsToken,
        SyntaxKind.BarBarEqualsToken,
      ].includes(assignmentKind as SyntaxKind);
    if (
      isAssignment &&
      candidate.getStart() >= assignment.getLeft().getStart() &&
      candidate.getEnd() <= assignment.getLeft().getEnd()
    ) {
      write = true;
      if (assignmentKind !== SyntaxKind.EqualsToken) read = true;
    } else read = true;
  }
  for (const call of node.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isActionCallback(call)) continue;
    const property = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (
      property?.getName() !== 'use' ||
      !isSettingsObject(property.getExpression(), checker, settingsBindings)
    )
      continue;
    const keys = call.getArguments()[0];
    if (!keys) {
      read = true;
      continue;
    }
    const result = evaluator.evaluate(keys, bindings);
    if (result.known && Array.isArray(result.value) && result.value.includes(settingKey))
      read = true;
  }
  return { read, write };
};

const jsxControl = (
  node: Node,
  settingKey: string,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  directIdentifier = false,
  assumeRelated = false,
  controlKinds: Readonly<Record<string, ComponentControlEvidence['kind']>> = CONTROL_KINDS
): ComponentControlEvidence | undefined => {
  const jsx =
    node.asKind(SyntaxKind.JsxSelfClosingElement) ?? node.asKind(SyntaxKind.JsxOpeningElement);
  if (!jsx) return undefined;
  const component = jsx.getTagNameNode().getText().split('.').at(-1) ?? '';
  const kind = controlKinds[component];
  if (!kind) return undefined;
  const referencesSetting = jsx.getAttributes().some((attribute) => {
    const expression = attribute
      .asKind(SyntaxKind.JsxAttribute)
      ?.getInitializer()
      ?.asKind(SyntaxKind.JsxExpression)
      ?.getExpression();
    if (!expression) return false;
    const evidence = storeEvidence(expression, settingKey, evaluator, checker, settingsBindings);
    return (
      assumeRelated ||
      evidence.read ||
      evidence.write ||
      (directIdentifier &&
        [expression, ...expression.getDescendants()].some(
          (candidate) =>
            candidate.isKind(SyntaxKind.Identifier) && candidate.getText() === settingKey
        ))
    );
  });
  if (!referencesSetting) return undefined;

  const optionsAttribute = jsx
    .getAttributes()
    .find(
      (attribute) =>
        attribute.asKind(SyntaxKind.JsxAttribute)?.getNameNode().getText() === 'options'
    )
    ?.asKind(SyntaxKind.JsxAttribute)
    ?.getInitializer()
    ?.asKind(SyntaxKind.JsxExpression)
    ?.getExpression();
  const options = optionsAttribute ? evaluator.evaluate(optionsAttribute) : undefined;
  const values =
    options?.known && Array.isArray(options.value)
      ? options.value
          .map((item) =>
            item && typeof item === 'object' && !Array.isArray(item)
              ? (item as Record<string, StaticValue>).value
              : item
          )
          .filter((value): value is string | number | boolean =>
            ['string', 'number', 'boolean'].includes(typeof value)
          )
      : undefined;
  return { component, kind, ...(values?.length ? { values } : {}) };
};

interface NestedComponentDefaults {
  readonly defaults: Record<string, StaticValue>;
  readonly labels: Record<string, string>;
}

const forEachNestedDefaults = (
  target: Node,
  settingKey: string,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[]
): NestedComponentDefaults => {
  const defaults: Record<string, StaticValue> = {};
  const labels: Record<string, string> = {};
  const aliases = storeAliases(target, evaluator, checker, settingsBindings);
  for (const call of target.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const property = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (property?.getName() !== 'forEach') continue;
    const source = evaluator.evaluate(property.getExpression());
    const callback = call.getArguments()[0]?.asKind(SyntaxKind.ArrowFunction);
    if (!source.known || !Array.isArray(source.value) || !callback) continue;
    const parameter = callback.getParameters()[0]?.getName();
    if (!parameter) continue;
    for (const item of source.value) {
      const bindings = new Map<string, StaticValue>([[parameter, item]]);
      for (const assignment of callback
        .getBody()
        .getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
        if (!isDefaultAssignment(assignment)) continue;
        const path = storePath(
          assignment.getLeft(),
          evaluator,
          checker,
          settingsBindings,
          bindings,
          aliases
        );
        if (path?.[0] !== settingKey || path.length < 2) continue;
        const value = evaluator.evaluate(assignment.getRight(), bindings);
        if (value.known && !('callable' in Object(value.value ?? {})))
          defaults[path[1]] = value.value as StaticValue;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const label = (item as Record<string, StaticValue>).displayName;
          if (typeof label === 'string') labels[path[1]] = label;
        }
      }
    }
  }
  return { defaults, labels };
};

const isDefaultAssignment = (assignment: BinaryExpression): boolean =>
  [SyntaxKind.EqualsToken, SyntaxKind.QuestionQuestionEqualsToken].includes(
    assignment.getOperatorToken().getKind()
  );

const storeDefault = (
  roots: readonly Node[],
  settingKey: string,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  ignoreActionCallbacks = false
): Pick<ComponentTrace, 'hasDefault' | 'defaultValue'> => {
  let hasDefault = false;
  let defaultValue: StaticValue;
  for (const root of roots) {
    const aliases = storeAliases(root, evaluator, checker, settingsBindings);
    for (const assignment of root.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      if (!isDefaultAssignment(assignment) || (ignoreActionCallbacks && isJsxCallback(assignment)))
        continue;
      const path = storePath(
        assignment.getLeft(),
        evaluator,
        checker,
        settingsBindings,
        new Map(),
        aliases
      );
      if (path?.length !== 1 || path[0] !== settingKey) continue;
      const result = evaluator.evaluate(assignment.getRight());
      if (result.known) {
        hasDefault = true;
        defaultValue = result.value as StaticValue;
      }
    }
  }
  return { hasDefault, ...(hasDefault ? { defaultValue } : {}) };
};

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
    storeReferenced: roots.some((root) => referencesSettingsStore(root, checker, settingsBindings)),
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
    referencesSettingsStore(target, checker, settingsBindings)
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
