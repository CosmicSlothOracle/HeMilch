// QTE Game Loop - Standalone JavaScript Version
// Compiled from TypeScript for browser compatibility

// Import dependencies (inline for standalone use)
// Attempt to reuse shared QTE modules from the project's `src/qte` during dev (Vite).
// If available we expose them on `window.QTE` so the standalone code can prefer the
// unified implementations. If import fails, local fallbacks below are used.
(async function tryImportQTEShared() {
  try {
    const atlasMod = await import("/src/qte/atlasLoader.ts");
    const animMod = await import("/src/qte/spriteAnimator.ts");
    window.QTE = window.QTE || {};
    if (atlasMod && atlasMod.loadAtlas)
      window.QTE.loadAtlas = atlasMod.loadAtlas;
    if (atlasMod && atlasMod.loadImage)
      window.QTE.loadImage = atlasMod.loadImage;
    if (animMod && animMod.SpriteAnimator)
      window.QTE.SpriteAnimator = animMod.SpriteAnimator;
    console.log("[qte] Shared modules loaded from /src/qte");
  } catch (e) {
    console.warn(
      "[qte] Shared QTE modules not available, using local fallbacks"
    );
  }
})();

function loadAtlasFn(path) {
  return window.QTE && window.QTE.loadAtlas
    ? window.QTE.loadAtlas(path)
    : loadAtlas(path);
}
function createSpriteAnimator(defaultImage, frameW, frameH, animations) {
  const Cl =
    window.QTE && window.QTE.SpriteAnimator
      ? window.QTE.SpriteAnimator
      : SpriteAnimator;
  return new Cl(defaultImage, frameW, frameH, animations);
}

function createKeyboardListener(canvas) {
  const keys = {};

  document.addEventListener("keydown", (e) => {
    keys[e.code] = true;
  });

  document.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  return keys;
}

function readGamepadsUnified(p1Keys, p2Keys) {
  // Simplified gamepad support - just return empty object for now
  return {};
}

// Key mappings
const P1_KEYS = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  attack: "KeyE",
  parry: "KeyR",
  ranged: "KeyT",
};

const P2_KEYS = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  attack: "Numpad1",
  parry: "Numpad2",
  ranged: "Numpad3",
};

// Asset registry
function buildSpriteConfig(character, overrides = {}) {
  const baseConfig = {
    idle: { src: `${character}/idle_256x256_4.png`, frames: 4, fps: 6 },
    walk: { src: `${character}/walk_256x256_4.png`, frames: 4, fps: 10 },
    jump: { src: `${character}/jump_256x256_4.png`, frames: 4, fps: 12 },
    attack: { src: `${character}/attack_256x256_4.png`, frames: 4, fps: 12 },
    parry: { src: `${character}/parry_256x256_6.png`, frames: 6, fps: 3.33 },
    spawn: { src: `${character}/spawn_256x256_4.png`, frames: 4, fps: 8 },
    defeat: { src: `${character}/defeat_256x256_4.png`, frames: 4, fps: 6 },
    projectile: {
      src: `${character}/projectile_256x256_6.png`,
      frames: 6,
      fps: 15,
      loop: true,
    },
    ranged: { src: `${character}/ranged_256x256_4.png`, frames: 4, fps: 12 },
    blast: { src: `${character}/blast_256x256_4.png`, frames: 4, fps: 12 },
  };

  return { ...baseConfig, ...overrides };
}

const P1_PROJECTILE_SRC = "ninja/projectile_256x256_6.png";
const P2_PROJECTILE_SRC = "cyboard/projectile_256x256_6.png";
const P1_BLAST_SRC = "ninja/blast_256x256_4.png";
const P2_BLAST_SRC = "cyboard/blast_256x256_4.png";

// Atlas loader
async function loadAtlas(path) {
  try {
    const response = await fetch(`${path}/atlas.json`);
    const atlasData = await response.json();

    // Load the atlas image
    const image = new Image();
    image.src = `${path}/atlas.png`;

    return new Promise((resolve, reject) => {
      image.onload = () => {
        resolve({
          ...atlasData,
          image: image,
        });
      };
      image.onerror = reject;
    });
  } catch (error) {
    console.warn(`Failed to load atlas from ${path}:`, error);
    return null;
  }
}

