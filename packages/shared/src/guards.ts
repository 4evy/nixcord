export const sortedEntries = <T>(obj: Record<string, T>): [string, T][] =>
  Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
