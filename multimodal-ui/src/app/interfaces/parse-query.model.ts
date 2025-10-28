// MARK: Types

import {
  OPERATORS,
  Query,
  QueryAggregator,
  QueryObjectPrimitiveValue,
  QueryOperator,
} from './query.model';

export const OPERATORS_IN_DECREASING_LENGTH: QueryOperator[] = OPERATORS.sort(
  (a, b) => b.length - a.length,
);

export const SYMBOL_OPERATORS: QueryOperator[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
];

export const SYMBOL_OPERATORS_IN_DECREASING_LENGTH: QueryOperator[] =
  SYMBOL_OPERATORS.sort((a, b) => b.length - a.length);

export type ArrayValueSeparator = ',' | ';';

export const ARRAY_VALUE_SEPARATORS: ArrayValueSeparator[] = [';', ','];

export type LiteralValue = 'TRUE' | 'FALSE' | 'NULL' | 'UNDEFINED';

export const LITERAL_VALUES: LiteralValue[] = [
  'TRUE',
  'FALSE',
  'NULL',
  'UNDEFINED',
];

export const LITERAL_VALUES_REAL_VALUE: Record<
  LiteralValue,
  QueryObjectPrimitiveValue
> = {
  TRUE: true,
  FALSE: false,
  NULL: null,
  UNDEFINED: undefined,
};

export type StringDelimiter = '"' | "'";

export const STRING_DELIMITERS: StringDelimiter[] = ['"', "'"];

export const stringBreakCharacter = '\\';

export type ShorthandQueryAggregator = '&' | '|';

export const SHORTHAND_QUERY_AGGREGATORS: ShorthandQueryAggregator[] = [
  '&',
  '|',
];
// MARK: Parse query
export interface ProcessedQuery {
  initialQuery: string;
  currentQuery: string;
  depth: number;
}

export type ParseErrorString =
  | 'Empty query encountered on start'
  | 'Aggregator not found'
  | 'Empty query encountered on field'
  | 'Field not found'
  | 'Empty query encountered on primitive array'
  | 'Empty query encountered on primitive value'
  | 'Opening bracket not found'
  | 'Closing bracket not found'
  | 'Breakable character not found after string break character'
  | 'Closing string delimiter not found'
  | 'String does not match number format'
  | 'Number not found'
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
    const hasParenthesis = parseParenthesis(processedQuery);

    if (hasParenthesis) {
      query = parseQuery(processedQuery, false, false);
    } else {
      query = parseAtomicQuery(processedQuery);
    }
  }

  query.isNot = isNot ? !query.isNot : query.isNot;

  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  if (isAggregated) {
    return query;
  }

  if (processedQuery.currentQuery === '') {
    return query;
  }

  let aggregator: QueryAggregator | null = null;

  const followingQueries: {
    query: Query;
    precedingAggregator: QueryAggregator;
  }[] = [];

  do {
    if (processedQuery.currentQuery.startsWith(')')) {
      if (processedQuery.depth === 0) {
        throw new ParseError(
          'Closing bracket encountered without opening bracket',
          processedQuery,
        );
      }

      processedQuery.depth -= 1;
      processedQuery.currentQuery = processedQuery.currentQuery.slice(1);
      break;
    }

    aggregator = null;

    if (processedQuery.currentQuery.startsWith('&')) {
      aggregator = 'AND';
      processedQuery.currentQuery = processedQuery.currentQuery.slice(1);
    } else if (
      processedQuery.currentQuery.length >= 'and'.length + 1 &&
      processedQuery.currentQuery.slice(0, 'and'.length).toLocaleLowerCase() ===
        'and' &&
      [' ', '('].includes(processedQuery.currentQuery['and'.length])
    ) {
      aggregator = 'AND';
      processedQuery.currentQuery = processedQuery.currentQuery.slice(
        'and'.length,
      );
    } else if (processedQuery.currentQuery.startsWith('|')) {
      aggregator = 'OR';
      processedQuery.currentQuery = processedQuery.currentQuery.slice(1);
    } else if (
      processedQuery.currentQuery.length >= 'or'.length + 1 &&
      processedQuery.currentQuery.slice(0, 'or'.length).toLocaleLowerCase() ===
        'or' &&
      [' ', '('].includes(processedQuery.currentQuery['or'.length])
    ) {
      aggregator = 'OR';
      processedQuery.currentQuery = processedQuery.currentQuery.slice(
        'or'.length,
      );
    } else {
      throw new ParseError('Aggregator not found', processedQuery);
    }

    processedQuery.currentQuery = processedQuery.currentQuery.trim();

    if (aggregator !== null) {
      followingQueries.push({
        query: parseQuery(processedQuery, true, false),
        precedingAggregator: aggregator,
      });
    }
  } while (aggregator !== null && processedQuery.currentQuery.length > 0);

  if (followingQueries.length === 0) {
    return query;
  }

  const conjunctions: Query[] = [];

  let currentConjunctionConditions: Query[] = [query];

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

