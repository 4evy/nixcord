// fallow-ignore-file unused-class-member
// Consumers use these snapshot views through inferred types across workspaces
import { type Type as NativeType, SignatureKind, TypeFlags } from '@typescript/native/async';
import { type Node, type Symbol, type TypeChecker } from './ast.js';

// Type queries remain asynchronous; identity is scoped to one native snapshot
export class Type {
  constructor(
    readonly native: NativeType,
    readonly checker: TypeChecker
  ) {}
  private has(flags: TypeFlags): boolean {
    return Boolean(this.native.flags & flags);
  }
  isAny(): boolean {
    return this.has(TypeFlags.Any);
  }
  isUnknown(): boolean {
    return this.has(TypeFlags.Unknown);
  }
  isNull(): boolean {
    return this.has(TypeFlags.Null);
  }
  isUndefined(): boolean {
    return this.has(TypeFlags.Undefined);
  }
  isUnion(): boolean {
    return this.has(TypeFlags.Union);
  }
  isObject(): boolean {
    return this.has(TypeFlags.Object);
  }
  isBoolean(): boolean {
    return this.has(TypeFlags.Boolean);
  }
  isNumber(): boolean {
    return this.has(TypeFlags.Number);
  }
  isString(): boolean {
    return this.has(TypeFlags.String);
  }
  isNever(): boolean {
    return this.has(TypeFlags.Never);
  }
  getLiteralValue(): string | number | boolean | bigint | undefined {
    return this.native.isLiteralType() ? this.native.value : undefined;
  }
  async getUnionTypes(): Promise<Type[]> {
    return (this.native.isUnionType() ? await this.native.getTypes() : []).map((t) =>
      this.checker.wrapType(t)
    );
  }
  async getNonNullableType(): Promise<Type> {
    return this.checker.wrapType(
      (await this.checker.native.getNonNullableType(this.native)) ?? this.native
    );
  }
  async getBaseTypeOfLiteralType(): Promise<Type> {
    return this.checker.wrapType(
      (await this.checker.native.getBaseTypeOfLiteralType(this.native)) ?? this.native
    );
  }
  isArray(): Promise<boolean> {
    return this.checker.native.isArrayType(this.native);
  }
  isTuple(): Promise<boolean> {
    return this.checker.native.isTupleType(this.native);
  }
  private async indexType(flags: TypeFlags): Promise<Type | undefined> {
    const infos = await this.checker.native.getIndexInfosOfType(this.native);
    const info = infos.find((info) => Boolean(info.keyType.flags & flags));
    return info && this.checker.wrapType(info.valueType);
  }
  getNumberIndexType(): Promise<Type | undefined> {
    return this.indexType(TypeFlags.Number);
  }
  getStringIndexType(): Promise<Type | undefined> {
    return this.indexType(TypeFlags.String);
  }
  async getArrayElementType(): Promise<Type | undefined> {
    return (await this.isArray()) || (await this.isTuple()) ? this.getNumberIndexType() : undefined;
  }
  getCallSignatures() {
    return this.checker.native.getSignaturesOfType(this.native, SignatureKind.Call);
  }
  getConstructSignatures() {
    return this.checker.native.getSignaturesOfType(this.native, SignatureKind.Construct);
  }
  async getProperties(): Promise<TypeSymbol[]> {
    return (await this.checker.native.getPropertiesOfType(this.native)).map(
      (s) => new TypeSymbol(s, this.checker)
    );
  }
  async getSymbol(): Promise<TypeSymbol | undefined> {
    const s = await this.native.getSymbol();
    return s && new TypeSymbol(s, this.checker);
  }
  async getAliasSymbol(): Promise<TypeSymbol | undefined> {
    const s = await this.native.getAliasSymbol();
    return s && new TypeSymbol(s, this.checker);
  }
}

class TypeSymbol {
  constructor(
    readonly native: Symbol['native'],
    readonly checker: TypeChecker
  ) {}
  getName(): string {
    return this.native.name;
  }
  async resolveDeclarations(): Promise<Node[]> {
    const nodes = await Promise.all(this.native.declarations.map((handle) => handle.resolve()));
    return nodes.flatMap((node) => (node ? [this.checker.view.wrap(node)!] : []));
  }
  async getTypeAtLocation(node: Node): Promise<Type> {
    return this.checker.wrapType(
      await this.checker.native.getTypeOfSymbolAtLocation(this.native, node.native)
    );
  }
}
