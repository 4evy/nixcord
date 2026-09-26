import { camelCase } from 'change-case';

const PARENTHESES_PATTERN = /\s*\([^)]*\)\s*/g;
const INVALID_CHARS_PATTERN = /[^A-Za-z0-9_'-]/g;
const LEADING_TRAILING_UNDERSCORES_PATTERN = /^_+|_+$/g;
const MULTIPLE_UNDERSCORES_PATTERN = /_+/g;
const VALID_IDENTIFIER_START_PATTERN = /^[A-Za-z_]/;
const LEADING_UNDERSCORE_PREFIX = '_';
const PLUS_PATTERN = /\+/g;

function sanitizeIdentifierInput(name: string): {
  sanitized: string;
  originalStartsWithUnderscore: boolean;
  originalEndsWithUnderscore: boolean;
} {
  return {
    originalStartsWithUnderscore: name.startsWith('_'),
    originalEndsWithUnderscore: name.endsWith('_'),
    sanitized: name
      .replace(PARENTHESES_PATTERN, '')
      .replace(INVALID_CHARS_PATTERN, '_')
      .replace(LEADING_TRAILING_UNDERSCORES_PATTERN, '')
      .replace(MULTIPLE_UNDERSCORES_PATTERN, '_'),
  };
}

function finalizeIdentifier(
  sanitized: string,
  originalStartsWithUnderscore: boolean,
  originalEndsWithUnderscore: boolean,
  needsPrefix: boolean
): string {
  if (
    originalStartsWithUnderscore &&
    !originalEndsWithUnderscore &&
    sanitized &&
    VALID_IDENTIFIER_START_PATTERN.test(sanitized)
  )
    return '_' + sanitized;
  if (needsPrefix || sanitized.length === 0 || !VALID_IDENTIFIER_START_PATTERN.test(sanitized))
    sanitized = LEADING_UNDERSCORE_PREFIX + sanitized;

  return sanitized;
}

/**
 * Reproduce older Nixcord option names when generating compatibility migrations.
 * Older releases preserved upstream acronym casing.
 */
export function toLegacyNixIdentifier(name: string): string {
  const {
    originalStartsWithUnderscore,
    originalEndsWithUnderscore,
    sanitized: initialSanitized,
  } = sanitizeIdentifierInput(name);
  let sanitized = initialSanitized;

  const needsPrefix = sanitized.length === 0 || !VALID_IDENTIFIER_START_PATTERN.test(sanitized);

  const hasAcronym = /[A-Z]{2}/.test(sanitized);

  const needsCamelCase = sanitized.includes('_') || sanitized.includes(' ');
  if (!hasAcronym || needsCamelCase) {
    try {
      sanitized = camelCase(sanitized);
    } catch {}
  }

  return finalizeIdentifier(
    sanitized,
    originalStartsWithUnderscore,
    originalEndsWithUnderscore,
    needsPrefix
  );
}

function normalizePluralAcronyms(segment: string): string {
  return segment.replace(/([A-Z]{2,})s(?=$|[A-Z_\s'-])/g, '$1S');
}

/**
 * Convert upstream names to Nix identifiers, keeping acronyms together:
 * ClearURLs becomes clearUrls, rather than clearUrLs.
 */
export function toNixIdentifier(name: string): string {
  name = name.replace(PLUS_PATTERN, ' Plus ');
  const {
    originalStartsWithUnderscore,
    originalEndsWithUnderscore,
    sanitized: initialSanitized,
  } = sanitizeIdentifierInput(name);
  const needsPrefix =
    initialSanitized.length === 0 || !VALID_IDENTIFIER_START_PATTERN.test(initialSanitized);

  const sanitized = camelCase(normalizePluralAcronyms(initialSanitized), {
    mergeAmbiguousCharacters: true,
  });

  return finalizeIdentifier(
    sanitized,
    originalStartsWithUnderscore,
    originalEndsWithUnderscore,
    needsPrefix
  );
}
