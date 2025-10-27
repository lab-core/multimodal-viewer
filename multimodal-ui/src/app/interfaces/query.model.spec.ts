import {
  AnyAtomicQuery,
  execute,
  ExecuteAtomicError,
  executeAtomicWithoutIsNot,
  executeWithoutIsNot,
  extractField,
  ExtractFieldError,
  JAVA_SCRIPT_NUMBER_REGEX,
  OPERATORS,
  parseAtomicQuery,
  ParseError,
  parseField,
  parseNumber,
  parseOperator,
  parsePrimitiveArray,
  parsePrimitiveValue,
  parseString,
  parseValue,
  ProcessedQuery,
  Query,
  QueryObject,
  QueryObjectFieldValue,
  QueryOperator,
  SHORTHAND_QUERY_AGGREGATORS,
  stringBreakCharacter,
  SYMBOL_OPERATORS,
} from './query.model';

describe('Query model', () => {
  // MARK: Execute
  describe('execute', () => {
    describe('when isNot is true', () => {
      it('should return the opposite of executeWithoutIsNot', () => {
        const query: AnyAtomicQuery = {
          field: 'field',
          operator: '=',
          value: 'value',
          isNot: true,
          isOptional: true,
        };

        const data: QueryObject = {
          field: 'value',
        };

        const result = execute(query, data);

        expect(result).toEqual(!executeWithoutIsNot(query, data));
      });
    });

    describe('when isNot is false', () => {
      it('should return executeWithoutIsNot', () => {
        const query: AnyAtomicQuery = {
          field: 'field',
          operator: '=',
          value: 'value',
          isNot: false,
          isOptional: true,
        };

        const data: QueryObject = {
          field: 'value',
        };

        const result = execute(query, data);

        expect(result).toEqual(executeWithoutIsNot(query, data));
      });
    });
  });

  describe('executeWithoutIsNot', () => {
    describe('when aggregator is AND', () => {
      describe('when all conditions are true', () => {
        it('should return true', () => {
          const query: Query = {
            conditions: [
              {
                field: 'field.a',
                operator: '=',
                value: 0,
                isNot: false,
                isOptional: true,
              },
              {
                field: 'field.b',
                operator: '=',
                value: 'a',
                isNot: false,
                isOptional: true,
              },
            ],
            aggregator: 'AND',
            isNot: false,
            isOptional: true,
          };

          const data: QueryObject = {
            field: {
              a: 0,
              b: 'a',
            },
          };

          const result = executeWithoutIsNot(query, data);

          expect(result).toEqual(true);
        });
      });

      describe('when at least one condition is false', () => {
        it('should return false', () => {
          const query: Query = {
            conditions: [
              {
                field: 'field.a',
                operator: '=',
                value: 0,
                isNot: false,
                isOptional: true,
              },
              {
                field: 'field,b',
                operator: '=',
                value: 'a',
                isNot: false,
                isOptional: true,
              },
            ],
            aggregator: 'AND',
            isNot: false,
            isOptional: true,
          };

          const data: QueryObject = {
            field: {
              a: 0,
              b: 'b',
            },
          };

          const result = executeWithoutIsNot(query, data);

          expect(result).toEqual(false);
        });
      });
    });

    describe('when aggregator is OR', () => {
      describe('when no conditions are true', () => {
        it('should return false', () => {
          const query: Query = {
            conditions: [
              {
                field: 'field.a',
                operator: '=',
                value: 0,
                isNot: false,
                isOptional: true,
              },
              {
                field: 'field.b',
                operator: '=',
                value: 'a',
                isNot: false,
                isOptional: true,
              },
            ],
            aggregator: 'OR',
            isNot: false,
            isOptional: true,
          };

          const data: QueryObject = {
            field: {
              a: 1,
              b: 'b',
            },
          };

          const result = executeWithoutIsNot(query, data);

          expect(result).toEqual(false);
        });
      });

      describe('when at least one condition is true', () => {
        it('should return true', () => {
          const query: Query = {
            conditions: [
              {
                field: 'field.a',
                operator: '=',
                value: 0,
                isNot: false,
                isOptional: true,
              },
              {
                field: 'field.b',
                operator: '=',
                value: 'a',
                isNot: false,
                isOptional: true,
              },
            ],
            aggregator: 'OR',
            isNot: false,
            isOptional: true,
          };

          const data: QueryObject = {
            field: {
              a: 0,
              b: 'b',
            },
          };

          const result = executeWithoutIsNot(query, data);

          expect(result).toEqual(true);
        });
      });
    });

    describe('when there is an error', () => {
      describe('during the field extraction', () => {
        describe('and isOptional is false', () => {
          it('should propagate the error', () => {
            const query: AnyAtomicQuery = {
              field: 'field.error',
              operator: '=',
              value: 'value',
              isNot: false,
              isOptional: false,
            };

            const data: QueryObject = {
              field: 'value',
            };

            let error: ExtractFieldError | null = null;

            try {
              executeWithoutIsNot(query, data);
            } catch (e) {
              error = e as ExtractFieldError;
            }

            expect(error).not.toBeNull();
          });
        });

        describe('and isOptional is true', () => {
          it('should return false', () => {
            const query: AnyAtomicQuery = {
              field: 'field.error',
              operator: '=',
              value: 'value',
              isNot: false,
              isOptional: true,
            };

            const data: QueryObject = {
              field: 'value',
            };

            let error: ExtractFieldError | null = null;
            let result: boolean | null = null;

            try {
              result = executeWithoutIsNot(query, data);
            } catch (e) {
              error = e as ExtractFieldError;
            }

            expect(error).toBeNull();
            expect(result).toEqual(false);
          });
        });
      });

      describe('during the atomic execution', () => {
        describe('and isOptional is false', () => {
          it('should propagate the error', () => {
            const query: AnyAtomicQuery = {
              field: 'field',
              operator: 'unknown' as QueryOperator,
              value: 'value',
              isNot: false,
              isOptional: false,
            };

            const data: QueryObject = {
              field: 'value',
            };

            let error: ExtractFieldError | null = null;

            try {
              executeWithoutIsNot(query, data);
            } catch (e) {
              error = e as ExtractFieldError;
            }

            expect(error).not.toBeNull();
          });
        });

        describe('and isOptional is true', () => {
          it('should return false', () => {
            const query: AnyAtomicQuery = {
              field: 'field',
              operator: 'unknown' as QueryOperator,
              value: 'value',
              isNot: false,
              isOptional: true,
            };

            const data: QueryObject = {
              field: 'value',
            };

            let error: ExtractFieldError | null = null;
            let result: boolean | null = null;

            try {
              result = executeWithoutIsNot(query, data);
            } catch (e) {
              error = e as ExtractFieldError;
            }

            expect(error).toBeNull();
            expect(result).toEqual(false);
          });
        });
      });
    });
  });

  describe('executeAtomicWithoutIsNot', () => {
    describe('=', () => {
      describe('when the values are equal', () => {
        it('should return true', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '=',
            value: fieldValue,
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(true);
        });
      });

      describe('when the values are not equal', () => {
        it('should return false', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '=',
            value: 'other',
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(false);
        });
      });

      describe('when comparing to null', () => {
        describe('when the value is null', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = null;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '=',
              value: fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the value is not null', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'value';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '=',
              value: null,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });
      });

      describe('when comparing to undefined', () => {
        describe('when the value is undefined', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = undefined;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '=',
              value: fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the value is not undefined', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'value';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '=',
              value: undefined,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });
      });

      describe('when comparing booleans', () => {
        describe('when the values are equal', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = true;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '=',
              value: fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the values are not equal', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = true;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '=',
              value: !fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });
      });
    });

    describe('!=', () => {
      describe('when the values are not equal', () => {
        it('should return true', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '!=',
            value: 'other',
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(true);
        });
      });

      describe('when the values are equal', () => {
        it('should return false', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '!=',
            value: fieldValue,
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(false);
        });
      });

      describe('when comparing to null', () => {
        describe('when the value is null', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = null;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '!=',
              value: fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the value is not null', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'value';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '!=',
              value: null,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });
      });

      describe('when comparing to undefined', () => {
        describe('when the value is undefined', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = undefined;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '!=',
              value: fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the value is not undefined', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'value';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '!=',
              value: undefined,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });
      });

      describe('when comparing booleans', () => {
        describe('when the values are equal', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = true;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '!=',
              value: fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the values are not equal', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = true;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '!=',
              value: !fieldValue,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });
      });
    });

    describe('>', () => {
      describe('when comparing numbers', () => {
        describe('when the first value is greater', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 1;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the first value is lower', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>',
              value: 1,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the values are equal', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });
      });

      describe('when comparing strings', () => {
        describe('when the first value is greater', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'b';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the first value is lower', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>',
              value: 'b',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the values are equal', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });
      });

      describe('when the values are not comparable', () => {
        it('should throw an error', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '>',
            value: 0,
            isNot: false,
            isOptional: true,
          };

          let error: ExecuteAtomicError | null = null;

          try {
            executeAtomicWithoutIsNot(query, fieldValue);
          } catch (e) {
            error = e as ExecuteAtomicError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ExecuteAtomicError);
          expect(error?.message).toEqual('Cannot compare elements');
          expect(error?.payload.atomicQuery).toEqual(query);
          expect(error?.payload.fieldValue).toEqual(fieldValue);
        });
      });
    });

    describe('<', () => {
      describe('when comparing numbers', () => {
        describe('when the first value is lower', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<',
              value: 1,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the first value is greater', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 1;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the values are equal', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });
      });

      describe('when comparing strings', () => {
        describe('when the first value is lower', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<',
              value: 'b',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the first value is greater', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'b';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the values are equal', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });
      });

      describe('when the values are not comparable', () => {
        it('should throw an error', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '<',
            value: 0,
            isNot: false,
            isOptional: true,
          };

          let error: ExecuteAtomicError | null = null;

          try {
            executeAtomicWithoutIsNot(query, fieldValue);
          } catch (e) {
            error = e as ExecuteAtomicError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ExecuteAtomicError);
          expect(error?.message).toEqual('Cannot compare elements');
          expect(error?.payload.atomicQuery).toEqual(query);
          expect(error?.payload.fieldValue).toEqual(fieldValue);
        });
      });
    });

    describe('>=', () => {
      describe('when comparing numbers', () => {
        describe('when the first value is lower', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>=',
              value: 1,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the first value is greater', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 1;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>=',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the values are equal', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>=',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });
      });

      describe('when comparing strings', () => {
        describe('when the first value is lower', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>=',
              value: 'b',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the first value is greater', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'b';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>=',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the values are equal', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '>=',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });
      });

      describe('when the values are not comparable', () => {
        it('should throw an error', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '>=',
            value: 0,
            isNot: false,
            isOptional: true,
          };

          let error: ExecuteAtomicError | null = null;

          try {
            executeAtomicWithoutIsNot(query, fieldValue);
          } catch (e) {
            error = e as ExecuteAtomicError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ExecuteAtomicError);
          expect(error?.message).toEqual('Cannot compare elements');
          expect(error?.payload.atomicQuery).toEqual(query);
          expect(error?.payload.fieldValue).toEqual(fieldValue);
        });
      });
    });

    describe('<=', () => {
      describe('when comparing numbers', () => {
        describe('when the first value is lower', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<=',
              value: 1,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the first value is greater', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 1;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<=',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the values are equal', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 0;

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<=',
              value: 0,
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });
      });

      describe('when comparing strings', () => {
        describe('when the first value is lower', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<=',
              value: 'b',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });

        describe('when the first value is greater', () => {
          it('should return false', () => {
            const fieldValue: QueryObjectFieldValue = 'b';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<=',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(false);
          });
        });

        describe('when the values are equal', () => {
          it('should return true', () => {
            const fieldValue: QueryObjectFieldValue = 'a';

            const query: AnyAtomicQuery = {
              field: 'field',
              operator: '<=',
              value: 'a',
              isNot: false,
              isOptional: true,
            };

            const result = executeAtomicWithoutIsNot(query, fieldValue);

            expect(result).toEqual(true);
          });
        });
      });

      describe('when the values are not comparable', () => {
        it('should throw an error', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: '<=',
            value: 0,
            isNot: false,
            isOptional: true,
          };

          let error: ExecuteAtomicError | null = null;

          try {
            executeAtomicWithoutIsNot(query, fieldValue);
          } catch (e) {
            error = e as ExecuteAtomicError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ExecuteAtomicError);
          expect(error?.message).toEqual('Cannot compare elements');
          expect(error?.payload.atomicQuery).toEqual(query);
          expect(error?.payload.fieldValue).toEqual(fieldValue);
        });
      });
    });

    describe('IN', () => {
      describe('when the element is in the array', () => {
        it('should return true', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'IN',
            value: ['value', 'other'],
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(true);
        });
      });

      describe('when the element is not in the array', () => {
        it('should return false', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'IN',
            value: ['other'],
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(false);
        });
      });
    });

    describe('NOT IN', () => {
      describe('when the element is not in the array', () => {
        it('should return true', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'NOT IN',
            value: ['other'],
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(true);
        });
      });

      describe('when the element is in the array', () => {
        it('should return false', () => {
          const fieldValue: QueryObjectFieldValue = 'value';

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'NOT IN',
            value: ['value', 'other'],
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(false);
        });
      });
    });

    describe('INCLUDES', () => {
      describe('when the element is in the array', () => {
        it('should return true', () => {
          const fieldValue: QueryObjectFieldValue = ['value', 'other'];

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'INCLUDES',
            value: 'value',
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(true);
        });
      });

      describe('when the element is not in the array', () => {
        it('should return false', () => {
          const fieldValue: QueryObjectFieldValue = ['other'];

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'INCLUDES',
            value: 'value',
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(false);
        });
      });
    });

    describe('DOES NOT INCLUDE', () => {
      describe('when the element is not in the array', () => {
        it('should return true', () => {
          const fieldValue: QueryObjectFieldValue = ['other'];

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'DOES NOT INCLUDE',
            value: 'value',
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(true);
        });
      });

      describe('when the element is in the array', () => {
        it('should return false', () => {
          const fieldValue: QueryObjectFieldValue = ['value', 'other'];

          const query: AnyAtomicQuery = {
            field: 'field',
            operator: 'DOES NOT INCLUDE',
            value: 'value',
            isNot: false,
            isOptional: true,
          };

          const result = executeAtomicWithoutIsNot(query, fieldValue);

          expect(result).toEqual(false);
        });
      });
    });

    describe('when using an unknown operator', () => {
      it('should throw an error', () => {
        const fieldValue: QueryObjectFieldValue = undefined;

        const query: AnyAtomicQuery = {
          field: 'field',
          operator: 'unknown' as QueryOperator,
          value: 'value',
          isNot: false,
          isOptional: true,
        };

        let error: ExecuteAtomicError | null = null;

        try {
          executeAtomicWithoutIsNot(query, fieldValue);
        } catch (e) {
          error = e as ExecuteAtomicError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ExecuteAtomicError);
        expect(error?.message).toEqual('Unknown operator');
        expect(error?.payload.atomicQuery).toEqual(query);
        expect(error?.payload.fieldValue).toEqual(fieldValue);
      });
    });
  });

  // MARK: Extract field
  describe('extractField', () => {
    describe('when encountering a string value', () => {
      it('should throw an error', () => {
        const data = { field: 'value' };

        const field = 'field.error';

        let error: ExtractFieldError | null = null;

        try {
          extractField(data, field);
        } catch (e) {
          error = e as ExtractFieldError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ExtractFieldError);
        expect(error?.message).toEqual('Cannot read field on primitive');
        expect(error?.payload.data).toEqual(data);
        expect(error?.payload.field).toEqual(field);
        expect(error?.payload.currentField).toEqual('field');
        expect(error?.payload.subField).toEqual('error');
        expect(error?.payload.currentFieldValue).toEqual('value');
      });
    });

    describe('when encountering a boolean value', () => {
      it('should throw an error', () => {
        const data = { field: true };

        const field = 'field.error';

        let error: ExtractFieldError | null = null;

        try {
          extractField(data, field);
        } catch (e) {
          error = e as ExtractFieldError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ExtractFieldError);
        expect(error?.message).toEqual('Cannot read field on primitive');
        expect(error?.payload.data).toEqual(data);
        expect(error?.payload.field).toEqual(field);
        expect(error?.payload.currentField).toEqual('field');
        expect(error?.payload.subField).toEqual('error');
        expect(error?.payload.currentFieldValue).toEqual(true);
      });
    });

    describe('when encountering a number value', () => {
      it('should throw an error', () => {
        const data = { field: 123 };

        const field = 'field.error';

        let error: ExtractFieldError | null = null;

        try {
          extractField(data, field);
        } catch (e) {
          error = e as ExtractFieldError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ExtractFieldError);
        expect(error?.message).toEqual('Cannot read field on primitive');
        expect(error?.payload.data).toEqual(data);
        expect(error?.payload.field).toEqual(field);
        expect(error?.payload.currentField).toEqual('field');
        expect(error?.payload.subField).toEqual('error');
        expect(error?.payload.currentFieldValue).toEqual(123);
      });
    });

    describe('when encountering a null value', () => {
      it('should throw an error', () => {
        const data = { field: null };

        const field = 'field.error';

        let error: ExtractFieldError | null = null;

        try {
          extractField(data, field);
        } catch (e) {
          error = e as ExtractFieldError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ExtractFieldError);
        expect(error?.message).toEqual('Cannot read field on primitive');
        expect(error?.payload.data).toEqual(data);
        expect(error?.payload.field).toEqual(field);
        expect(error?.payload.currentField).toEqual('field');
        expect(error?.payload.subField).toEqual('error');
        expect(error?.payload.currentFieldValue).toEqual(null);
      });
    });

    describe('when encountering an undefined value', () => {
      it('should throw an error', () => {
        const data = { field: undefined };

        const field = 'field.error';

        let error: ExtractFieldError | null = null;

        try {
          extractField(data, field);
        } catch (e) {
          error = e as ExtractFieldError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ExtractFieldError);
        expect(error?.message).toEqual('Cannot read field on primitive');
        expect(error?.payload.data).toEqual(data);
        expect(error?.payload.field).toEqual(field);
        expect(error?.payload.currentField).toEqual('field');
        expect(error?.payload.subField).toEqual('error');
        expect(error?.payload.currentFieldValue).toEqual(undefined);
      });
    });

    describe('when encountering an array', () => {
      describe('and the current field is not a valid index', () => {
        it('should throw an error', () => {
          const data = { field: ['value'] };

          const field = 'field.error';

          let error: ExtractFieldError | null = null;

          try {
            extractField(data, field);
          } catch (e) {
            error = e as ExtractFieldError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ExtractFieldError);
          expect(error?.message).toEqual(
            'Cannot read non-numeric index on array',
          );
          expect(error?.payload.data).toEqual(data);
          expect(error?.payload.field).toEqual(field);
          expect(error?.payload.currentField).toEqual('field');
          expect(error?.payload.subField).toEqual('error');
          expect(error?.payload.currentFieldValue).toEqual(['value']);
        });
      });

      describe('and the current field is a valid index', () => {
        it('should return the value at the index', () => {
          const data = { field: ['value'] };

          const field = 'field.0';

          const result = extractField(data, field);

          expect(result).toEqual('value');
        });
      });
    });

    describe('when encountering an object', () => {
      it('should return the value at the field', () => {
        const data = { field: { value: 'value' } };

        const field = 'field.value';

        const result = extractField(data, field);

        expect(result).toEqual('value');
      });
    });

    it('should return the value at the field', () => {
      const data = { field: { subField: [{ fieldInArray: 'value' }] } };

      const field = 'field.subField.0.fieldInArray';

      const result = extractField(data, field);

      expect(result).toEqual('value');
    });
  });

  // MARK: Parse atomic query
  describe('parseAtomicQuery', () => {
    describe('when the query consists only of a field', () => {
      it('should return an atomic query where the field is compared to true', () => {
        const field = 'field';
        const followingString = ' & abc = 5';
        const queryString = field + followingString;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseAtomicQuery(processedQuery);

        expect(result).toEqual({
          field: field,
          operator: '=',
          value: true,
          isNot: false,
          isOptional: true,
        });
        expect(processedQuery.currentQuery).toEqual(followingString.trim());
      });
    });

    describe('when the query has a primitive value', () => {
      it('should return an atomic query with the primitive value', () => {
        const queryString = 'field = 5';
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseAtomicQuery(processedQuery);

        expect(result).toEqual({
          field: 'field',
          operator: '=',
          value: 5,
          isNot: false,
          isOptional: true,
        });
        expect(processedQuery.currentQuery).toEqual('');
      });
    });

    describe('when the query has an array value', () => {
      it('should return an atomic query with the array value', () => {
        const queryString = 'field NOT IN [5, 6, 7, 8]';
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseAtomicQuery(processedQuery);

        expect(result).toEqual({
          field: 'field',
          operator: 'NOT IN',
          value: [5, 6, 7, 8],
          isNot: false,
          isOptional: true,
        });
        expect(processedQuery.currentQuery).toEqual('');
      });
    });
  });

  // MARK: Parse field
  describe('parseField', () => {
    describe('when the string is empty', () => {
      it('should throw an error', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '',
          currentQuery: '',
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parseField(processedQuery);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ParseError);
        expect(error?.message).toEqual('Empty query encountered on field');
        expect(error?.payload).toEqual(processedQuery);
      });
    });

    describe('when the string starts immediately with an operator', () => {
      it('should throw an error', () => {
        const queryString = '=value';
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parseField(processedQuery);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ParseError);
        expect(error?.message).toEqual('Field not found');
        expect(error?.payload).toEqual(processedQuery);
        expect(processedQuery.currentQuery).toEqual(queryString);
      });
    });

    for (const operator of SYMBOL_OPERATORS) {
      describe(`when the field is followed by ${operator}`, () => {
        it('should return the field', () => {
          const queryString = 'field' + operator;
          const processedQuery: ProcessedQuery = {
            initialQuery: queryString,
            currentQuery: queryString,
            depth: 0,
          };

          const result = parseField(processedQuery);

          expect(result).toEqual('field');
          expect(processedQuery.currentQuery).toEqual(operator);
        });
      });
    }

    for (const shorthandQueryAggregator of SHORTHAND_QUERY_AGGREGATORS) {
      describe(`when the field is followed by ${shorthandQueryAggregator}`, () => {
        it('should return the field', () => {
          const queryString = 'field' + shorthandQueryAggregator;
          const processedQuery: ProcessedQuery = {
            initialQuery: queryString,
            currentQuery: queryString,
            depth: 0,
          };

          const result = parseField(processedQuery);

          expect(result).toEqual('field');
          expect(processedQuery.currentQuery).toEqual(shorthandQueryAggregator);
        });
      });
    }

    describe('when the field is followed by a space', () => {
      it('should return the field', () => {
        const followingString = ' abc';
        const queryString = 'field' + followingString;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseField(processedQuery);

        expect(result).toEqual('field');
        expect(processedQuery.currentQuery).toEqual(followingString);
      });
    });

    describe('when the string contains only the field', () => {
      it('should return the field', () => {
        const queryString = 'field';
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseField(processedQuery);

        expect(result).toEqual('field');
        expect(processedQuery.currentQuery).toEqual('');
      });
    });
  });

  // MARK: Parse operator
  describe('parseOperator', () => {
    for (const operator of OPERATORS) {
      describe(`when the string stars with ${operator}`, () => {
        it('should return the operator', () => {
          const processedQuery: ProcessedQuery = {
            initialQuery: operator,
            currentQuery: operator,
            depth: 0,
          };

          const result = parseOperator(processedQuery);

          expect(result).toEqual(operator);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });
    }

    const alteredCaseOperators: [string, QueryOperator][] = [
      ['iN', 'IN'],
      ['nOT iN', 'NOT IN'],
      ['iNCludes', 'INCLUDES'],
      ['doEs not iNClude', 'DOES NOT INCLUDE'],
    ];

    for (const [alteredOperator, operator] of alteredCaseOperators) {
      describe(`when the string stars with ${alteredOperator}`, () => {
        it('should return the operator', () => {
          const processedQuery: ProcessedQuery = {
            initialQuery: alteredOperator,
            currentQuery: alteredOperator,
            depth: 0,
          };

          const result = parseOperator(processedQuery);

          expect(result).toEqual(operator);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });
    }

    describe('when the string does not start with an operator', () => {
      it('should return null', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: 'value',
          currentQuery: 'value',
          depth: 0,
        };

        const result = parseOperator(processedQuery);

        expect(result).toBeNull();
        expect(processedQuery.currentQuery).toEqual('value');
      });
    });

    describe('when the string is empty', () => {
      it('should return null', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '',
          currentQuery: '',
          depth: 0,
        };

        const result = parseOperator(processedQuery);

        expect(result).toBeNull();
        expect(processedQuery.currentQuery).toEqual('');
      });
    });
  });

  // MARK: Parse value
  describe('parseValue', () => {
    describe('when the operator is IN', () => {
      describe('and the value is an array', () => {
        it('should return the array', () => {
          const value = '[1, 2, 3, TRUE, FALSE, null, undefined, "string"]';
          const processedQuery: ProcessedQuery = {
            initialQuery: value,
            currentQuery: value,
            depth: 0,
          };

          const result = parseValue(processedQuery, 'IN');

          expect(result).toEqual([
            1,
            2,
            3,
            true,
            false,
            null,
            undefined,
            'string',
          ]);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });

      describe('and the value is not an array', () => {
        it('should throw an error', () => {
          const value = '"value"';
          const processedQuery: ProcessedQuery = {
            initialQuery: value,
            currentQuery: value,
            depth: 0,
          };

          let error: ParseError | null = null;

          try {
            parseValue(processedQuery, 'IN');
          } catch (e) {
            error = e as ParseError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ParseError);
          expect(error?.message).toEqual('Opening bracket not found');
          expect(error?.payload).toEqual(processedQuery);
        });
      });
    });

    describe('when the operator is NOT IN', () => {
      describe('and the value is an array', () => {
        it('should return the array', () => {
          const value = '[1, 2, 3, TRUE, FALSE, null, undefined, "string"]';
          const processedQuery: ProcessedQuery = {
            initialQuery: value,
            currentQuery: value,
            depth: 0,
          };

          const result = parseValue(processedQuery, 'NOT IN');

          expect(result).toEqual([
            1,
            2,
            3,
            true,
            false,
            null,
            undefined,
            'string',
          ]);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });

      describe('and the value is not an array', () => {
        it('should throw an error', () => {
          const value = '"value"';
          const processedQuery: ProcessedQuery = {
            initialQuery: value,
            currentQuery: value,
            depth: 0,
          };

          let error: ParseError | null = null;

          try {
            parseValue(processedQuery, 'NOT IN');
          } catch (e) {
            error = e as ParseError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ParseError);
          expect(error?.message).toEqual('Opening bracket not found');
          expect(error?.payload).toEqual(processedQuery);
        });
      });
    });

    describe('when the operator is =', () => {
      describe('and the value is an array', () => {
        it('should throw an error', () => {
          const value = '[1, 2, 3, TRUE, FALSE, null, undefined, "string"]';
          const processedQuery: ProcessedQuery = {
            initialQuery: value,
            currentQuery: value,
            depth: 0,
          };

          let error: ParseError | null = null;

          try {
            parseValue(processedQuery, '=');
          } catch (e) {
            error = e as ParseError;
          }

          expect(error).not.toBeNull();
          expect(error).toBeInstanceOf(ParseError);
          expect(error?.message).toEqual('Number not found');
          expect(error?.payload).toEqual(processedQuery);
        });
      });

      describe('and the value is not an array', () => {
        it('should return the value', () => {
          const value = '"value"';
          const processedQuery: ProcessedQuery = {
            initialQuery: value,
            currentQuery: value,
            depth: 0,
          };

          const result = parseValue(processedQuery, '=');

          expect(result).toEqual('value');
          expect(processedQuery.currentQuery).toEqual('');
        });
      });
    });
  });

  // MARK: Parse primitive array
  describe('parsePrimitiveArray', () => {
    describe('when the delimiter is a comma', () => {
      it('should return an array', () => {
        const value = '[1, 2, 3, TRUE, FALSE, null, undefined, "string"]';
        const processedQuery: ProcessedQuery = {
          initialQuery: value,
          currentQuery: value,
          depth: 0,
        };

        const result = parsePrimitiveArray(processedQuery);

        expect(result).toEqual([
          1,
          2,
          3,
          true,
          false,
          null,
          undefined,
          'string',
        ]);
        expect(processedQuery.currentQuery).toEqual('');
      });
    });

    describe('when the delimiter is a semicolon', () => {
      it('should return an array', () => {
        const value = '[1; 2; 3; TRUE; FALSE; null; undefined; "string"]';
        const processedQuery: ProcessedQuery = {
          initialQuery: value,
          currentQuery: value,
          depth: 0,
        };

        const result = parsePrimitiveArray(processedQuery);

        expect(result).toEqual([
          1,
          2,
          3,
          true,
          false,
          null,
          undefined,
          'string',
        ]);
        expect(processedQuery.currentQuery).toEqual('');
      });
    });

    describe('when the string is empty', () => {
      it('should throw an error', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '',
          currentQuery: '',
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parsePrimitiveArray(processedQuery);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ParseError);
        expect(error?.message).toEqual(
          'Empty query encountered on primitive array',
        );
        expect(error?.payload).toEqual(processedQuery);
      });
    });

    describe('when the opening bracket is missing', () => {
      it('should throw an error', () => {
        const value = '1, 2, 3, TRUE, FALSE, null, undefined, "string"]';
        const processedQuery: ProcessedQuery = {
          initialQuery: value,
          currentQuery: value,
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parsePrimitiveArray(processedQuery);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ParseError);
        expect(error?.message).toEqual('Opening bracket not found');
        expect(error?.payload).toEqual(processedQuery);
      });
    });

    describe('when the closing bracket is missing', () => {
      it('should throw an error', () => {
        const value = '[1, 2, 3, TRUE, FALSE, null, undefined, "string"';
        const processedQuery: ProcessedQuery = {
          initialQuery: value,
          currentQuery: value,
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parsePrimitiveArray(processedQuery);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ParseError);
        expect(error?.message).toEqual('Closing bracket not found');
        expect(error?.payload).toEqual(processedQuery);
      });
    });
  });

  // MARK: Parse primitive value
  describe('parsePrimitiveValue', () => {
    describe('when the string is empty', () => {
      it('should throw an error', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '',
          currentQuery: '',
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parsePrimitiveValue(processedQuery, false);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error).toBeInstanceOf(ParseError);
        expect(error?.message).toEqual(
          'Empty query encountered on primitive value',
        );
        expect(error?.payload).toEqual(processedQuery);
      });
    });

    describe('when the value is a number', () => {
      it('should return a number', () => {
        const value = 123;
        const processedQuery: ProcessedQuery = {
          initialQuery: value.toString(),
          currentQuery: value.toString(),
          depth: 0,
        };

        const result = parsePrimitiveValue(processedQuery, false);

        expect(result).toEqual(value);
        expect(processedQuery.currentQuery).toEqual('');
      });
    });

    const trueValues = ['true', 'TRUE', 'TrUe'];
    for (const trueValue of trueValues) {
      describe(`when the value is ${trueValue}`, () => {
        it(`should return true`, () => {
          const processedQuery: ProcessedQuery = {
            initialQuery: trueValue,
            currentQuery: trueValue,
            depth: 0,
          };

          const result = parsePrimitiveValue(processedQuery, false);

          expect(result).toEqual(true);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });
    }

    const falseValues = ['false', 'FALSE', 'FaLsE'];
    for (const falseValue of falseValues) {
      describe(`when the value is ${falseValue}`, () => {
        it(`should return false`, () => {
          const processedQuery: ProcessedQuery = {
            initialQuery: falseValue,
            currentQuery: falseValue,
            depth: 0,
          };

          const result = parsePrimitiveValue(processedQuery, false);

          expect(result).toEqual(false);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });
    }

    const nullValues = ['null', 'NULL', 'NuLl'];
    for (const nullValue of nullValues) {
      describe(`when the value is ${nullValue}`, () => {
        it(`should return null`, () => {
          const processedQuery: ProcessedQuery = {
            initialQuery: nullValue,
            currentQuery: nullValue,
            depth: 0,
          };

          const result = parsePrimitiveValue(processedQuery, false);

          expect(result).toEqual(null);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });
    }

    const undefinedValues = ['undefined', 'UNDEFINED', 'UnDeFiNeD'];
    for (const undefinedValue of undefinedValues) {
      describe(`when the value is ${undefinedValue}`, () => {
        it(`should return undefined`, () => {
          const processedQuery: ProcessedQuery = {
            initialQuery: undefinedValue,
            currentQuery: undefinedValue,
            depth: 0,
          };

          const result = parsePrimitiveValue(processedQuery, false);

          expect(result).toEqual(undefined);
          expect(processedQuery.currentQuery).toEqual('');
        });
      });
    }

    describe('when the value is a string', () => {
      it('should return a string', () => {
        const value = 'value';
        const stringDelimiter = '"';
        const queryString = `${stringDelimiter}${value}${stringDelimiter}`;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parsePrimitiveValue(processedQuery, false);

        expect(result).toEqual(value);
        expect(processedQuery.currentQuery).toEqual('');
      });
    });
  });

  // MARK: Parse string
  describe('parseString', () => {
    describe("when using ' as quote", () => {
      it('should return a string', () => {
        const value = 'value';
        const stringDelimiter = "'";
        const followingString = ') abc';
        const queryString = `${value}${stringDelimiter}${followingString}`;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseString(processedQuery, stringDelimiter);

        expect(result).toEqual(value);
        expect(processedQuery.currentQuery).toEqual(followingString);
      });
    });

    describe('when using " as quote', () => {
      it('should return a string', () => {
        const value = 'value';
        const followingString = ') abc';
        const stringDelimiter = '"';
        const queryString = `${value}${stringDelimiter}${followingString}`;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseString(processedQuery, stringDelimiter);

        expect(result).toEqual(value);
        expect(processedQuery.currentQuery).toEqual(followingString);
      });
    });

    describe('when using quote inside the string with a break character', () => {
      it('should return the string with the quote but without the break character', () => {
        const stringDelimiter = '"';
        const value = `value with ${stringBreakCharacter}${stringDelimiter} inside`;
        const followingString = ') abc';
        const queryString = `${value}${stringDelimiter}${followingString}`;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseString(processedQuery, stringDelimiter);

        expect(result).toEqual(value.replace(stringBreakCharacter, ''));
        expect(processedQuery.currentQuery).toEqual(followingString);
      });
    });

    describe('when using the break character doubled inside the string', () => {
      it('should return the string with only one break character', () => {
        const stringDelimiter = '"';
        const value = `value with ${stringBreakCharacter}${stringBreakCharacter} inside`;
        const followingString = ') abc';
        const queryString = `${value}${stringDelimiter}${followingString}`;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        const result = parseString(processedQuery, stringDelimiter);

        expect(result).toEqual(
          value.replace(stringBreakCharacter.repeat(2), stringBreakCharacter),
        );
        expect(processedQuery.currentQuery).toEqual(followingString);
      });
    });

    describe('when using the break character without a breakable string following', () => {
      it('should throw an error', () => {
        const stringDelimiter = '"';
        const value = `value with ${stringBreakCharacter} inside`;
        const followingString = ') abc';
        const queryString = `${value}${stringDelimiter}${followingString}`;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parseString(processedQuery, stringDelimiter);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error?.message).toEqual(
          'Breakable character not found after string break character',
        );
        expect(error?.payload).toEqual(processedQuery);
        expect(processedQuery.currentQuery).toEqual(queryString);
      });
    });

    describe('when the closing quote is missing', () => {
      it('should throw an error', () => {
        const stringDelimiter = '"';
        const value = `value`;
        const followingString = ') abc';
        const queryString = `${value}${followingString}`;
        const processedQuery: ProcessedQuery = {
          initialQuery: queryString,
          currentQuery: queryString,
          depth: 0,
        };

        let error: ParseError | null = null;

        try {
          parseString(processedQuery, stringDelimiter);
        } catch (e) {
          error = e as ParseError;
        }

        expect(error).not.toBeNull();
        expect(error?.message).toEqual('Closing string delimiter not found');
        expect(error?.payload).toEqual(processedQuery);
        expect(processedQuery.currentQuery).toEqual(queryString);
      });
    });
  });

  // MARK: Parse number
  describe('parseNumber', () => {
    const testNumbers: [string, number][] = [
      ['0', 0],
      ['5', 5],
      ['+5', 5],
      ['-5', -5],
      ['0.5', 0.5],
      ['+0.5', 0.5],
      ['-0.5', -0.5],
      ['1e10', 1e10],
      ['+1e10', 1e10],
      ['-1e10', -1e10],
      ['1e-10', 1e-10],
      ['+1e-10', 1e-10],
      ['-1e-10', -1e-10],
      ['1.2345e10', 1.2345e10],
      ['1.2345e+10', 1.2345e10],
      ['1.2345e-10', 1.2345e-10],
    ];

    for (const [number, expectedNumber] of testNumbers) {
      describe('testing number ' + number, () => {
        it('should match the regex', () => {
          expect(number.match(JAVA_SCRIPT_NUMBER_REGEX)).not.toBeNull();
        });

        describe('when the number is alone', () => {
          it('should return the number', () => {
            const queryString = number;

            expect(
              parseNumber(
                {
                  initialQuery: queryString,
                  currentQuery: queryString,
                  depth: 0,
                },
                false,
              ),
            ).toEqual(expectedNumber);
          });
        });

        describe('when the number is followed by a space', () => {
          it('should return the number', () => {
            const followingString = ' abc';
            const queryString = number + followingString;
            const processedQuery: ProcessedQuery = {
              initialQuery: queryString,
              currentQuery: queryString,
              depth: 0,
            };

            expect(parseNumber(processedQuery, false)).toEqual(expectedNumber);
            expect(processedQuery.currentQuery).toEqual(followingString);
          });
        });

        describe('when the number is followed by a &', () => {
          it('should return the number', () => {
            const followingString = '& abc';
            const queryString = number + followingString;
            const processedQuery: ProcessedQuery = {
              initialQuery: queryString,
              currentQuery: queryString,
              depth: 0,
            };

            expect(parseNumber(processedQuery, false)).toEqual(expectedNumber);
            expect(processedQuery.currentQuery).toEqual(followingString);
          });
        });

        describe('when the number is followed by a |', () => {
          it('should return the number', () => {
            const followingString = '| abc';
            const queryString = number + followingString;
            const processedQuery: ProcessedQuery = {
              initialQuery: queryString,
              currentQuery: queryString,
              depth: 0,
            };

            expect(parseNumber(processedQuery, false)).toEqual(expectedNumber);
            expect(processedQuery.currentQuery).toEqual(followingString);
          });
        });

        describe('when the number is followed by a )', () => {
          describe('and the depth is 0', () => {
            it('should throw an error', () => {
              let error: ParseError | null = null;

              const followingString = ') abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 0,
              };

              try {
                parseNumber(processedQuery, false);
              } catch (e) {
                error = e as ParseError;
              }

              expect(error).toBeInstanceOf(ParseError);
              expect(error?.payload).toEqual(processedQuery);
              expect(error?.message).toEqual('Number not found');
              expect(processedQuery.currentQuery).toEqual(queryString);
            });
          });

          describe('and the depth is 1', () => {
            it('should return the number', () => {
              const followingString = ') abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 1,
              };

              expect(parseNumber(processedQuery, false)).toEqual(
                expectedNumber,
              );
              expect(processedQuery.currentQuery).toEqual(followingString);
            });
          });
        });

        describe('when the number is followed by a ]', () => {
          describe('and is not in an array', () => {
            it('should throw an error', () => {
              let error: ParseError | null = null;

              const followingString = '] abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 0,
              };

              try {
                parseNumber(processedQuery, false);
              } catch (e) {
                error = e as ParseError;
              }

              expect(error).toBeInstanceOf(ParseError);
              expect(error?.payload).toEqual(processedQuery);
              expect(error?.message).toEqual('Number not found');
              expect(processedQuery.currentQuery).toEqual(queryString);
            });
          });

          describe('and is in an array', () => {
            it('should return the number', () => {
              const followingString = '] abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 0,
              };

              expect(parseNumber(processedQuery, true)).toEqual(expectedNumber);
              expect(processedQuery.currentQuery).toEqual(followingString);
            });
          });
        });

        describe('when the number is followed by a ,', () => {
          describe('and is not in an array', () => {
            it('should throw an error', () => {
              let error: ParseError | null = null;

              const followingString = ', abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 0,
              };

              try {
                parseNumber(processedQuery, false);
              } catch (e) {
                error = e as ParseError;
              }

              expect(error).toBeInstanceOf(ParseError);
              expect(error?.payload).toEqual(processedQuery);
              expect(error?.message).toEqual('Number not found');
              expect(processedQuery.currentQuery).toEqual(queryString);
            });
          });

          describe('and is in an array', () => {
            it('should return the number', () => {
              const followingString = ', abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 0,
              };

              expect(parseNumber(processedQuery, true)).toEqual(expectedNumber);
              expect(processedQuery.currentQuery).toEqual(followingString);
            });
          });
        });

        describe('when the number is followed by ;', () => {
          describe('and is not in an array', () => {
            it('should throw an error', () => {
              let error: ParseError | null = null;

              const followingString = '; abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 0,
              };

              try {
                parseNumber(processedQuery, false);
              } catch (e) {
                error = e as ParseError;
              }

              expect(error).toBeInstanceOf(ParseError);
              expect(error?.payload).toEqual(processedQuery);
              expect(error?.message).toEqual('Number not found');
              expect(processedQuery.currentQuery).toEqual(queryString);
            });
          });

          describe('and is in an array', () => {
            it('should return the number', () => {
              const followingString = '; abc';
              const queryString = number + followingString;
              const processedQuery: ProcessedQuery = {
                initialQuery: queryString,
                currentQuery: queryString,
                depth: 0,
              };

              expect(parseNumber(processedQuery, true)).toEqual(expectedNumber);
              expect(processedQuery.currentQuery).toEqual(followingString);
            });
          });
        });
      });
    }
  });
});