// Sprite Animator
class SpriteAnimator {
  constructor(image, frameW, frameH, animations) {
    this.image = image;
    this.frameW = frameW;
    this.frameH = frameH;
    this.animations = animations;
    this.currentState = "idle";
    this.currentFrame = 0;
    this.frameTimer = 0;
    this.playing = true;
  }

  setState(state) {
    if (this.animations[state]) {
      this.currentState = state;
      this.currentFrame = 0;
      this.frameTimer = 0;
      this.playing = true; // Reset playing state
      console.log(`[qte] SpriteAnimator: Set state to ${state}`, {
        hasAnimation: !!this.animations[state],
        animation: this.animations[state],
        hasImage: !!this.image,
        imageSrc: this.image?.src,
      });
    } else {
      console.warn(`[qte] SpriteAnimator: Animation '${state}' not found!`, {
        availableAnimations: Object.keys(this.animations),
      });
    }
  }

  update(dt) {
    if (!this.playing) return;

    const anim = this.animations[this.currentState];
    if (!anim) return;

    this.frameTimer += dt;
    const frameDuration = 1 / anim.fps;

    if (this.frameTimer >= frameDuration) {
      this.frameTimer = 0;
      this.currentFrame++;

      if (this.currentFrame >= anim.frames) {
        if (anim.loop) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = anim.frames - 1;
          this.playing = false;
        }
      }
    }
  }

  draw(ctx, x, y, w, h) {
    const anim = this.animations[this.currentState];
    if (!anim || !this.image) return;

    // Check if we have atlas-based animation data
    if (anim.rects && anim.rects[this.currentFrame]) {
      // Use atlas-based frame data
      const frameData = anim.rects[this.currentFrame];
      ctx.drawImage(
        this.image,
        frameData.x,
        frameData.y,
        frameData.w,
        frameData.h,
        x,
        y,
        w,
        h
      );
    } else {
      // Fallback to simple frame calculation
      const frameX = (this.currentFrame % 4) * this.frameW;
      const frameY = Math.floor(this.currentFrame / 4) * this.frameH;

      ctx.drawImage(
        this.image,
        frameX,
        frameY,
        this.frameW,
        this.frameH,
        x,
        y,
        w,
        h
      );
    }
  }
}

// Fighter class
class Fighter {
  constructor(config) {
    this.x = config.x;
    this.y = config.y;
    this.w = 64;
    this.h = 64;
    this.vx = 0;
    this.vy = 0;
    this.color = config.color;
    this.keys = config.keys;
    this.name = config.name;
    this.ctx = config.ctx;
    this.canvasWidth = config.canvasWidth;
    this.canvasHeight = config.canvasHeight;
    this.muzzleOffset = config.muzzleOffset;

    this.hp = 3;
    this.maxHp = 3;
    this.facing = 1;
    this.state = "idle";
    this.attacking = false;
    this.parrying = false;
    this.ranging = false;
    this.stunTimer = 0;
    this.parryTimer = 0;
    this.parryDurationDefault = 0.5;
    // Removed parry window - use full parry duration
    this.parryConsumed = false;
    this.parryFreezeTimer = 0;

    // Create animator
    this.anim = createSpriteAnimator(null, 256, 256, config.spriteConfig);
  }

  update(dt, input, projectiles) {
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      return;
    }

    if (this.parryFreezeTimer > 0) {
      this.parryFreezeTimer -= dt;
      return;
    }

    // Handle parry
    if (input[this.keys.parry] && !this.parrying) {
      this.parrying = true;
      this.parryTimer = this.parryDurationDefault;
      this.parryConsumed = false;
      this.anim.setState("parry");
      console.log(`[qte] ${this.name} started parry`);
      console.log(`[qte] DEBUG: Parry animation state:`, {
        currentState: this.anim.currentState,
        hasParryAnim: !!this.anim.animations.parry,
        parryAnim: this.anim.animations.parry,
        hasImage: !!this.anim.image,
        imageSrc: this.anim.image?.src,
      });
    }

