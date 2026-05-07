import { describe, expect, it } from 'vitest';
import { buildSwiftFormatCommand } from './swiftFormat';

describe('buildSwiftFormatCommand', () => {
  it('defaults to `swift-format lint --recursive`', () => {
    expect(buildSwiftFormatCommand({})).toBe('swift-format lint --recursive');
  });

  it('switches to `swift-format format -i --recursive` for format mode', () => {
    expect(
      buildSwiftFormatCommand({ mode: 'format' }),
    ).toBe('swift-format format -i --recursive');
  });

  it('emits --configuration <file> when configFile is set', () => {
    expect(
      buildSwiftFormatCommand({ configFile: '.swift-format' }),
    ).toBe(`swift-format lint --configuration '.swift-format' --recursive`);
  });

  it('appends paths at the end, shell-quoted', () => {
    expect(
      buildSwiftFormatCommand({ paths: 'Sources\nTests' }),
    ).toBe(`swift-format lint --recursive 'Sources' 'Tests'`);
  });

  it('drops empty / whitespace-only path lines', () => {
    expect(
      buildSwiftFormatCommand({ paths: 'Sources\n\n  \nTests' }),
    ).toBe(`swift-format lint --recursive 'Sources' 'Tests'`);
  });

  it('omits --recursive when recursive="false"', () => {
    expect(
      buildSwiftFormatCommand({ recursive: 'false' }),
    ).toBe('swift-format lint');
  });

  it('adds --parallel when parallel="true"', () => {
    expect(
      buildSwiftFormatCommand({ parallel: 'true' }),
    ).toBe('swift-format lint --recursive --parallel');
  });

  it('combines all flags + paths in a stable order', () => {
    expect(
      buildSwiftFormatCommand({
        mode: 'format',
        configFile: '.swift-format',
        recursive: 'true',
        parallel: 'true',
        paths: 'Sources',
      }),
    ).toBe(`swift-format format -i --configuration '.swift-format' --recursive --parallel 'Sources'`);
  });

  it('throws on an invalid mode', () => {
    // @ts-expect-error testing the runtime guard
    expect(() => buildSwiftFormatCommand({ mode: 'bogus' })).toThrow(/invalid mode/);
  });
});
