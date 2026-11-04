import type { SettingValue } from '@nixcord/domain';
import type { StaticEvaluator } from '@nixcord/typescript-analysis';
import {
  type Node,
  type ObjectLiteralExpression,
  SyntaxKind,
  type TypeChecker,
} from '@nixcord/typescript-analysis';
import * as v from 'valibot';
import type { RawRecord, UnresolvedAstValue } from '../context.js';
import { propertyInitializer, resolveNode } from '../resolve.js';

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

export const JsonValueSchema: v.GenericSchema<unknown, SettingValue> = v.lazy(() =>
  v.union([
    v.null(),
    v.string(),
    v.pipe(v.number(), v.finite()),
    v.boolean(),
    v.array(JsonValueSchema),
    v.pipe(
      v.custom<RawRecord>(isRecord),
      v.transform((value) =>
        Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
      ),
      v.record(v.string(), JsonValueSchema)
    ),
  ])
);

export const settingNodeMap = (
  node: Node | undefined,
  checker: TypeChecker,
  evaluator: StaticEvaluator,
  visited = new Set<string>()
): Map<string, ObjectLiteralExpression> => {
  const output = new Map<string, ObjectLiteralExpression>();
  const collect = (source: Node | undefined): void => {
    if (!source) return;
    const resolved = resolveNode(source, checker);
    const object = resolved?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!object) {
      const spread = evaluator.evaluate(source);
      if (spread.known) {
        if (
          isRecord(spread.value) ||
          Array.isArray(spread.value) ||
          typeof spread.value === 'string'
        )
          for (const name of Object.keys(spread.value)) output.delete(name);
      } else output.clear();
      return;
    }
    const key = `${object.getSourceFile().getFilePath()}:${object.getStart()}`;
    if (visited.has(key)) {
      output.clear();
      return;
    }
    visited.add(key);
    for (const property of object.getProperties()) {
      if (property.isKind(SyntaxKind.SpreadAssignment)) {
        collect(property.getExpression());
        continue;
      }
      if (
        !property.isKind(SyntaxKind.PropertyAssignment) &&
        !property.isKind(SyntaxKind.ShorthandPropertyAssignment) &&
        !property.isKind(SyntaxKind.GetAccessor) &&
        !property.isKind(SyntaxKind.MethodDeclaration)
      )
        continue;
      const name = propertyKey(property.getNameNode(), evaluator);
      if (name === undefined) {
        output.clear();
        continue;
      }
      const value = resolveNode(propertyInitializer(property), checker)?.asKind(
        SyntaxKind.ObjectLiteralExpression
      );
      if (value) output.set(name, value);
      else output.delete(name);
    }
    // Repeated spreads are separate evaluations, not cycles
    visited.delete(key);
  };
  collect(node);
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
  parentPath = '',
  output: RawRecord = {}
): RawRecord => {
  const visitKey = `${object.getSourceFile().getFilePath()}:${object.getStart()}`;
  if (visited.has(visitKey)) {
    recordUnresolvedAstValue(unresolved, {
      node: object,
      ...(parentPath ? { path: parentPath } : {}),
      reason: 'Cyclic object definition could not be normalized',
    });
    for (const key of Object.keys(output)) output[key] = undefined;
    return output;
  }
  visited.add(visitKey);
  for (const property of object.getProperties()) {
    if (property.isKind(SyntaxKind.SpreadAssignment)) {
      const spreadObject = resolveNode(property.getExpression(), checker)?.asKind(
        SyntaxKind.ObjectLiteralExpression
      );
      if (spreadObject) {
        rawObjectFromAst(spreadObject, checker, evaluator, visited, unresolved, parentPath, output);
        continue;
      }
      const spread = evaluator.evaluate(property.getExpression());
      if (spread.known) {
        if (
          isRecord(spread.value) ||
          Array.isArray(spread.value) ||
          typeof spread.value === 'string'
        )
          Object.assign(output, spread.value);
      } else {
        // Keep overwritten keys present so normalization sees unresolved defaults
        for (const key of Object.keys(output)) output[key] = undefined;
        recordUnresolvedAstValue(unresolved, {
          node: property.getExpression(),
          ...(parentPath ? { path: parentPath } : {}),
          reason: spread.reason,
        });
      }
      continue;
    }
    if (
      !property.isKind(SyntaxKind.PropertyAssignment) &&
      !property.isKind(SyntaxKind.ShorthandPropertyAssignment) &&
      !property.isKind(SyntaxKind.GetAccessor) &&
      !property.isKind(SyntaxKind.MethodDeclaration)
    )
      continue;
    const key = propertyKey(property.getNameNode(), evaluator);
    if (key === undefined) {
      for (const key of Object.keys(output)) output[key] = undefined;
      recordUnresolvedAstValue(unresolved, {
        node: property.getNameNode(),
        ...(parentPath ? { path: parentPath } : {}),
        reason: 'Computed property name could not be evaluated statically',
      });
      continue;
    }
    const path = parentPath ? `${parentPath}.${key}` : key;
    const initializer = resolveNode(propertyInitializer(property), checker);
    const nested = initializer?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (nested) {
      output[key] = rawObjectFromAst(nested, checker, evaluator, visited, unresolved, path);
      continue;
    }
    if (!initializer) {
      output[key] = undefined;
      recordUnresolvedAstValue(unresolved, {
        node: property,
        path,
        reason: property.isKind(SyntaxKind.GetAccessor)
          ? 'Accessor does not have a single return expression'
          : 'Property does not have a statically evaluable initializer',
      });
      continue;
    }
    const result = evaluator.evaluate(initializer);
    if (result.known) output[key] = result.value;
    else {
      output[key] = undefined;
      recordUnresolvedAstValue(unresolved, { node: initializer, path, reason: result.reason });
    }
  }
  // Remove each definition from `visited` when this branch returns. Settings can
  // share a definition; leaving it marked would discard later defaults and metadata
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
