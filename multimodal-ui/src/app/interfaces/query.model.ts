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

export interface CompoundQuery {
  conditions: Query[];
  aggregator: QueryAggregator;
  isNot: boolean;
}

export type Query = AnyAtomicQuery | CompoundQuery;

export function isAtomicQueryWithOperator<T extends keyof QueryValueByOperator>(
  atomicQuery: AnyAtomicQuery,
  operator: T,
): atomicQuery is AtomicQuery<T> {
  return atomicQuery.operator === operator;
}
