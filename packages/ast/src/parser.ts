import { isObject, isPrimitive } from '@nixcord/shared';
import type { Node, Program, TypeChecker } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import {
  NIX_ENUM_TYPE,
  NIX_TYPE_ATTRS,
  NIX_TYPE_BOOL,
  NIX_TYPE_FLOAT,
  NIX_TYPE_INT,
  NIX_TYPE_LIST_OF_ATTRS,
  NIX_TYPE_LIST_OF_STR,
  NIX_TYPE_STR,
  OPTION_TYPE_BIGINT,
  OPTION_TYPE_BOOLEAN,
  OPTION_TYPE_COMPONENT,
  OPTION_TYPE_CUSTOM,
  OPTION_TYPE_NUMBER,
  OPTION_TYPE_SELECT,
  OPTION_TYPE_SLIDER,
  OPTION_TYPE_STRING,
  PARSE_INT_RADIX,
  TS_ARRAY_BRACKET_PATTERN,
  TS_ARRAY_GENERIC_PATTERN,
  TS_TYPE_BOOLEAN,
  TS_TYPE_NUMBER,
  TS_TYPE_STRING,
} from './extractor/constants.js';
import { evaluate, isBooleanEnumValues, typeMatches } from './foundation/index.js';

type EnumLiteral = string | number | boolean;

type TypeResolution = Readonly<{
  readonly nixType: string;
  readonly enumValues?: readonly EnumLiteral[];
}>;

type TypeResolutionSetting = Readonly<{ type?: unknown; default?: unknown; options?: unknown }>;

const OPTION_TYPE_NAMES_BY_VALUE = [
  OPTION_TYPE_STRING,
  OPTION_TYPE_NUMBER,
  OPTION_TYPE_BIGINT,
  OPTION_TYPE_BOOLEAN,
  OPTION_TYPE_SELECT,
  OPTION_TYPE_SLIDER,
  OPTION_TYPE_COMPONENT,
  OPTION_TYPE_CUSTOM,
] as const;

type OptionTypeName = (typeof OPTION_TYPE_NAMES_BY_VALUE)[number];

const OPTION_TYPE_NAME_SET: ReadonlySet<string> = new Set(OPTION_TYPE_NAMES_BY_VALUE);

const isOptionTypeName = (value: string): value is OptionTypeName =>
  OPTION_TYPE_NAME_SET.has(value);

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).getKind === 'function';

const resolveOptionTypeNameFromNumericValue = (value: number): OptionTypeName | undefined =>
  OPTION_TYPE_NAMES_BY_VALUE[value];

const inferNixTypeFromRuntimeDefault = (defaultValue: unknown): string => {
  if (defaultValue === undefined) return NIX_TYPE_STR;
  if (typeof defaultValue === 'boolean') return NIX_TYPE_BOOL;
  if (Array.isArray(defaultValue)) return NIX_TYPE_ATTRS;
  if (typeof defaultValue === 'string') return NIX_TYPE_STR;
  if (typeof defaultValue === 'number')
    return Number.isInteger(defaultValue) ? NIX_TYPE_INT : NIX_TYPE_FLOAT;
  if (isObject(defaultValue)) return NIX_TYPE_ATTRS;
  return NIX_TYPE_STR;
};

const resolveOptionTypeNameFromDeclaration = (
  valueDeclaration: Node
): OptionTypeName | undefined => {
  const enumMember = valueDeclaration.asKind(SyntaxKind.EnumMember);
  if (!enumMember) return undefined;

  const memberName = enumMember.getName();
  if (isOptionTypeName(memberName)) return memberName;

  try {
    const value = enumMember.getValue();
    if (typeof value === 'number') return resolveOptionTypeNameFromNumericValue(value);
    if (typeof value === 'string' && isOptionTypeName(value)) return value;
  } catch {}

  const initializer = enumMember.getInitializer();
  if (initializer?.getKind() !== SyntaxKind.NumericLiteral) return undefined;

  return resolveOptionTypeNameFromNumericValue(
    parseInt(
      initializer.asKindOrThrow(SyntaxKind.NumericLiteral).getLiteralValue().toString(),
      PARSE_INT_RADIX
    )
  );
};

const getInitializerFromDeclaration = (declaration: Node): Node | undefined =>
  'getInitializer' in declaration
    ? (declaration as { getInitializer: () => Node | undefined }).getInitializer()
    : undefined;

