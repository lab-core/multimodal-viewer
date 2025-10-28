import {
  AnyAtomicQuery,
  isAtomicQueryWithOperator,
  Query,
  QueryObject,
  QueryObjectFieldValue,
} from './query.model';

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

// MARK: Extract field
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
