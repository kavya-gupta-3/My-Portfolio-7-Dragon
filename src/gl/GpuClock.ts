/**
 * How long the graphics chip really spends on a frame, read every so often.
 * The gap between frames can't tell you: a browser saving battery caps it at
 * 30 Hz and a covered window stretches it, with the chip sitting idle. Not
 * every browser can time the chip, and where it can't `ms` stays 0.
 */
export class GpuClock {
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private query: WebGLQuery | null = null;
  private running = false;
  private rest = 0;
  ms = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  /** Timing has a small cost of its own, so most frames go by untimed. */
  start() {
    if (!this.ext || this.query || --this.rest > 0) return;
    this.query = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
    this.running = true;
  }

  stop() {
    if (!this.running) return;
    this.gl.endQuery(this.ext!.TIME_ELAPSED_EXT);
    this.running = false;
  }

  read() {
    const { gl, ext, query } = this;
    if (!ext || !query || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      this.ms = this.ms ? this.ms + (ms - this.ms) * 0.25 : ms;
    }
    gl.deleteQuery(query);
    this.query = null;
    this.rest = 12;
  }
}