const resolveOptionTypeNameFromNode = (
  typeNode: Node,
  _checker: TypeChecker
): OptionTypeName | undefined => {
  const extractTypeValue = (): OptionTypeName | number | undefined => {
    switch (typeNode.getKind()) {
      case SyntaxKind.PropertyAccessExpression: {
        const propAccess = typeNode.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        const propName = propAccess.getName();
        if (isOptionTypeName(propName)) return propName;
        try {
          const symbol = propAccess.getSymbol();
          const valueDecl = symbol?.getValueDeclaration();
          if (valueDecl) {
            return resolveOptionTypeNameFromDeclaration(valueDecl) ?? undefined;
          }
        } catch {}
        return undefined;
      }
      case SyntaxKind.Identifier: {
        const symbol = typeNode.asKindOrThrow(SyntaxKind.Identifier).getSymbol();
        const valueDecl = symbol?.getValueDeclaration();
        if (!valueDecl) return undefined;
        const enumName = resolveOptionTypeNameFromDeclaration(valueDecl);
        if (enumName) return enumName;

        const init = getInitializerFromDeclaration(valueDecl);
        if (init) return resolveOptionTypeNameFromNode(init, _checker);

        const result = evaluate(typeNode, _checker);
        return result.ok && typeof result.value === 'number'
          ? resolveOptionTypeNameFromNumericValue(result.value)
          : undefined;
      }
      case SyntaxKind.NumericLiteral:
        return resolveOptionTypeNameFromNumericValue(
          parseInt(
            typeNode.asKindOrThrow(SyntaxKind.NumericLiteral).getLiteralValue().toString(),
            PARSE_INT_RADIX
          )
        );
      case SyntaxKind.BinaryExpression: {
        const binExpr = typeNode.asKindOrThrow(SyntaxKind.BinaryExpression);
        if (binExpr.getOperatorToken().getKind() === SyntaxKind.BarToken) {
          const leftName = resolveOptionTypeNameFromNode(binExpr.getLeft(), _checker);
          const rightName = resolveOptionTypeNameFromNode(binExpr.getRight(), _checker);
          const concrete = [leftName, rightName].find(
            (name) =>
              name !== undefined && name !== OPTION_TYPE_CUSTOM && name !== OPTION_TYPE_COMPONENT
          );
          if (concrete) return concrete;
          return leftName ?? rightName;
        }

        const result = evaluate(typeNode, _checker);
        if (result.ok && typeof result.value === 'number') {
          return resolveOptionTypeNameFromNumericValue(result.value);
        }
        return undefined;
      }
      default:
        return undefined;
    }
  };

  const typeValue = extractTypeValue();
  if (typeValue === undefined) return undefined;

  return typeof typeValue === 'number'
    ? resolveOptionTypeNameFromNumericValue(typeValue)
    : typeValue;
};

const buildEnumValuesFromOptions = (options: unknown): readonly EnumLiteral[] | undefined => {
  if (Array.isArray(options)) {
    const validOptions = options.filter((opt): opt is EnumLiteral => isPrimitive(opt));
    if (validOptions.length > 0) return Object.freeze(validOptions);
  }

  if (!Array.isArray(options)) return Object.freeze([]);

  return Object.freeze(
    (options as unknown[])
      .map((option) => {
        if (typeof option !== 'object' || option === null) return null;
        const val = (option as Record<string, unknown>).value;
        return isPrimitive(val) ? val : null;
      })
      .filter((val): val is EnumLiteral => val !== null)
  );
};

const nixTypeForComponentOrCustom = (defaultValue: unknown): string => {
  if (defaultValue === undefined) return NIX_TYPE_ATTRS;
  if (Array.isArray(defaultValue)) {
    if (defaultValue.length > 0 && defaultValue.every((v: unknown) => typeof v === 'string'))
      return NIX_TYPE_LIST_OF_STR;
    return NIX_TYPE_LIST_OF_ATTRS;
  }
  return inferNixTypeFromRuntimeDefault(defaultValue);
};

const inferTypeFromTypeScriptType = (
  typeNode: Node,
  checker: TypeChecker,
  defaultValue: unknown
): string | undefined => {
  try {
    const type = checker.getTypeAtLocation(typeNode);
    if (!type) return undefined;

    if (type.isString() || type.isStringLiteral()) return NIX_TYPE_STR;
    if (type.isNumber() || type.isNumberLiteral())
      return typeof defaultValue === 'number'
        ? Number.isInteger(defaultValue)
          ? NIX_TYPE_INT
          : NIX_TYPE_FLOAT
        : NIX_TYPE_INT;
    if (type.isBoolean() || type.isBooleanLiteral()) return NIX_TYPE_BOOL;
    if (type.isArray() || type.isTuple()) return NIX_TYPE_ATTRS;

    const typeName = type.getSymbol()?.getName() ?? type.getText();

    if (typeMatches(typeName, TS_TYPE_STRING)) return NIX_TYPE_STR;
    if (typeMatches(typeName, TS_TYPE_NUMBER))
      return typeof defaultValue === 'number'
        ? Number.isInteger(defaultValue)
          ? NIX_TYPE_INT
          : NIX_TYPE_FLOAT
        : NIX_TYPE_INT;
    if (typeMatches(typeName, TS_TYPE_BOOLEAN)) return NIX_TYPE_BOOL;
    if (typeName.includes(TS_ARRAY_BRACKET_PATTERN) || typeName.includes(TS_ARRAY_GENERIC_PATTERN))
      return NIX_TYPE_ATTRS;

    const unionTypes = type.getUnionTypes();
    if (unionTypes.length === 0) return undefined;

    const typeNames = unionTypes.map((t) => t.getText());
    const allStrings = typeNames.every((n) => typeMatches(n, TS_TYPE_STRING));
    const allNumbers = typeNames.every((n) => typeMatches(n, TS_TYPE_NUMBER));
    const allBooleans = typeNames.every((n) => typeMatches(n, TS_TYPE_BOOLEAN));

    if (allStrings) return NIX_TYPE_STR;
    if (allNumbers) return NIX_TYPE_INT;
    if (allBooleans) return NIX_TYPE_BOOL;
    return undefined;
  } catch {
    return undefined;
  }
};

