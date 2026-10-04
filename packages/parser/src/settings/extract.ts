import type { StaticEvaluator } from '@nixcord/ast';
import type { SettingValue } from '@nixcord/shared';
import { type Node, type ObjectLiteralExpression, SyntaxKind, type TypeChecker } from 'ts-morph';
import * as z from 'zod';
import type { RawRecord, UnresolvedAstValue } from '../context.js';
import { resolveNode } from '../resolve.js';

// Recover raw settings with source nodes and unresolved-value evidence
const DIAGNOSTIC_SETTING_FIELDS = new Set([
  'default',
  'description',
  'name',
  'options',
  'placeholder',
  'restartNeeded',
  'hidden',
]);

const recordUnresolvedAstValue = (
  unresolved: UnresolvedAstValue[],
  item: UnresolvedAstValue
): void => {
  const segments = item.path?.split('.') ?? [];
  if (
    segments.length > 1 &&
    !segments.slice(1).some((segment) => DIAGNOSTIC_SETTING_FIELDS.has(segment))
  )
    return;
  unresolved.push(item);
};

export const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('callable' in value);

export const JsonValueSchema: z.ZodType<SettingValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.array(JsonValueSchema),
    z
      .custom<RawRecord>(isRecord)
      .transform((value) =>
        Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
      )
      .pipe(z.record(z.string(), JsonValueSchema)),
  ])
);

export const settingNodeMap = (
  node: Node | undefined,
  checker: TypeChecker,
  evaluator: StaticEvaluator,
  visited = new Set<string>()
): Map<string, ObjectLiteralExpression> => {
  const output = new Map<string, ObjectLiteralExpression>();
  const resolved = resolveNode(node, checker);
  if (!resolved) return output;
  const key = `${resolved.getSourceFile().getFilePath()}:${resolved.getStart()}`;
  if (visited.has(key)) return output;
  visited.add(key);
  const object = resolved.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!object) return output;
  for (const property of object.getProperties()) {
    if (property.isKind(SyntaxKind.SpreadAssignment)) {
      for (const [name, value] of settingNodeMap(
        property.getExpression(),
        checker,
        evaluator,
        visited
      ))
        output.set(name, value);
      continue;
    }
    if (!property.isKind(SyntaxKind.PropertyAssignment)) continue;
    const name = propertyKey(property.getNameNode(), evaluator);
    if (name === undefined) continue;
    const value = resolveNode(property.getInitializer(), checker)?.asKind(
      SyntaxKind.ObjectLiteralExpression
    );
    if (value) output.set(name, value);
  }
  return output;
};

export const propertyKey = (node: Node, evaluator: StaticEvaluator): string | undefined => {
  if (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NumericLiteral))
    return String(node.getLiteralValue());
  if (node.isKind(SyntaxKind.Identifier)) return node.getText();
  const computed = node.asKind(SyntaxKind.ComputedPropertyName)?.getExpression();
  const result = evaluator.evaluate(computed ?? node);
  if (result.known && (typeof result.value === 'string' || typeof result.value === 'number'))
    return String(result.value);
  return undefined;
};

const rawObjectFromAst = (
  object: ObjectLiteralExpression,
  checker: TypeChecker,
  evaluator: StaticEvaluator,
  visited = new Set<string>(),
  unresolved: UnresolvedAstValue[] = [],
  parentPath = ''
): RawRecord => {
  const visitKey = `${object.getSourceFile().getFilePath()}:${object.getStart()}`;
  if (visited.has(visitKey)) {
    recordUnresolvedAstValue(unresolved, {
      node: object,
      ...(parentPath ? { path: parentPath } : {}),
      reason: 'Cyclic object definition could not be normalized',
    });
    return {};
  }
  visited.add(visitKey);
  const output: RawRecord = {};
  for (const property of object.getProperties()) {
    if (property.isKind(SyntaxKind.SpreadAssignment)) {
      const spreadObject = resolveNode(property.getExpression(), checker)?.asKind(
        SyntaxKind.ObjectLiteralExpression
      );
      if (spreadObject) {
        Object.assign(
          output,
          rawObjectFromAst(spreadObject, checker, evaluator, visited, unresolved, parentPath)
        );
        continue;
      }
      const spread = evaluator.evaluate(property.getExpression());
      if (spread.known && isRecord(spread.value)) Object.assign(output, spread.value);
      else
        recordUnresolvedAstValue(unresolved, {
          node: property.getExpression(),
          ...(parentPath ? { path: parentPath } : {}),
          reason: spread.known ? 'Spread value did not evaluate to an object' : spread.reason,
        });
      continue;
    }
    if (property.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      const result = evaluator.evaluate(property.getNameNode());
      if (result.known) output[property.getName()] = result.value;
      else
        recordUnresolvedAstValue(unresolved, {
          node: property.getNameNode(),
          path: parentPath ? `${parentPath}.${property.getName()}` : property.getName(),
          reason: result.reason,
        });
      continue;
    }
    if (property.isKind(SyntaxKind.GetAccessor) && property.getName() === 'default') {
      recordUnresolvedAstValue(unresolved, {
        node: property,
        path: parentPath ? `${parentPath}.default` : 'default',
        reason: 'Runtime default accessor could not be evaluated statically',
      });
      continue;
    }
    if (!property.isKind(SyntaxKind.PropertyAssignment)) continue;
    const key = propertyKey(property.getNameNode(), evaluator);
    if (key === undefined) {
      recordUnresolvedAstValue(unresolved, {
        node: property.getNameNode(),
        ...(parentPath ? { path: parentPath } : {}),
        reason: 'Computed property name could not be evaluated statically',
      });
      continue;
    }
    const path = parentPath ? `${parentPath}.${key}` : key;
    const initializer = resolveNode(property.getInitializer(), checker);
    const nested = initializer?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (nested) {
      output[key] = rawObjectFromAst(nested, checker, evaluator, visited, unresolved, path);
      continue;
    }
    if (!initializer) continue;
    const result = evaluator.evaluate(initializer);
    if (result.known) output[key] = result.value;
    else recordUnresolvedAstValue(unresolved, { node: initializer, path, reason: result.reason });
  }
  // Remove each definition from `visited` when this branch returns. Settings can
  // share a definition; leaving it marked would discard later defaults and metadata.
  visited.delete(visitKey);
  return output;
};

export const rawSettingsFromArgument = (
  argument: Node,
  checker: TypeChecker,
  evaluator: StaticEvaluator,
  unresolved: UnresolvedAstValue[]
): RawRecord | undefined => {
  const resolved = resolveNode(argument, checker);
  const object = resolved?.asKind(SyntaxKind.ObjectLiteralExpression);
  return object ? rawObjectFromAst(object, checker, evaluator, new Set(), unresolved) : undefined;
};
