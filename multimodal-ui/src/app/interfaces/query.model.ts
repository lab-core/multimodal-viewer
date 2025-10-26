// MARK: Types
export type QueryObjectPrimitiveValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type QueryObjectFieldValue =
  | QueryObjectPrimitiveValue
  | QueryObject
  | QueryObjectPrimitiveValue[]
  | QueryObject[];

export interface QueryObject {
  [key: string]: QueryObjectFieldValue;
}

export type QueryOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'IN'
  | 'NOT IN'
  | 'INCLUDES'
  | 'DOES NOT INCLUDE';

export const OPERATORS: QueryOperator[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'IN',
  'NOT IN',
  'INCLUDES',
  'DOES NOT INCLUDE',
];

export const SYMBOL_OPERATORS: QueryOperator[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
];

export interface QueryValueByOperator {
  '=': QueryObjectPrimitiveValue;
  '!=': QueryObjectPrimitiveValue;
  '>': QueryObjectPrimitiveValue;
  '<': QueryObjectPrimitiveValue;
  '>=': QueryObjectPrimitiveValue;
  '<=': QueryObjectPrimitiveValue;
  IN: QueryObjectPrimitiveValue[];
  'NOT IN': QueryObjectPrimitiveValue[];
  INCLUDES: QueryObjectPrimitiveValue;
  'DOES NOT INCLUDE': QueryObjectPrimitiveValue;
}

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

export interface AtomicQuery<T extends keyof QueryValueByOperator> {
  field: string;
  operator: T;
  value: QueryValueByOperator[T];
  isNot: boolean;

  /**
   * Whether to ignore when an error occurs and return false
   */
  isOptional: boolean;
}

export type AnyAtomicQuery = AtomicQuery<keyof QueryValueByOperator>;

export type QueryAggregator = 'AND' | 'OR';

export type Query =
  | AnyAtomicQuery
  | {
      conditions: Query[];
      aggregator: QueryAggregator;
      isNot: boolean;
    };

export function isAtomicQueryWithOperator<T extends keyof QueryValueByOperator>(
  atomicQuery: AnyAtomicQuery,
  operator: T,
): atomicQuery is AtomicQuery<T> {
  return atomicQuery.operator === operator;
}

// MARK: Execute
export function execute(query: Query, data: QueryObject): boolean {
  const result = executeWithoutIsNot(query, data);

  return query.isNot ? !result : result;
}

export function executeWithoutIsNot(query: Query, data: QueryObject): boolean {
  if ('aggregator' in query) {
    return query.aggregator === 'AND'
      ? query.conditions.every((query) => execute(query, data))
      : query.conditions.some((query) => execute(query, data));
  }

  try {
    const fieldValue = extractField(data, query.field);

    return executeAtomicWithoutIsNot(query, fieldValue);
  } catch (error) {
    if (query.isOptional) {
      return false;
    }

    throw error;
  }
}

export class ExecuteAtomicError extends Error {
  constructor(
    message: string,
    public readonly payload: {
      atomicQuery: AnyAtomicQuery;
      fieldValue: QueryObjectFieldValue;
    },
  ) {
    super(message);
  }
}

