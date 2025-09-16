export interface Rect { x: number; y: number; w: number; h: number }

interface AnimationDef {
  src: string; // optional when using atlas
  frames: number;
  fps: number;
  loop: boolean;
  frameW: number;
  frameH: number;
  rects?: Rect[]; // atlas-based frames
  image?: HTMLImageElement;
  imageLoaded?: boolean;
  imageBroken?: boolean;
}

/**
 * Utility: extract frame count from filename pattern *_XX.png.
 */
function defaultFramesFromFilename(src: string, fallback: number): number {
  try {
    const m = /_(\d+)\.(png|jpg|jpeg|webp)$/i.exec(src);
    const n = m ? parseInt(m[1], 10) : NaN;
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/**
 * SpriteAnimator – verwaltet Frame-basierte Sprite-Sheet-Animationen.
 *  ‑ Jede Animation liegt in einer PNG-Reihe (Frames horizontal).
 *  ‑ draw(ctx, x, y, w, h) rendert den aktuellen Frame.
 */
export class SpriteAnimator {
  private defaultImage: HTMLImageElement | null;
  private frameW: number;
  private frameH: number;
  public animations: Record<string, AnimationDef>;
  public state: string = "idle";
  public frame = 0;
  private acc = 0; // Sekunden-Accumulator
  private fps = 12;
  private loop = true;
  private warnedStates: Set<string> = new Set(); // Track warned states to avoid spam
  private waitingForCompletion: boolean = false;
  private completionDelay: number = 0;

  constructor(
    defaultImage: HTMLImageElement | null,
    frameW: number,
    frameH: number,
    animations: Record<string, Partial<AnimationDef>> = {}
  ) {
    this.defaultImage = defaultImage;
    this.frameW = frameW;
    this.frameH = frameH;
    // Merge defaults
    this.animations = {};
    for (const key of Object.keys(animations)) {
      const a = animations[key];
      const full: AnimationDef = {
        src: a.src || "",
        frames: a.frames ?? defaultFramesFromFilename(a.src || "", 1),
        fps: a.fps ?? 12,
        loop: a.loop ?? true,
        frameW: a.frameW ?? frameW,
        frameH: a.frameH ?? frameH,
        // Preserve atlas data if provided
        image: a.image,
        rects: a.rects,
        imageLoaded: a.imageLoaded,
        imageBroken: a.imageBroken,
      } as AnimationDef;
      // Preload image (optional) - only if no atlas image is provided
      if (full.src && !full.image) {
        const img = new Image();
        full.image = img;
        full.imageLoaded = false;
        full.imageBroken = false;
        img.onload = () => (full.imageLoaded = true);
        img.onerror = () => (full.imageBroken = true);
        img.src = full.src;
      }
      this.animations[key] = full;
    }
  }

  setState(state: string) {
    if (this.state === state) {
      // Debug: log when animation would be skipped
      if (state === "parry") {
        console.debug(`[SpriteAnimator] SKIPPED setState("${state}") - already in this state`);
      }
      return;
    }
    this.state = state;
    this.frame = 0;
    this.acc = 0;
    // Cancel any previous completion wait - changing state must resume normal updates
    this.waitingForCompletion = false;
    this.completionDelay = 0;
    // Clear warning for this state when changing to it
    this.warnedStates.delete(state);
    const a = this.animations[state];
    if (a) {
      // Respect animation-provided fps/loop but fall back to previous values if missing
      this.fps = (typeof a.fps === 'number') ? a.fps : this.fps;
      this.loop = (typeof a.loop === 'boolean') ? a.loop : this.loop;
      // Only log state changes for important animations (use gated logger)
      if (state === "parry" || state === "attack" || state === "defeat") {
        console.debug(`[SpriteAnimator] State changed to "${state}" ` + JSON.stringify({
          frames: a.frames,
          fps: a.fps,
          loop: a.loop,
          hasImage: !!a.image,
          hasRects: !!a.rects,
          imageLoaded: a.imageLoaded,
          imageBroken: a.imageBroken
        }));
      }
    } else {
      console.warn(`[SpriteAnimator] Animation "${state}" not found! Available: ${Object.keys(this.animations).join(',')}`);
    }
  }

  /**
   * Fixed-timestep Update.
   * @param dt Delta-Zeit in Sekunden
   */
  update(dt: number) {
    const a = this.animations[this.state];
    if (!a) return;

    const frameTime = 1 / (a.fps || this.fps);

    // If we're currently waiting to display the final frame of a
    // non-looping animation, count down and then auto-reset to `idle`
    // (except for terminal states like `defeat`).
    if (this.waitingForCompletion) {
      this.completionDelay -= dt;
      if (this.completionDelay <= 0) {
        this.waitingForCompletion = false;
        if (this.state !== "defeat") this.setState("idle");
      }
      return;
    }

    this.acc += dt;
    while (this.acc >= frameTime) {
      this.acc -= frameTime;
      this.frame++;
      if (this.frame >= a.frames) {
        if (a.loop) {
          this.frame = 0;
        } else {
          // Clamp to last frame and wait one frameTime before auto-reset
          this.frame = a.frames - 1;
          this.waitingForCompletion = true;
          this.completionDelay = frameTime;
          break;
        }
      }
    }

    // Debug parry animation specifically - removed to reduce console spam
  }

  /**
   * Rendert aktuellen Frame.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    flip = false
  ) {
    const a = this.animations[this.state];
    const img = (a && a.image) || this.defaultImage;

    // minimal debug: only warn if animation missing or image not ready (avoid noisy per-frame logs)

    // Consider the image "broken" only when the DOM image is missing or not complete.
    // Some callers set `imageBroken` on the animation defs; prefer the actual HTMLImageElement
    // readiness (complete + naturalWidth) as the source of truth to avoid false positives.
    if (!a || !img || !img.complete || img.naturalWidth === 0) {
      // Fallback: graue Box - only warn once per state to avoid spam
      if (!this.warnedStates.has(this.state)) {
        console.warn(`[SpriteAnimator] FALLBACK GREY BOX for state "${this.state}":`, {
          hasAnimation: !!a,
          hasImage: !!img,
          // Report the declared broken-flag for diagnostics, but don't treat it as authoritative
          declaredImageBrokenFlag: a?.imageBroken,
          imageComplete: img?.complete,
          naturalWidth: img?.naturalWidth,
          imageSrc: img?.src,
          animationSrc: a?.src
        });
        this.warnedStates.add(this.state);
      }
      ctx.fillStyle = "#666";
      ctx.fillRect(x, y, w, h);
      return;
    }
    let sx = this.frame * (a.frameW || this.frameW);
    let sy = 0;

    // Atlas mode: use rects array if provided
    let frameW = a.frameW || this.frameW;
    let frameH = a.frameH || this.frameH;

    if (a.rects && a.rects.length > 0) {
      const r = a.rects[this.frame % a.rects.length];
      sx = r.x;
      sy = r.y;
      frameW = r.w;
      frameH = r.h;
    }

    // Optimize canvas state changes: avoid save/restore when not flipping
    if (flip) {
      ctx.save();
      ctx.translate(x + w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, frameW, frameH, 0, y, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, frameW, frameH, x, y, w, h);
    }
  }
}
