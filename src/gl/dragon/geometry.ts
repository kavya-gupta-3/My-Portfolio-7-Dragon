import {
  BufferAttribute,
  BufferGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Sphere,
  Vector3,
} from 'three';
import type { PackedGeometry } from './anatomy';
import type { BlueprintResult } from './blueprints';
import type { Species } from './registry';

type Pending = { resolve: (r: BlueprintResult) => void; reject: (e: Error) => void };

/**
 * Hands blueprint jobs to the geometry worker (falls back to the main
 * thread if workers are unavailable) and turns the packed arrays it returns
 * into three.js geometries.
 */
export class GeometryFactory {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  timings: Record<string, number> = {};

  constructor() {
    try {
      this.worker = new Worker(new URL('./geo.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent) => {
        const { id, ok, result, error, ms } = e.data;
        const job = this.pending.get(id);
        if (!job) return;
        this.pending.delete(id);
        if (ok) {
          this.timings[id] = ms;
          job.resolve(result);
        } else job.reject(new Error(error));
      };
      this.worker.onerror = () => this.failover();
    } catch {
      this.worker = null;
    }
  }

  private failover() {
    this.worker?.terminate();
    this.worker = null;
    // Re-run anything that was in flight on the main thread.
    const jobs = [...this.pending.values()];
    this.pending.clear();
    for (const j of jobs) j.reject(new Error('worker failed'));
  }

  async build(species: Species, detail: number): Promise<BlueprintResult> {
    if (this.worker) {
      try {
        return await new Promise<BlueprintResult>((resolve, reject) => {
          const id = this.nextId++;
          this.pending.set(id, { resolve, reject });
          this.worker!.postMessage({ id, species, detail });
        });
      } catch {
        // fall through to the main thread
      }
    }
    const { BLUEPRINTS } = await import('./registry');
    return BLUEPRINTS[species](detail);
  }

  dispose() {
    this.worker?.terminate();
  }
}

const BIG = new Sphere(new Vector3(), 1e5);

export function toGeometry(packed: PackedGeometry): BufferGeometry {
  const geo = packed.instances ? new InstancedBufferGeometry() : new BufferGeometry();
  for (const [name, a] of Object.entries(packed.attributes)) geo.setAttribute(name, new BufferAttribute(a.array, a.itemSize));
  if (packed.index) geo.setIndex(new BufferAttribute(packed.index, 1));
  if (packed.instances && geo instanceof InstancedBufferGeometry) {
    for (const [name, a] of Object.entries(packed.instances.attributes)) {
      geo.setAttribute(name, new InstancedBufferAttribute(a.array, a.itemSize));
    }
    geo.instanceCount = packed.instances.count;
  }
  // Vertices are bent on the GPU, so rest-space bounds mean nothing.
  geo.boundingSphere = BIG.clone();
  return geo;
}