    if (this.parrying) {
      this.parryTimer -= dt;
      if (this.parryTimer <= 0) {
        this.parrying = false;
        this.parryConsumed = false;
        this.anim.setState("idle");
      }
    }

    // Handle attack
    if (input[this.keys.attack] && !this.attacking && !this.parrying) {
      this.attacking = true;
      this.anim.setState("attack");
      setTimeout(() => {
        this.attacking = false;
        this.anim.setState("idle");
      }, 500);
    }

    // Handle ranged attack
    if (input[this.keys.ranged] && !this.ranging && !this.parrying) {
      this.ranging = true;
      this.anim.setState("ranged");

      // Create projectile
      const projectile = new Projectile(
        this.x + this.muzzleOffset.x * this.facing,
        this.y + this.muzzleOffset.y,
        this.facing,
        this
      );
      projectiles.push(projectile);

      setTimeout(() => {
        this.ranging = false;
        this.anim.setState("idle");
      }, 500);
    }

    // Handle movement
    if (!this.attacking && !this.parrying && !this.ranging) {
      if (input[this.keys.left]) {
        this.vx = -200;
        this.facing = -1;
        this.anim.setState("walk");
      } else if (input[this.keys.right]) {
        this.vx = 200;
        this.facing = 1;
        this.anim.setState("walk");
      } else {
        this.vx = 0;
        if (!this.attacking && !this.parrying && !this.ranging) {
          this.anim.setState("idle");
        }
      }

      if (input[this.keys.up] && this.y >= this.canvasHeight - 40 - 256) {
        this.vy = -400;
        this.anim.setState("jump");
      }
    }

    // Apply gravity
    this.vy += 800 * dt;

    // Update position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Ground collision
    if (this.y >= this.canvasHeight - 40 - 256) {
      this.y = this.canvasHeight - 40 - 256;
      this.vy = 0;
    }

    // Screen bounds
    this.x = Math.max(0, Math.min(this.canvasWidth - this.w, this.x));

    // Update animator
    this.anim.update(dt);
  }

  draw() {
    this.anim.draw(this.ctx, this.x, this.y, this.w, this.h);
  }

  hitbox() {
    if (this.attacking) {
      return {
        x: this.x + (this.facing > 0 ? this.w : -20),
        y: this.y + 10,
        w: 20,
        h: this.h - 20,
      };
    }
    return null;
  }

  rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    console.log(`[qte] ${this.name} took ${amount} damage, HP: ${this.hp}`);

    // Trigger hurt animation
    if (this.anim.animations.hurt) {
      this.anim.setState("hurt");
      // Return to idle after hurt animation
      setTimeout(() => {
        if (this.hp > 0) {
          this.anim.setState("idle");
        }
      }, 500); // Duration of hurt animation
    }
  }

  isDefeated() {
    return this.hp <= 0;
  }
}

// Projectile class
class Projectile {
  constructor(x, y, facing, owner) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.vx = facing * 300;
    this.vy = 0;
    this.facing = facing;
    this.owner = owner;
    this.alive = true;

    // Create simple animator
    this.anim = createSpriteAnimator(null, 32, 32, {
      fly: { src: "", frames: 6, fps: 15, loop: true },
    });
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Remove if off screen
    if (this.x < -50 || this.x > 1200) {
      this.alive = false;
    }

    this.anim.update(dt);
  }

  draw(ctx) {
    ctx.fillStyle = this.owner.color;
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }

  rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}

// Blast class
class Blast {
  constructor(x, y, src, frames, image, rects) {
    this.x = x;
    this.y = y;
    this.w = 64;
    this.h = 64;
    this.alive = true;
    this.frame = 0;
    this.maxFrames = frames;
    this.frameTimer = 0;
    this.frameDuration = 1 / 12; // 12 fps

    this.image = image;
    this.rects = rects;
  }