export function parseNegation(processedQuery: ProcessedQuery): boolean {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const currentQuery = processedQuery.currentQuery;

  if (currentQuery === '') {
    return false;
  }

  if (currentQuery.startsWith('!') || currentQuery.startsWith('~')) {
    processedQuery.currentQuery = currentQuery.slice(1);
    return true;
  }

  if (
    currentQuery.length >= 4 &&
    currentQuery.slice(0, 3).toLocaleLowerCase() === 'not' &&
    [' ', '(', '!', '~'].includes(currentQuery[3])
  ) {
    processedQuery.currentQuery = currentQuery.slice(3);
    return true;
  }

  return false;
}

export function parseParenthesis(processedQuery: ProcessedQuery): boolean {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const currentQuery = processedQuery.currentQuery;

  if (currentQuery === '') {
    return false;
  }

  if (currentQuery.startsWith('(')) {
    processedQuery.currentQuery = currentQuery.slice(1);
    processedQuery.depth++;
    return true;
  }

  return false;
}

export function parseAtomicQuery(processedQuery: ProcessedQuery): Query {
  const field = parseField(processedQuery);

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

export function parseField(processedQuery: ProcessedQuery): string {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const currentQuery = processedQuery.currentQuery;

  if (currentQuery === '') {
    throw new ParseError('Empty query encountered on field', processedQuery);
  }

  let field = '';
  let currentQueryCopy = currentQuery;

  while (
    currentQueryCopy.length > 0 &&
    !(
      SYMBOL_OPERATORS_IN_DECREASING_LENGTH.some((operator) =>
        currentQueryCopy.startsWith(operator),
      ) ||
      SHORTHAND_QUERY_AGGREGATORS.some((aggregator) =>
        currentQueryCopy.startsWith(aggregator),
      ) ||
      currentQueryCopy.startsWith(' ')
    )
  ) {
    field += currentQueryCopy[0];
    currentQueryCopy = currentQueryCopy.slice(1);
  }

  if (field === '') {
    throw new ParseError('Field not found', processedQuery);
  }

  processedQuery.currentQuery = currentQueryCopy;
  return field;
}

export function parseOperator(
  processedQuery: ProcessedQuery,
): QueryOperator | null {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  const currentQuery = processedQuery.currentQuery;

  if (currentQuery === '') {
    return null;
  }

  for (const operator of OPERATORS_IN_DECREASING_LENGTH) {
    if (
      currentQuery.length >= operator.length &&
      currentQuery.slice(0, operator.length).toLocaleLowerCase() ===
        operator.toLocaleLowerCase()
    ) {
      processedQuery.currentQuery = currentQuery.slice(operator.length);
      return operator;
    }
  }

  return null;
}

export function parseValue(
  processedQuery: ProcessedQuery,
  operator: QueryOperator,
): QueryObjectPrimitiveValue | QueryObjectPrimitiveValue[] {
  if (operator === 'IN' || operator === 'NOT IN') {
    return parsePrimitiveArray(processedQuery);
  }

  return parsePrimitiveValue(processedQuery, false);
}

export function parsePrimitiveArray(
  processedQuery: ProcessedQuery,
): QueryObjectPrimitiveValue[] {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  if (processedQuery.currentQuery === '') {
    throw new ParseError(
      'Empty query encountered on primitive array',
      processedQuery,
    );
  }

  if (!processedQuery.currentQuery.startsWith('[')) {
    throw new ParseError('Opening bracket not found', processedQuery);
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(1);

  const values: QueryObjectPrimitiveValue[] = [];

  while (processedQuery.currentQuery.length > 0) {
    values.push(parsePrimitiveValue(processedQuery, true));

    processedQuery.currentQuery = processedQuery.currentQuery.trim();

    if (
      ARRAY_VALUE_SEPARATORS.some((separator) =>
        processedQuery.currentQuery.startsWith(separator),
      )
    ) {
      processedQuery.currentQuery = processedQuery.currentQuery.slice(1);
    } else if (processedQuery.currentQuery.startsWith(']')) {
      processedQuery.currentQuery = processedQuery.currentQuery.slice(1);
      return values;
    } else {
      break;
    }
  }

  throw new ParseError('Closing bracket not found', processedQuery);
}

export function parsePrimitiveValue(
  processedQuery: ProcessedQuery,
  isInArray: boolean,
): QueryObjectPrimitiveValue {
  processedQuery.currentQuery = processedQuery.currentQuery.trim();

  if (processedQuery.currentQuery === '') {
    throw new ParseError(
      'Empty query encountered on primitive value',
      processedQuery,
    );
  }

  for (const literalValue of LITERAL_VALUES) {
    if (
      processedQuery.currentQuery.length >= literalValue.length &&
      processedQuery.currentQuery
        .slice(0, literalValue.length)
        .toLocaleLowerCase() === literalValue.toLocaleLowerCase()
    ) {
      processedQuery.currentQuery = processedQuery.currentQuery.slice(
        literalValue.length,
      );
      return LITERAL_VALUES_REAL_VALUE[literalValue];
    }
  }

  for (const stringDelimiter of STRING_DELIMITERS) {
    if (processedQuery.currentQuery.startsWith(stringDelimiter)) {
      processedQuery.currentQuery = processedQuery.currentQuery.slice(1);
      return parseString(processedQuery, stringDelimiter);
    }
  }

  return parseNumber(processedQuery, isInArray);
}

export function parseString(
  processedQuery: ProcessedQuery,
  stringDelimiter: string,
): string {
  let stringValue = '';

  let currentQuery = processedQuery.currentQuery;

  while (currentQuery.length > 0) {
    if (currentQuery.startsWith(stringDelimiter)) {
      currentQuery = currentQuery.slice(1);
      processedQuery.currentQuery = currentQuery;
      return stringValue;
    } else if (currentQuery.startsWith(stringBreakCharacter)) {
      let hasFoundBreakableCharacter = false;
      for (const breakableCharacter of [
        stringBreakCharacter,
        stringDelimiter,
      ]) {
        const remainder = currentQuery.slice(stringBreakCharacter.length);
        if (remainder.startsWith(breakableCharacter)) {
          hasFoundBreakableCharacter = true;
          stringValue += breakableCharacter;
          currentQuery = remainder.slice(breakableCharacter.length);
          break;
        }
      }

      if (!hasFoundBreakableCharacter) {
        throw new ParseError(
          'Breakable character not found after string break character',
          processedQuery,
        );
      }
    } else {
      stringValue += currentQuery[0];
      currentQuery = currentQuery.slice(1);
    }
  }

  throw new ParseError('Closing string delimiter not found', processedQuery);
}

export const JAVA_SCRIPT_NUMBER_REGEX =
  /^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]*)?$/;

