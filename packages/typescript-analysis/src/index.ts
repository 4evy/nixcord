// Syntax, symbols, sessions, and static evaluation belong to this package
// Import setting traces from @nixcord/setting-analysis and component execution
// from @nixcord/slice-executor

export { createScanner } from '@typescript/native/ast/scanner';
export * from './ast.js';
export type {
  EvaluationEvidence,
  EvaluationResult,
  StaticEvaluatorOptions,
  StaticScalar,
  StaticValue,
} from './evaluator.js';
export { StaticEvaluator } from './evaluator.js';
export { resolvedDeclaration, unwrapExpression } from './nodes.js';
export { unexportedText } from './printing.js';
export type {
  AnalysisSession,
  AnalysisSessionOptions,
} from './session.js';
export { createAnalysisSession } from './session.js';
export { Type } from './types.js';