  update(dt) {
    this.frameTimer += dt;
    if (this.frameTimer >= this.frameDuration) {
      this.frameTimer = 0;
      this.frame++;
      if (this.frame >= this.maxFrames) {
        this.alive = false;
      }
    }
  }

  draw(ctx) {
    if (this.image && this.rects && this.rects[this.frame]) {
      const rect = this.rects[this.frame];
      ctx.drawImage(
        this.image,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        this.x - this.w / 2,
        this.y - this.h / 2,
        this.w,
        this.h
      );
    } else {
      // Fallback: draw colored circle
      ctx.fillStyle = "#ffaa00";
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Animation Viewer (simplified)
function getAnimationViewer() {
  return {
    toggle: () => {
      console.log(
        "Animation viewer toggle - not implemented in standalone version"
      );
    },
  };
}

// Main game creation function
export function createGame(canvas) {
  const ctx = canvas.getContext("2d");
  const WIDTH = canvas.width,
    HEIGHT = canvas.height;

  console.log("[qte] createGame initialized", { WIDTH, HEIGHT });

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  const input = createKeyboardListener(canvas);

  // Create animation viewer button
  const animationViewerBtn = document.createElement("button");
  animationViewerBtn.textContent = "🎬 View Animations";
  animationViewerBtn.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 1000;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  `;
  animationViewerBtn.onclick = () => getAnimationViewer().toggle();
  document.body.appendChild(animationViewerBtn);

  const p1Sprite = buildSpriteConfig("ninja");
  const p2Sprite = buildSpriteConfig("cyboard", {
    idle: { src: "cyboard/idle_256x256_4.png", frames: 4, fps: 6 },
    walk: { src: "cyboard/walk_256x256_4.png", frames: 4, fps: 10 },
    ranged: { src: "cyboard/ranged_256x256_4.png", frames: 4, fps: 12 },
    parry: { src: "", frames: 6, fps: 3.33 },
    blast: { src: "cyboard/blast_256x256_4.png", frames: 4, fps: 12 },
    projectile: {
      src: "cyboard/projectile_256x256_6.png",
      frames: 6,
      fps: 15,
      loop: true,
    },
    hurt: { src: "cyboard/hurt_256x256_4.png", frames: 3, fps: 15 },
    spawn: { src: "cyboard/spawn_256x256_4.png", frames: 4, fps: 8 },
  });

  const projectiles = [];
  const blasts = [];

  // Game state
  let gameOver = false;
  let winner = null;
  let gameStarted = false;
  let introPhase = true;
  let introTimer = 0;
  let readyPulse = 0;

  const p1 = new Fighter({
    x: 100,
    y: HEIGHT - 40 - 256,
    color: "#4aa3ff",
    keys: P1_KEYS,
    name: "P1",
    spriteConfig: p1Sprite,
    ctx,
    canvasWidth: WIDTH,
    canvasHeight: HEIGHT,
    muzzleOffset: { x: 36, y: -48 },
  });

  const p2 = new Fighter({
    x: WIDTH - 100 - 256,
    y: HEIGHT - 40 - 256,
    color: "#ff7a7a",
    keys: P2_KEYS,
    name: "P2",
    spriteConfig: p2Sprite,
    ctx,
    canvasWidth: WIDTH,
    canvasHeight: HEIGHT,
    muzzleOffset: { x: -36, y: -48 },
  });
  p2.facing = -1;

  // Start with spawn animations
  p1.anim.setState("spawn");
  p2.anim.setState("spawn");

  // Preload stage background (moved into section folders)
  const stageImg = new Image();
  stageImg.src =
    "/levels/sidescroller/ninja_stage/sections/section_01/stage.png";

  // Preload stage foreground (cosmetic overlay)
  const stageForegroundImg = new Image();
  stageForegroundImg.src =
    "/levels/sidescroller/ninja_stage/sections/section_01/stage_foreground.png";

  // Store atlases globally for projectiles/blasts
  let globalAtlas1 = null;
  let globalAtlas2 = null;

  // Asynchronously load atlases and patch animators once ready
  (async () => {
    try {
      console.log("[qte] Starting atlas load...");
      const [atlas1, atlas2] = await Promise.all([
        loadAtlasFn("/qte/ninja"),
        loadAtlasFn("/qte/cyboard/atlas2"),
      ]);

      globalAtlas1 = atlas1 || null;
      globalAtlas2 = atlas2 || null;
      console.log("[qte] Atlases loaded successfully:", {
        ninja: !!atlas1,
        cyboard: !!atlas2,
      });

      // Patch animators with atlas data using a safe patch helper
      const safePatch = (anim, atlas) => {
        if (!atlas || !atlas.image) return;
        anim.image = atlas.image;
        const allStates = Object.keys(anim.animations);
        for (const state of allStates) {
          if (!anim.animations[state]) anim.animations[state] = {};
          const dest = anim.animations[state];
          dest.image = atlas.image;
          dest.src = atlas.image.src;
          dest.imageLoaded = !!(
            atlas.image &&
            atlas.image.complete &&
            atlas.image.naturalWidth > 0
          );
          dest.imageBroken = false;
          const atlasState = atlas.animations && atlas.animations[state];
          if (atlasState) {
            dest.rects = atlasState.frames.slice();
            dest.frameW = atlas.frameW;
            dest.frameH = atlas.frameH;
            dest.frames = atlasState.frames.length;
            // Preserve original fps if already set (for overrides), otherwise use atlas values
            dest.fps =
              dest.fps ||
              (typeof atlasState.fps === "number"
                ? atlasState.fps
                : atlas.meta?.fps || 12);
            dest.loop =
              typeof atlasState.loop === "boolean"
                ? atlasState.loop
                : dest.loop ?? true;
          } else {
            dest.frameW = dest.frameW || atlas.frameW;
            dest.frameH = dest.frameH || atlas.frameH;
          }
        }
      };

      safePatch(p1.anim, atlas1);
      safePatch(p2.anim, atlas2);

      console.log("[qte] atlases loaded and patched successfully");
    } catch (e) {
      console.warn("[qte] atlas load failed", e);
    }
  })();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // merge inputs
    const gp = readGamepadsUnified(P1_KEYS, P2_KEYS);
    const mergedInput = {};
    function getKeyboard(code) {
      return !!input[code];
    }
    [
      P1_KEYS.left,
      P1_KEYS.right,
      P1_KEYS.up,
      P1_KEYS.down,
      P1_KEYS.attack,
      P1_KEYS.parry,
      P1_KEYS.ranged,
    ].forEach((k) => {
      if (k) mergedInput[k] = !!gp[k] || getKeyboard(k);
    });
    [
      P2_KEYS.left,
      P2_KEYS.right,
      P2_KEYS.up,
      P2_KEYS.down,
      P2_KEYS.attack,
      P2_KEYS.parry,
      P2_KEYS.ranged,
    ].forEach((k) => {
      if (k) mergedInput[k] = !!gp[k] || getKeyboard(k);
    });

    // Handle intro phase
    if (introPhase) {
      introTimer += dt;
      readyPulse += dt * 3; // Pulse speed

      // Check for any input to start the game
      const anyInput = Object.values(mergedInput).some((pressed) => pressed);
      if (anyInput && introTimer > 1.0) {
        // Minimum 1 second intro
        introPhase = false;
        gameStarted = true;
        // Transition from spawn to idle
        p1.anim.setState("idle");
        p2.anim.setState("idle");
        console.log("[qte] Game started!");
      }
    }

    // draw background
    if (stageImg.complete && stageImg.naturalWidth > 0) {
      ctx.drawImage(stageImg, 0, 0, WIDTH, HEIGHT);
    } else {
      ctx.fillStyle = "#071428";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.fillStyle = "#333";
    ctx.fillRect(0, HEIGHT - 40, WIDTH, 40);

    // draw foreground (cosmetic overlay)
    if (stageForegroundImg.complete && stageForegroundImg.naturalWidth > 0) {
      ctx.drawImage(stageForegroundImg, 0, 0, WIDTH, HEIGHT);
    }

    // update
    p1.update(dt, mergedInput, projectiles);
    p2.update(dt, mergedInput, projectiles);

    projectiles.forEach((pr) => pr.update(dt));
    blasts.forEach((b) => b.update(dt));

    // cleanup
    for (let i = projectiles.length - 1; i >= 0; i--)
      if (!projectiles[i].alive) projectiles.splice(i, 1);
    for (let i = blasts.length - 1; i >= 0; i--)
      if (!blasts[i].alive) blasts.splice(i, 1);

    // draw
    p1.draw();
    p2.draw();
    projectiles.forEach((pr) => pr.draw(ctx));
    blasts.forEach((b) => b.draw(ctx));

    // Draw health bars
    drawHealthBar(ctx, 20, 20, p1.hp, 3, p1.color, "P1");
    drawHealthBar(ctx, WIDTH - 120, 20, p2.hp, 3, p2.color, "P2");

    // Draw parry indicators
    if (p1.parrying) {
      drawParryIndicator(
        ctx,
        p1.x + p1.w / 2,
        p1.y - 20,
        p1.parryTimer,
        p1.parryDurationDefault,
        0, // No parry window
        p1.color
      );
    }
    if (p2.parrying) {
      drawParryIndicator(
        ctx,
        p2.x + p2.w / 2,
        p2.y - 20,
        p2.parryTimer,
        p2.parryDurationDefault,
        0, // No parry window
        p2.color
      );
    }

    // Draw intro screen
    if (introPhase) {
      drawIntroScreen(ctx, WIDTH, HEIGHT, readyPulse);
    }

    // Draw game over screen
    if (gameOver && winner) {
      drawGameOverScreen(ctx, WIDTH, HEIGHT, winner);
    }

    // collisions
    const h1 = p1.hitbox(),
      h2 = p2.hitbox();
    if (h1 && aabb(h1, p2.rect())) {
      // Check if P2 can parry P1's attack (no window restriction)
      if (p2.parrying && !p2.parryConsumed) {
        // Successful parry - no damage, stun attacker
        p2.parryConsumed = true;
        p2.parryFreezeTimer = 0.15;
        p1.stunTimer = 1.2;
        console.log(`[qte] P2 successfully parried P1's attack!`);
      } else if (!p2.parrying || p2.parryConsumed) {
        // No parry or parry already consumed - take damage
        p2.takeDamage(1);
      }
    }
    if (h2 && aabb(h2, p1.rect())) {
      // Check if P1 can parry P2's attack (no window restriction)
      if (p1.parrying && !p1.parryConsumed) {
        // Successful parry - no damage, stun attacker
        p1.parryConsumed = true;
        p1.parryFreezeTimer = 0.15;
        p2.stunTimer = 1.2;
        console.log(`[qte] P1 successfully parried P2's attack!`);
      } else if (!p1.parrying || p1.parryConsumed) {
        // No parry or parry already consumed - take damage
        p1.takeDamage(1);
      }
    }

    for (const pr of projectiles) {
      if (!pr.alive) continue;
      if (pr.owner !== p1 && aabb(pr.rect(), p1.rect())) {
        // Check if P1 can parry the projectile (no window restriction)
        if (p1.parrying && !p1.parryConsumed) {
          // Successful parry - no damage, stun attacker
          p1.parryConsumed = true;
          p1.parryFreezeTimer = 0.15;
          pr.owner.stunTimer = 1.2;
          pr.alive = false;
          console.log(`[qte] P1 successfully parried P2's projectile!`);
        } else if (!p1.parrying || p1.parryConsumed) {
          // No parry or parry already consumed - take damage
          p1.takeDamage(1);
          pr.alive = false;
        }

        // Create blast effect
        let blastImage = null;
        let blastRects = null;
        let blastFrames = 4;

        if (globalAtlas2 && globalAtlas2.animations.blast) {
          blastImage = globalAtlas2.image;
          blastRects = globalAtlas2.animations.blast.frames;
          blastFrames = globalAtlas2.animations.blast.frames.length;
        }

        blasts.push(
          new Blast(
            p1.x + p1.w * 0.5,
            p1.y + p1.h * 0.5,
            P2_BLAST_SRC,
            blastFrames,
            blastImage,
            blastRects
          )
        );
      }
      if (pr.owner !== p2 && aabb(pr.rect(), p2.rect())) {
        // Check if P2 can parry the projectile (no window restriction)
        if (p2.parrying && !p2.parryConsumed) {
          // Successful parry - no damage, stun attacker
          p2.parryConsumed = true;
          p2.parryFreezeTimer = 0.15;
          pr.owner.stunTimer = 1.2;
          pr.alive = false;
          console.log(`[qte] P2 successfully parried P1's projectile!`);
        } else if (!p2.parrying || p2.parryConsumed) {
          // No parry or parry already consumed - take damage
          p2.takeDamage(1);
          pr.alive = false;
        }

        // Create blast effect
        let blastImage = null;
        let blastRects = null;
        let blastFrames = 4;

        if (globalAtlas1 && globalAtlas1.animations.blast) {
          blastImage = globalAtlas1.image;
          blastRects = globalAtlas1.animations.blast.frames;
          blastFrames = globalAtlas1.animations.blast.frames.length;
        }

        blasts.push(
          new Blast(
            p2.x + p2.w * 0.5,
            p2.y + p2.h * 0.5,
            P1_BLAST_SRC,
            blastFrames,
            blastImage,
            blastRects
          )
        );
      }
    }

    // auto-defeat and game over logic
    if (p1.isDefeated() && p1.state !== "defeat") {
      p1.state = "defeat";
      p1.attacking = false;
      p1.parrying = false;
      p1.ranging = false;
      p1.vx = 0;
      p1.vy = 0;
      p1.anim.setState("defeat");
      gameOver = true;
      winner = p2;
      console.log(`[qte] P1 DEFEATED! P2 WINS!`);
    }
    if (p2.isDefeated() && p2.state !== "defeat") {
      p2.state = "defeat";
      p2.attacking = false;
      p2.parrying = false;
      p2.ranging = false;
      p2.vx = 0;
      p2.vy = 0;
      p2.anim.setState("defeat");
      gameOver = true;
      winner = p1;
      console.log(`[qte] P2 DEFEATED! P1 WINS!`);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  function aabb(a, b) {
    return !(
      a.x + a.w < b.x ||
      b.x + b.w < a.x ||
      a.y + a.h < b.y ||
      b.y + b.h < a.y
    );
  }

  function drawHealthBar(ctx, x, y, currentHp, maxHp, color, playerName) {
    const barWidth = 80;
    const barHeight = 20;
    const heartSize = 16;
    const heartSpacing = 20;

    // Background
    ctx.fillStyle = "#333";
    ctx.fillRect(x, y, barWidth, barHeight);

    // Health bar
    const healthPercent = currentHp / maxHp;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth * healthPercent, barHeight);

    // Border
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, barWidth, barHeight);

    // Player name
    ctx.fillStyle = "#fff";
    ctx.font = "12px Arial";
    ctx.fillText(playerName, x, y - 5);

    // Hearts
    for (let i = 0; i < maxHp; i++) {
      const heartX = x + i * heartSpacing;
      const heartY = y + barHeight + 5;

      if (i < currentHp) {
        // Full heart
        ctx.fillStyle = "#ff4444";
        drawHeart(ctx, heartX, heartY, heartSize);
      } else {
        // Empty heart
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 2;
        drawHeartOutline(ctx, heartX, heartY, heartSize);
      }
    }
  }

