import type { SettingListElement } from '../types/types.js';

// Canonical Nix type strings emitted in the generated module
export const NIX_ENUM_TYPE = 'types.enum';
export const NIX_TYPE_BOOL = 'types.bool';
export const NIX_TYPE_STR = 'types.str';
export const NIX_TYPE_INT = 'types.int';
export const NIX_TYPE_FLOAT = 'types.float';
export const NIX_TYPE_ATTRS = 'types.attrs';
export const NIX_TYPE_NULL_OR_ATTRS = 'types.nullOr types.attrs';
export const NIX_TYPE_NULL_OR_STR = 'types.nullOr types.str';
export const NIX_TYPE_NULL_OR_LIST_OF_STR = 'types.nullOr (types.listOf types.str)';
export const NIX_TYPE_LIST_OF_STR = 'types.listOf types.str';
export const NIX_TYPE_LIST_OF_NUMBER = 'types.listOf types.number';
export const NIX_TYPE_LIST_OF_BOOL = 'types.listOf types.bool';
export const NIX_TYPE_LIST_OF_ATTRS = 'types.listOf types.attrs';
export const NIX_TYPE_LIST_OF_ANYTHING = 'types.listOf types.anything';

export const NIX_LIST_TYPES = {
  string: NIX_TYPE_LIST_OF_STR,
  number: NIX_TYPE_LIST_OF_NUMBER,
  boolean: NIX_TYPE_LIST_OF_BOOL,
  attrs: NIX_TYPE_LIST_OF_ATTRS,
  anything: NIX_TYPE_LIST_OF_ANYTHING,
} as const satisfies Record<SettingListElement, string>;

export type NixSettingType =
  | typeof NIX_ENUM_TYPE
  | typeof NIX_TYPE_BOOL
  | typeof NIX_TYPE_STR
  | typeof NIX_TYPE_INT
  | typeof NIX_TYPE_FLOAT
  | typeof NIX_TYPE_ATTRS
  | typeof NIX_TYPE_NULL_OR_STR
  | typeof NIX_TYPE_NULL_OR_ATTRS
  | typeof NIX_TYPE_NULL_OR_LIST_OF_STR
  | (typeof NIX_LIST_TYPES)[keyof typeof NIX_LIST_TYPES];

// Regex for detecting integer-only strings in setting analysis and Nix generation
export const INTEGER_STRING_PATTERN = /^[0-9]+$/;
