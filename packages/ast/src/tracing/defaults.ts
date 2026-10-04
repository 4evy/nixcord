import { type BinaryExpression, type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import type { StaticEvaluator, StaticValue } from '../evaluator.js';
import type { ComponentTrace } from '../trace.js';
import { storeAliases, storePath } from './store.js';
import { isJsxCallback } from './targets.js';

// Trace direct defaults and statically enumerable nested defaults separately:
// direct defaults can exclude every JSX callback, not only action callbacks
interface NestedComponentDefaults {
  readonly defaults: Record<string, StaticValue>;
  readonly labels: Record<string, string>;
}

export const forEachNestedDefaults = (
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

export const storeDefault = (
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
