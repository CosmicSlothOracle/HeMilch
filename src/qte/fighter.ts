import { SpriteAnimator } from "./spriteAnimator";
import {
  P1_PROJECTILE_SRC,
  P2_PROJECTILE_SRC,
} from "./assetRegistry";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FighterOptions {
  x: number;
  y: number;
  color: string;
  keys: Record<string, string>; // keycodes mapping
  name: string;
  characterId?: string;
  spriteConfig: { frameW: number; frameH: number; animations: any };
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  muzzleOffset?: { x: number; y: number };
}

export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive = true;
  age = 0;
  lifespan = 1.0;
  owner: Fighter;
  anim: SpriteAnimator;
  displayW = 256;
  displayH = 256;
  // Whether this projectile should apply knockback on hit. Some ranged
  // attacks should only increase percent damage without knockback.
  applyKnockbackOnHit = true;

  // initialVy and gravity are optional and enable a parabolic trajectory
  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    owner: Fighter,
    imgSrc: string,
    framesHint: number,
    atlasImage: HTMLImageElement | null = null,
    atlasRects: Rect[] | null = null,
    initialVy: number = 0,
    gravity: number = 0
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    // Allow initialVy override to create an arcing projectile
    this.vy = initialVy !== 0 ? initialVy : vy;
    // gravity applied each update (px/s^2). 0 = no gravity (linear motion)
    (this as any).gravity = gravity || 0;
    this.owner = owner;
    const animationDef: any = {
      src: imgSrc,
      frames: framesHint,
      fps: 15, // Slightly faster FPS for more dynamic projectile animation
      loop: true,
      frameW: 256,
      frameH: 256,
    };

    if (atlasImage && atlasRects) {
      animationDef.image = atlasImage;
      animationDef.rects = atlasRects;
      animationDef.frames = atlasRects.length;
      animationDef.imageLoaded = true;
      animationDef.imageBroken = false;
      // Clear the src to prevent SpriteAnimator from trying to load it separately
      animationDef.src = "";
      // projectile atlas configured (silent)
    } else {
      // missing projectile atlas (silent)
    }

    this.anim = new SpriteAnimator(atlasImage, 256, 256, {
      fly: animationDef,
    });
    this.anim.setState("fly");
    // Ensure the projectile animation starts from frame 0 and plays all 6 frames
    this.anim.frame = 0;
    // projectile initialization (silent)
  }

  update(dt: number) {
    this.age += dt;
    // Apply gravity if present (positive gravity pulls downwards)
    const g = (this as any).gravity || 0;
    if (g !== 0) this.vy += g * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.anim.update(dt);
    if (this.age >= this.lifespan) this.alive = false;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const alpha = Math.max(0, 1 - this.age / this.lifespan);
    ctx.globalAlpha = alpha;
    // Debug image load state if available
    const a = this.anim.animations["fly"];
    // eslint-disable-next-line no-console
    // projectile image state check (silent)
    this.anim.draw(ctx, this.x, this.y, this.displayW, this.displayH, this.vx < 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  rect(): Rect {
    return { x: this.x, y: this.y, w: this.displayW, h: this.displayH };
  }
}

export class Blast {
  x: number;
  y: number;
  alive = true;
  timer: number;
  anim: SpriteAnimator;
  w = 256;
  h = 256;
  constructor(x: number, y: number, imgSrc: string, framesHint: number, atlasImage: HTMLImageElement | null = null, atlasRects: Rect[] | null = null) {
    this.x = x;
    this.y = y;
    this.timer = framesHint / 12;

    const animationDef: any = {
      src: imgSrc,
      frames: framesHint,
      fps: 12,
      loop: false,
      frameW: 256,
      frameH: 256,
    };

    if (atlasImage && atlasRects) {
      animationDef.image = atlasImage;
      animationDef.rects = atlasRects;
      animationDef.frames = atlasRects.length;
      animationDef.imageLoaded = true;
      animationDef.imageBroken = false;
      // Clear the src to prevent SpriteAnimator from trying to load it separately
      animationDef.src = "";
      // blast atlas configured (silent)
    } else {
      console.warn(`[qte] BLAST ATLAS MISSING: atlasImage=${!!atlasImage}, atlasRects=${!!atlasRects}`);
    }

    this.anim = new SpriteAnimator(atlasImage, 256, 256, {
      boom: animationDef,
    });
    this.anim.setState("boom");

    // Debug the final animation state
    const boomAnim = this.anim.animations["boom"];
    // blast final state (silent)
  }
  update(dt: number) {
    this.timer -= dt;
    this.anim.update(dt);
    if (this.timer <= 0) this.alive = false;
  }
  draw(ctx: CanvasRenderingContext2D) {
    this.anim.draw(ctx, this.x - this.w * 0.5, this.y - this.h * 0.5, this.w, this.h);
  }
}

export class Fighter {
  private ctx: CanvasRenderingContext2D;
  private canvasW: number;
  private canvasH: number;

  x: number;
  y: number;
  w = 256;
  h = 256;
  vx = 0;
  vy = 0;
  facing = 1;
  hp = 3; // 3 hits to defeat
  maxHp = 3;
  // Smash-style percent damage (0..inf). Higher values -> stronger knockback.
  damagePercent = 0;
  // number of lives/stocks
  stocks = 3;
  onGround = false;

  state: string = "idle";
  name: string;
  color: string;
  keys: Record<string, string>;
  anim: SpriteAnimator;

  // action flags
  attacking1 = false;
  attacking2 = false;
  parrying = false;
  ranging1 = false;
  ranging2 = false;
  attack1Launched = false;
  attack2Launched = false;
  // whether Laurin's attack1 auto-fired its special projectile3 this animation
  laurinAttack1ProjectileLaunched = false;
  ranged1Launched = false;
  ranged2Launched = false;
  ranged2Hold = false;
  hurt = false; // hurt animation state
  flying = false; // true while Circle (dodge) is held to fly
  flyHold = false; // whether we're looping the last frames of fly
  flySpeed = 300; // px/s movement speed while flying
  // internal input/feature flags
  _prevAttack2 = false;
  _grannyR2Active = false;
  _playReverse: any = null;
  // whether this fighter should consider the bottom "ground" (canvasH-40) as a solid surface
  allowGroundCollision = true;
  muzzleOffset: { x: number; y: number };

  // animation frame tracking to detect looped frames (used for repeat-fire)
  private _lastAnimFrame: Record<string, number> = {};
  // debugging helpers for flying animation
  private _lastLoggedFlyFrame = -1;
  private _flyLogAcc = 0;
  private _frozen = false;

  // timers
  attack1Timer = 0;
  attack2Timer = 0;
  ranged1Timer = 0;
  ranged2Timer = 0;
  parryTimer = 0;
  parryFreezeTimer = 0;
  parryCooldown = 0; // seconds until parry can be used again
  stunTimer = 0;
  hurtTimer = 0; // hurt animation duration
  parryConsumed = false;
  parryDurationDefault = 0.25; // twice as fast as before
  // Removed parry window - use full parry duration
  stunned = false;
  // true when the fighter was launched by a high-percent hit and hasn't landed yet
  launchedFromHit = false;
  // mark for removal after defeat animation finished (used for NPCs)
  shouldRemove = false;

  // dev-only visual feedback when auto-spawning projectile3 (duration seconds)
  devSpawnFlashTimer = 0;
  devSpawnFlashPos: { x: number; y: number } = { x: 0, y: 0 };

  constructor(opts: FighterOptions) {
    this.x = opts.x;
    this.y = opts.y;
    this.color = opts.color;
    this.keys = opts.keys;
    this.name = opts.name;
    // optional character id from registry (useful for per-character behavior)
    (this as any).characterId = (opts as any).characterId || null;
    this.ctx = opts.ctx;
    this.canvasW = opts.canvasWidth;
    this.canvasH = opts.canvasHeight;
    this.muzzleOffset = opts.muzzleOffset ?? { x: 36, y: -48 };

    const img = new Image();
    img.src = opts.spriteConfig.animations.idle.src;
    this.anim = new SpriteAnimator(img, opts.spriteConfig.frameW, opts.spriteConfig.frameH, opts.spriteConfig.animations);
    this.anim.setState("idle");
    this.maxHp = this.hp;
  }

  rect(): Rect {
    // return a centered hurtbox that is 50% of the sprite's width and height
    const hurtW = Math.max(1, Math.floor(this.w * 0.5));
    const hurtH = Math.max(1, Math.floor(this.h * 0.5));
    const hurtX = this.x + Math.floor((this.w - hurtW) * 0.5);
    const hurtY = this.y + Math.floor((this.h - hurtH) * 0.5);
    return { x: hurtX, y: hurtY, w: hurtW, h: hurtH };
  }

  hitbox(): Rect | null {
    if (this.state === "attack1" || this.state === "attack2") {
      const aw = 60,
        ah = 40;
      const ax = this.facing > 0 ? this.x + this.w - 10 : this.x - (aw - 10);
      const ay = this.y + this.h * 0.55 - ah * 0.5;
      return { x: ax, y: ay, w: aw, h: ah };
    }
    return null;
  }

  update(dt: number, input: Record<string, boolean>, projectiles: Projectile[], blasts: Blast[] = []) {
    // Movement & gravity
    // Flying (Circle) overrides gravity and allows free movement while held.
    const dodgeHeld = !!input[this.keys.dodge];
    if (dodgeHeld && !this.flying) {
      // start flying
      this.flying = true;
      this.state = 'fly';
      // Defensive: only set the animator to the 'fly' state if a 'fly'
      // animation actually exists. Many character sprite configs don't
      // include a 'fly' animation (projectiles do), so calling
      // setState('fly') unconditionally results in missing-frame
      // fallbacks and visual jitter. If 'fly' is not present, fall
      // back to 'jump' or 'idle'. This prevents the animator from
      // briefly showing an empty/malformed frame list.
      try {
        const flyAnimDef = this.anim.animations['fly'];
        if (flyAnimDef && ((flyAnimDef.rects && flyAnimDef.rects.length > 0) || (flyAnimDef.frames && flyAnimDef.frames > 0) || flyAnimDef.src)) {
          this.anim.setState('fly');
          // ensure animator knows frame count when using atlas rects (defensive)
          try {
            const a = this.anim.animations['fly'];
            if (a && a.rects && a.rects.length > 0 && (!a.frames || a.frames === 0)) {
              a.frames = a.rects.length;
              // ensure sensible fps/loop for fly
              if (!a.fps) a.fps = 12;
              a.loop = true;
            }
          } catch (e) {}
        } else {
          // fallback: if 'jump' exists prefer it (still non-looping), otherwise idle
          if (this.anim.animations['jump']) this.anim.setState('jump');
          else this.anim.setState('idle');
        }
      } catch (e) {
        try { this.anim.setState('fly'); } catch (ee) {}
      }
      this.vy = 0;
      this.onGround = false;
      // ensure we start from frame 0 if supported
      try { this.anim.frame = 0; } catch (e) {}
    }

    if (this.flying) {
      // Ensure animator advances immediately while flying (defensive in case global update timing differs)
      try { this.anim.update(dt); } catch (e) {}
      // Allow directional control in x and y while flying
      let vx = 0, vy = 0;
      if (input[this.keys.left]) { vx = -this.flySpeed; this.facing = -1; }
      else if (input[this.keys.right]) { vx = this.flySpeed; this.facing = 1; }
      else vx = 0;
      if (input[this.keys.up]) vy = -this.flySpeed;
      else if (input[this.keys.down]) vy = this.flySpeed;
      else vy = 0;

      this.vx = vx;
      this.vy = vy;

      // move directly (no gravity)
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Debug: log fly animation progress (rate-limited)
      try {
        this._flyLogAcc += dt;
        const a = this.anim.animations[this.anim.state];
        const curFrame = this.anim.frame;
        // Rate-limit fly logs to a modest frequency to avoid console spam.
        // Only emit a periodic state snapshot (includes current frame) and
        // do not log every single frame transition.
        if (this._flyLogAcc >= 0.25) { // ~4 logs/sec max
          this._flyLogAcc = 0;
          this._lastLoggedFlyFrame = curFrame;
          console.debug('[qte][fly] state=', this.anim.state, 'frame=', curFrame, 'frames=', a?.frames, 'fps=', a?.fps, 'loop=', a?.loop, 'hasRects=', !!a?.rects);
        }
      } catch (e) {}

      // Create a hold-loop animation from last 2 frames of 'fly' when appropriate
      try {
        const baseAnim = this.anim.animations['fly'];
        if (baseAnim) {
          const total = (baseAnim.rects && baseAnim.rects.length) ? baseAnim.rects.length : baseAnim.frames || 1;
          const holdStart = Math.max(0, total - 2);
          if (!this.flyHold && this.anim.state === 'fly' && this.anim.frame >= holdStart) {
            if (!this.anim.animations['fly_hold']) {
              const holdAnim: any = {
                src: baseAnim.src || '',
                frames: 0,
                fps: baseAnim.fps || 12,
                loop: true,
                frameW: baseAnim.frameW || 256,
                frameH: baseAnim.frameH || 256,
                image: baseAnim.image,
              };
              if (baseAnim.rects && baseAnim.rects.length > 0) {
                holdAnim.rects = baseAnim.rects.slice(holdStart);
                holdAnim.frames = holdAnim.rects.length;
              } else {
                holdAnim.frames = (baseAnim.frames || 1) - holdStart;
              }
              this.anim.animations['fly_hold'] = holdAnim;
            }
            this.flyHold = true;
            this.anim.setState('fly_hold');
            // Immediately advance one frame so the hold loop becomes visible without extra delay
            try { this.anim.update(1 / (this.anim.animations['fly_hold']?.fps || 12)); } catch (e) {}
          }
        }
      } catch (e) {}

      // release flying when dodge released
      if (!dodgeHeld) {
        this.flying = false;
        this.flyHold = false;
        // restore sensible state
        if (!this.onGround) this.setState('jump');
        else if (Math.abs(this.vx) > 1) this.setState('walk');
        else this.setState('idle');
      }
    } else {
      // If stunned, ignore player directional input so knockback impulses persist.
      if (this.stunTimer <= 0 && !this.launchedFromHit) {
        if (input[this.keys.left]) {
          this.vx = -150;
          this.facing = -1;
        } else if (input[this.keys.right]) {
          this.vx = 150;
          this.facing = 1;
        } else this.vx = 0;
      }
      if (this.onGround && input[this.keys.up]) {
        // Track jump input timing for short tap detection
        if (!(this as any)._jumpStartTime) {
          (this as any)._jumpStartTime = performance.now();
        }
        this.vy = -350; // reduced jump impulse (50% of original -700)
        this.onGround = false;
      }

      // Handle jump release for short tap detection
      if (!input[this.keys.up] && (this as any)._jumpStartTime) {
        const jumpDuration = performance.now() - (this as any)._jumpStartTime;
        // If jump was held for less than 100ms, reduce jump height to 25%
        if (jumpDuration < 100 && this.vy < 0) {
          this.vy = -175; // 25% of original jump height
        }
        (this as any)._jumpStartTime = null;
      }
      this.vy += 900 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    // ground friction: when on ground and not launched from hit, gradually stop horizontal movement
    const groundFriction = 1200; // px/s^2, tunable
    if (this.onGround && !this.launchedFromHit) {
      if (Math.abs(this.vx) > 0.001) {
        const dec = Math.sign(this.vx) * groundFriction * dt;
        if (Math.abs(dec) >= Math.abs(this.vx)) this.vx = 0;
        else this.vx -= dec;
      } else {
        this.vx = 0;
      }
    }

    // ground collision (legacy). Respect allowGroundCollision flag so outer logic can disable it
    if (this.allowGroundCollision && this.y + this.h >= this.canvasH - 40) {
      this.y = this.canvasH - 40 - this.h;
      this.vy = 0;
      // If we landed from a launch, stop horizontal motion and clear hurt
      if (this.launchedFromHit) {
        this.vx = 0;
        this.launchedFromHit = false;
        this.hurt = false;
        this.hurtTimer = 0;
        this.stunTimer = 0; // restore control immediately after landing
        if (this.state !== "defeat" && !this.parrying) this.setState("idle");
      }
      this.onGround = true;
    }

    // Block all actions except movement while flying
    if (!this.flying) {
    // Parry input (Triangle) - only start if not already parrying
    if (input[this.keys.parry] && !this.parrying && !this.attacking1 && !this.attacking2 && !this.ranging1 && !this.ranging2 && !this.hurt && this.parryCooldown <= 0) {
      this.parrying = true;
      this.setState("parry"); // Use private setState method to keep states in sync
      this.parryTimer = this.parryDurationDefault;
      this.parryConsumed = false;
      // set cooldown (3 seconds) immediately so parry cannot be spammed
      this.parryCooldown = 3;
      console.debug(`[Fighter] ${this.name} started parry - state: ${this.state}, anim.state: ${this.anim.state}`);
    }
    if (this.parrying) {
      this.parryTimer -= dt;
      if (this.parryTimer <= 0) {
        this.parrying = false;
        this.setState("idle"); // Explicitly return to idle after parry
        console.debug(`[Fighter] ${this.name} parry ended - returning to idle`);
        // console.log(`[qte] ${this.name} parry ended`); // Reduced logging
      }
    }

    // parry cooldown tick
    if (this.parryCooldown > 0) this.parryCooldown = Math.max(0, this.parryCooldown - dt);

    // Attack1 input (R1)
    if (input[this.keys.attack1] && !this.attacking1 && !this.parrying) {
      this.attacking1 = true;
      this.state = "attack1";
      this.anim.setState("attack1");
      this.attack1Timer = 0.35;
      this.attack1Launched = false;
      // reset Laurin-specific auto-projectile flag when (re)starting attack1
      try {
        const cid = (this as any).characterId;
        if (cid && String(cid).toLowerCase() === 'laurin') {
          this.laurinAttack1ProjectileLaunched = false;
          // Log animation meta to help debug why final-frame spawn may not trigger
          try {
            const a = this.anim.animations['attack1'];
            const total = (a && a.rects && a.rects.length) ? a.rects.length : (a && a.frames) || 0;
            const fps = (a && a.fps) || 12;
            console.debug('[qte][laurin] attack1 started - reset projectile flag', { totalFrames: total, fps });
          } catch (ee) {}
        }
      } catch (e) {}
    }
    if (this.attacking1) {
      this.attack1Timer -= dt;
      if (this.attack1Timer <= 0) this.attacking1 = false;
    }

    // Attack2 input (R2)
    if (input[this.keys.attack2] && !this.attacking2 && !this.parrying) {
      // Special per-character behavior for attack2 (R2)
      const cid = (this as any).characterId;
      if (cid === 'granny') {
        // When Granny triggers attack2: set idle to last frame of attack2,
        // add a custom walking animation 'walking' (from atlas) and
        // create 'attack1alt' using frames at r5c6..r6c3 (grid cells)
        this.attacking2 = true;
        this.state = 'attack2';
        this.anim.setState('attack2');
        this.attack2Timer = 0.35;
        this.attack2Launched = false;
        // enter Granny special R2 mode
        (this as any)._grannyR2Active = true;

        // Ensure attack1alt exists by building from atlas rects if present
        try {
          const a2 = this.anim.animations['attack2'];
          if (a2 && a2.rects && a2.rects.length > 0) {
            // 'attack1alt' frames located at r5c6 r5c7 r6c0 r6c1 r6c2 r6c3
            const gridRects = a2.rects || []; // atlas rects (safe fallback)
            // compute indices by matching x,y to grid; helper:
            const pick = (rx: number, ry: number) => gridRects.find((r: any) => r.x === rx && r.y === ry);
            const cells = [ [1536,1280], [1792,1280], [0,1536], [256,1536], [512,1536], [768,1536] ];
            const rects = cells.map(([x,y]) => pick(x,y)).filter(Boolean);
            if (rects.length === cells.length) {
              this.anim.animations['attack1alt'] = {
                src: a2.src || '',
                frames: rects.length,
                fps: a2.fps || 12,
                loop: false,
                frameW: a2.frameW || 256,
                frameH: a2.frameH || 256,
                image: a2.image,
                rects
              } as any;
            }
          }
        } catch (e) { /* defensive */ }

        // Set idle to last frame of attack2 by creating a one-frame idle from attack2 last rect
        try {
          const a2 = this.anim.animations['attack2'];
          if (a2 && a2.rects && a2.rects.length > 0) {
            const lastRect = a2.rects[a2.rects.length - 1];
            this.anim.animations['idle_from_attack2_last'] = {
              src: a2.src || '',
              frames: 1,
              fps: 1,
              loop: true,
              frameW: a2.frameW || 256,
              frameH: a2.frameH || 256,
              image: a2.image,
              rects: [ lastRect ]
            } as any;
            // Immediately use that idle
            this.anim.setState('idle_from_attack2_last');
          }
        } catch (e) {}

        // Add walking animation named 'walking' if atlas has it (atlas patching will populate it)
        if (!this.anim.animations['walking'] && this.anim.animations['walk']) {
          this.anim.animations['walking'] = this.anim.animations['walk'];
        }

      } else {
        this.attacking2 = true;
        this.state = "attack2";
        this.anim.setState("attack2");
        this.attack2Timer = 0.35;
        this.attack2Launched = false;
      }
    }
    if (this.attacking2) {
      this.attack2Timer -= dt;
      if (this.attack2Timer <= 0) this.attacking2 = false;
    }

    // If Granny's special R2 state is active and attack2 released again, restore animations and play attack2 reversed
    try {
      const cid = (this as any).characterId;
      if (cid === 'granny') {
        // detect pressing attack2 again to toggle back
        // (the input handling in gameLoop will set attacking2 true; here we look for state transition)
        // When toggled back, restore base animations and enqueue reverse playback of attack2
        // Implement a simple toggle flag on the instance
        if ((this as any)._grannyR2Active && !this.attacking2) {
          // deactivate special mode and restore default animations
          (this as any)._grannyR2Active = false;
          // Restore normal idle/walk/attack1 if present
          if (this.anim.animations['idle']) this.anim.setState('idle');
          // Play attack2 in reverse once (simulate by setting frame and decrementing via a small timer)
          if (this.anim.animations['attack2']) {
            const a2 = this.anim.animations['attack2'];
            this.anim.setState('attack2');
            this.anim.frame = a2.frames - 1;
            // mark animator to play backwards over next frames by setting a temporary property
            (this as any)._playReverse = { remaining: a2.frames, fps: a2.fps || 12 };
          }
        }
        // reverse player animator tick (if active)
        if ((this as any)._playReverse) {
          const pr = (this as any)._playReverse;
          if (pr.remaining > 0) {
            // step backwards based on fps
            const stepTime = 1 / pr.fps;
            pr.acc = (pr.acc || 0) + dt;
            while (pr.acc >= stepTime && pr.remaining > 0) {
              pr.acc -= stepTime;
              this.anim.frame = Math.max(0, this.anim.frame - 1);
              pr.remaining -= 1;
            }
            if (pr.remaining <= 0) {
              delete (this as any)._playReverse;
              // restore idle
              if (this.anim.animations['idle']) this.anim.setState('idle');
            }
          }
        }
      }
    } catch (e) {}

    // Ranged1 input (L1)
    if (input[this.keys.ranged1] && !this.ranging1 && !this.parrying) {
      this.ranging1 = true;
      this.state = "ranged1";
      this.anim.setState("ranged1");
      this.ranged1Timer = 0.4;
      this.ranged1Launched = false;
    }
    if (this.ranging1) {
      this.ranged1Timer -= dt;
      this.handleRangedAttack("ranged1", this.ranged1Launched, (launched) => { this.ranged1Launched = launched; }, projectiles, blasts);
      if (this.ranged1Timer <= 0) this.ranging1 = false;
    }

    // Ranged2 input (L2) with hold-loop support
    if (input[this.keys.ranged2] && !this.ranging2 && !this.parrying) {
      this.ranging2 = true;
      this.ranged2Hold = false;
      this.state = "ranged2";
      this.anim.setState("ranged2");
      this.ranged2Timer = 0.4; // initial animation window (will not automatically cancel while holding)
      this.ranged2Launched = false;
    }

    if (this.ranging2) {
      // While the button is held, allow a special hold-loop once the animation reaches its last 3 frames
      this.handleRangedAttack("ranged2", this.ranged2Launched, (launched) => { this.ranged2Launched = launched; }, projectiles, blasts);

      // If the player is still holding the ranged2 key, enable hold-loop when reaching last 3 frames
      if (input[this.keys.ranged2]) {
        try {
          const baseAnim = this.anim.animations["ranged2"];
          if (baseAnim) {
            const total = (baseAnim.rects && baseAnim.rects.length) ? baseAnim.rects.length : baseAnim.frames || 1;
            const holdStart = Math.max(0, total - 3);
            if (!this.ranged2Hold && this.anim.state === "ranged2" && this.anim.frame >= holdStart) {
              // create hold animation definition if missing
              if (!this.anim.animations["ranged2_hold"]) {
                const holdAnim: any = {
                  src: baseAnim.src || "",
                  frames: 0,
                  fps: baseAnim.fps || 12,
                  loop: true,
                  frameW: baseAnim.frameW || 256,
                  frameH: baseAnim.frameH || 256,
                  image: baseAnim.image,
                };
                if (baseAnim.rects && baseAnim.rects.length > 0) {
                  const startIdx = Math.max(0, baseAnim.rects.length - 3);
                  holdAnim.rects = baseAnim.rects.slice(startIdx);
                  holdAnim.frames = holdAnim.rects.length;
                } else {
                  const startIdx = Math.max(0, (baseAnim.frames || 1) - 3);
                  holdAnim.frames = (baseAnim.frames || 1) - startIdx;
                }
                this.anim.animations["ranged2_hold"] = holdAnim;
              }

              // switch to the hold-loop animation (it will loop the last 3 frames)
              this.ranged2Hold = true;
              this.anim.setState("ranged2_hold");
            }
          }
        } catch (e) {
          // swallow errors - defensive
        }
      } else {
        // Button released: end ranged2 (exit hold if active)
        if (this.ranged2Hold || this.ranging2) {
          this.ranging2 = false;
          this.ranged2Hold = false;
        }
      }
    }
    }

    // Hurt animation handling
    if (this.hurt) {
      this.hurtTimer -= dt;
      if (this.hurtTimer <= 0) {
        this.hurt = false;
        // Ensure we return the animator/state to a sensible non-hurt state
        // immediately rather than relying on the fallback that may be
        // prevented by other flags. Preserve defeat state.
        if (this.state !== "defeat" && !this.parrying) {
          if (!this.onGround) this.setState("jump");
          else if (Math.abs(this.vx) > 1) this.setState("walk");
          else this.setState("idle");
        }
      }
    }

    // State machine fallbacks (only if not hurt, parrying, defeated, or flying)
    if (!this.flying && !this.attacking1 && !this.attacking2 && !this.ranging1 && !this.ranging2 && !this.hurt && !this.parrying && this.state !== "defeat") {
      if (!this.onGround) this.setState("jump");
      else if (Math.abs(this.vx) > 1) this.setState("walk");
      else this.setState("idle");
    }

    // animator update
    this.anim.update(dt);

    // Laurin: spawn projectile3 at the LAST frame of attack1 (use animation's total frames)
    try {
      const cid = (this as any).characterId;
      if (cid && String(cid).toLowerCase() === 'laurin' && this.anim.state === 'attack1' && !this.laurinAttack1ProjectileLaunched) {
        const a = this.anim.animations['attack1'];
        const total = (a && a.rects && a.rects.length) ? a.rects.length : (a && a.frames) || 0;
        // spawn when animator reaches frame 4 (5th frame, 0-indexed) of 6-frame attack1
        if (total > 0 && this.anim.frame >= 4) {
          this.laurinAttack1ProjectileLaunched = true;
          console.debug('[qte][laurin] attack1 final frame - spawning projectile3', { frame: this.anim.frame, total });

          const projW = 256, projH = 256;
          const muzzle = this.muzzleOffset || { x: 36, y: -48 };
          const centerX = this.x + this.w * 0.5 + muzzle.x * this.facing;
          const centerY = this.y + this.h * 0.5 + muzzle.y;
          const startX = Math.round(centerX - projW * 0.5);
          const startY = Math.round(centerY - projH * 0.5);
          const speed = 600;
          const vx = this.facing > 0 ? speed : -speed;

          // Require projectile3 atlas (no fallback to projectile)
          let projectileImage = null;
          let projectileRects = null;
          let projectileFrames = 1;
          if (this.anim.animations.projectile3 && this.anim.animations.projectile3.rects && this.anim.animations.projectile3.rects.length > 0) {
            projectileImage = this.anim.animations.projectile3.image;
            projectileRects = this.anim.animations.projectile3.rects;
            projectileFrames = projectileRects.length;
            console.debug('[qte][laurin] using projectile3 atlas frames (final-frame spawn)');
          } else {
            console.warn('[qte][laurin] projectile3 atlas frames not found on final-frame spawn; aborting spawn to avoid fallback');
            // Do not spawn if projectile3 frames absent
            // reset flag to allow retry later
            this.laurinAttack1ProjectileLaunched = false;
            return;
          }

          const imgSrc = this.name === 'P1' ? P1_PROJECTILE_SRC : P2_PROJECTILE_SRC;
          const proj = new Projectile(startX, startY, vx, 0, this, imgSrc, projectileFrames, projectileImage, projectileRects, 0, 0);
          proj.applyKnockbackOnHit = false;
          const distanceToEdge = this.facing > 0 ? this.canvasW - startX : startX;
          proj.lifespan = Math.min(1.2, Math.abs(distanceToEdge / speed));
          projectiles.push(proj);

          // dev visual flash
          this.devSpawnFlashTimer = 0.25;
          this.devSpawnFlashPos = { x: startX + projW * 0.5, y: startY + projH * 0.5 };
        }
      }
    } catch (e) { console.error('[qte][laurin] error spawning projectile3 on final frame', e); }

    // dev timer tick for spawn flash
    try { if (this.devSpawnFlashTimer > 0) this.devSpawnFlashTimer = Math.max(0, this.devSpawnFlashTimer - dt); } catch (e) {}
    // If we're in the terminal 'defeat' state, freeze the fighter once the
    // animator reached the last frame so the final defeat pose remains visible
    // and no further updates/movement occur.
    try {
      if (this.state === 'defeat') {
        const a = this.anim.animations['defeat'];
        const total = (a && a.rects && a.rects.length) ? a.rects.length : (a && a.frames) || 0;
        if (total > 0 && this.anim.frame >= total - 1) {
          (this as any)._frozen = true;
          try {
            if (this.name !== 'P1') this.shouldRemove = true;
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  draw() {
    this.anim.draw(this.ctx, this.x, this.y, this.w, this.h, this.facing < 0);
    // Draw health bar above character (only in singleplayer mode this will be used by gameLoop)
    try {
      if (this.hp > 0 && this.maxHp > 0) {
        const barW = 80;
        const barH = 8;
        const bx = this.x + (this.w - barW) * 0.5;
        const by = this.y - 12; // above the sprite
        // background
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(bx, by, barW, barH);
        // health fill
        const pct = Math.max(0, Math.min(1, this.hp / this.maxHp));
        this.ctx.fillStyle = '#ff4444';
        this.ctx.fillRect(bx + 1, by + 1, (barW - 2) * pct, barH - 2);
        // border
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bx, by, barW, barH);
      }
    } catch (e) {}
    // dev-only spawn flash visual
    try {
      if (this.devSpawnFlashTimer > 0 && this.devSpawnFlashPos) {
        const alpha = Math.max(0, Math.min(1, this.devSpawnFlashTimer / 0.25));
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(255,216,0,${alpha})`;
        this.ctx.arc(this.devSpawnFlashPos.x, this.devSpawnFlashPos.y, 20 * alpha, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    } catch (e) {}
  }

  // Called when the fighter lands on any surface at the given y position (top of sprite).
  public landAt(yTop: number) {
    this.y = yTop;
    this.vy = 0;
    // If we landed from a launch, stop horizontal motion and clear hurt/stun
    if (this.launchedFromHit) {
      this.vx = 0;
      this.launchedFromHit = false;
      this.hurt = false;
      this.hurtTimer = 0;
      this.stunTimer = 0;
      if (this.state !== "defeat" && !this.parrying) this.setState("idle");
    }
    this.onGround = true;
  }

  private setState(s: string) {
    if (this.state === s) return;
    this.state = s;
    this.anim.setState(s);
  }

  // Helper method to handle ranged attacks
  private handleRangedAttack(animationName: string, launched: boolean, setLaunched: (launched: boolean) => void, projectiles: Projectile[], blasts: Blast[] = []) {
    // Spawn projectile at frame 2 of ranged animation (0-indexed, so frame 2 = 3rd frame)
    const rangedFrames = this.anim.animations[animationName]?.frames || 4;
    const projectileSpawnFrame = Math.min(2, rangedFrames - 1);

    // For automatic weapons (Laurin), we want to fire each time the hold-loop loops.
    // Detect loop transitions by comparing the animator frame to the last seen frame for this animation.
    const key = animationName;
    const lastFrame = this._lastAnimFrame[key] ?? -1;
    const frameJustLooped = (lastFrame > this.anim.frame) || (lastFrame === this.anim.animations[animationName]?.frames - 1 && this.anim.frame === 0);
    this._lastAnimFrame[key] = this.anim.frame;

    // For Laurin's ranged1 (L1), only spawn once per attack, not on loops
    const isLaurinRanged1 = (this as any).characterId === 'laurin' && animationName === 'ranged1';
    const shouldSpawn = isLaurinRanged1
      ? (!launched && this.anim.state === animationName && this.anim.frame === projectileSpawnFrame)
      : ((!launched && this.anim.state === animationName && this.anim.frame === projectileSpawnFrame) || frameJustLooped);

    if (shouldSpawn) {
      setLaunched(true);
      // spawn point (muzzle) – use configured muzzleOffset (mirrored by facing)
      const projW = 256, projH = 256;
      const muzzle = this.muzzleOffset || { x: 36, y: -48 };
      const centerX = this.x + this.w * 0.5 + muzzle.x * this.facing;
      const centerY = this.y + this.h * 0.5 + muzzle.y;
      const startX = Math.round(centerX - projW * 0.5);
      const startY = Math.round(centerY - projH * 0.5);
      const speed = 600;
      const vx = this.facing > 0 ? speed : -speed;
      const imgSrc = this.name === "P1" ? P1_PROJECTILE_SRC : P2_PROJECTILE_SRC;

      // Use atlas for projectile if available
      let projectileImage = null;
      let projectileRects = null;
      let projectileFrames = 6;

      // Choose projectile frames: prefer 'projectile2' for ranged1 (Laurin alt projectile),
      // otherwise fall back to 'projectile'. This allows ranged1 to use an alternate
      // projectile animation while ranged2 keeps the original.
      const prefersProjectile2 = (animationName === "ranged1");
      if (prefersProjectile2 && this.anim && this.anim.animations.projectile2 && this.anim.animations.projectile2.rects) {
        projectileImage = this.anim.animations.projectile2.image;
        projectileRects = this.anim.animations.projectile2.rects;
        projectileFrames = this.anim.animations.projectile2.rects.length;
        console.log(`[qte] Projectile using atlas frames 'projectile2' from ${this.name} (${projectileFrames} frames)`);
      } else if (this.anim && this.anim.animations.projectile && this.anim.animations.projectile.rects) {
        projectileImage = this.anim.animations.projectile.image;
        projectileRects = this.anim.animations.projectile.rects;
        projectileFrames = this.anim.animations.projectile.rects.length;
        console.log(`[qte] Projectile using atlas frames from ${this.name} (${projectileFrames} frames)`);
      } else {
        console.log(`[qte] Projectile: No atlas frames for 'projectile' in ${this.name}, falling back to individual image.`);
        if (this.anim && this.anim.animations.projectile && this.anim.animations.projectile.image) {
          projectileImage = this.anim.animations.projectile.image;
          console.log(`[qte] Projectile: using per-animation image for ${this.name}`);
        }
      }

      // Allow per-character arcing projectile (e.g. Laurin's projectile2)
      let initialVy = 0;
      let gravity = 0;
      try {
        const cid = (this as any).characterId;
        if (animationName === 'ranged1' && (cid === 'laurin' || cid === 'Laurin')) {
          initialVy = -220;
          gravity = 900;
          console.log('[qte] spawning arcing projectile for Laurin');
        }
      } catch (e) {}
      const proj = new Projectile(startX, startY, vx, 0, this, imgSrc, projectileFrames, projectileImage, projectileRects, initialVy, gravity);
      // Ranged attacks 'ranged1' and 'ranged2' should only add percent damage
      // and NOT apply knockback on hit.
      if (animationName === "ranged1" || animationName === "ranged2") {
        proj.applyKnockbackOnHit = false;
      }
      const distanceToEdge = this.facing > 0 ? this.canvasW - startX : startX;
      proj.lifespan = Math.min(1.2, Math.abs(distanceToEdge / speed));
      projectiles.push(proj);

      // spawn a blast visual at the impact point immediately
      // Blast visuals are now spawned on projectile collision (in gameLoop) — do not spawn here.
    }
  }

  // Method to handle taking damage
  takeDamage(amount: number = 1) {
    if (this.hp <= 0 || this.state === "defeat") return; // Already defeated

    this.hp = Math.max(0, this.hp - amount);
    this.hurt = true;
    this.hurtTimer = 0.3; // hurt animation duration

    // Trigger hurt animation if available
    if (this.anim.animations["hurt"]) {
      this.anim.setState("hurt");
    }

    // damage taken (silent)
    // If HP reached zero, trigger defeat state and freeze on last frame
    if (this.hp <= 0) {
      this.state = 'defeat';
      // ensure defeat animation is set and frozen on last frame
      try {
        if (this.anim.animations['defeat']) {
          // Play defeat animation from the beginning. SpriteAnimator will advance
          // through all frames of this non-looping animation and, because the
          // update logic excludes the "defeat" state from automatic reset,
          // will naturally freeze on the last frame once it has completed.
          // We therefore do NOT jump directly to the final frame here.
          this.anim.setState('defeat');
        } else {
          // fallback: set state and keep last visible frame
          this.anim.setState('idle');
        }
      } catch (e) {}
      // Hide health bar by setting maxHp to 0 (draw logic checks hp>0 && maxHp>0)
      this.maxHp = 0;
      // Do NOT immediately freeze here; allow the `defeat` animation to
      // play through. We'll freeze the instance after the animator
      // reaches its final frame inside `update` so the full animation
      // is visible.
    }
  }

  /**
   * Apply Smash-style percent damage and knockback.
   * - increases damagePercent
   * - applies velocity impulse based on formula
   * - sets a short stun so inputs don't cancel knockback
   */
  receiveHit(percentIncrease: number, baseKB: number = 120, strength: number = 1, angleRad?: number) {
    if (this.state === "defeat") return;

    this.damagePercent += percentIncrease;

    const dp = this.damagePercent;

    // compute knockback magnitude (tunable formula)
    const scale = 6 * strength; // tunable scaling factor
    const k = 30;
    const KB = baseKB + dp * scale + (dp * dp) / (k + dp);

    // Determine attacker side from angleRad if provided: if cos(angleRad) < 0 attacker was left
    const attackerFromLeft = (typeof angleRad === 'number') ? (Math.cos(angleRad) < 0) : false;

    // Reduce knockback by 80% intensity globally when applying to NPCs? We'll apply 20% multiplier to KB
    const globalKnockbackMultiplier = 0.2; // 20% of original
    if (dp < 30) {
      // small nudge for low damage
      const horizontalFactor = 0.12 * strength;
      const verticalFactor = 0.12 * strength;
      const ang = typeof angleRad === 'number' ? angleRad : (this.facing > 0 ? Math.PI : 0);
      const appliedVx = Math.cos(ang) * KB * horizontalFactor * globalKnockbackMultiplier;
      const appliedVy = -Math.sin(ang) * KB * verticalFactor * globalKnockbackMultiplier;
      this.vx += appliedVx;
      this.vy += appliedVy;
      this.stunTimer = Math.max(this.stunTimer, 0.25 * strength);
      this.hurt = true;
      this.hurtTimer = 0.3;
      if (this.anim.animations["hurt"]) this.anim.setState("hurt");
      // received hit (silent)
    } else {
      // Launch in a parabolic arc opposite the attack source.
      const clamped = Math.min(Math.max((dp - 30) / 70, 0), 1);
      const scaleMultiplier = 1 + clamped * 2; // 1..3

      // base vertical impulse (matches jump) - reduced to match new jump height
      const baseJumpVy = -350;
      const baseHor = 150;
      const appliedVy = baseJumpVy * scaleMultiplier * globalKnockbackMultiplier;
      const dir = attackerFromLeft ? 1 : -1; // push away from attacker
      const appliedVx = baseHor * scaleMultiplier * dir * globalKnockbackMultiplier;

      this.vx = appliedVx;
      this.vy = appliedVy;
      this.onGround = false;
      this.launchedFromHit = true;
      this.hurt = true;
      this.hurtTimer = 0.45;
      if (this.anim.animations["hurt"]) this.anim.setState("hurt");
      this.stunTimer = Math.max(this.stunTimer, 0.5 * strength);
      // launched (silent)
    }
  }

  // Check if fighter is defeated
  isDefeated(): boolean {
    return this.hp <= 0;
  }
}
