// Canonical Nix type strings emitted in the generated module
export const NIX_ENUM_TYPE = 'types.enum';
export const NIX_TYPE_BOOL = 'types.bool';
export const NIX_TYPE_STR = 'types.str';
export const NIX_TYPE_INT = 'types.int';
export const NIX_TYPE_FLOAT = 'types.float';
export const NIX_TYPE_ATTRS = 'types.attrs';
export const NIX_TYPE_NULL_OR_STR = 'types.nullOr types.str';
export const NIX_TYPE_LIST_OF_STR = 'types.listOf types.str';
export const NIX_TYPE_LIST_OF_NUMBER = 'types.listOf types.number';
export const NIX_TYPE_LIST_OF_BOOL = 'types.listOf types.bool';
export const NIX_TYPE_LIST_OF_ATTRS = 'types.listOf types.attrs';
export const NIX_TYPE_LIST_OF_ANYTHING = 'types.listOf types.anything';

// Regex for detecting integer-only strings (used by nix-generator and ast)
export const INTEGER_STRING_PATTERN = /^[0-9]+$/;
