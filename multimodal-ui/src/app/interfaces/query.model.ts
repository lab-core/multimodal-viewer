// MARK: Types
export type QueryPrimitiveValue = string | number | boolean | null | undefined;

export type QueryFieldValue =
  | QueryPrimitiveValue
  | QueryObject
  | QueryPrimitiveValue[]
  | QueryObject[];

export interface QueryObject {
  [key: string]: QueryFieldValue;
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

export interface QueryValueByOperator {
  '=': QueryPrimitiveValue;
  '!=': QueryPrimitiveValue;
  '>': QueryPrimitiveValue;
  '<': QueryPrimitiveValue;
  '>=': QueryPrimitiveValue;
  '<=': QueryPrimitiveValue;
  IN: QueryPrimitiveValue[];
  'NOT IN': QueryPrimitiveValue[];
  INCLUDES: QueryPrimitiveValue;
  'DOES NOT INCLUDE': QueryPrimitiveValue;
}

export interface AtomicQueryCondition<T extends keyof QueryValueByOperator> {
  field: string;
  operator: T;
  value: QueryValueByOperator[T];
  isNot: boolean;

  /**
   * Whether to ignore when an error occurs and return false
   */
  isOptional: boolean;
}

export type AnyAtomicQueryCondition = AtomicQueryCondition<
  keyof QueryValueByOperator
>;

export type QueryConditionAggregator = 'AND' | 'OR';

export type QueryCondition =
  | AnyAtomicQueryCondition
  | {
      conditions: QueryCondition[];
      aggregator: QueryConditionAggregator;
      isNot: boolean;
    };

export function isAtomicQueryConditionWithOperator<
  T extends keyof QueryValueByOperator,
>(
  atomicQueryCondition: AnyAtomicQueryCondition,
  operator: T,
): atomicQueryCondition is AtomicQueryCondition<T> {
  return atomicQueryCondition.operator === operator;
}

// MARK: Execute
export function execute(
  queryCondition: QueryCondition,
  data: QueryObject,
): boolean {
  const result = executeWithoutIsNot(queryCondition, data);

  return queryCondition.isNot ? !result : result;
}

export function executeWithoutIsNot(
  queryCondition: QueryCondition,
  data: QueryObject,
): boolean {
  if ('aggregator' in queryCondition) {
    return queryCondition.aggregator === 'AND'
      ? queryCondition.conditions.every((condition) => execute(condition, data))
      : queryCondition.conditions.some((condition) => execute(condition, data));
  }

  try {
    const fieldValue = extractField(data, queryCondition.field);

    return executeAtomicWithoutIsNot(queryCondition, fieldValue);
  } catch (error) {
    if (queryCondition.isOptional) {
      return false;
    }

    throw error;
  }
}

export class ExecuteAtomicError extends Error {
  constructor(
    message: string,
    public readonly payload: {
      atomicQueryCondition: AnyAtomicQueryCondition;
      fieldValue: QueryFieldValue;
    },
  ) {
    super(message);
  }
}

export function executeAtomicWithoutIsNot(
  queryCondition: AnyAtomicQueryCondition,
  fieldValue: QueryFieldValue,
): boolean {
  if (isAtomicQueryConditionWithOperator(queryCondition, '=')) {
    return fieldValue === queryCondition.value;
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, '!=')) {
    return fieldValue !== queryCondition.value;
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, '>')) {
    if (
      typeof fieldValue === 'string' &&
      typeof queryCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(queryCondition.value) > 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof queryCondition.value === 'number'
    ) {
      return fieldValue > queryCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQueryCondition: queryCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, '<')) {
    if (
      typeof fieldValue === 'string' &&
      typeof queryCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(queryCondition.value) < 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof queryCondition.value === 'number'
    ) {
      return fieldValue < queryCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQueryCondition: queryCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, '>=')) {
    if (
      typeof fieldValue === 'string' &&
      typeof queryCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(queryCondition.value) >= 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof queryCondition.value === 'number'
    ) {
      return fieldValue >= queryCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQueryCondition: queryCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, '<=')) {
    if (
      typeof fieldValue === 'string' &&
      typeof queryCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(queryCondition.value) <= 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof queryCondition.value === 'number'
    ) {
      return fieldValue <= queryCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        atomicQueryCondition: queryCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, 'IN')) {
    return queryCondition.value.some((value) => fieldValue === value);
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, 'NOT IN')) {
    return !queryCondition.value.some((value) => fieldValue === value);
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, 'INCLUDES')) {
    if (!Array.isArray(fieldValue)) {
      throw new ExecuteAtomicError('Expected array', {
        atomicQueryCondition: queryCondition,
        fieldValue,
      });
    }

    return fieldValue.some((value) => queryCondition.value === value);
  }

  if (isAtomicQueryConditionWithOperator(queryCondition, 'DOES NOT INCLUDE')) {
    if (!Array.isArray(fieldValue)) {
      throw new ExecuteAtomicError('Expected array', {
        atomicQueryCondition: queryCondition,
        fieldValue,
      });
    }

    return !fieldValue.some((value) => queryCondition.value === value);
  }

  throw new ExecuteAtomicError('Unknown operator', {
    atomicQueryCondition: queryCondition,
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
      currentFieldValue: QueryFieldValue;
    },
  ) {
    super(message);
  }
}

export function extractField(data: QueryObject, field: string) {
  const fields = field.split('.');

  let currentFieldValue: QueryFieldValue = data;
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
