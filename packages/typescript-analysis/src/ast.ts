// fallow-ignore-file unused-class-member
// Consumers use these snapshot views through inferred types across workspaces
import * as ast from '@typescript/native/unstable/ast';
import type {
  Checker,
  Symbol as NativeSymbol,
  Type as NativeType,
} from '@typescript/native/unstable/async';
import { SymbolFlags } from '@typescript/native/unstable/async';

import { Type } from './types.js';

export const SyntaxKind = ast.SyntaxKind;
export type SyntaxKind = ast.SyntaxKind;

type GuardedNode<F> = F extends (node: ast.Node) => node is ast.Node & infer N
  ? ast.Node & N
  : never;
type NativeNodes = GuardedNode<(typeof ast)[keyof typeof ast]>;
type IsUnion<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;
type ConcreteNode<N extends ast.Node> = N extends ast.Node
  ? IsUnion<N['kind']> extends false
    ? N
    : never
  : never;
type NativeNodeByKind = {
  [N in ConcreteNode<NativeNodes> as N['kind']]: N;
};
type NativeNodeOfKind<K extends SyntaxKind> = K extends keyof NativeNodeByKind
  ? NativeNodeByKind[K]
  : ast.Node & { readonly kind: K };
type FieldKeys<N, Value> = N extends ast.Node
  ? { [K in keyof N]-?: NonNullable<N[K]> extends Value ? K : never }[keyof N]
  : never;
type ChildOf<N, K extends PropertyKey> = N extends ast.Node
  ? K extends keyof N
    ? Extract<NonNullable<N[K]>, ast.Node>
    : ast.Node
  : never;
type ChildrenOf<N, K extends PropertyKey> = N extends ast.Node
  ? K extends keyof N
    ? NonNullable<N[K]> extends readonly (infer E extends ast.Node)[]
      ? E
      : ast.Node
    : ast.Node
  : never;
type ChildKey = FieldKeys<NativeNodes, ast.Node>;
type ChildrenKey = FieldKeys<NativeNodes, readonly ast.Node[]>;

