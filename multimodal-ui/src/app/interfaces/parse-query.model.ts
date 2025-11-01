import {
  OPERATORS,
  Query,
  QueryAggregator,
  QueryObjectPrimitiveValue,
  QueryOperator,
} from './query.model';
import {
  ANY_AMOUNT_OF_WHITESPACE$$,
  concatenate,
  END_CHARACTER$$,
  exclude,
  ignoreCase,
  ANY_AMOUNT_OF_WHITESPACE$$ as ONE_OR_MORE_WHITESPACE$$,
  some,
  startsWith,
  zeroOrMore,
} from './reg-exp.model';

// Number regexp
export const JAVA_SCRIPT_NUMBER_REGEXP =
  /[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]*)?/;

const JAVA_SCRIPT_FIELD_REGEXP = /[a-zA-Z_$][a-zA-Z0-9_$]*/;

// Operators regexp

export const SYMBOL_OPERATORS: QueryOperator[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
];

const OPERATORS$$ = some(...OPERATORS);
const SYMBOL_OPERATORS$$ = some(...SYMBOL_OPERATORS);

// Array regexp
const ARRAY_OPENING_BRACKETS_FOR_REGEXP = ['\\[']; // Needs to be escaped for regexp
const ARRAY_CLOSING_BRACKETS_FOR_REGEXP = ['\\]']; // Needs to be escaped for regexp

const ARRAY_OPENING_BRACKETS$$ = some(...ARRAY_OPENING_BRACKETS_FOR_REGEXP);
const ARRAY_CLOSING_BRACKETS$$ = some(...ARRAY_CLOSING_BRACKETS_FOR_REGEXP);

type ArrayValueSeparator = ',' | ';';

const ARRAY_VALUE_SEPARATORS: ArrayValueSeparator[] = [',', ';'];
const ARRAY_VALUE_SEPARATORS$$ = some(...ARRAY_VALUE_SEPARATORS);

// Scope regexp
const SCOPE_OPENING_BRACKETS_FOR_REGEXP = ['\\(']; // Needs to be escaped for regexp
const SCOPE_CLOSING_BRACKETS_FOR_REGEXP = ['\\)']; // Needs to be escaped for regexp

const SCOPE_OPENING_BRACKETS$$ = some(...SCOPE_OPENING_BRACKETS_FOR_REGEXP);
const SCOPE_CLOSING_BRACKETS$$ = some(...SCOPE_CLOSING_BRACKETS_FOR_REGEXP);

// String regexp
type StringDelimiter = '"' | "'" | '`';

export const STRING_DELIMITERS: StringDelimiter[] = ['"', "'", '`'];

const ESCAPE_CHARACTER = '\\';
const ESCAPE_CHARACTER$$ = /\\/;

// Negation regexp
const TEXT_NEGATIONS = ['NOT'];
const SHORTHAND_NEGATIONS = ['!', '~'];

const TEXT_NEGATIONS$$ = some(...TEXT_NEGATIONS);
const SHORTHAND_NEGATIONS$$ = some(...SHORTHAND_NEGATIONS);

// Aggregator regexp
const TEXT_CONJUNCTION_AGGREGATORS = ['AND'];
const TEXT_DISJUNCTION_AGGREGATORS = ['OR'];

export const SHORTHAND_CONJUNCTION_AGGREGATORS = ['&', '&&'];
export const SHORTHAND_DISJUNCTION_AGGREGATORS = ['|', '||'];
const SHORTHAND_DISJUNCTION_AGGREGATORS_FOR_REGEXP = ['\\|', '\\|\\|']; // Needs to be escaped for regexp

const TEXT_AGGREGATORS = [
  ...TEXT_CONJUNCTION_AGGREGATORS,
  ...TEXT_DISJUNCTION_AGGREGATORS,
];
export const SHORTHAND_AGGREGATORS = [
  ...SHORTHAND_CONJUNCTION_AGGREGATORS,
  ...SHORTHAND_DISJUNCTION_AGGREGATORS,
];

const SHORTHAND_AGGREGATORS_FOR_REGEXP = [
  ...SHORTHAND_CONJUNCTION_AGGREGATORS,
  ...SHORTHAND_DISJUNCTION_AGGREGATORS_FOR_REGEXP,
];

const TEXT_AGGREGATORS$$ = some(...TEXT_AGGREGATORS);
const SHORTHAND_AGGREGATORS$$ = some(...SHORTHAND_AGGREGATORS_FOR_REGEXP);

