import {
  ExecuteAtomicError,
  ExtractFieldError,
  execute,
  executeAtomicWithoutIsNot,
  executeWithoutIsNot,
  extractField,
} from './execute-query.model';
import {
  AnyAtomicQuery,
  Query,
  QueryObject,
  QueryObjectFieldValue,
  QueryOperator,
} from './query.model';

describe('Execute query model', () => {
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
});
