import {
  JAVA_SCRIPT_NUMBER_REGEX,
  ParseError,
  ProcessedQuery,
  SHORTHAND_QUERY_AGGREGATORS,
  SYMBOL_OPERATORS,
  parseAtomicQuery,
  parseField,
  parseNegation,
  parseNumber,
  parseOperator,
  parseParenthesis,
  parsePrimitiveArray,
  parsePrimitiveValue,
  parseQuery,
  parseString,
  parseValue,
  stringBreakCharacter,
} from './parse-query.model';
import { AnyAtomicQuery, OPERATORS, QueryOperator } from './query.model';

describe('Query model', () => {
  // MARK: Parse query
  describe('parseQuery', () => {
    describe('when the string represents and atomic query', () => {
      it('should return the query', () => {
        const query = 'field=123';

        const result = parseQuery(query);

        expect(result).toEqual({
          field: 'field',
          operator: '=',
          value: 123,
          isNot: false,
          isOptional: true,
        });
      });
    });

    describe('when the string contains parenthesis', () => {
      it('should return the query', () => {
        const query = '(field=123)';

        const result = parseQuery(query);

        expect(result).toEqual({
          field: 'field',
          operator: '=',
          value: 123,
          isNot: false,
          isOptional: true,
        });
      });
    });

    describe('when the string contains a negation', () => {
      it('should return the query', () => {
        const query = '!field=123';

        const result = parseQuery(query);

        expect(result).toEqual({
          field: 'field',
          operator: '=',
          value: 123,
          isNot: true,
          isOptional: true,
        });
      });
    });

    describe('simple conjonctions', () => {
      const andAggregators = ['AND', 'and', 'AnD', 'aNd'];
      for (const aggregator of andAggregators) {
        describe(`when the string contains ${aggregator}`, () => {
          describe('and is followed by a space', () => {
            it('should return the query', () => {
              const query = 'field1=123 AND field2=456';

              const result = parseQuery(query);

              expect(result).toEqual({
                aggregator: 'AND',
                conditions: [
                  {
                    field: 'field1',
                    operator: '=',
                    value: 123,
                    isNot: false,
                    isOptional: true,
                  },
                  {
                    field: 'field2',
                    operator: '=',
                    value: 456,
                    isNot: false,
                    isOptional: true,
                  },
                ],
                isNot: false,
              });
            });
          });

          describe('and is followed by a parenthesis', () => {
            it('should return the query', () => {
              const query = 'field1=123 AND(field2=456)';

              const result = parseQuery(query);

              expect(result).toEqual({
                aggregator: 'AND',
                conditions: [
                  {
                    field: 'field1',
                    operator: '=',
                    value: 123,
                    isNot: false,
                    isOptional: true,
                  },
                  {
                    field: 'field2',
                    operator: '=',
                    value: 456,
                    isNot: false,
                    isOptional: true,
                  },
                ],
                isNot: false,
              });
            });
          });

          describe('and is followed by other characters', () => {
            it('should throw an error', () => {
              const query = 'field1=123 ANDerror field2=456';

              let error: ParseError | null = null;

              try {
                parseQuery(query);
              } catch (e) {
                error = e as ParseError;
              }

              expect(error).not.toBeNull();
              expect(error).toBeInstanceOf(ParseError);
              expect(error?.message).toEqual('Aggregator not found');
              expect(error?.payload).toEqual({
                initialQuery: query,
                currentQuery: 'ANDerror field2=456',
                depth: 0,
              });
            });
          });
        });
      }
    });

    describe('simple disjunctions', () => {
      const orAggregators = ['OR', 'or', 'Or', 'oR'];
      for (const aggregator of orAggregators) {
        describe(`when the string contains ${aggregator}`, () => {
          describe('and is followed by a space', () => {
            it('should return the query', () => {
              const query = 'field1=123 OR field2=456';

              const result = parseQuery(query);

              expect(result).toEqual({
                aggregator: 'OR',
                conditions: [
                  {
                    field: 'field1',
                    operator: '=',
                    value: 123,
                    isNot: false,
                    isOptional: true,
                  },
                  {
                    field: 'field2',
                    operator: '=',
                    value: 456,
                    isNot: false,
                    isOptional: true,
                  },
                ],
                isNot: false,
              });
            });
          });

          describe('and is followed by a parenthesis', () => {
            it('should return the query', () => {
              const query = 'field1=123 OR(field2=456)';

              const result = parseQuery(query);

              expect(result).toEqual({
                aggregator: 'OR',
                conditions: [
                  {
                    field: 'field1',
                    operator: '=',
                    value: 123,
                    isNot: false,
                    isOptional: true,
                  },
                  {
                    field: 'field2',
                    operator: '=',
                    value: 456,
                    isNot: false,
                    isOptional: true,
                  },
                ],
                isNot: false,
              });
            });
          });

          describe('and is followed by other characters', () => {
            it('should throw an error', () => {
              const query = 'field1=123 ORerror field2=456';

              let error: ParseError | null = null;

              try {
                parseQuery(query);
              } catch (e) {
                error = e as ParseError;
              }

              expect(error).not.toBeNull();
              expect(error).toBeInstanceOf(ParseError);
              expect(error?.message).toEqual('Aggregator not found');
              expect(error?.payload).toEqual({
                initialQuery: query,
                currentQuery: 'ORerror field2=456',
                depth: 0,
              });
            });
          });
        });
      }
    });

    describe('multiple aggregators at the same depth', () => {
      it('should return the query', () => {
        const query =
          'field1=123 AND field2=456 OR field3=789 OR field4=012 AND field5=345 AND field6=678';

        const result = parseQuery(query);

        const field1Query: AnyAtomicQuery = {
          field: 'field1',
          operator: '=',
          value: 123,
          isNot: false,
          isOptional: true,
        };

        const field2Query: AnyAtomicQuery = {
          field: 'field2',
          operator: '=',
          value: 456,
          isNot: false,
          isOptional: true,
        };

        const field3Query: AnyAtomicQuery = {
          field: 'field3',
          operator: '=',
          value: 789,
          isNot: false,
          isOptional: true,
        };

        const field4Query: AnyAtomicQuery = {
          field: 'field4',
          operator: '=',
          value: 12,
          isNot: false,
          isOptional: true,
        };

        const field5Query: AnyAtomicQuery = {
          field: 'field5',
          operator: '=',
          value: 345,
          isNot: false,
          isOptional: true,
        };

        const field6Query: AnyAtomicQuery = {
          field: 'field6',
          operator: '=',
          value: 678,
          isNot: false,
          isOptional: true,
        };

        expect(result).toEqual({
          aggregator: 'OR',
          conditions: [
            {
              aggregator: 'AND',
              conditions: [field1Query, field2Query],
              isNot: false,
            },
            field3Query,
            {
              aggregator: 'AND',
              conditions: [field4Query, field5Query, field6Query],
              isNot: false,
            },
          ],
          isNot: false,
        });
      });
    });

    describe('everything mixed together', () => {
      it('should return the query', () => {
        const query =
          '!(NOT(!~NOT(field1=123 AND field2=456))) AND field3=789 OR (NOT field4=012 AND NOT (field5=345 AND !field6=678))';

        const result = parseQuery(query);

        const field1Query: AnyAtomicQuery = {
          field: 'field1',
          operator: '=',
          value: 123,
          isNot: false,
          isOptional: true,
        };

        const field2Query: AnyAtomicQuery = {
          field: 'field2',
          operator: '=',
          value: 456,
          isNot: false,
          isOptional: true,
        };

        const field3Query: AnyAtomicQuery = {
          field: 'field3',
          operator: '=',
          value: 789,
          isNot: false,
          isOptional: true,
        };

        const field4Query: AnyAtomicQuery = {
          field: 'field4',
          operator: '=',
          value: 12,
          isNot: true,
          isOptional: true,
        };

        const field5Query: AnyAtomicQuery = {
          field: 'field5',
          operator: '=',
          value: 345,
          isNot: false,
          isOptional: true,
        };

        const field6Query: AnyAtomicQuery = {
          field: 'field6',
          operator: '=',
          value: 678,
          isNot: true,
          isOptional: true,
        };

        expect(result).toEqual({
          aggregator: 'OR',
          conditions: [
            {
              aggregator: 'AND',
              conditions: [
                {
                  aggregator: 'AND',
                  conditions: [field1Query, field2Query],
                  isNot: true,
                },
                field3Query,
              ],
              isNot: false,
            },
            {
              aggregator: 'AND',
              conditions: [
                field4Query,
                {
                  aggregator: 'AND',
                  conditions: [field5Query, field6Query],
                  isNot: true,
                },
              ],
              isNot: false,
            },
          ],
          isNot: false,
        });
      });
    });
  });

  // MARK: Parse negation
  describe('parseNegation', () => {
    describe('when the string is empty', () => {
      it('should return false', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '',
          currentQuery: '',
          depth: 0,
        };

        const result = parseNegation(processedQuery);

        expect(result).toEqual(false);
      });
    });

    describe('when the string starts with !', () => {
      it('should return true', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '!value',
          currentQuery: '!value',
          depth: 0,
        };

        const result = parseNegation(processedQuery);

        expect(result).toEqual(true);
        expect(processedQuery.currentQuery).toEqual('value');
      });
    });

    describe('when the string starts with ~', () => {
      it('should return true', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '~value',
          currentQuery: '~value',
          depth: 0,
        };

        const result = parseNegation(processedQuery);

        expect(result).toEqual(true);
        expect(processedQuery.currentQuery).toEqual('value');
      });
    });

    const differentNotOperators = ['not', 'NOT', 'NoT', 'Not'];
    for (const operator of differentNotOperators) {
      describe(`when the string starts with ${operator}`, () => {
        const allowedFollowingCharacters = [' ', '(', '!', '~'];

        for (const followingCharacter of allowedFollowingCharacters) {
          describe(`and the following character is ${followingCharacter}`, () => {
            it('should return true', () => {
              const followingString = `${followingCharacter}value`;
              const processedQuery: ProcessedQuery = {
                initialQuery: `${operator}${followingString}`,
                currentQuery: `${operator}${followingString}`,
                depth: 0,
              };

              const result = parseNegation(processedQuery);

              expect(result).toEqual(true);
              expect(processedQuery.currentQuery).toEqual(followingString);
            });
          });
        }
      });
    }

    describe('when the string does starts with not but followed with other characters', () => {
      it('should return false', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: 'notvalue',
          currentQuery: 'notvalue',
          depth: 0,
        };

        const result = parseNegation(processedQuery);

        expect(result).toEqual(false);
        expect(processedQuery.currentQuery).toEqual('notvalue');
      });
    });

    describe('when the string does not start with a negation operator', () => {
      it('should return false', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: 'value',
          currentQuery: 'value',
          depth: 0,
        };

        const result = parseNegation(processedQuery);

        expect(result).toEqual(false);
        expect(processedQuery.currentQuery).toEqual('value');
      });
    });
  });

  // MARK: Parse parenthesis
  describe('parseParenthesis', () => {
    describe('when the string is empty', () => {
      it('should return false', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '',
          currentQuery: '',
          depth: 0,
        };

        const result = parseParenthesis(processedQuery);

        expect(result).toEqual(false);
      });
    });

    describe('when the string does not start with (', () => {
      it('should return false', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: 'value',
          currentQuery: 'value',
          depth: 0,
        };

        const result = parseParenthesis(processedQuery);

        expect(result).toEqual(false);
        expect(processedQuery.currentQuery).toEqual('value');
      });
    });

    describe('when the string starts with (', () => {
      it('should return true', () => {
        const processedQuery: ProcessedQuery = {
          initialQuery: '(value)',
          currentQuery: '(value)',
          depth: 0,
        };

        const result = parseParenthesis(processedQuery);

        expect(result).toEqual(true);
        expect(processedQuery.currentQuery).toEqual('value)');
        expect(processedQuery.depth).toEqual(1);
      });
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