// Literal regexp
type QueryObjectLiteral = boolean | null | undefined;

type LiteralValue = 'TRUE' | 'FALSE' | 'NULL' | 'UNDEFINED';

const LITERALS: LiteralValue[] = ['TRUE', 'FALSE', 'NULL', 'UNDEFINED'];

const LITERALS$$ = some(...LITERALS);

const VALUE_BY_LITERALS: Record<LiteralValue, QueryObjectLiteral> = {
  TRUE: true,
  FALSE: false,
  NULL: null,
  UNDEFINED: undefined,
};

// MARK: Parse query
export interface ProcessedQuery {
  initialQuery: string;
  currentQuery: string;
  depth: number;
}

export type ParseErrorString =
  | 'Empty query encountered on start'
  | 'Aggregator not found'
  | 'Field not found'
  | 'Opening bracket not found'
  | 'Closing bracket not found'
  | 'Primitive value not found'
  | 'Closing bracket encountered without opening bracket';

export class ParseError extends Error {
  constructor(
    message: ParseErrorString,
    public readonly payload: ProcessedQuery,
  ) {
    super(message);
  }
}

export function parseQuery(queryString: string): Query;
export function parseQuery(
  processedQuery: ProcessedQuery,
  isAggregated: boolean,
  isNot: boolean,
): Query;
export function parseQuery(
  queryStringOrProcessedQuery: string | ProcessedQuery,
  isAggregated = false,
  isNot = false,
): Query {
  let processedQuery: ProcessedQuery;
  let query: Query;

  if (typeof queryStringOrProcessedQuery === 'string') {
    processedQuery = {
      initialQuery: queryStringOrProcessedQuery,
      currentQuery: queryStringOrProcessedQuery,
      depth: 0,
    };
  } else {
    processedQuery = queryStringOrProcessedQuery;
  }

  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  if (processedQuery.currentQuery === '') {
    throw new ParseError('Empty query encountered on start', processedQuery);
  }

  const hasNegation = parseNegation(processedQuery);

  if (hasNegation) {
    query = parseQuery(processedQuery, false, true);
  } else {
    const hasScopeOpening = parseScopeOpening(processedQuery);

    if (hasScopeOpening) {
      query = parseQuery(processedQuery, false, false);
    } else {
      query = parseAtomicQuery(processedQuery);
    }
  }

  query.isNot = isNot ? !query.isNot : query.isNot;

  if (isAggregated) {
    return query;
  }

  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  if (processedQuery.currentQuery === '') {
    return query;
  }

  return parseAggregated(processedQuery, query);
}

// MARK: Parse aggregated
export function parseAggregated(
  processedQuery: ProcessedQuery,
  firstQuery: Query,
): Query {
  let aggregator: QueryAggregator | null = null;

  const followingQueries: {
    query: Query;
    precedingAggregator: QueryAggregator;
  }[] = [];

  do {
    const hasScopeClosing = parseScopeClosing(processedQuery);

    if (hasScopeClosing) {
      if (processedQuery.depth === -1) {
        throw new ParseError(
          'Closing bracket encountered without opening bracket',
          processedQuery,
        );
      }
      break;
    }

    aggregator = parseAggregator(processedQuery);

    if (aggregator === null) {
      throw new ParseError('Aggregator not found', processedQuery);
    }

    if (aggregator !== null) {
      followingQueries.push({
        query: parseQuery(processedQuery, true, false),
        precedingAggregator: aggregator,
      });
    }
  } while (aggregator !== null && processedQuery.currentQuery.length > 0);

  return mergeAggregated(firstQuery, followingQueries);
}

// MARK: Merge aggregated
export function mergeAggregated(
  firstQuery: Query,
  followingQueries: {
    query: Query;
    precedingAggregator: QueryAggregator;
  }[],
): Query {
  if (followingQueries.length === 0) {
    return firstQuery;
  }

  const conjunctions: Query[] = [];

  let currentConjunctionConditions: Query[] = [firstQuery];

  for (const followingQuery of followingQueries) {
    if (followingQuery.precedingAggregator === 'AND') {
      currentConjunctionConditions.push(followingQuery.query);
    } else {
      if (currentConjunctionConditions.length > 1) {
        conjunctions.push({
          conditions: currentConjunctionConditions,
          aggregator: 'AND',
          isNot: false,
        });
      } else {
        conjunctions.push(currentConjunctionConditions[0]);
      }

      currentConjunctionConditions = [followingQuery.query];
    }
  }

  if (currentConjunctionConditions.length > 1) {
    conjunctions.push({
      conditions: currentConjunctionConditions,
      aggregator: 'AND',
      isNot: false,
    });
  } else {
    conjunctions.push(currentConjunctionConditions[0]);
  }

  if (conjunctions.length === 1) {
    return conjunctions[0];
  }

  return {
    conditions: conjunctions,
    aggregator: 'OR',
    isNot: false,
  };
}