export function executeAtomicWithoutIsNot(
  query: AnyAtomicQuery,
  fieldValue: QueryObjectFieldValue,
): boolean {
  if (isAtomicQueryWithOperator(query, '=')) {
    return fieldValue === query.value;
  }

  if (isAtomicQueryWithOperator(query, '!=')) {
    return fieldValue !== query.value;
  }

  if (isAtomicQueryWithOperator(query, '>')) {
    if (typeof fieldValue === 'string' && typeof query.value === 'string') {
      return fieldValue.localeCompare(query.value) > 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof query.value === 'number'
    ) {
      return fieldValue > query.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQuery: query,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryWithOperator(query, '<')) {
    if (typeof fieldValue === 'string' && typeof query.value === 'string') {
      return fieldValue.localeCompare(query.value) < 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof query.value === 'number'
    ) {
      return fieldValue < query.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQuery: query,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryWithOperator(query, '>=')) {
    if (typeof fieldValue === 'string' && typeof query.value === 'string') {
      return fieldValue.localeCompare(query.value) >= 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof query.value === 'number'
    ) {
      return fieldValue >= query.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQuery: query,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryWithOperator(query, '<=')) {
    if (typeof fieldValue === 'string' && typeof query.value === 'string') {
      return fieldValue.localeCompare(query.value) <= 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof query.value === 'number'
    ) {
      return fieldValue <= query.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQuery: query,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryWithOperator(query, 'IN')) {
    return query.value.some((value) => fieldValue === value);
  }

  if (isAtomicQueryWithOperator(query, 'NOT IN')) {
    return !query.value.some((value) => fieldValue === value);
  }

  if (isAtomicQueryWithOperator(query, 'INCLUDES')) {
    if (!Array.isArray(fieldValue)) {
      throw new ExecuteAtomicError('Expected array', {
        atomicQuery: query,
        fieldValue,
      });
    }

    return fieldValue.some((value) => query.value === value);
  }

  if (isAtomicQueryWithOperator(query, 'DOES NOT INCLUDE')) {
    if (!Array.isArray(fieldValue)) {
      throw new ExecuteAtomicError('Expected array', {
        atomicQuery: query,
        fieldValue,
      });
    }

    return !fieldValue.some((value) => query.value === value);
  }

  throw new ExecuteAtomicError('Unknown operator', {
    atomicQuery: query,
    fieldValue,
  });
}

// MARK: extractField
export class ExtractFieldError extends Error {
  constructor(
    message: string,
    public readonly payload: {
      data: QueryObject;
      field: string;
      currentField: string;
      subField: string;
      currentFieldValue: QueryObjectFieldValue;
    },
  ) {
    super(message);
  }
}

export function extractField(data: QueryObject, field: string) {
  const fields = field.split('.');

  let currentFieldValue: QueryObjectFieldValue = data;
  let currentField = '';
  for (const subField of fields) {
    if (
      currentFieldValue === null ||
      currentFieldValue === undefined ||
      typeof currentFieldValue === 'boolean' ||
      typeof currentFieldValue === 'string' ||
      typeof currentFieldValue === 'number'
    ) {
      throw new ExtractFieldError(`Cannot read field on primitive`, {
        data,
        field,
        currentField,
        subField,
        currentFieldValue,
      });
    }

    if (Array.isArray(currentFieldValue)) {
      const castedField = Number(subField);

      if (Number.isNaN(castedField)) {
        throw new ExtractFieldError(`Cannot read non-numeric index on array`, {
          data,
          field,
          currentField,
          subField,
          currentFieldValue,
        });
      }

      currentFieldValue = currentFieldValue[castedField];
      continue;
    }

    currentFieldValue = currentFieldValue[subField];

    currentField = currentField ? `${currentField}.${subField}` : subField;
  }

  return currentFieldValue;
}

// MARK: Parser

/**
 * Tokens :
 *
 * 🌵=
 * 🌵>
 * 🌵<
 * 🌵>=
 * 🌵<=
 * 🌵IN
 * 🌵NOT IN
 * 🌵INCLUDES
 * 🌵DOES NOT INCLUDE
 *
 * 🌵TRUE
 * 🌵FALSE
 *
 * 🌵NOT
 * AND
 * OR
 * (
 * )
 *
 * 🌵UNDEFINED
 * 🌵NULL
 *
 * 🌵"string"
 * 🌵number
 *
 * 🌵array
 *
 * 🌵field
 *
 *
 * 🌵in string : \" and \\
 *
 * if AND or OR expected and nothing found, AND by default
 *
 * & and | can be used instead of AND and OR respectively
 * 🌵~ or ! can be used instead of NOT
 *
 * if not without parenthesis, only on next condition
 *
 * if AND and OR at the same level, AND are grouped
 *
 */

export interface ProcessedQuery {
  initialQuery: string;
  currentQuery: string;
  depth: number;
}

export type ParseErrorString =
  | 'Empty query encountered on start'
  | 'Empty query encountered on field'
  | 'Field not found'
  | 'Empty query encountered on primitive array'
  | 'Empty query encountered on primitive value'
  | 'Opening bracket not found'
  | 'Closing bracket not found'
  | 'Breakable character not found after string break character'
  | 'Closing string delimiter not found'
  | 'Number not found';

export class ParseError extends Error {
  constructor(
    message: ParseErrorString,
    public readonly payload: ProcessedQuery,
  ) {
    super(message);
  }
}

export function parseQuery(queryString: string): Query;
export function parseQuery(processedQuery: ProcessedQuery): Query;
export function parseQuery(
  queryStringOrProcessedQuery: string | ProcessedQuery,
): Query {
  let processedQuery: ProcessedQuery;

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
    // TODO Query handle negation on condition vs parenthesis
    const query = parseQuery(processedQuery);
    query.isNot = !query.isNot;
    return query;
  }

  const hasParenthesis = parseParenthesis(processedQuery);

  if (hasParenthesis) {
    // TODO Query handle parenthesis
    const query = parseQuery(processedQuery);
    return query;
  }

  // TODO Query handle compound (AND, OR)
  const query = parseAtomicQuery(processedQuery);
  return query;
}

// TODO Query test parse

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
      isOptional: false,
    };
  }

  const value = parseValue(processedQuery, operator);

  return {
    field,
    operator,
    value,
    isNot: false,
    isOptional: false,
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
    (!SYMBOL_OPERATORS.some((operator) =>
      currentQueryCopy.startsWith(operator),
    ) ||
      currentQueryCopy.startsWith(' '))
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

  for (const operator of OPERATORS) {
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

  let currentQueryCopy = processedQuery.currentQuery;

  while (currentQueryCopy.length > 0) {
    if (processedQuery.currentQuery.startsWith(stringDelimiter)) {
      currentQueryCopy = currentQueryCopy.slice(1);
      processedQuery.currentQuery = currentQueryCopy;
      return stringValue;
    } else if (processedQuery.currentQuery.startsWith(stringBreakCharacter)) {
      let hasFoundBreakableCharacter = false;
      for (const breakableCharacter of [
        stringBreakCharacter,
        stringDelimiter,
      ]) {
        const remainder = processedQuery.currentQuery.slice(
          stringBreakCharacter.length,
        );
        if (remainder.startsWith(breakableCharacter)) {
          hasFoundBreakableCharacter = true;
          stringValue += breakableCharacter;
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
      stringValue += currentQueryCopy[0];
      currentQueryCopy = currentQueryCopy.slice(1);
    }
  }

  throw new ParseError('Closing string delimiter not found', processedQuery);
}

export function parseNumber(
  processedQuery: ProcessedQuery,
  isInArray: boolean,
): number {
  const possibleFollowingCharactersAfterNumber: string[] = [' '];

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

  let followingCharacterIndex = -1;
  let followingCharacter: string | null = null;
  for (const possibleFollowingCharacterIndex of possibleFollowingCharactersAfterNumberIndexes) {
    if (possibleFollowingCharacterIndex > followingCharacterIndex) {
      followingCharacterIndex = possibleFollowingCharacterIndex;
      followingCharacter =
        possibleFollowingCharactersAfterNumber[possibleFollowingCharacterIndex];
    }
  }

  let number: number | null = null;
  let nextCurrentQuery = processedQuery.currentQuery;
  if (followingCharacter === null) {
    number = parseFloat(processedQuery.currentQuery);
    nextCurrentQuery = '';
  } else {
    number = parseFloat(
      processedQuery.currentQuery.slice(0, followingCharacterIndex),
    );
    nextCurrentQuery = processedQuery.currentQuery.slice(
      followingCharacterIndex,
    );
  }

  if (isNaN(number)) {
    throw new ParseError('Number not found', processedQuery);
  }

  processedQuery.currentQuery = nextCurrentQuery;

  return number;
}
