import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../../src/db/repositories/escape-like-pattern.js';

describe('escapeLikePattern', () => {
  it('escapes a literal percent sign', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
  });

  it('escapes a literal underscore', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('escapes a literal backslash', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('escapes multiple special characters in one input', () => {
    expect(escapeLikePattern('50%_off\\now')).toBe('50\\%\\_off\\\\now');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLikePattern('hotfix release')).toBe('hotfix release');
  });
});
