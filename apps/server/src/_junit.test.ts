import { describe, it, expect } from 'vitest';
import { parseJunitXml } from './_junit';

describe('parseJunitXml', () => {
  it('parses a simple JUnit XML with passes and failures', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="LoginTests" time="1.234">
    <testcase classname="MyApp.LoginViewSpec" name="logs in with valid creds" time="0.42"/>
    <testcase classname="MyApp.LoginViewSpec" name="rejects bad password" time="0.15">
      <failure message="expected error to be shown">at LoginViewSpec.swift:42</failure>
    </testcase>
    <testcase classname="MyApp.LoginViewSpec" name="works offline" time="0">
      <skipped/>
    </testcase>
  </testsuite>
</testsuites>`;
    const suites = parseJunitXml(xml);
    expect(suites).toHaveLength(1);
    expect(suites[0]?.name).toBe('LoginTests');
    expect(suites[0]?.timeSec).toBe(1.234);
    expect(suites[0]?.tests).toHaveLength(3);
    const [pass, fail, skip] = suites[0]!.tests;
    expect(pass?.status).toBe('passed');
    expect(pass?.classname).toBe('MyApp.LoginViewSpec');
    expect(fail?.status).toBe('failed');
    expect(fail?.message).toContain('expected error to be shown');
    expect(fail?.message).toContain('LoginViewSpec.swift:42');
    expect(skip?.status).toBe('skipped');
  });

  it('decodes XML entities in test names and messages', () => {
    const xml = `<testsuite name="Encoded">
  <testcase name="a &amp; b" classname="X">
    <failure message="&quot;1 &lt; 2&quot;">bad</failure>
  </testcase>
</testsuite>`;
    const [suite] = parseJunitXml(xml);
    expect(suite?.tests[0]?.name).toBe('a & b');
    expect(suite?.tests[0]?.message).toContain('"1 < 2"');
  });

  it('treats <error> like <failure>', () => {
    const xml = `<testsuite name="X"><testcase name="boom"><error message="kaboom"/></testcase></testsuite>`;
    const [suite] = parseJunitXml(xml);
    expect(suite?.tests[0]?.status).toBe('failed');
    expect(suite?.tests[0]?.message).toBe('kaboom');
  });

  it('returns an empty list for non-JUnit XML', () => {
    expect(parseJunitXml('<coverage line-rate="0.9"/>')).toEqual([]);
    expect(parseJunitXml('not xml at all')).toEqual([]);
  });

  it('does not double-count testcases when suites nest', () => {
    const xml = `<testsuite name="Outer">
  <testcase name="outer-only" classname="O"/>
  <testsuite name="Inner">
    <testcase name="inner-1" classname="I"/>
    <testcase name="inner-2" classname="I"/>
  </testsuite>
</testsuite>`;
    const suites = parseJunitXml(xml);
    expect(suites).toHaveLength(2);
    const outer = suites.find((s) => s.name === 'Outer');
    const inner = suites.find((s) => s.name === 'Inner');
    expect(outer?.tests.map((t) => t.name)).toEqual(['outer-only']);
    expect(inner?.tests.map((t) => t.name)).toEqual(['inner-1', 'inner-2']);
  });

  it('captures file/line attributes when present', () => {
    const xml = `<testsuite name="X">
  <testcase name="t" file="Tests/X.swift" line="17"/>
</testsuite>`;
    const [suite] = parseJunitXml(xml);
    expect(suite?.tests[0]?.file).toBe('Tests/X.swift');
    expect(suite?.tests[0]?.line).toBe(17);
  });
});
