/// <reference lib="webworker" />
/**
 * Geometry worker: sculpts and meshes dragons off the main thread so the
 * loader keeps animating while seven skeletons are built.
 */
import { BLUEPRINTS, type Species } from './registry';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<{ id: number; species: Species; detail: number }>) => {
  const { id, species, detail } = event.data;
  const t0 = performance.now();
  try {
    const result = BLUEPRINTS[species](detail);
    const transfer: Transferable[] = [];
    for (const geo of Object.values(result.pack)) {
      for (const a of Object.values(geo.attributes)) transfer.push(a.array.buffer);
      if (geo.index) transfer.push(geo.index.buffer);
      if (geo.instances) for (const a of Object.values(geo.instances.attributes)) transfer.push(a.array.buffer);
    }
    self.postMessage({ id, ok: true, result, ms: performance.now() - t0 }, transfer);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String((error as Error)?.stack ?? error) });
  }
};