// Native nodes are immutable; this view keeps source navigation local while
// declaration facts are populated by the async session before evaluation
export class Node<N extends ast.Node = ast.Node> {
  constructor(
    readonly native: N,
    readonly view: AstView
  ) {}
  getKind(): SyntaxKind {
    return this.native.kind;
  }
  getKindName(): string {
    return SyntaxKind[this.native.kind];
  }
  isKind<K extends SyntaxKind>(kind: K): this is Node<N & NativeNodeOfKind<K>> {
    return this.native.kind === kind;
  }
  asKind<K extends SyntaxKind>(kind: K): Node<NativeNodeOfKind<K>> | undefined {
    if (this.native.kind !== kind) return undefined;
    return this.view.wrap(this.native as N & NativeNodeOfKind<K>);
  }
  private required<T>(value: T | undefined): T {
    if (value === undefined) throw new Error(`Missing node in ${this.getKindName()}`);
    return value;
  }
  private field(name: ChildKey): ast.Node | undefined {
    // Field names come from native node guards; absent fields remain optional
    return (this.native as ast.Node & Partial<Record<ChildKey, ast.Node>>)[name];
  }
  private child<K extends ChildKey>(name: K): Node<ChildOf<N, K>> | undefined {
    return this.view.wrap(this.field(name) as ChildOf<N, K> | undefined);
  }
  private children<K extends ChildrenKey>(name: K): Node<ChildrenOf<N, K>>[] {
    const native = this.native as ast.Node & Partial<Record<ChildrenKey, readonly ast.Node[]>>;
    return (native[name] ?? []).map((n) => this.view.wrap(n as ChildrenOf<N, K>));
  }
  getText(): string {
    return this.native.getText();
  }
  getStart(): number {
    return this.native.getStart();
  }
  getEnd(): number {
    return this.native.end;
  }
  containsRange(start: number, end: number): boolean {
    return this.getStart() <= start && this.getEnd() >= end;
  }
  getParent(): Node | undefined {
    return this.view.wrap(this.native.parent);
  }
  getParentOrThrow(): Node {
    return this.required(this.getParent());
  }
  getParentIfKind<K extends SyntaxKind>(kind: K): Node<NativeNodeOfKind<K>> | undefined {
    return this.getParent()?.asKind(kind);
  }
  getAncestors(): Node[] {
    const nodes: Node[] = [];
    for (let parent = this.getParent(); parent; parent = parent.getParent()) nodes.push(parent);
    return nodes;
  }
  getFirstAncestor(predicate: (node: Node) => boolean): Node | undefined {
    return this.getAncestors().find(predicate);
  }
  getFirstAncestorByKind<K extends SyntaxKind>(kind: K): Node<NativeNodeOfKind<K>> | undefined {
    return this.getAncestors().find((n) => n.isKind(kind));
  }
  getDescendants(): Node[] {
    const nodes: Node[] = [];
    const visit = (node: ast.Node): void => {
      node.forEachChild((child) => {
        nodes.push(this.view.wrap(child)!);
        visit(child);
      });
    };
    visit(this.native);
    return nodes;
  }
  getDescendantsOfKind<K extends SyntaxKind>(kind: K): Node<NativeNodeOfKind<K>>[] {
    return this.getDescendants().filter((n) => n.isKind(kind));
  }
  getSourceFile(): Node<ast.SourceFile> {
    return this.view.wrap(this.native.getSourceFile());
  }
  getFilePath(): string {
    return ast.cast(this.native, ast.isSourceFile).fileName;
  }
  isDeclarationFile(): boolean {
    return Boolean(ast.cast(this.native, ast.isSourceFile).isDeclarationFile);
  }
  getLineAndColumnAtPos(position: number): { line: number; column: number } {
    const { line, character } = ast
      .cast(this.native, ast.isSourceFile)
      .getLineAndCharacterOfPosition(position);
    return { line: line + 1, column: character + 1 };
  }
  getStartLineNumber(): number {
    return this.getSourceFile().getLineAndColumnAtPos(this.getStart()).line;
  }
  getExpression(): Node<ChildOf<N, 'expression'>> {
    return this.child('expression')!;
  }
  getArgumentExpression(): Node<ChildOf<N, 'argumentExpression'>> | undefined {
    return this.child('argumentExpression');
  }
  getArgumentExpressionOrThrow(): Node {
    return this.required(this.getArgumentExpression());
  }
  getInitializer(): Node<ChildOf<N, 'initializer'>> | undefined {
    return this.child('initializer');
  }
  getInitializerOrThrow(): Node {
    return this.required(this.getInitializer());
  }
  getBody(): Node<ChildOf<N, 'body'>> {
    return this.child('body')!;
  }
  getBodyOrThrow(): Node {
    return this.getBody();
  }
  getTypeNode(): Node<ChildOf<N, 'type'>> | undefined {
    return this.child('type');
  }
  getTypeName(): Node<ChildOf<N, 'typeName'>> {
    return this.required(this.child('typeName'));
  }
  getTypeNodes(): Node<ChildrenOf<N, 'types'>>[] {
    return this.children('types');
  }
  getTypeArguments(): Node<ChildrenOf<N, 'typeArguments'>>[] {
    return this.children('typeArguments');
  }
  getArguments(): Node<ChildrenOf<N, 'arguments'>>[] {
    return this.children('arguments');
  }
  getParameters(): ParameterDeclaration[] {
    return ast.isFunctionLikeDeclaration(this.native)
      ? this.native.parameters.map((node) => this.view.wrap(node))
      : [];
  }
  getDeclarations(): Node<ast.VariableDeclaration>[] {
    return ast.isVariableStatement(this.native)
      ? this.native.declarationList.declarations.map((node) => this.view.wrap(node))
      : [];
  }
  getElements(): Node<ChildrenOf<N, 'elements'>>[] {
    return this.children('elements');
  }
  getProperties(): Node<ChildrenOf<N, 'properties'>>[] {
    return this.children('properties');
  }
  getProperty(name: string): Node<ChildrenOf<N, 'properties'>> | undefined {
    return this.getProperties().find((n) => n.getName() === name);
  }
  getMembers(): Node<ChildrenOf<N, 'members'>>[] {
    return this.children('members');
  }
  getStatements(): Statement[] {
    return ast.isSourceFile(this.native) ||
      ast.isBlock(this.native) ||
      ast.isModuleBlock(this.native)
      ? this.native.statements.map((node) => this.view.wrap(node))
      : [];
  }
  getLeft(): Node<ChildOf<N, 'left'>> {
    return this.required(this.child('left'));
  }
  getRight(): Node<ChildOf<N, 'right'>> {
    return this.required(this.child('right'));
  }
  getCondition(): Node {
    return this.required(this.child('condition') ?? this.child('expression'));
  }
  getWhenTrue(): Node<ChildOf<N, 'whenTrue'>> {
    return this.required(this.child('whenTrue'));
  }
  getWhenFalse(): Node<ChildOf<N, 'whenFalse'>> {
    return this.required(this.child('whenFalse'));
  }
  getThenStatement(): Statement {
    return this.view.wrap(ast.cast(this.native, ast.isIfStatement).thenStatement);
  }
  getElseStatement(): Statement | undefined {
    return ast.isIfStatement(this.native) ? this.view.wrap(this.native.elseStatement) : undefined;
  }
  getOperand(): Node<ChildOf<N, 'operand'>> {
    return this.required(this.child('operand'));
  }
  getOperatorToken(): Node<ChildOf<N, 'operatorToken'>> {
    return this.required(this.child('operatorToken'));
  }
  getUnaryOperator(): SyntaxKind {
    return ast.cast(this.native, ast.isPrefixUnaryExpression).operator;
  }
  getNameNode(): Node<
    ChildOf<N, 'name'> | (N extends ast.ImportSpecifier ? ast.ModuleExportName : never)
  > {
    if (ast.isImportSpecifier(this.native) && this.native.propertyName)
      return this.view.wrap(this.native.propertyName) as Node<
        ChildOf<N, 'name'> | (N extends ast.ImportSpecifier ? ast.ModuleExportName : never)
      >;
    return this.required(this.child('name'));
  }
  getName(): string {
    const node =
      (this.isKind(SyntaxKind.ImportSpecifier) ? this.child('propertyName') : undefined) ??
      this.child('name');
    return node && (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NumericLiteral))
      ? String(node.getLiteralValue())
      : (node?.getText() ?? '');
  }
  getAliasNode(): Node | undefined {
    return this.field('propertyName') ? this.child('name') : undefined;
  }
  getPropertyNameNode(): Node | undefined {
    return this.child('propertyName');
  }
  getLiteralValue(): string | number | RegExp {
    const text = ast.cast(this.native, ast.isLiteralLikeNode).text;
    if (this.isKind(SyntaxKind.NumericLiteral)) return Number(text);
    if (this.isKind(SyntaxKind.RegularExpressionLiteral)) {
      const literal = this.getText();
      const slash = literal.lastIndexOf('/');
      return new RegExp(literal.slice(1, slash), literal.slice(slash + 1));
    }
    return text;
  }
  getLiteralText(): string {
    return String(this.getLiteralValue());
  }
  getHead(): Node<ChildOf<N, 'head'>> {
    return this.required(this.child('head'));
  }
  getTemplateSpans(): Node<ChildrenOf<N, 'templateSpans'>>[] {
    return this.children('templateSpans');
  }
  getLiteral(): Node<ChildOf<N, 'literal'>> {
    return this.required(this.child('literal'));
  }
  getDotDotDotToken(): Node<ChildOf<N, 'dotDotDotToken'>> | undefined {
    return this.child('dotDotDotToken');
  }
  isRestParameter(): boolean {
    return Boolean(this.getDotDotDotToken());
  }
  getVariableStatement(): Node | undefined {
    return this.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  }
  getVariableDeclarationOrThrow(name: string): Node {
    return this.required(
      this.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((n) => n.getName() === name)
    );
  }
  getImportDeclarations(): ImportDeclaration[] {
    return this.getStatements().filter((n) => n.isKind(SyntaxKind.ImportDeclaration));
  }
  getModuleSpecifierValue(): string {
    return this.child('moduleSpecifier')!.getLiteralText();
  }
  getModuleSpecifierSourceFile(): SourceFile | undefined {
    return this.view.modules.get(this.native);
  }
  getDefaultImport(): Node | undefined {
    return this.isKind(SyntaxKind.ImportClause)
      ? this.child('name')
      : this.child('importClause')?.child('name');
  }
  getNamedImports(): Node[] {
    return this.child('importClause')?.child('namedBindings')?.children('elements') ?? [];
  }
  getTagNameNode(): Node<ChildOf<N, 'tagName'>> {
    return this.required(this.child('tagName'));
  }
  getAttributes(): Node[] {
    return this.child('attributes')?.getProperties() ?? [];
  }
  getSymbol(): Symbol | undefined {
    return this.view.symbols.get(this.native);
  }
  getValueSymbol(): Symbol | undefined {
    return this.view.shorthands.get(this.native);
  }
  getValue(): string | number | undefined {
    return this.view.constants.get(this.native);
  }
  getExportedDeclarations(): Map<string, Node[]> {
    return this.view.exports.get(this.native) ?? new Map();
  }
  static isNode(value: unknown): value is Node {
    return value instanceof Node;
  }
  static isInitializerExpressionGetable(node: Node | undefined): boolean {
    return Boolean(node && 'initializer' in node.native);
  }
  static isNamed(node: Node | undefined): boolean {
    return Boolean(node && 'name' in node.native);
  }
  static isNameable = Node.isNamed;
  static isExpression(node: Node | undefined): boolean {
    return Boolean(node && ast.isExpression(node.native));
  }
  static isFunctionLikeDeclaration(node: Node): boolean {
    return ast.isFunctionLikeDeclaration(node.native);
  }
  static isTypeAliasDeclaration(node: Node): boolean {
    return ast.isTypeAliasDeclaration(node.native);
  }
  static isPropertySignature(node: Node): boolean {
    return ast.isPropertySignatureDeclaration(node.native);
  }
  static isClassDeclaration(node: Node): boolean {
    return ast.isClassDeclaration(node.native);
  }
}

