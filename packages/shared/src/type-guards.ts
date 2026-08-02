export const isString = (x: unknown): x is string => typeof x === 'string';
export const isNumber = (x: unknown): x is number => typeof x === 'number';
export const isBoolean = (x: unknown): x is boolean => typeof x === 'boolean';
export const isNull = (x: unknown): x is null => x === null;
export const isArray = Array.isArray;
export const isObject = (x: unknown): x is object =>
  typeof x === 'object' && x !== null && !isArray(x);
export const filterNullish = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null)) as T;

export const sortedEntries = <T>(obj: Record<string, T>): [string, T][] =>
  Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));

export const isNestedConfig = (setting: object): setting is { settings: Record<string, unknown> } =>
  'settings' in setting && !!(setting as { settings?: unknown }).settings;
