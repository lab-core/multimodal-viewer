// MARK: Types
export type SearchValue = string | number | boolean | null | undefined;

export type SearchDataFieldValue =
  | SearchValue
  | SearchData
  | SearchValue[]
  | SearchData[];

export interface SearchData {
  [key: string]: SearchDataFieldValue;
}

export type SearchOperator =
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

export interface SearchValueByOperator {
  '=': SearchValue;
  '!=': SearchValue;
  '>': SearchValue;
  '<': SearchValue;
  '>=': SearchValue;
  '<=': SearchValue;
  IN: SearchValue[];
  'NOT IN': SearchValue[];
  INCLUDES: SearchValue;
  'DOES NOT INCLUDE': SearchValue;
}

export interface AtomicSearchCondition<T extends keyof SearchValueByOperator> {
  field: string;
  operator: T;
  value: SearchValueByOperator[T];
  isNot: boolean;

  /**
   * Whether to ignore when an error occurs and return false
   */
  isOptional: boolean;
}

export type AnyAtomicSearchCondition = AtomicSearchCondition<
  keyof SearchValueByOperator
>;

export type SearchConditionAggregator = 'AND' | 'OR';

export type SearchCondition =
  | AnyAtomicSearchCondition
  | {
      conditions: SearchCondition[];
      aggregator: SearchConditionAggregator;
      isNot: boolean;
    };

export function isAtomicSearchConditionWithOperator<
  T extends keyof SearchValueByOperator,
>(
  searchCondition: AnyAtomicSearchCondition,
  operator: T,
): searchCondition is AtomicSearchCondition<T> {
  return searchCondition.operator === operator;
}

/**
 * where field=TRUE
 * where field=FALSE
 * where field=UNDEFINED
 * where field=NULL
 * where field?="string"
 * where field=123456
 * where field // Treated as boolean
 *
 * where field=123456 AND (field2=TRUE OR field2=FALSE)
 *
 * TODO parser
 * TODO validator
 * TODO serializer
 * TODO deserializer
 * TODO executor
 *
 */

// MARK: Execute
export function execute(
  searchCondition: SearchCondition,
  data: SearchData,
): boolean {
  const result = executeWithoutIsNot(searchCondition, data);

  return searchCondition.isNot ? !result : result;
}

export function executeWithoutIsNot(
  searchCondition: SearchCondition,
  data: SearchData,
): boolean {
  if ('aggregator' in searchCondition) {
    return searchCondition.aggregator === 'AND'
      ? searchCondition.conditions.every((condition) =>
          execute(condition, data),
        )
      : searchCondition.conditions.some((condition) =>
          execute(condition, data),
        );
  }

  try {
    const fieldValue = extractField(data, searchCondition.field);

    return executeAtomicWithoutIsNot(searchCondition, fieldValue);
  } catch (error) {
    if (searchCondition.isOptional) {
      return false;
    }

    throw error;
  }
}

export class ExecuteAtomicError extends Error {
  constructor(
    message: string,
    public readonly payload: {
      searchCondition: AnyAtomicSearchCondition;
      fieldValue: SearchDataFieldValue;
    },
  ) {
    super(message);
  }
}

export function executeAtomicWithoutIsNot(
  searchCondition: AnyAtomicSearchCondition,
  fieldValue: SearchDataFieldValue,
): boolean {
  if (isAtomicSearchConditionWithOperator(searchCondition, '=')) {
    return fieldValue === searchCondition.value;
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, '!=')) {
    return fieldValue !== searchCondition.value;
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, '>')) {
    if (
      typeof fieldValue === 'string' &&
      typeof searchCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(searchCondition.value) > 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof searchCondition.value === 'number'
    ) {
      return fieldValue > searchCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        searchCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, '<')) {
    if (
      typeof fieldValue === 'string' &&
      typeof searchCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(searchCondition.value) < 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof searchCondition.value === 'number'
    ) {
      return fieldValue < searchCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        searchCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, '>=')) {
    if (
      typeof fieldValue === 'string' &&
      typeof searchCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(searchCondition.value) >= 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof searchCondition.value === 'number'
    ) {
      return fieldValue >= searchCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        searchCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, '<=')) {
    if (
      typeof fieldValue === 'string' &&
      typeof searchCondition.value === 'string'
    ) {
      return fieldValue.localeCompare(searchCondition.value) <= 0;
    } else if (
      typeof fieldValue === 'number' &&
      typeof searchCondition.value === 'number'
    ) {
      return fieldValue <= searchCondition.value;
    } else {
      throw new ExecuteAtomicError('Cannot compare elements', {
        searchCondition,
        fieldValue,
      });
    }
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, 'IN')) {
    return searchCondition.value.some((value) => fieldValue === value);
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, 'NOT IN')) {
    return !searchCondition.value.some((value) => fieldValue === value);
  }

  if (isAtomicSearchConditionWithOperator(searchCondition, 'INCLUDES')) {
    if (!Array.isArray(fieldValue)) {
      throw new ExecuteAtomicError('Expected array', {
        searchCondition,
        fieldValue,
      });
    }

    return fieldValue.some((value) => searchCondition.value === value);
  }

  if (
    isAtomicSearchConditionWithOperator(searchCondition, 'DOES NOT INCLUDE')
  ) {
    if (!Array.isArray(fieldValue)) {
      throw new ExecuteAtomicError('Expected array', {
        searchCondition,
        fieldValue,
      });
      return false;
    }

    return !fieldValue.some((value) => searchCondition.value === value);
  }

  throw new ExecuteAtomicError('Unknown operator', {
    searchCondition,
    fieldValue,
  });
}

// MARK: extractField
export class ExtractFieldError extends Error {
  constructor(
    message: string,
    public readonly payload: {
      data: SearchData;
      field: string;
      currentField: string;
      subField: string;
      currentFieldValue: SearchDataFieldValue;
    },
  ) {
    super(message);
  }
}

export function extractField(data: SearchData, field: string) {
  const fields = field.split('.');

  let currentFieldValue: SearchDataFieldValue = data;
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