export class Symbol {
  declarations: Node[] = [];
  valueDeclaration?: Node;
  alias?: Symbol;
  constructor(readonly native: NativeSymbol) {}
  getName(): string {
    return this.native.name;
  }
  isAlias(): boolean {
    return Boolean(this.native.flags & SymbolFlags.Alias);
  }
  getAliasedSymbol(): Symbol | undefined {
    return this.alias;
  }
  getDeclarations(): Node[] {
    return this.declarations;
  }
  getValueDeclaration(): Node | undefined {
    return this.valueDeclaration;
  }
}

export class AstView {
  printNode?: (node: ast.Node) => Promise<string>;
  readonly nodes = new WeakMap<ast.Node, Node>();
  readonly symbols = new WeakMap<ast.Node, Symbol>();
  readonly shorthands = new WeakMap<ast.Node, Symbol>();
  readonly constants = new WeakMap<ast.Node, string | number>();
  readonly modules = new WeakMap<ast.Node, SourceFile>();
  readonly defaultLibraries = new Set<string>();
  readonly exports = new WeakMap<ast.Node, Map<string, Node[]>>();
  wrap<N extends ast.Node>(node: N): Node<N>;
  wrap<N extends ast.Node>(node: N | undefined): Node<N> | undefined;
  wrap(node: ast.Node | undefined): Node | undefined {
    if (!node) return undefined;
    let wrapped = this.nodes.get(node);
    if (!wrapped) {
      wrapped = new Node(node, this);
      this.nodes.set(node, wrapped);
    }
    return wrapped;
  }
}