// MARK: Parse aggregator
export function parseAggregator(
  processedQuery: ProcessedQuery,
): QueryAggregator | null {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const shorthandAggregatorMatches = startsWith(SHORTHAND_AGGREGATORS$$).exec(
    processedQuery.currentQuery,
  );

  if (shorthandAggregatorMatches !== null) {
    processedQuery.currentQuery = processedQuery.currentQuery.slice(
      shorthandAggregatorMatches[0].length,
    );

    if (
      SHORTHAND_CONJUNCTION_AGGREGATORS.includes(shorthandAggregatorMatches[0])
    ) {
      return 'AND';
    }
    if (
      SHORTHAND_DISJUNCTION_AGGREGATORS.includes(shorthandAggregatorMatches[0])
    ) {
      return 'OR';
    }

    return null;
  }

  const allowedFollowingText: (string | RegExp)[] = [
    ANY_AMOUNT_OF_WHITESPACE$$,
    SCOPE_OPENING_BRACKETS$$,
  ];

  const textAggregatorWithFollowingMatches = ignoreCase(
    startsWith(concatenate(TEXT_AGGREGATORS$$, some(...allowedFollowingText))),
  ).exec(processedQuery.currentQuery);

  if (textAggregatorWithFollowingMatches === null) {
    return null;
  }

  const textAggregatorMatches = ignoreCase(startsWith(TEXT_AGGREGATORS$$)).exec(
    processedQuery.currentQuery,
  );

  if (textAggregatorMatches === null) {
    return null;
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    textAggregatorMatches[0].length,
  );

  return textAggregatorMatches[0].toLocaleUpperCase() as QueryAggregator;
}

// MARK: Parse negation
export function parseNegation(processedQuery: ProcessedQuery): boolean {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const shorthandNegationMatches = startsWith(SHORTHAND_NEGATIONS$$).exec(
    processedQuery.currentQuery,
  );

  if (shorthandNegationMatches !== null) {
    processedQuery.currentQuery = processedQuery.currentQuery.slice(
      shorthandNegationMatches[0].length,
    );
    return true;
  }

  const allowedFollowingText: (string | RegExp)[] = [
    SHORTHAND_NEGATIONS$$,
    ANY_AMOUNT_OF_WHITESPACE$$,
    SCOPE_OPENING_BRACKETS$$,
  ];

  const textNegationWithFollowingMatches = ignoreCase(
    startsWith(concatenate(TEXT_NEGATIONS$$, some(...allowedFollowingText))),
  ).exec(processedQuery.currentQuery);

  if (textNegationWithFollowingMatches === null) {
    return false;
  }

  const textNegationMatches = ignoreCase(startsWith(TEXT_NEGATIONS$$)).exec(
    processedQuery.currentQuery,
  );

  if (textNegationMatches === null) {
    return false;
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    textNegationMatches[0].length,
  );

  return true;
}

// MARK: Parse scope opening
export function parseScopeOpening(processedQuery: ProcessedQuery): boolean {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const currentQuery = processedQuery.currentQuery;

  const scopeOpeningMatches = ignoreCase(
    startsWith(SCOPE_OPENING_BRACKETS$$),
  ).exec(currentQuery);

  if (scopeOpeningMatches === null) {
    return false;
  }

  processedQuery.currentQuery = currentQuery.slice(
    scopeOpeningMatches[0].length,
  );

  ++processedQuery.depth;

  return true;
}

// MARK: Parse scope closing
export function parseScopeClosing(processedQuery: ProcessedQuery): boolean {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const currentQuery = processedQuery.currentQuery;

  const scopeClosingMatches = ignoreCase(
    startsWith(SCOPE_CLOSING_BRACKETS$$),
  ).exec(currentQuery);

  if (scopeClosingMatches === null) {
    return false;
  }

  processedQuery.currentQuery = currentQuery.slice(
    scopeClosingMatches[0].length,
  );

  --processedQuery.depth;

  return true;
}

