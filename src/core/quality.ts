/**
 * Device tiering. Picks a starting budget from what the device tells us,
 * then the adaptive governor in the engine trims render scale at runtime if
 * frames run long. `?q=low|medium|high` forces a tier.
 */

export type Tier = 'low' | 'medium' | 'high';

export interface Quality {
  tier: Tier;
  /** Upper bound for the canvas pixel ratio. */
  maxDpr: number;
  /** Hard cap on rendered pixels: big retina windows stop costing 2× the GPU. */
  maxPixels: number;
  /** MSAA samples on the HDR scene target. FXAA in the composite does this job at a fraction of the cost. */
  msaa: number;
  /** Ambient particles per world (only the world on screen is ever drawn). */
  particles: number;
  /** Bloom mip levels. */
  bloomLevels: number;
  /** Resolution of the procedural sky relative to the scene. */
  skyScale: number;
  /** Geometry density multiplier for procedural meshes (0.5 – 1). */
  detail: number;
  touch: boolean;
  reducedMotion: boolean;
  gpu: string;
}

const PRESETS: Record<Tier, Omit<Quality, 'tier' | 'touch' | 'reducedMotion' | 'gpu'>> = {
  high: { maxDpr: 2, maxPixels: 3_600_000, msaa: 0, particles: 1500, bloomLevels: 4, skyScale: 0.5, detail: 1 },
  medium: { maxDpr: 2, maxPixels: 1_800_000, msaa: 0, particles: 900, bloomLevels: 4, skyScale: 0.4, detail: 0.8 },
  low: { maxDpr: 1, maxPixels: 800_000, msaa: 0, particles: 450, bloomLevels: 3, skyScale: 0.33, detail: 0.6 },
};

function gpuName(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return 'unknown';
  }
}

export function supportsWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function detectQuality(): Quality {
  const params = new URLSearchParams(location.search);
  const forced = params.get('q') as Tier | null;
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gpu = gpuName();
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const small = Math.min(screen.width, screen.height) < 600;

  let tier: Tier = 'high';
  const weakGpu = /swiftshader|llvmpipe|software|mali-[gt]?[4-7]\d|adreno \(tm\) [3-5]\d\d|powervr|intel\(r\) (hd|uhd) graphics [2-6]\d\d/i.test(gpu);
  if (weakGpu || cores <= 2 || memory <= 2) tier = 'low';
  else if (touch || small || cores <= 4 || memory <= 4) tier = 'medium';
  if (forced && forced in PRESETS) tier = forced;

  const preset = PRESETS[tier];
  return {
    tier,
    ...preset,
    maxDpr: Math.min(preset.maxDpr, window.devicePixelRatio || 1),
    // Phones get a smaller particle budget than desktops of the same tier.
    particles: touch && tier !== 'low' ? Math.round(preset.particles * 0.6) : preset.particles,
    touch,
    reducedMotion,
    gpu,
  };
}
