import { describe, expect, it } from 'vitest';
import { extractModule, parseLinkMap } from './linkMapAnalyze';

const SAMPLE = `# Path: /var/build/MyApp.app/MyApp
# Object files:
[  0] linker synthesized
[  1] /Pods/Alamofire/Source/AFError.swift.o
[  2] /Pods/SwiftyJSON/Source/SwiftyJSON.swift.o
[  3] /MyApp.build/Objects-normal/arm64/AppDelegate.o

# Symbols:
0x00001000 0x00000040 [  1] -[AFError init]
0x00001040 0x00000080 [  2] +[SwiftyJSON parse]
0x000010c0 0x00000020 [  1] -[AFError dealloc]
0x000010e0 0x00000100 [  3] -[AppDelegate applicationDidFinishLaunching]
`;

describe('extractModule', () => {
  it('finds a Pods module', () => {
    expect(extractModule('/Pods/Alamofire/Source/AFError.swift.o')).toBe('Alamofire');
  });

  it('finds a framework module', () => {
    expect(extractModule('/Build/Products/Release-iphoneos/Foo.framework/Foo')).toBe('Foo');
  });

  it('finds a .build/ module', () => {
    expect(extractModule('/build/Bar.build/Objects-normal/arm64/x.o')).toBe('Bar');
  });

  it('falls back to (App) for unprefixed objects', () => {
    expect(extractModule('/MyApp.build/Objects-normal/arm64/AppDelegate.o')).toBe('MyApp');
  });
});

describe('parseLinkMap', () => {
  it('aggregates per-module bytes + object counts', () => {
    const modules = parseLinkMap(SAMPLE);
    const af = modules.find((m) => m.module === 'Alamofire');
    expect(af?.bytes).toBe(0x40 + 0x20);
    expect(af?.objectCount).toBe(2);
    const sj = modules.find((m) => m.module === 'SwiftyJSON');
    expect(sj?.bytes).toBe(0x80);
    const my = modules.find((m) => m.module === 'MyApp');
    expect(my?.bytes).toBe(0x100);
  });

  it('sorts results largest first', () => {
    const modules = parseLinkMap(SAMPLE);
    expect(modules[0]?.bytes).toBeGreaterThanOrEqual(modules[1]?.bytes ?? 0);
  });
});
