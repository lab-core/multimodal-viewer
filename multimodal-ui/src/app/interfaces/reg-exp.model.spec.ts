import {
  concatenate,
  endsWith,
  exclude,
  ignoreCase,
  oneOrMore,
  some,
  startsWith,
  zeroOrMore,
} from './reg-exp.model';

describe('Reg exp model', () => {
  describe('some', () => {
    it('it should match any of the patterns', () => {
      const regex = some(/a/, /b/, /c/);

      expect(regex.test('a')).toBeTruthy();
      expect(regex.test('b')).toBeTruthy();
      expect(regex.test('c')).toBeTruthy();

      expect(regex.test('d')).toBeFalsy();
    });
  });

  describe('startsWith', () => {
    it('it should match the pattern', () => {
      const regex = startsWith(/a/);

      expect(regex.test('a')).toBeTruthy();
      expect(regex.test('b')).toBeFalsy();

      expect(regex.test('ab')).toBeTruthy();
      expect(regex.test('ba')).toBeFalsy();
    });
  });

  describe('endsWith', () => {
    it('it should match the pattern', () => {
      const regex = endsWith(/a/);

      expect(regex.test('a')).toBeTruthy();
      expect(regex.test('b')).toBeFalsy();

      expect(regex.test('ab')).toBeFalsy();
      expect(regex.test('ba')).toBeTruthy();
    });
  });

  describe('ignoreCase', () => {
    it('it should match the pattern', () => {
      const regex = ignoreCase(/a/);

      expect(regex.test('a')).toBeTruthy();
      expect(regex.test('A')).toBeTruthy();
    });
  });

  describe('concatenate', () => {
    it('it should match the pattern', () => {
      const regex = concatenate(/a/, /b/);

      expect(regex.test('ab')).toBeTruthy();
      expect(regex.test('aa')).toBeFalsy();
      expect(regex.test('a')).toBeFalsy();
    });
  });

  describe('exclude', () => {
    it('it should match the pattern', () => {
      const regex = exclude(/a/, /b/);

      expect(regex.test('a')).toBeFalsy();
      expect(regex.test('b')).toBeFalsy();
      expect(regex.test('c')).toBeTruthy();
    });
  });

  describe('zeroOrMore', () => {
    it('it should match the pattern', () => {
      const regex = zeroOrMore(/a/);

      expect(regex.test('')).toBeTruthy();
      expect(regex.test('a')).toBeTruthy();
      expect(regex.test('aa')).toBeTruthy();
      expect(regex.test('aaa')).toBeTruthy();
    });
  });

  describe('oneOrMore', () => {
    it('it should match the pattern', () => {
      const regex = oneOrMore(/a/);

      expect(regex.test('')).toBeFalsy();
      expect(regex.test('a')).toBeTruthy();
      expect(regex.test('aa')).toBeTruthy();
      expect(regex.test('aaa')).toBeTruthy();
    });
  });
});
