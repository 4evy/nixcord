import type { ParseDiagnostic } from '@nixcord/domain';
import type { DiagnosticBucket, GeneratePluginOptionsDiagnosticSummary } from './params.js';

const summarizeCounts = (values: readonly string[], limit: number): DiagnosticBucket[] =>
  Array.from(
    Map.groupBy(values, (value) => value),
    ([name, items]) => ({ name, count: items.length })
  )
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);

export const summarizeDiagnostics = (
  diagnostics: readonly ParseDiagnostic[]
): GeneratePluginOptionsDiagnosticSummary | undefined => {
  if (diagnostics.length === 0) return undefined;

  return {
    total: diagnostics.length,
    byKind: summarizeCounts(
      diagnostics.map((diagnostic) => diagnostic.code),
      Number.POSITIVE_INFINITY
    ),
    topPlugins: summarizeCounts(
      diagnostics.flatMap((diagnostic) =>
        diagnostic.pluginName === undefined ? [] : [diagnostic.pluginName]
      ),
      10
    ),
    topFiles: summarizeCounts(
      diagnostics.flatMap((diagnostic) =>
        diagnostic.location === undefined ? [] : [diagnostic.location.file]
      ),
      10
    ),
  };
};
