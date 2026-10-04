import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import type { StaticEvaluator, StaticValue } from '../evaluator.js';
import { isSettingsObject, storeAliases, storePath } from './store.js';
import { isActionCallback } from './targets.js';

// Keep broad execution-fallback references separate from paired read/write
// evidence, which excludes action callbacks and unrelated setting keys
export interface StoreEvidence {
  readonly read: boolean;
  readonly write: boolean;
}

export const referencesSettingsStore = (
  node: Node,
  settingKey: string,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[]
): boolean =>
  [node, ...node.getDescendants()].some((candidate) => {
    const store = candidate.asKind(SyntaxKind.PropertyAccessExpression);
    if (
      store?.getName() === 'store' &&
      isSettingsObject(store.getExpression(), checker, settingsBindings)
    ) {
      // Other settings do not justify executing this component, but unresolved
      // keys and references to the whole store still need execution fallback
      const path = storePath(store.getParentOrThrow(), evaluator, checker, settingsBindings);
      return !path?.length || path[0] === settingKey;
    }
    const call = candidate.asKind(SyntaxKind.CallExpression);
    const property = call?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (
      property?.getName() !== 'use' ||
      !isSettingsObject(property.getExpression(), checker, settingsBindings)
    )
      return false;
    const keys = call?.getArguments()[0];
    if (!keys) return true;
    const result = evaluator.evaluate(keys);
    return !result.known || !Array.isArray(result.value) || result.value.includes(settingKey);
  });

export const storeEvidence = (
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
