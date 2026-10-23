export { createScanner } from '@typescript/native/unstable/ast/scanner';
export * from './ast.js';
export type {
  EvaluationEvidence,
  EvaluationResult,
  StaticEvaluatorOptions,
  StaticScalar,
  StaticValue,
} from './evaluator.js';
export { createStaticEvaluator, StaticEvaluator } from './evaluator.js';
export { resolvedDeclaration, unwrapExpression } from './nodes.js';
export { unexportedText } from './printing.js';
export type {
  AnalysisSession,
  AnalysisSessionOptions,
} from './session.js';
export { createAnalysisSession } from './session.js';
export { Type } from './types.js';
