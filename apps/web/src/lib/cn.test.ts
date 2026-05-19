import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins multiple class strings with a space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('respects truthy expressions from clsx', () => {
    const active = true;
    const disabled = false;
    expect(cn('btn', active && 'btn-active', disabled && 'btn-disabled')).toBe(
      'btn btn-active',
    );
  });

  it('flattens nested arrays', () => {
    expect(cn(['a', ['b', 'c']], 'd')).toBe('a b c d');
  });

  it('honours object-style conditional classes', () => {
    expect(cn({ a: true, b: false, c: 1 })).toBe('a c');
  });

  it('returns an empty string when given no inputs', () => {
    expect(cn()).toBe('');
  });
});
