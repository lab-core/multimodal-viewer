// The following characters need to be escaped anytime they are used in a regex :
//   . ^ $ * + - ? ( ) [ ] { } \ |
//
// https://stackoverflow.com/questions/399078/what-special-characters-must-be-escaped-in-regular-expressions
//
//
// Regexp variables are mark with $$

export const START_CHARACTER$$ = /^/;

export const END_CHARACTER$$ = /$/;

export const ANY_AMOUNT_OF_WHITESPACE$$ = /\s+/;

export function some(...patterns: (string | RegExp)[]): RegExp {
  const patternsInDecreasingLength = patterns
    .map(toString)
    .sort((a, b) => b.length - a.length);

  return new RegExp(`(${patternsInDecreasingLength.join('|')})`);
}
export function startsWith(pattern: string | RegExp): RegExp {
  return concatenate(START_CHARACTER$$, pattern);
}

export function endsWith(pattern: string | RegExp): RegExp {
  return concatenate(pattern, END_CHARACTER$$);
}

export function toString(pattern: string | RegExp): string {
  return pattern instanceof RegExp ? pattern.source : pattern;
}

export function toRegExp(pattern: string | RegExp): RegExp {
  return pattern instanceof RegExp ? pattern : new RegExp(pattern);
}

/**
 * Always put this function at the end of the chain
 */
export function ignoreCase(pattern: string | RegExp): RegExp {
  return new RegExp(toString(pattern), 'i');
}

export function concatenate(...patterns: (string | RegExp)[]): RegExp {
  return new RegExp(patterns.map(toString).join(''));
}

/**
 * This is restricted to single characters
 */
export function exclude(...patterns: (string | RegExp)[]): RegExp {
  return new RegExp(`[^${patterns.map(toString).join('')}]`);
}

export function zeroOrMore(pattern: string | RegExp): RegExp {
  return new RegExp(`${toString(pattern)}*`);
}

export function oneOrMore(pattern: string | RegExp): RegExp {
  return new RegExp(`${toString(pattern)}+`);
}

export function lookAhead(pattern: string | RegExp): RegExp {
  return new RegExp(`(?=${toString(pattern)})`);
}
