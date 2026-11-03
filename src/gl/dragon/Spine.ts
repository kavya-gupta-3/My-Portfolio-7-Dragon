import { DataTexture, FloatType, NearestFilter, RGBAFormat, Vector3 } from 'three';

const tmp = new Vector3();
const tmpB = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * The dragon's backbone. Each frame it takes the posed curve, re-spaces the
 * samples to exact arclength (so the body never stretches), builds
 * rotation-minimising frames from the head down and uploads everything to a
 * float texture the vertex shaders read. Frames carry over from the previous
 * frame, so the body can roll but can never flip.
 */
export class Spine {
  readonly count: number;
  readonly length: number;
  readonly pos: Float32Array;
  readonly tan: Float32Array;
  readonly nor: Float32Array;
  readonly scale: Float32Array;
  readonly texture: DataTexture;
  /** Extra roll (radians) per sample, applied after framing. */
  readonly roll: Float32Array;
  bankGain = 0;
  /** Direction the dorsal ridge prefers to face. */
  readonly up = UP.clone();
  /** The skull's up: the first frame starts from it, so head and neck stay square. */
  readonly n0 = UP.clone();
  /** Share of the way each frame moves to its new orientation per update. */
  ease = 1;
  maxBank = 0.9;
  upRelax = 0.08;
  private readonly data: Float32Array;
  private readonly dense: Float32Array;
  private readonly cum: Float32Array;
  private readonly maxDense: number;
  private readonly last: Float32Array;
  private settled = false;