// MARK: Parse atomic query
export function parseAtomicQuery(processedQuery: ProcessedQuery): Query {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const field = parseField(processedQuery);

  if (field === null) {
    throw new ParseError('Field not found', processedQuery);
  }

  const operator = parseOperator(processedQuery);

  if (operator === null) {
    // Will be compared to true
    return {
      field,
      operator: '=',
      value: true,
      isNot: false,
      isOptional: true,
    };
  }

  const value = parseValue(processedQuery, operator);

  return {
    field,
    operator,
    value,
    isNot: false,
    isOptional: true,
  };
}

// MARK: Parse field
export function parseField(processedQuery: ProcessedQuery): string | null {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const allowedFollowing = [
    END_CHARACTER$$,
    SYMBOL_OPERATORS$$,
    SHORTHAND_AGGREGATORS$$,
    SCOPE_CLOSING_BRACKETS$$,
    ONE_OR_MORE_WHITESPACE$$,
  ];

  const fieldWithFollowingMatches = ignoreCase(
    startsWith(
      concatenate(JAVA_SCRIPT_FIELD_REGEXP, some(...allowedFollowing)),
    ),
  ).exec(processedQuery.currentQuery);

  if (fieldWithFollowingMatches === null) {
    return null;
  }

  const fieldMatches = startsWith(JAVA_SCRIPT_FIELD_REGEXP).exec(
    processedQuery.currentQuery,
  );

  if (fieldMatches === null) {
    return null;
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    fieldMatches[0].length,
  );

  return fieldMatches[0];
}

// MARK: Parse operator
export function parseOperator(
  processedQuery: ProcessedQuery,
): QueryOperator | null {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  if (processedQuery.currentQuery === '') {
    return null;
  }

  const operatorMatches = ignoreCase(startsWith(some(OPERATORS$$))).exec(
    processedQuery.currentQuery,
  );

  if (operatorMatches !== null) {
    processedQuery.currentQuery = processedQuery.currentQuery.slice(
      operatorMatches[0].length,
    );
    return operatorMatches[0].toLocaleUpperCase() as QueryOperator;
  }

  return null;
}

// MARK: Parse value
export function parseValue(
  processedQuery: ProcessedQuery,
  operator: QueryOperator,
): QueryObjectPrimitiveValue | QueryObjectPrimitiveValue[] {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  if (operator === 'IN' || operator === 'NOT IN') {
    return parsePrimitiveArray(processedQuery);
  }

  return parsePrimitiveValue(processedQuery, false);
}

// MARK: Parse primitive array
export function parsePrimitiveArray(
  processedQuery: ProcessedQuery,
): QueryObjectPrimitiveValue[] {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const openingBracketMatches = startsWith(some(ARRAY_OPENING_BRACKETS$$)).exec(
    processedQuery.currentQuery,
  );

  if (openingBracketMatches === null) {
    throw new ParseError('Opening bracket not found', processedQuery);
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    openingBracketMatches[0].length,
  );

  const values: QueryObjectPrimitiveValue[] = [];

  while (processedQuery.currentQuery.length > 0) {
    processedQuery.currentQuery = processedQuery.currentQuery.trim();

    values.push(parsePrimitiveValue(processedQuery, true));

    processedQuery.currentQuery = processedQuery.currentQuery.trim();

    const separatorMatches = startsWith(some(ARRAY_VALUE_SEPARATORS$$)).exec(
      processedQuery.currentQuery,
    );
    if (separatorMatches !== null) {
      processedQuery.currentQuery = processedQuery.currentQuery.slice(
        separatorMatches[0].length,
      );
      continue;
    }

    const closingBracketMatches = startsWith(
      some(ARRAY_CLOSING_BRACKETS$$),
    ).exec(processedQuery.currentQuery);
    if (closingBracketMatches !== null) {
      processedQuery.currentQuery = processedQuery.currentQuery.slice(
        closingBracketMatches[0].length,
      );
      return values;
    }

    break;
  }

  throw new ParseError('Closing bracket not found', processedQuery);
}

