import { describe, expect, it } from 'vitest';
import { formatLevel } from '@content/format';

describe('formatLevel', () => {
  it('keeps primitive-only objects and short point arrays on one line, nests the rest', () => {
    const out = formatLevel({
      id: 'x',
      spawn: { x: 1, y: 2 },
      solids: [{ x: 0, y: 0, w: 32, h: 32 }],
      movingSolids: [{ x: 0, y: 0, w: 96, h: 16, path: [{ x: 0, y: 0 }, { x: 128, y: 0 }], speed: 60 }],
      art: { props: 'p', backdrops: { far: 'sky' }, decor: [] },
    });
    expect(out).toBe(
      [
        '{',
        '  "id": "x",',
        '  "spawn": { "x": 1, "y": 2 },',
        '  "solids": [',
        '    { "x": 0, "y": 0, "w": 32, "h": 32 }',
        '  ],',
        '  "movingSolids": [',
        '    {',
        '      "x": 0,',
        '      "y": 0,',
        '      "w": 96,',
        '      "h": 16,',
        '      "path": [{ "x": 0, "y": 0 }, { "x": 128, "y": 0 }],',
        '      "speed": 60',
        '    }',
        '  ],',
        '  "art": {',
        '    "props": "p",',
        '    "backdrops": { "far": "sky" },',
        '    "decor": []',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('round-trips through JSON.parse', () => {
    const v = { a: [1, 2, { b: null, c: 'x' }], d: { e: [{ f: true }] } };
    expect(JSON.parse(formatLevel(v))).toEqual(v);
  });
});
