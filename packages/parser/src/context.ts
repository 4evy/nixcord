import type { ParseDiagnostic, PluginConfig, PluginRename, SettingRename } from '@nixcord/domain';
import type { SliceExecutionOptions, SliceExecutionResult } from '@nixcord/slice-executor';
import type {
  AnalysisSession,
  Node,
  SourceFile,
  StaticEvaluator,
} from '@nixcord/typescript-analysis';
import type { SourceProfile } from './profiles.js';

// Shared per-plugin analysis state and diagnostic construction
export interface PluginContext {
  readonly pluginDir: string;
  readonly pluginPath: string;
  readonly sourceFiles: readonly SourceFile[];
  readonly profile: SourceProfile;
  readonly session: AnalysisSession;
  readonly evaluator: StaticEvaluator;
  readonly executionMode: 'disabled' | 'fallback';
  readonly executeSlice: (
    component: Node,
    options: SliceExecutionOptions
  ) => Promise<SliceExecutionResult>;
  readonly diagnostics: ParseDiagnostic[];
}

export interface PluginParseResult {
  readonly entry?: readonly [string, PluginConfig];
  readonly settingRenames: SettingRename[];
  readonly pluginRenames: PluginRename[];
  readonly diagnostics: ParseDiagnostic[];
}

export type RawRecord = Record<string, unknown>;

export interface UnresolvedAstValue {
  readonly node: Node;
  readonly path?: string;
  readonly reason: string;
}

const locationFor = (node: Node): NonNullable<ParseDiagnostic['location']> => {
  const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    file: node.getSourceFile().getFilePath(),
    line: position.line,
    column: position.column,
  };
};

export const diagnostic = (
  code: string,
  severity: ParseDiagnostic['severity'],
  stage: ParseDiagnostic['stage'],
  message: string,
  options: {
    pluginName?: string;
    settingPath?: string;
    node?: Node;
    evidence?: readonly string[];
  } = {}
): ParseDiagnostic => ({
  code,
  severity,
  stage,
  message,
  ...(options.pluginName ? { pluginName: options.pluginName } : {}),
  ...(options.settingPath ? { settingPath: options.settingPath } : {}),
  ...(options.node ? { location: locationFor(options.node) } : {}),
  ...(options.evidence?.length ? { evidence: options.evidence } : {}),
});
