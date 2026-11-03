import type { PerspectiveCamera, Vector2, Vector3 } from 'three';
import type { Quality } from '../core/quality';

export interface FrameContext {
  time: number;
  dt: number;
  /** The chapter on screen (0‥6). */
  scene: number;
  /** Progress through the current chapter's pinned film (0‥1). */
  p: number;
  /** Progress through this dragon's own page content (0‥1). */
  local: number;
  /** 1 while the seven hold the opening shot, 0 once Ignis has taken over. */
  conclave: number;
  /** 0 at the very top of the page, 1 once the opening shot has handed over. */
  hero: number;
  /** Opening sequence: how far this dragon has ignited (0‥1). */
  reveal: number;
  /** Opening sequence: this dragon's eyes have opened (0‥1). */
  eyes: number;
  /** World-space centre of this dragon's stage. */
  center: Vector3;
  camera: PerspectiveCamera;
  /** Pointer in normalised device coordinates. */
  pointer: Vector2;
  /** Pointer projected onto the stage's z = 0 plane. */
  pointerWorld: Vector3;
  /** Direction from the camera through the pointer. */
  ray: Vector3;
  /** The pointer is in play: on the world, not on the page or mid-cut. */
  free: boolean;
  /** The dragon under the pointer, or −1. */
  focus: number;
  /** Smoothed scroll velocity (px per frame at 60fps). */
  velocity: number;
  /** 0‥1 through the current dragon's entrance, −1 when none is playing. */
  entry: number;
  /** Sub-progress used by sections with internal chapters (hobbies). */
  chapter: number;
  /** 0‥1 while a surge of light passes through the world. */
  pulse: number;
  /** 0‥1 while the dragon is delivering a line; drives the jaw. */
  speaking: number;
  /** How far the page has come in over the end of the film (0‥1). */
  page: number;
  quality: Quality;
  /** Viewport aspect ratio. */
  aspect: number;
  /** Current renderer pixel ratio (for point sizes). */
  pixelRatio: number;
}
