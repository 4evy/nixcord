/** Recursively makes all properties readonly. */
export type ReadonlyDeep<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T extends readonly (infer U)[]
    ? readonly ReadonlyDeep<U>[]
    : T extends object
      ? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
      : T;

/** Flattens an intersection into a single object type for cleaner display. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
