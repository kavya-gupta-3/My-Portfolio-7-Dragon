import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import forgeSource from './shaders/forge.glsl';

const INF = 1e20;
/** Above and below the type in all, in ems: room for the glow to fade out. */
const PADDING = 0.8;

/** One line of the squared distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(grid: Float64Array, offset: number, stride: number, n: number, f: Float64Array, v: Uint16Array, z: Float64Array) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < n; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const d = q - r;
    grid[offset + q * stride] = f[r] + d * d;
  }
}

function edt(grid: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Uint16Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

/** Letters are measured at this size, in pixels. */
const PROBE = 240;
/** The space between letters and between words, in ems. */
const LETTER = 0.13;
const WORD = 0.46;
/** The nearest two letters' outlines may ever come, in ems. */
const CLOSEST = 0.085;
/** How far into a letter's outline the eye still counts as space, in ems. */
const DEEPEST = 0.17;

interface Glyph {
  /** Where the ink starts and ends, measured from the pen. */
  lo: number;
  hi: number;
  /** How far the outline sits back from each side, row by row. NaN on an empty row. */
  left: Float32Array;
  right: Float32Array;
}

const glyphs = new Map<string, Glyph>();

/** Traces the outline of one letter. */
function trace(ch: string): Glyph {
  const known = glyphs.get(ch);
  if (known) return known;
  const pad = PROBE >> 1;
  const canvas = document.createElement('canvas');
  canvas.width = PROBE * 2;
  canvas.height = PROBE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `900 ${PROBE}px Cinzel, serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, pad, PROBE * 0.85);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const first = new Float32Array(PROBE).fill(NaN);
  const last = new Float32Array(PROBE).fill(NaN);
  for (let y = 0; y < PROBE; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < 128) continue;
      if (Number.isNaN(first[y])) first[y] = x - pad;
      last[y] = x - pad;
    }
  }
  const lo = Math.min(...first.filter((v) => !Number.isNaN(v)));
  const hi = Math.max(...last.filter((v) => !Number.isNaN(v)));
  const glyph = { lo, hi, left: first.map((v) => v - lo), right: last.map((v) => hi - v) };
  glyphs.set(ch, glyph);
  return glyph;
}

/**
 * How far apart the sides of two letters must stand for the space between them
 * to look like `want`. A font's kerning only tucks a few pairs together, so A,
 * V and Y end up nearly touching while straight letters stand well apart. The
 * eye judges the area between two outlines, so that is what gets evened out,
 * with a hard limit on how close the nearest points may come.
 */
function gapBetween(a: Glyph, b: Glyph, want: number) {
  const deep = PROBE * DEEPEST;
  let area = 0;
  let rows = 0;
  let nearest = Infinity;
  for (let y = 0; y < PROBE; y++) {
    const ra = a.right[y];
    const lb = b.left[y];
    if (Number.isNaN(ra) && Number.isNaN(lb)) continue;
    area += (Number.isNaN(ra) ? deep : Math.min(ra, deep)) + (Number.isNaN(lb) ? deep : Math.min(lb, deep));
    rows++;
    // a few rows either way: corners can come close without being level
    for (let k = -10; k <= 10; k += 5) {
      const other = b.left[y + k];
      if (!Number.isNaN(ra) && other !== undefined && !Number.isNaN(other)) nearest = Math.min(nearest, ra + other);
    }
  }
  return Math.max(want * PROBE - area / Math.max(rows, 1), CLOSEST * PROBE - nearest);
}

/** Where each letter's pen goes in a line, and the line's width, in ems. */
function setLine(line: string) {
  const pen: number[] = [];
  let x = 0;
  let want = LETTER;
  let last: Glyph | null = null;
  for (const ch of line) {
    if (ch === ' ') {
      want = WORD;
      pen.push(0);
      continue;
    }
    const g = trace(ch);
    if (last) x += gapBetween(last, g, want);
    pen.push((x - g.lo) / PROBE);
    x += g.hi - g.lo;
    last = g;
    want = LETTER;
  }
  return { pen, width: x / PROBE };
}

/**
 * The name as a piece of forged metal. Runs once per layout and hands back a
 * bitmap at the screen's own resolution: pin-sharp at any render scale, and
 * no cost at all per frame, because the 3D scene never draws it.
 */
export class NameForge {
  private stacked: boolean | null = null;
  private width = 0;
  /** Letters only, for the light that plays across them. */
  maskUrl = '';

  constructor(private readonly renderer: WebGLRenderer, private readonly output: HTMLCanvasElement) {}

  private drawMask(canvas: HTMLCanvasElement, lines: string[], w: number, h: number, size: number, background: string | null) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.font = `900 ${size}px Cinzel, serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const lineH = size * 1.06;
    lines.forEach((line, i) => {
      const { pen, width } = setLine(line);
      const y = h / 2 + (i - (lines.length - 1) / 2) * lineH + size * 0.03;
      [...line].forEach((ch, k) => ctx.fillText(ch, (w - width * size) / 2 + pen[k] * size, y));
    });
  }

  /** Forge the name for a CSS width. Skips the work if nothing changed. */
  forge(cssWidth: number, stack: boolean) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.min(3400, Math.round(cssWidth * dpr));
    if (stack === this.stacked && Math.abs(w - this.width) < 24) return;
    this.stacked = stack;
    this.width = w;
    const lines = stack ? ['KAVYA', 'GUPTA'] : ['KAVYA GUPTA'];

    // size the type to fill the width, leaving room for its glow
    const widest = Math.max(...lines.map((l) => setLine(l).width));
    // stacked it reaches the screen's edges, so leave its glow room at the sides
    const size = Math.floor((w * (stack ? 0.82 : 0.9)) / widest);
    const h = Math.ceil(size * (lines.length * 1.06 + PADDING));

    const maskCanvas = document.createElement('canvas');
    this.drawMask(maskCanvas, lines, w, h, size, '#000');

    // the distance field: half resolution, seeded from the antialiased edge
    const dw = w >> 1;
    const dh = h >> 1;
    const small = document.createElement('canvas');
    small.width = dw;
    small.height = dh;
    const sc = small.getContext('2d', { willReadFrequently: true })!;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(maskCanvas, 0, 0, dw, dh);
    const px = sc.getImageData(0, 0, dw, dh).data;
    const outer = new Float64Array(dw * dh);
    const inner = new Float64Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      const a = px[i * 4] / 255;
      if (a >= 1) {
        outer[i] = 0;
        inner[i] = INF;
      } else if (a <= 0) {
        outer[i] = INF;
        inner[i] = 0;
      } else {
        const d = 0.5 - a;
        outer[i] = d > 0 ? d * d : 0;
        inner[i] = d < 0 ? d * d : 0;
      }
    }
    edt(outer, dw, dh);
    edt(inner, dw, dh);
    const em = size / 2;
    const data = new Uint16Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) data[i] = DataUtils.toHalfFloat((Math.sqrt(outer[i]) - Math.sqrt(inner[i])) / em);
    const distance = new DataTexture(data, dw, dh, RedFormat, HalfFloatType);
    distance.minFilter = LinearFilter;
    distance.magFilter = LinearFilter;
    distance.wrapS = ClampToEdgeWrapping;
    distance.wrapT = ClampToEdgeWrapping;
    distance.needsUpdate = true;
    const mask = new CanvasTexture(maskCanvas);
    mask.minFilter = LinearFilter;
    mask.magFilter = LinearFilter;
    mask.generateMipmaps = false;

    const material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${forgeSource}`,
      fragmentShader: forgeSource,
      uniforms: {
        tDistance: { value: distance },
        tMask: { value: mask },
        uTexel: { value: new Vector2(1 / dw, 1 / dh) },
        uSlope: { value: 2 / em },
        uLines: { value: lines.length },
        uHeight: { value: h / size },
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new Mesh(geo, material);
    quad.frustumCulled = false;
    const target = new WebGLRenderTarget(w, h, { type: UnsignedByteType, depthBuffer: false, generateMipmaps: false });
    const r = this.renderer;
    const was = r.getRenderTarget();
    r.setRenderTarget(target);
    r.render(quad, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
    const pixels = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    r.setRenderTarget(was);

    this.output.width = w;
    this.output.height = h;
    const image = new ImageData(w, h);
    for (let y = 0; y < h; y++) image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    this.output.getContext('2d')!.putImageData(image, 0, 0);

    target.dispose();
    distance.dispose();
    mask.dispose();
    material.dispose();
    geo.dispose();

    // a smaller copy of the letters, as the mask for the moving light
    const light = document.createElement('canvas');
    this.drawMask(light, lines, Math.round(w * 0.5), Math.round(h * 0.5), size * 0.5, null);
    light.toBlob((blob) => {
      if (!blob) return;
      if (this.maskUrl) URL.revokeObjectURL(this.maskUrl);
      this.maskUrl = URL.createObjectURL(blob);
      this.output.parentElement?.style.setProperty('--name-mask', `url(${this.maskUrl})`);
    });
  }
}
