import { buildAstra, buildAurum, buildCrimson, buildIgnis, buildJade, buildPixel, buildVolt, type BlueprintResult } from './blueprints';

export type Species = 'ignis' | 'pixel' | 'volt' | 'jade' | 'aurum' | 'astra' | 'crimson';

export const BLUEPRINTS: Record<Species, (detail: number) => BlueprintResult> = {
  ignis: buildIgnis,
  pixel: buildPixel,
  volt: buildVolt,
  jade: buildJade,
  aurum: buildAurum,
  astra: buildAstra,
  crimson: buildCrimson,
};
