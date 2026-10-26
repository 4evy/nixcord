import { createScanner, type Node, SyntaxKind, type Type } from '@nixcord/typescript-analysis';

export interface TypeContext {
  readonly name?: string;
  readonly members?: readonly TypeContext[];
  readonly element?: TypeContext;
}

// Only classify the shapes used by setting rules, with native tokenization so
// strings and nested generic/object types cannot introduce false union splits
export const contextualTypeNode = (
  text: string | TypeContext | undefined
): TypeContext | undefined => {
  if (typeof text !== 'string') return text;
  if (!text) return undefined;
  const scanner = createScanner(true, undefined, text);
  const tokens: string[] = [];
  while (scanner.scan() !== SyntaxKind.EndOfFile) tokens.push(scanner.getTokenText());
  return shape(tokens);
};

// Keep checker facts structured so aliases, literals, and generic substitutions
// do not depend on TypeScript's display format
export const checkedTypeContext = async (type: Type, depth = 0): Promise<TypeContext> => {
  if (depth >= 32) return { name: 'unknown' };
  if (type.isUnion())
    return {
      members: await Promise.all(
        (await type.getUnionTypes()).map((member) => checkedTypeContext(member, depth + 1))
      ),
    };
  if (type.isNull()) return { name: 'null' };
  if (type.isAny()) return { name: 'any' };
  if (type.isUnknown()) return { name: 'unknown' };
  if (type.isNever()) return { name: 'never' };
  if (type.isUndefined()) return { name: 'undefined' };
  const base = await type.getBaseTypeOfLiteralType();
  if (base.isString()) return { name: 'string' };
  if (base.isNumber()) return { name: 'number' };
  if (base.isBoolean()) return { name: 'boolean' };
  const element = await type.getArrayElementType();
  if (element) return { element: await checkedTypeContext(element, depth + 1) };
  if (await type.getStringIndexType()) return { name: 'record' };
  return { name: 'object' };
};

// Unresolved imports still have useful annotation syntax in the native AST
export const sourceTypeContext = (node: Node): TypeContext => {
  if (node.isKind(SyntaxKind.ParenthesizedType) || node.isKind(SyntaxKind.TypeOperator))
    return sourceTypeContext(node.getTypeNode()!);
  if (node.isKind(SyntaxKind.UnionType))
    return { members: node.getTypeNodes().map(sourceTypeContext) };
  if (node.isKind(SyntaxKind.ArrayType))
    return { element: sourceTypeContext(node.view.wrap(node.native.elementType)) };
  if (node.isKind(SyntaxKind.TypeReference)) {
    const name = node.getTypeName().getText();
    const element = node.getTypeArguments()[0];
    if ((name === 'Array' || name === 'ReadonlyArray') && element)
      return { element: sourceTypeContext(element) };
    return { name: name === 'Record' ? 'record' : 'object' };
  }
  if (node.isKind(SyntaxKind.TypeLiteral) || node.isKind(SyntaxKind.MappedType))
    return { name: 'record' };
  if (node.isKind(SyntaxKind.LiteralType))
    return sourceTypeContext(node.view.wrap(node.native.literal));
  const names: Partial<Record<SyntaxKind, string>> = {
    [SyntaxKind.StringKeyword]: 'string',
    [SyntaxKind.StringLiteral]: 'string',
    [SyntaxKind.NumberKeyword]: 'number',
    [SyntaxKind.NumericLiteral]: 'number',
    [SyntaxKind.BooleanKeyword]: 'boolean',
    [SyntaxKind.TrueKeyword]: 'boolean',
    [SyntaxKind.FalseKeyword]: 'boolean',
    [SyntaxKind.NullKeyword]: 'null',
    [SyntaxKind.AnyKeyword]: 'any',
    [SyntaxKind.UnknownKeyword]: 'unknown',
    [SyntaxKind.NeverKeyword]: 'never',
  };
  return { name: names[node.getKind()] ?? 'object' };
};

const split = (tokens: readonly string[], separator: string): string[][] => {
  const groups: string[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (depth === 0 && token === separator) {
      groups.push([]);
      continue;
    }
    groups.at(-1)!.push(token);
    if (['(', '[', '{', '<'].includes(token)) depth++;
    if ([')', ']', '}', '>'].includes(token)) depth--;
  }
  return groups;
};

const shape = (input: readonly string[]): TypeContext => {
  let tokens = input;
  if (tokens[0] === 'readonly') tokens = tokens.slice(1);
  if (tokens[0] === '(' && tokens.at(-1) === ')') {
    let depth = 0;
    const enclosed = tokens.every((token, index) => {
      if (token === '(') depth++;
      if (token === ')') depth--;
      return depth > 0 || index === tokens.length - 1;
    });
    if (enclosed) return shape(tokens.slice(1, -1));
  }
  const members = split(tokens, '|');
  if (members.length > 1) return { members: members.map(shape) };
  if (tokens.at(-2) === '[' && tokens.at(-1) === ']')
    return { element: shape(tokens.slice(0, -2)) };
  if (['Array', 'ReadonlyArray'].includes(tokens[0]) && tokens[1] === '<' && tokens.at(-1) === '>')
    return { element: shape(tokens.slice(2, -1)) };
  if (tokens[0] === '{' || (tokens[0] === 'Record' && tokens[1] === '<')) return { name: 'record' };
  return { name: tokens.length === 1 ? tokens[0] : 'object' };
};

export const typeMembers = (context: TypeContext | undefined): readonly TypeContext[] =>
  context ? (context.members?.flatMap(typeMembers) ?? [context]) : [];