// MARK: Parse primitive value
export function parsePrimitiveValue(
  processedQuery: ProcessedQuery,
  isInArray: boolean,
): QueryObjectPrimitiveValue {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const parsedLiteral = parseLiteral(processedQuery);
  if (parsedLiteral !== 'no-literal-match') {
    return parsedLiteral;
  }

  const parsedString = parseString(processedQuery);
  if (parsedString !== null) {
    return parsedString;
  }

  const parsedNumber = parseNumber(processedQuery, isInArray);
  if (parsedNumber !== null) {
    return parsedNumber;
  }

  throw new ParseError('Primitive value not found', processedQuery);
}

// MARK: Parse literal
export function parseLiteral(
  processedQuery: ProcessedQuery,
): QueryObjectLiteral | 'no-literal-match' {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const literalMatches = ignoreCase(startsWith(LITERALS$$)).exec(
    processedQuery.currentQuery,
  );

  if (literalMatches === null) {
    return 'no-literal-match';
  }

  const literalMatch = literalMatches[0];

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    literalMatch.length,
  );

  return VALUE_BY_LITERALS[literalMatch.toLocaleUpperCase() as LiteralValue];
}

// MARK: Parse string
export function parseString(processedQuery: ProcessedQuery): string | null {
  // This regexp is more complex than the others
  //
  // We want to match any string that :
  // - starts and ends with a string delimiter (the same delimiter)
  // - contains anything but the escape character and the string delimiter
  // - if an escape character is found, the next character is either the string delimiter or another escape character

  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  let stringMatchDelimiter: StringDelimiter | null = null;
  let stringMatch: string | null = null;

  for (const stringDelimiter of STRING_DELIMITERS) {
    const anyCharacterButNotStringDelimiterOrEscapeCharacter$$ = exclude(
      stringDelimiter,
      ESCAPE_CHARACTER$$,
    );

    const escapedStringDelimiter$$ = concatenate(
      ESCAPE_CHARACTER$$,
      stringDelimiter,
    );

    const escapedEscapeCharacter$$ = concatenate(
      ESCAPE_CHARACTER$$,
      ESCAPE_CHARACTER$$,
    );

    const string$$ = startsWith(
      concatenate(
        stringDelimiter,
        zeroOrMore(
          some(
            anyCharacterButNotStringDelimiterOrEscapeCharacter$$,
            escapedStringDelimiter$$,
            escapedEscapeCharacter$$,
          ),
        ),
        stringDelimiter,
      ),
    );

    const stringMatches = string$$.exec(processedQuery.currentQuery);

    if (stringMatches !== null) {
      stringMatchDelimiter = stringDelimiter;
      stringMatch = stringMatches[0];
      break;
    }
  }

  if (stringMatch === null || stringMatchDelimiter === null) {
    return null;
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    stringMatch.length,
  );
  return stringMatch
    .slice(1, -1)
    .replaceAll(
      `${ESCAPE_CHARACTER}${ESCAPE_CHARACTER}`,
      `${ESCAPE_CHARACTER}${ESCAPE_CHARACTER}temp`,
    )
    .replaceAll(
      `${ESCAPE_CHARACTER}${stringMatchDelimiter}`,
      stringMatchDelimiter,
    )
    .replaceAll(
      `${ESCAPE_CHARACTER}${ESCAPE_CHARACTER}temp`,
      `${ESCAPE_CHARACTER}`,
    );
}

// MARK: Parse number
export function parseNumber(
  processedQuery: ProcessedQuery,
  isInArray: boolean,
): number | null {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const allowedFollowing = [
    END_CHARACTER$$,
    ONE_OR_MORE_WHITESPACE$$,
    SHORTHAND_AGGREGATORS$$,
  ];

  if (processedQuery.depth > 0) {
    allowedFollowing.push(SCOPE_CLOSING_BRACKETS$$);
  }

  if (isInArray) {
    allowedFollowing.push(ARRAY_CLOSING_BRACKETS$$, ARRAY_VALUE_SEPARATORS$$);
  }

  const numberWithFollowing$$ = startsWith(
    concatenate(JAVA_SCRIPT_NUMBER_REGEXP, some(...allowedFollowing)),
  );

  if (numberWithFollowing$$.exec(processedQuery.currentQuery) === null) {
    return null;
  }

  const number$$ = startsWith(JAVA_SCRIPT_NUMBER_REGEXP);

  const numberMatches = number$$.exec(processedQuery.currentQuery);

  if (numberMatches === null) {
    return null;
  }

  const numberMatch = numberMatches[0];

  const parsedNumber = parseFloat(numberMatch);

  if (isNaN(parsedNumber)) {
    return null;
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    numberMatch.length,
  );

  return parsedNumber;
}