export function parseNumber(
  processedQuery: ProcessedQuery,
  isInArray: boolean,
): number {
  const possibleFollowingCharactersAfterNumber: string[] = [
    ' ',
    ...SHORTHAND_QUERY_AGGREGATORS,
  ];

  if (processedQuery.depth > 0) {
    possibleFollowingCharactersAfterNumber.push(')');
  }

  if (isInArray) {
    possibleFollowingCharactersAfterNumber.push(...ARRAY_VALUE_SEPARATORS, ']');
  }

  const possibleFollowingCharactersAfterNumberIndexes =
    possibleFollowingCharactersAfterNumber.map((character) =>
      processedQuery.currentQuery.indexOf(character),
    );

  let followingCharacterIndex = Infinity;
  let followingCharacter: string | null = null;
  for (const possibleFollowingCharacterIndex of possibleFollowingCharactersAfterNumberIndexes) {
    if (
      possibleFollowingCharacterIndex > 0 &&
      possibleFollowingCharacterIndex < followingCharacterIndex
    ) {
      followingCharacterIndex = possibleFollowingCharacterIndex;
      followingCharacter =
        possibleFollowingCharactersAfterNumber[possibleFollowingCharacterIndex];
    }
  }

  let numberString: string;
  if (followingCharacter === null) {
    numberString = processedQuery.currentQuery;
  } else {
    numberString = processedQuery.currentQuery.slice(
      0,
      followingCharacterIndex,
    );
  }

  if (numberString.match(JAVA_SCRIPT_NUMBER_REGEX) === null) {
    throw new ParseError('Number not found', processedQuery);
  }

  const number = Number(numberString);

  if (isNaN(number)) {
    throw new ParseError('Number not found', processedQuery);
  }

  processedQuery.currentQuery = processedQuery.currentQuery.slice(
    numberString.length,
  );

  return number;
}