const resolveEnumType = (setting: TypeResolutionSetting): TypeResolution => {
  const enumValues = buildEnumValuesFromOptions(setting.options) ?? Object.freeze([]);
  if (isBooleanEnumValues(enumValues)) return { nixType: NIX_TYPE_BOOL };
  if (enumValues.length === 0) return { nixType: NIX_TYPE_STR };
  return { nixType: NIX_ENUM_TYPE, enumValues };
};

const resolveCustomType = (setting: TypeResolutionSetting): TypeResolution => {
  const enumValues = buildEnumValuesFromOptions(setting.options) ?? Object.freeze([]);
  if (isBooleanEnumValues(enumValues)) return { nixType: NIX_TYPE_BOOL };
  if (enumValues.length > 0) return { nixType: NIX_ENUM_TYPE, enumValues };
  return { nixType: nixTypeForComponentOrCustom(setting.default) };
};

const OPTION_TYPE_RESOLVERS = {
  [OPTION_TYPE_BOOLEAN]: () => ({ nixType: NIX_TYPE_BOOL }),
  [OPTION_TYPE_STRING]: () => ({ nixType: NIX_TYPE_STR }),
  [OPTION_TYPE_NUMBER]: (setting) => ({
    nixType:
      typeof setting.default === 'number'
        ? Number.isInteger(setting.default)
          ? NIX_TYPE_INT
          : NIX_TYPE_FLOAT
        : NIX_TYPE_FLOAT,
  }),
  [OPTION_TYPE_BIGINT]: () => ({ nixType: NIX_TYPE_INT }),
  [OPTION_TYPE_SELECT]: resolveEnumType,
  [OPTION_TYPE_SLIDER]: () => ({ nixType: NIX_TYPE_FLOAT }),
  [OPTION_TYPE_COMPONENT]: (setting) => ({
    nixType: nixTypeForComponentOrCustom(setting.default),
  }),
  [OPTION_TYPE_CUSTOM]: resolveCustomType,
} satisfies Record<OptionTypeName, (setting: TypeResolutionSetting) => TypeResolution>;

export function tsTypeToNixType(
  setting: TypeResolutionSetting,
  _program: Program,
  _checker: TypeChecker
): TypeResolution {
  const type = setting.type;

  if (!type || !isNode(type)) {
    if (typeof type === 'number') {
      const typeValue = resolveOptionTypeNameFromNumericValue(type);
      if (typeValue === OPTION_TYPE_COMPONENT || typeValue === OPTION_TYPE_CUSTOM)
        return OPTION_TYPE_RESOLVERS[typeValue](setting);
    }
    const enumValues = buildEnumValuesFromOptions(setting.options);
    if (enumValues && enumValues.length > 0)
      return isBooleanEnumValues(enumValues)
        ? { nixType: NIX_TYPE_BOOL }
        : { nixType: NIX_ENUM_TYPE, enumValues };
    return { nixType: inferNixTypeFromRuntimeDefault(setting.default) };
  }

  const typeName = resolveOptionTypeNameFromNode(type, _checker);
  if (typeName !== undefined) {
    return OPTION_TYPE_RESOLVERS[typeName](setting);
  }

  const inferredType = inferTypeFromTypeScriptType(type, _checker, setting.default);
  const enumValues = buildEnumValuesFromOptions(setting.options);
  if (enumValues && enumValues.length > 0) {
    if (isBooleanEnumValues(enumValues)) return { nixType: NIX_TYPE_BOOL };
    return { nixType: NIX_ENUM_TYPE, enumValues };
  }
  if (inferredType) return { nixType: inferredType };
  return { nixType: inferNixTypeFromRuntimeDefault(setting.default) };
}