  function drawHeart(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y + size);
    ctx.bezierCurveTo(x, y + size, x, y + size / 2, x + size / 2, y + size / 2);
    ctx.bezierCurveTo(
      x + size,
      y + size / 2,
      x + size,
      y + size,
      x + size / 2,
      y + size
    );
    ctx.bezierCurveTo(x + size, y + size / 2, x + size, y, x + size / 2, y);
    ctx.bezierCurveTo(x, y, x, y + size / 2, x + size / 2, y + size / 2);
    ctx.fill();
  }

  function drawHeartOutline(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y + size);
    ctx.bezierCurveTo(x, y + size, x, y + size / 2, x + size / 2, y + size / 2);
    ctx.bezierCurveTo(
      x + size,
      y + size / 2,
      x + size,
      y + size,
      x + size / 2,
      y + size
    );
    ctx.bezierCurveTo(x + size, y + size / 2, x + size, y, x + size / 2, y);
    ctx.bezierCurveTo(x, y, x, y + size / 2, x + size / 2, y + size / 2);
    ctx.stroke();
  }

  function drawParryIndicator(
    ctx,
    x,
    y,
    currentTimer,
    totalDuration,
    windowLength,
    color
  ) {
    const barWidth = 60;
    const barHeight = 8;

    // Background
    ctx.fillStyle = "#333";
    ctx.fillRect(x - barWidth / 2, y, barWidth, barHeight);

    // Progress bar
    const progress = (totalDuration - currentTimer) / totalDuration;
    ctx.fillStyle = color;
    ctx.fillRect(x - barWidth / 2, y, barWidth * progress, barHeight);

    // Parry window indicator
    const windowStart = (totalDuration - windowLength) / totalDuration;
    const windowEnd = 1.0;
    const windowX = x - barWidth / 2 + barWidth * windowStart;
    const windowW = barWidth * (windowEnd - windowStart);

    ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
    ctx.fillRect(windowX, y, windowW, barHeight);

    // Border
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - barWidth / 2, y, barWidth, barHeight);

    // "PARRY" text
    ctx.fillStyle = "#fff";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PARRY", x, y - 5);
    ctx.textAlign = "left";
  }

  function drawIntroScreen(ctx, width, height, pulse) {
    // Semi-transparent overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, width, height);

    // Pulsating "READY" text
    const pulseScale = 1 + Math.sin(pulse) * 0.2;
    const alpha = 0.7 + Math.sin(pulse) * 0.3;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(pulseScale, pulseScale);

    // Ready text with glow effect
    ctx.shadowColor = "#4aa3ff";
    ctx.shadowBlur = 20;
    ctx.fillStyle = `rgba(74, 163, 255, ${alpha})`;
    ctx.font = "bold 72px Arial";
    ctx.textAlign = "center";
    ctx.fillText("READY", 0, -20);

    // Subtitle
    ctx.shadowBlur = 10;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.font = "24px Arial";
    ctx.fillText("Press any key to start", 0, 40);

    ctx.restore();

    // Player indicators
    ctx.fillStyle = "rgba(74, 163, 255, 0.8)";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";
    ctx.fillText("P1 (Blue)", 50, 100);

    ctx.fillStyle = "rgba(255, 122, 122, 0.8)";
    ctx.textAlign = "right";
    ctx.fillText("P2 (Red)", width - 50, 100);

    // Controls hint
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      "WASD + E/R/T vs Arrow Keys + Num1/2/3",
      width / 2,
      height - 50
    );

    // Reset text alignment
    ctx.textAlign = "left";
  }

  function drawGameOverScreen(ctx, width, height, winner) {
    // Semi-transparent overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, width, height);

    // Victory text
    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", width / 2, height / 2 - 60);

    // Winner text
    ctx.fillStyle = winner.color;
    ctx.font = "bold 36px Arial";
    ctx.fillText(`${winner.name} WINS!`, width / 2, height / 2);

    // Restart instruction
    ctx.fillStyle = "#ccc";
    ctx.font = "24px Arial";
    ctx.fillText("Press F5 to restart", width / 2, height / 2 + 60);

    // Reset text alignment
    ctx.textAlign = "left";
  }

  return { ctx, p1, p2 };
}