export class TypeChecker {
  readonly types = new Map<number, Type>();
  wrapType(native: NativeType): Type {
    let type = this.types.get(native.id);
    if (!type) {
      type = new Type(native, this);
      this.types.set(native.id, type);
    }
    return type;
  }
  constructor(
    readonly native: Checker,
    readonly view: AstView
  ) {}
  getSymbolAtLocation(node: Node): Symbol | undefined {
    return this.view.symbols.get(node.native);
  }
  getShorthandAssignmentValueSymbol(node: Node): Symbol | undefined {
    return this.view.shorthands.get(node.native);
  }
  async getTypeAtLocation(node: Node): Promise<Type> {
    return this.wrapType(
      (await this.native.getTypeAtLocation(node.native)) ?? (await this.native.getAnyType())
    );
  }
  async getTypesAtLocations(nodes: readonly Node[]): Promise<Type[]> {
    const types = await this.native.getTypeAtLocation(nodes.map((node) => node.native));
    const fallback = types.includes(undefined) ? await this.native.getAnyType() : undefined;
    return types.map((type) => this.wrapType(type ?? fallback!));
  }
}

export type SourceFile = Node<ast.SourceFile>;
export type CallExpression = Node<ast.CallExpression>;
export type ObjectLiteralExpression = Node<ast.ObjectLiteralExpression>;
export type BinaryExpression = Node<ast.BinaryExpression>;
export type Identifier = Node<ast.Identifier>;
export type PropertyAccessExpression = Node<ast.PropertyAccessExpression>;
export type ElementAccessExpression = Node<ast.ElementAccessExpression>;
export type ArrayLiteralExpression = Node<ast.ArrayLiteralExpression>;
export type TemplateExpression = Node<ast.TemplateExpression>;
export type PrefixUnaryExpression = Node<ast.PrefixUnaryExpression>;
export type BindingElement = Node<ast.BindingElement>;
export type FunctionDeclaration = Node<ast.FunctionDeclaration>;
export type ArrowFunction = Node<ast.ArrowFunction>;
export type FunctionExpression = Node<ast.FunctionExpression>;
export type ImportDeclaration = Node<ast.ImportDeclaration>;
export type ParameterDeclaration = Node<ast.ParameterDeclaration>;
export type ObjectBindingPattern = Node<ast.ObjectBindingPattern>;
export type ArrayBindingPattern = Node<ast.ArrayBindingPattern>;
export type Statement = Node<ast.Statement>;
export type TypeLiteralNode = Node<ast.TypeLiteralNode>;

export type BindingName = Node<ast.BindingName>;
export type Block = Node<ast.Block>;
export type Expression = Node<ast.Expression>;