  constructor(count: number, length: number) {
    this.count = count;
    this.length = length;
    this.pos = new Float32Array(count * 3);
    this.tan = new Float32Array(count * 3);
    this.nor = new Float32Array(count * 3);
    this.scale = new Float32Array(count).fill(1);
    this.roll = new Float32Array(count);
    this.last = new Float32Array(count * 3);
    this.maxDense = count * 10;
    this.dense = new Float32Array(this.maxDense * 3);
    this.cum = new Float32Array(this.maxDense);
    this.data = new Float32Array(count * 3 * 4);
    this.texture = new DataTexture(this.data, count, 3, RGBAFormat, FloatType);
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  /** The next frame is a new shot: take it as it comes. */
  reset() {
    this.settled = false;
  }

  /** Lay the body along explicit points (head first), e.g. a posed curve. */
  fromPoints(points: Float32Array, pointCount: number) {
    const { dense, cum } = this;
    const m = Math.min(pointCount, this.maxDense);
    dense.set(points.subarray(0, m * 3));
    cum[0] = 0;
    for (let i = 1; i < m; i++) {
      const j = i * 3;
      const dx = dense[j] - dense[j - 3];
      const dy = dense[j + 1] - dense[j - 2];
      const dz = dense[j + 2] - dense[j - 1];
      cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.resample(m);
    this.frame();
  }

  private resample(n: number) {
    const { dense, cum, pos, count, length } = this;
    const total = cum[n - 1];
    let seg = 1;
    for (let i = 0; i < count; i++) {
      const s = (i / (count - 1)) * length;
      const o = i * 3;
      if (s >= total) {
        // Track was shorter than the body: extend straight from the last sample.
        const a = (n - 2) * 3;
        const b = (n - 1) * 3;
        let dx = dense[b] - dense[a];
        let dy = dense[b + 1] - dense[a + 1];
        let dz = dense[b + 2] - dense[a + 2];
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
        const extra = s - total;
        pos[o] = dense[b] + dx * extra;
        pos[o + 1] = dense[b + 1] + dy * extra;
        pos[o + 2] = dense[b + 2] + dz * extra;
        continue;
      }
      while (seg < n - 1 && cum[seg] < s) seg++;
      const s0 = cum[seg - 1];
      const s1 = cum[seg];
      const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
      const a = (seg - 1) * 3;
      const b = seg * 3;
      pos[o] = dense[a] + (dense[b] - dense[a]) * f;
      pos[o + 1] = dense[a + 1] + (dense[b + 1] - dense[a + 1]) * f;
      pos[o + 2] = dense[a + 2] + (dense[b + 2] - dense[a + 2]) * f;
    }
  }

  private frame() {
    const { pos, tan, nor, count, roll, data, scale, last } = this;
    // Tangents point toward the tail.
    for (let i = 0; i < count; i++) {
      const a = Math.max(0, i - 1) * 3;
      const b = Math.min(count - 1, i + 1) * 3;
      let x = pos[b] - pos[a];
      let y = pos[b + 1] - pos[a + 1];
      let z = pos[b + 2] - pos[a + 2];
      const l = Math.hypot(x, y, z) || 1;
      x /= l;
      y /= l;
      z /= l;
      tan[i * 3] = x;
      tan[i * 3 + 1] = y;
      tan[i * 3 + 2] = z;
    }
    // Banking from horizontal curvature.
    if (this.bankGain !== 0) {
      for (let i = 0; i < count; i++) {
        const a = Math.max(0, i - 2) * 3;
        const b = Math.min(count - 1, i + 2) * 3;
        const cross = tan[a + 2] * tan[b] - tan[a] * tan[b + 2];
        roll[i] = Math.max(-this.maxBank, Math.min(this.maxBank, cross * this.bankGain));
      }
    }
    // Rotation-minimising frames, gently relaxed toward the up hint so the
    // dorsal ridge stays on top without flipping in vertical loops.
    const up = this.up;
    tmp.set(tan[0], tan[1], tan[2]);
    tmpB.copy(this.n0).addScaledVector(tmp, -this.n0.dot(tmp)).normalize();
    let nx = tmpB.x;
    let ny = tmpB.y;
    let nz = tmpB.z;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const tx = tan[o];
      const ty = tan[o + 1];
      const tz = tan[o + 2];
      let d = nx * tx + ny * ty + nz * tz;
      nx -= tx * d;
      ny -= ty * d;
      nz -= tz * d;
      // relax toward the up hint projected off the tangent
      const ud = up.x * tx + up.y * ty + up.z * tz;
      const ux = up.x - tx * ud;
      const uy = up.y - ty * ud;
      const uz = up.z - tz * ud;
      const ul = Math.hypot(ux, uy, uz);
      if (ul > 0.2) {
        const k = this.upRelax * Math.min(1, (ul - 0.2) * 2);
        nx += (ux / ul - nx) * k;
        ny += (uy / ul - ny) * k;
        nz += (uz / ul - nz) * k;
        d = nx * tx + ny * ty + nz * tz;
        nx -= tx * d;
        ny -= ty * d;
        nz -= tz * d;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let rx = nx;
      let ry = ny;
      let rz = nz;
      const r = roll[i];
      if (r !== 0) {
        // rotate N about T by r: N' = N cos r + (T × N) sin r
        const bx = ty * nz - tz * ny;
        const by = tz * nx - tx * nz;
        const bz = tx * ny - ty * nx;
        const c = Math.cos(r);
        const s = Math.sin(r);
        rx = nx * c + bx * s;
        ry = ny * c + by * s;
        rz = nz * c + bz * s;
      }
      if (this.settled) {
        // ease toward the new frame from the last one: rolls, never flips. The
        // first samples stay exact, because the skull is bolted to them.
        const k = i >= 10 ? this.ease : this.ease + (1 - this.ease) * (1 - i / 10);
        const lx = last[o], ly = last[o + 1], lz = last[o + 2];
        rx = lx + (rx - lx) * k;
        ry = ly + (ry - ly) * k;
        rz = lz + (rz - lz) * k;
        d = rx * tx + ry * ty + rz * tz;
        rx -= tx * d;
        ry -= ty * d;
        rz -= tz * d;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl;
        ry /= rl;
        rz /= rl;
      }
      last[o] = rx;
      last[o + 1] = ry;
      last[o + 2] = rz;
      nor[o] = rx;
      nor[o + 1] = ry;
      nor[o + 2] = rz;
    }
    this.settled = true;
    // Upload.
    const row = count * 4;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const d = i * 4;
      data[d] = pos[o];
      data[d + 1] = pos[o + 1];
      data[d + 2] = pos[o + 2];
      data[d + 3] = scale[i];
      data[row + d] = tan[o];
      data[row + d + 1] = tan[o + 1];
      data[row + d + 2] = tan[o + 2];
      data[row + d + 3] = 0;
      data[row * 2 + d] = nor[o];
      data[row * 2 + d + 1] = nor[o + 1];
      data[row * 2 + d + 2] = nor[o + 2];
      data[row * 2 + d + 3] = 0;
    }
    this.texture.needsUpdate = true;
  }

  /** World position at arclength s (linear interpolation), for CPU effects. */
  sample(s: number, out: Vector3): Vector3 {
    const u = Math.max(0, Math.min(1, s / this.length)) * (this.count - 1);
    const i = Math.min(this.count - 2, Math.floor(u));
    const f = u - i;
    const a = i * 3;
    const b = a + 3;
    return out.set(
      this.pos[a] + (this.pos[b] - this.pos[a]) * f,
      this.pos[a + 1] + (this.pos[b + 1] - this.pos[a + 1]) * f,
      this.pos[a + 2] + (this.pos[b + 2] - this.pos[a + 2]) * f,
    );
  }

  tangent(s: number, out: Vector3): Vector3 {
    const i = Math.round(Math.max(0, Math.min(1, s / this.length)) * (this.count - 1)) * 3;
    return out.set(this.tan[i], this.tan[i + 1], this.tan[i + 2]);
  }

  normal(s: number, out: Vector3): Vector3 {
    const i = Math.round(Math.max(0, Math.min(1, s / this.length)) * (this.count - 1)) * 3;
    return out.set(this.nor[i], this.nor[i + 1], this.nor[i + 2]);
  }
}
