// Molded surfaces, lit for real. Each surface is an SVG height map (alpha: the face,
// letters pressed into it, a dot raised from it) run through feDiffuseLighting and
// feSpecularLighting with fine noise for the soft-touch grain. Light falling on the
// shape makes the relief; nothing is a painted shadow. Vector, so crisp at any size.

const NS = 'http://www.w3.org/2000/svg';
let seq = 0;

export function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

const grey = (v) => { const c = Math.round(v * 255); return `rgb(${c},${c},${c})`; };

// marks: [{ node, level, paint? }] where level < face presses in and level > face stands up.
// `paint` colours a mark's area (a lit letter) under the same light, so its walls keep their shading.
// Pass the same `seed` to surfaces that overlay each other so their grain lines up.
export function surface({ w, h, rx, color, marks = [], face = 0.72, depth, soft, grain = 0.02, seed }) {
  const id = `rl${++seq}`, small = Math.min(w, h);
  depth ??= Math.max(5, Math.min(14, small * 0.03));
  soft ??= Math.max(1.1, Math.min(3.4, small * 0.0068));
  const lowest = Math.min(face, ...marks.map((m) => m.level));
  const light = () => svg('feDistantLight', { azimuth: 235, elevation: 52 });
  const gain = 1 / Math.sin((52 * Math.PI) / 180); // flat faces come out at their own colour
  const mask = svg('mask', { id: `${id}m`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h },
    svg('rect', { width: w, height: h, fill: grey(face) }),
    ...marks.map((m) => { const n = m.node.cloneNode(true); n.setAttribute('fill', grey(m.level)); return n; }));
  const filter = svg('filter', { id: `${id}f`, filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: w, height: h, 'color-interpolation-filters': 'sRGB' },
    svg('feComponentTransfer', { in: 'SourceAlpha', result: 'shape' }, svg('feFuncA', { type: 'linear', slope: 1 / lowest, intercept: 0 })),
    svg('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1', result: 'base' }),
    svg('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: soft, result: 'soft' }),
    svg('feTurbulence', { type: 'fractalNoise', baseFrequency: 1.4, numOctaves: 2, seed: seed ?? seq, stitchTiles: 'stitch', result: 'noise' }),
    svg('feColorMatrix', { in: 'noise', type: 'matrix', values: `0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${grain} 0`, result: 'grain' }),
    svg('feComposite', { in: 'soft', in2: 'grain', operator: 'arithmetic', k2: 1, k3: 1, result: 'height' }),
    svg('feDiffuseLighting', { in: 'height', surfaceScale: depth, diffuseConstant: 1, 'lighting-color': '#ffffff', result: 'diffuse' }, light()),
    svg('feSpecularLighting', { in: 'height', surfaceScale: depth, specularConstant: 0.18, specularExponent: 20, 'lighting-color': '#ffffff', result: 'spec' }, light()),
    svg('feComposite', { in: 'base', in2: 'diffuse', operator: 'arithmetic', k1: gain, result: 'shaded' }),
    svg('feComposite', { in: 'spec', in2: 'shape', operator: 'in', result: 'gloss' }),
    svg('feComposite', { in: 'shaded', in2: 'gloss', operator: 'arithmetic', k2: 1, k3: 0.4, result: 'lit' }),
    svg('feComposite', { in: 'lit', in2: 'shape', operator: 'in' }));
  return svg('svg', { class: 'relief', width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true', focusable: 'false' },
    svg('defs', {}, mask, filter),
    svg('g', { filter: `url(#${id}f)` }, svg('g', { mask: `url(#${id}m)` },
      svg('rect', { width: w, height: h, rx, fill: color }),
      ...marks.filter((m) => m.paint).map((m) => { const n = m.node.cloneNode(true); n.setAttribute('fill', m.paint); return n; }))));
}

// Width of a capital in Barlow 800, as a fraction of the font size.
const widths = {};
function advance(ch) {
  if (!widths[ch]) {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '800 100px Barlow';
    widths[ch] = c.measureText(ch).width / 100 || 0.62;
  }
  return widths[ch];
}

// Shared light for small plates (state labels, setting values): raised when engaged,
// pressed in when off. The plate takes its colour from its own fill, so two filters serve all.
let plateDefs = null;
export function plate(pressed = false) {
  if (!plateDefs) {
    const f = (id, scale) => svg('filter', { id, x: '-20%', y: '-40%', width: '140%', height: '180%', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' },
      svg('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1', result: 'base' }),
      svg('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 1.3, result: 'soft' }),
      svg('feDiffuseLighting', { in: 'soft', surfaceScale: scale, diffuseConstant: 1, 'lighting-color': '#ffffff', result: 'diffuse' }, svg('feDistantLight', { azimuth: 235, elevation: 52 })),
      svg('feComposite', { in: 'base', in2: 'diffuse', operator: 'arithmetic', k1: 1.27, result: 'shaded' }),
      svg('feComposite', { in: 'shaded', in2: 'SourceAlpha', operator: 'in' }));
    plateDefs = svg('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false', style: 'position:absolute' },
      svg('defs', {}, f('plate-raised', 3.2), f('plate-pressed', -3.2)));
    document.body.append(plateDefs);
  }
  return svg('svg', { class: 'plate', 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { width: '100%', height: '100%', rx: 6, filter: `url(#${pressed ? 'plate-pressed' : 'plate-raised'})` }));
}

// A capital centred in a w x h box, as large as a moulded marking can be: about 70% of the
// height on big pads, close to 80% in the short meter band, never wider than 84% of the pad.
export function glyphSize(ch, w, h) { return Math.min(h * (h < 200 ? 1.12 : 1.0), (w * 0.84) / advance(ch)); }
export function glyph(ch, w, h, { lift = 0, fill = '#000', scale = 1 } = {}) {
  const size = glyphSize(ch, w, h) * scale;
  return svg('text', {
    x: w / 2, y: h / 2 + size * (0.35 - lift), 'text-anchor': 'middle',
    'font-family': 'Barlow, sans-serif', 'font-weight': 800, 'font-size': size.toFixed(2), fill,
  }, ch);
}

// The same glyph as a flat fill, for the lit meter layers drawn over a surface.
export const flat = (w, h, node) => svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true', focusable: 'false' }, node);
