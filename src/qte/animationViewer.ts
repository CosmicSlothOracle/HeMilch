// Animation Viewer Modal for QTE System
import { SpriteAnimator } from "./spriteAnimator";
import { loadAtlas } from "./atlasLoader";

export interface AnimationInfo {
  name: string;
  character: string;
  frames: number;
  fps: number;
  loop: boolean;
}

export class AnimationViewer {
  private modal!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private currentAnimationIndex = 0;
  private animations: AnimationInfo[] = [];
  private animators: Map<string, SpriteAnimator> = new Map();
  private availableCharacters: string[] = [];
  private atlasCanvas!: HTMLCanvasElement;
  private atlasCtx!: CanvasRenderingContext2D;
  private timelineCanvas!: HTMLCanvasElement;
  private timelineCtx!: CanvasRenderingContext2D;
  private isVisible = false;
  private animationId: number | null = null;
  private currentCharacter = "ninja";
  private characterSelect!: HTMLSelectElement;
  private frameSequencer!: HTMLInputElement;
  private frameSequencerLabel!: HTMLElement;
  private isPlaying = true;
  private currentFrame = 0;

  constructor() {
    this.createModal();
    this.setupEventListeners();
    // Discover available atlas directories and populate select, then load animations
    this.populateCharacterSelect().then(() => this.loadAnimations());
  }

  private createModal() {
    // Create modal container
    this.modal = document.createElement('div');
    this.modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      z-index: 10000;
      font-family: Arial, sans-serif;
    `;

    // Create modal content - use full screen
    const content = document.createElement('div');
    content.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #1a1a1a;
      border: none;
      border-radius: 0;
      padding: 20px;
      overflow: auto;
      display: flex;
      flex-direction: column;
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid #333;
      padding-bottom: 10px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'QTE Animation Viewer';
    title.style.cssText = `
      color: #fff;
      margin: 0;
      font-size: 24px;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 4px;
      width: 30px;
      height: 30px;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.onclick = () => this.hide();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Create character selector
    const characterSelector = document.createElement('div');
    characterSelector.style.cssText = `
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
    `;

    const characterLabel = document.createElement('label');
    characterLabel.textContent = 'Character:';
    characterLabel.style.cssText = 'color: #fff; font-weight: bold;';

    this.characterSelect = document.createElement('select');
    const characterSelect = this.characterSelect;
    characterSelect.style.cssText = `
      background: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 14px;
    `;
    // Initially populate with a placeholder while discovery runs
    characterSelect.innerHTML = `<option value="">(discovering...)</option>`;
    characterSelect.onchange = (e) => {
      this.currentCharacter = (e.target as HTMLSelectElement).value;
      this.loadAnimations();
      this.currentAnimationIndex = 0;
      this.updateDisplay();
    };

    characterSelector.appendChild(characterLabel);
    characterSelector.appendChild(characterSelect);

    // Create animation display area
    const displayArea = document.createElement('div');
    displayArea.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    `;

    // Create canvas for animation - much larger for full screen
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 512;
    this.canvas.style.cssText = `
      border: 2px solid #555;
      border-radius: 4px;
      background: #000;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
      width: 512px;
      height: 512px;
    `;
    this.ctx = this.canvas.getContext('2d')!;

    // Create animation info display
    const infoDisplay = document.createElement('div');
    infoDisplay.id = 'animation-info';
    infoDisplay.style.cssText = `
      color: #fff;
      text-align: center;
      font-size: 16px;
      min-height: 60px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    `;

    // Create navigation controls
    const controls = document.createElement('div');
    controls.style.cssText = `
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: center;
    `;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '◀ Previous';
    prevBtn.style.cssText = `
      background: #444;
      color: white;
      border: 1px solid #666;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
    `;
    prevBtn.onclick = () => this.previousAnimation();

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next ▶';
    nextBtn.style.cssText = `
      background: #444;
      color: white;
      border: 1px solid #666;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
    `;
    nextBtn.onclick = () => this.nextAnimation();

    const playPauseBtn = document.createElement('button');
    playPauseBtn.id = 'play-pause-btn';
    playPauseBtn.textContent = '⏸ Pause';
    playPauseBtn.style.cssText = `
      background: #0066cc;
      color: white;
      border: 1px solid #0088ff;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
    `;
    playPauseBtn.onclick = () => this.togglePlayPause();

    // Create frame sequencer
    const frameSequencerContainer = document.createElement('div');
    frameSequencerContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      margin: 0 20px;
    `;

    this.frameSequencerLabel = document.createElement('div');
    this.frameSequencerLabel.style.cssText = `
      color: #fff;
      font-size: 12px;
      font-weight: bold;
    `;
    this.frameSequencerLabel.textContent = 'Frame: 0/0';

    this.frameSequencer = document.createElement('input');
    this.frameSequencer.type = 'range';
    this.frameSequencer.min = '0';
    this.frameSequencer.max = '0';
    this.frameSequencer.value = '0';
    this.frameSequencer.style.cssText = `
      width: 200px;
      height: 20px;
      background: #333;
      outline: none;
      border-radius: 10px;
    `;
    this.frameSequencer.oninput = () => this.onFrameSequencerChange();

    frameSequencerContainer.appendChild(this.frameSequencerLabel);
    frameSequencerContainer.appendChild(this.frameSequencer);

    controls.appendChild(prevBtn);
    controls.appendChild(playPauseBtn);
    controls.appendChild(frameSequencerContainer);
    controls.appendChild(nextBtn);

    // Create animation list - make it scrollable in full screen
    const animationList = document.createElement('div');
    animationList.id = 'animation-list';
    animationList.style.cssText = `
      margin-top: 20px;
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #333;
      border-radius: 4px;
      background: #222;
      flex: 1;
    `;

    displayArea.appendChild(this.canvas);
    displayArea.appendChild(infoDisplay);
    displayArea.appendChild(controls);
    // Add atlas preview area (shows atlas and timeline)
    const previewWrap = document.createElement('div');
    previewWrap.style.cssText = `
      display: flex;
      gap: 12px;
      align-items: center;
      margin-top: 10px;
    `;

    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = 400;
    this.atlasCanvas.height = 400;
    this.atlasCanvas.style.cssText = `
      border: 1px solid #333;
      background: #000;
      image-rendering: pixelated;
      width: 400px;
      height: 400px;
    `;
    this.atlasCtx = this.atlasCanvas.getContext('2d')!;

    this.timelineCanvas = document.createElement('canvas');
    this.timelineCanvas.width = 500;
    this.timelineCanvas.height = 60;
    this.timelineCanvas.style.cssText = `
      border: 1px solid #333;
      background: #111;
      width: 500px;
      height: 60px;
    `;
    this.timelineCtx = this.timelineCanvas.getContext('2d')!;

    previewWrap.appendChild(this.atlasCanvas);
    previewWrap.appendChild(this.timelineCanvas);

    displayArea.appendChild(previewWrap);
    displayArea.appendChild(animationList);

    content.appendChild(header);
    content.appendChild(characterSelector);
    content.appendChild(displayArea);
    this.modal.appendChild(content);
    document.body.appendChild(this.modal);
  }

  // Try to discover atlas directories by fetching the /qte/ index and extracting links.
  // Falls back to a small known list if discovery fails.
  private async discoverAtlasDirectories(): Promise<string[]> {
    // Prefer explicit index file if present
    try {
      const res = await fetch('/qte/atlas_index.json');
      if (res.ok) {
        const idx = await res.json();
        if (idx && idx.characters) return Object.keys(idx.characters);
      }
    } catch (e) {
      console.debug('[AnimationViewer] atlas_index.json not found or invalid, falling back to directory scan', e);
    }

    const knownFallback = ['ninja', 'cyboard', 'granny', 'Laurin'];
    try {
      const res = await fetch('/qte/');
      if (!res.ok) return knownFallback;
      const text = await res.text();
      // Extract hrefs from the returned HTML
      const hrefRe = /href\s*=\s*"([^"']+)"/g;
      const dirs = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = hrefRe.exec(text)) !== null) {
        const href = m[1];
        // Accept relative directory links like "granny/" or "/qte/granny/"
        const dirMatch = /(?:\/qte\/)?([^\/]+)\/?$/.exec(href);
        if (dirMatch) {
          const candidate = dirMatch[1];
          // simple filter: ignore files with extensions
          if (!/\.[a-zA-Z0-9]{1,5}$/.test(candidate)) {
            dirs.add(candidate);
          }
        }
      }

      const out = Array.from(dirs).filter(Boolean);
      return out.length ? out : knownFallback;
    } catch (e) {
      console.warn('[AnimationViewer] discoverAtlases failed, using fallback', e);
      return knownFallback;
    }
  }

  private async populateCharacterSelect() {
    const select = this.characterSelect;
    select.innerHTML = '';
    const dirs = await this.discoverAtlasDirectories();
    dirs.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      select.appendChild(opt);
    });
    // Set currentCharacter if present in discovered list
    if (dirs.includes(this.currentCharacter)) {
      select.value = this.currentCharacter;
    } else if (dirs.length > 0) {
      this.currentCharacter = dirs[0];
      select.value = this.currentCharacter;
    }
  }

  private setupEventListeners() {
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!this.isVisible) return;

      switch (e.key) {
        case 'Escape':
          this.hide();
          break;
        case 'ArrowLeft':
          this.previousAnimation();
          break;
        case 'ArrowRight':
          this.nextAnimation();
          break;
        case ' ':
          e.preventDefault();
          this.togglePlayPause();
          break;
      }
    });
  }

  private async loadAnimations() {
    try {
      console.log(`[AnimationViewer] Loading animations for ${this.currentCharacter}`);
      // Load all available atlases for current character
      const atlases = await this.loadAllAtlasesForCharacter(this.currentCharacter);
      console.log(`[AnimationViewer] Atlas loaded:`, {
        atlasCount: atlases.length,
        totalAnimations: atlases.reduce((sum, a) => sum + Object.keys(a.animations || {}).length, 0)
      });

      // Clear previous animations
      this.animations = [];
      this.animators.clear();

      // Process all loaded atlases
      for (const atlas of atlases) {
        this.processAtlas(atlas);
      }

      console.log(`[AnimationViewer] Total animations loaded: ${this.animations.length}`);
      this.updateAnimationList();
      this.updateDisplay();
    } catch (error) {
      console.error('Failed to load animations:', error);
    }
  }

  // Load all atlas files for a character (e.g., atlas4.json + atlas4_1.json for Laurin)
  private async loadAllAtlasesForCharacter(character: string): Promise<any[]> {
    const atlases: any[] = [];

    // Try to load atlas_index.json first to get exact filenames
    try {
      const res = await fetch('/qte/atlas_index.json');
      if (res.ok) {
        const index = await res.json();
        if (index.characters && index.characters[character]) {
          const jsonFiles = index.characters[character].json || [];
          for (const jsonFile of jsonFiles) {
            try {
              const atlas = await loadAtlas(`/qte/${character}/${jsonFile.replace('.json', '')}`);
              atlases.push(atlas);
              console.log(`[AnimationViewer] Loaded ${character}/${jsonFile}`);
            } catch (e) {
              console.warn(`[AnimationViewer] Failed to load ${character}/${jsonFile}:`, e);
            }
          }
          return atlases;
        }
      }
    } catch (e) {
      console.debug('[AnimationViewer] atlas_index.json not available, using fallback');
    }

    // Fallback: try common atlas filenames
    const candidates = ['atlas.json', 'atlas2.json', 'atlas3.json', 'atlas4.json', 'atlas4_1.json', 'Atlas.json'];
    for (const candidate of candidates) {
      try {
        const atlas = await loadAtlas(`/qte/${character}/${candidate.replace('.json', '')}`);
        atlases.push(atlas);
        console.log(`[AnimationViewer] Loaded ${character}/${candidate}`);
      } catch (e) {
        // Silently skip failed candidates
      }
    }

    return atlases;
  }

  // Process a single atlas and add its animations to the viewer
  private processAtlas(atlas: any) {
    const animNames = Object.keys(atlas.animations || {}).sort();

    // If no animations entry exists, attempt to infer from frames
    if (animNames.length === 0 && atlas.frames) {
      console.log('[AnimationViewer] No explicit animations array in atlas.json — using inferred states from frames.');
      animNames.push(...Object.keys(atlas.animations || {}).sort());
    }

    // Create animator per animation name
    for (const name of animNames) {
      const animData = atlas.animations[name];
      const framesCount = animData ? animData.frames.length : 0;
      if (framesCount === 0) {
        console.log(`[AnimationViewer] Skipping ${name} — no frames`);
        continue;
      }

      const fps = (animData && animData.fps) ? animData.fps : (atlas.meta?.fps || 12);
      const loop = (animData && typeof animData.loop === 'boolean') ? animData.loop : true;

      const animationInfo: AnimationInfo = {
        name,
        character: this.currentCharacter,
        frames: framesCount,
        fps,
        loop
      };

      const animator = new SpriteAnimator(atlas.image, atlas.frameW || 256, atlas.frameH || 256, {
        [name]: {
          src: '',
          frames: framesCount,
          fps,
          loop,
          frameW: atlas.frameW || 256,
          frameH: atlas.frameH || 256,
          rects: animData ? animData.frames : [],
          image: atlas.image,
          imageLoaded: true,
          imageBroken: false
        }
      });

      // Ensure animator internal data is consistent with atlas
      const animDef = animator.animations[name];
      if (animData) {
        animDef.rects = animData.frames;
        animDef.frames = animData.frames.length;
      }
      animDef.image = atlas.image;
      (animDef as any).imageLoaded = true;
      (animDef as any).imageBroken = false;

      this.animations.push(animationInfo);
      this.animators.set(name, animator);
      console.log(`[AnimationViewer] Registered animation '${name}' (${framesCount} frames)`);
    }

    // Also, offer a flat view of any single frames not grouped by animations
    if (atlas.frames) {
      const loneFrames: string[] = Object.keys(atlas.frames).filter(k => !k.includes('_'));
      if (loneFrames.length > 0) {
        const name = '__frames__';
        const framesList = loneFrames.map(k => {
          const f = atlas.frames![k].frame;
          return { x: f.x, y: f.y, w: f.w, h: f.h };
        });
        const animationInfo: AnimationInfo = { name, character: this.currentCharacter, frames: framesList.length, fps: atlas.meta?.fps || 12, loop: true };
        const animator = new SpriteAnimator(atlas.image, atlas.frameW || 256, atlas.frameH || 256, {
          [name]: { src: '', frames: framesList.length, fps: atlas.meta?.fps || 12, loop: true, frameW: atlas.frameW || 256, frameH: atlas.frameH || 256, rects: framesList, image: atlas.image, imageLoaded: true, imageBroken: false }
        });
        const animDef = animator.animations[name];
        animDef.rects = framesList;
        animDef.frames = framesList.length;
        animDef.image = atlas.image;
        (animDef as any).imageLoaded = true;
        (animDef as any).imageBroken = false;
        this.animations.push(animationInfo);
        this.animators.set(name, animator);
        console.log(`[AnimationViewer] Added lone frames view with ${framesList.length} frames`);
      }
    }
  }

  private updateAnimationList() {
    const list = document.getElementById('animation-list');
    if (!list) return;

    list.innerHTML = '';

    this.animations.forEach((anim, index) => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid #333;
        color: #fff;
        font-size: 14px;
        transition: background-color 0.2s;
      `;

      if (index === this.currentAnimationIndex) {
        item.style.backgroundColor = '#0066cc';
      }

      item.innerHTML = `
        <div style="font-weight: bold;">${anim.name}</div>
        <div style="font-size: 12px; color: #aaa;">
          ${anim.frames} frames • ${anim.fps} fps • ${anim.loop ? 'Loop' : 'Once'}
        </div>
      `;

      item.onclick = () => {
        this.currentAnimationIndex = index;
        this.updateDisplay();
        this.updateAnimationList();
      };

      item.onmouseenter = () => {
        if (index !== this.currentAnimationIndex) {
          item.style.backgroundColor = '#444';
        }
      };

      item.onmouseleave = () => {
        if (index !== this.currentAnimationIndex) {
          item.style.backgroundColor = 'transparent';
        }
      };

      list.appendChild(item);
    });
  }

  private updateDisplay() {
    if (this.animations.length === 0) return;

    const currentAnim = this.animations[this.currentAnimationIndex];
    const animator = this.animators.get(currentAnim.name);

    if (!animator) return;

    // Set the animation state
    animator.setState(currentAnim.name);

    // Update frame sequencer
    this.frameSequencer.max = String(currentAnim.frames - 1);
    this.frameSequencer.value = String(this.currentFrame);
    this.frameSequencerLabel.textContent = `Frame: ${this.currentFrame + 1}/${currentAnim.frames}`;

    // Update info display
    const infoDisplay = document.getElementById('animation-info');
    if (infoDisplay) {
      infoDisplay.innerHTML = `
        <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">
          ${currentAnim.name.toUpperCase()}
        </div>
        <div style="font-size: 14px; color: #aaa;">
          ${currentAnim.character} • ${currentAnim.frames} frames • ${currentAnim.fps} fps • ${currentAnim.loop ? 'Looping' : 'Single play'}
        </div>
      `;
    }

    // Start animation loop if not already running
    if (!this.animationId && this.isPlaying) {
      this.startAnimationLoop();
    }

    // Update atlas preview and timeline
    this.updateAtlasPreview(currentAnim.name);
  }

  // Draw atlas preview: render the entire atlas scaled down and highlight current frame rect
  private updateAtlasPreview(animName: string) {
    const animator = this.animators.get(animName);
    if (!animator) {
      this.atlasCtx.fillStyle = '#000';
      this.atlasCtx.fillRect(0, 0, this.atlasCanvas.width, this.atlasCanvas.height);
      this.timelineCtx.fillStyle = '#111';
      this.timelineCtx.fillRect(0, 0, this.timelineCanvas.width, this.timelineCanvas.height);
      return;
    }

    const def = animator.animations[animName];
    const img = def.image;
    if (!img) return;

    // Fit full atlas into atlasCanvas
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const dw = this.atlasCanvas.width;
    const dh = this.atlasCanvas.height;
    const scale = Math.min(dw / sw, dh / sh);
    const drawW = sw * scale;
    const drawH = sh * scale;
    const ox = (dw - drawW) / 2;
    const oy = (dh - drawH) / 2;

    this.atlasCtx.clearRect(0, 0, dw, dh);
    this.atlasCtx.drawImage(img, 0, 0, sw, sh, ox, oy, drawW, drawH);

    // Draw frame rects overlay
    const rects = def.rects || [];
    rects.forEach((r, idx) => {
      const x = ox + r.x * scale;
      const y = oy + r.y * scale;
      const w = r.w * scale;
      const h = r.h * scale;
      this.atlasCtx.strokeStyle = idx === animator.frame ? 'rgba(0,255,128,0.9)' : 'rgba(255,255,255,0.15)';
      this.atlasCtx.lineWidth = idx === animator.frame ? 2 : 1;
      this.atlasCtx.strokeRect(x, y, w, h);
      if (idx === animator.frame) {
        // draw index label
        this.atlasCtx.fillStyle = 'rgba(0,255,128,0.9)';
        this.atlasCtx.font = '12px monospace';
        this.atlasCtx.fillText(String(idx), x + 2, y + 12);
      }
    });

    // Draw timeline showing frame positions over time
    const tctx = this.timelineCtx;
    const tw = this.timelineCanvas.width;
    const th = this.timelineCanvas.height;
    tctx.clearRect(0, 0, tw, th);
    tctx.fillStyle = '#111';
    tctx.fillRect(0, 0, tw, th);

    const total = rects.length || def.frames || 1;
    const fps = def.fps || 12;
    const frameWpx = tw / total;
    for (let i = 0; i < total; i++) {
      const x = i * frameWpx;
      tctx.fillStyle = i === animator.frame ? '#00ff80' : '#444';
      tctx.fillRect(x, 0, Math.max(1, frameWpx - 2), th - 1);
      tctx.fillStyle = '#ccc';
      tctx.font = '10px monospace';
      tctx.fillText(String(i), x + 2, th - 6);
    }
  }

  private startAnimationLoop() {
    const animate = (timestamp: number) => {
      if (!this.isVisible || !this.isPlaying) {
        this.animationId = null;
        return;
      }

      const currentAnim = this.animations[this.currentAnimationIndex];
      const animator = this.animators.get(currentAnim.name);

      if (animator) {
        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, 512, 512);

        // Update and draw animation
        animator.update(1/60); // Assume 60fps
        animator.draw(this.ctx, 0, 0, 512, 512);

        // Update current frame for sequencer
        this.currentFrame = animator.frame;
        this.frameSequencer.value = String(this.currentFrame);
        this.frameSequencerLabel.textContent = `Frame: ${this.currentFrame + 1}/${currentAnim.frames}`;
      } else {
        // Debug: draw a red box if no animator
        this.ctx.fillStyle = '#ff0000';
        this.ctx.fillRect(0, 0, 512, 512);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText('No animator found', 10, 30);
      }

      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  private previousAnimation() {
    if (this.animations.length === 0) return;
    this.currentAnimationIndex = (this.currentAnimationIndex - 1 + this.animations.length) % this.animations.length;
    this.updateDisplay();
    this.updateAnimationList();
  }

  private nextAnimation() {
    if (this.animations.length === 0) return;
    this.currentAnimationIndex = (this.currentAnimationIndex + 1) % this.animations.length;
    this.updateDisplay();
    this.updateAnimationList();
  }

  private togglePlayPause() {
    const btn = document.getElementById('play-pause-btn');
    if (!btn) return;

    this.isPlaying = !this.isPlaying;

    if (this.isPlaying) {
      // Play
      this.startAnimationLoop();
      btn.textContent = '⏸ Pause';
      btn.style.background = '#cc6600';
    } else {
      // Pause
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      btn.textContent = '▶ Play';
      btn.style.background = '#0066cc';
    }
  }

  private onFrameSequencerChange() {
    if (!this.isPlaying) {
      const frameIndex = parseInt(this.frameSequencer.value);
      this.currentFrame = frameIndex;

      const currentAnim = this.animations[this.currentAnimationIndex];
      const animator = this.animators.get(currentAnim.name);

      if (animator) {
        // Manually set frame
        animator.frame = frameIndex;

        // Clear canvas and draw current frame
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, 512, 512);
        animator.draw(this.ctx, 0, 0, 512, 512);

        // Update label
        this.frameSequencerLabel.textContent = `Frame: ${frameIndex + 1}/${currentAnim.frames}`;

        // Update atlas preview
        this.updateAtlasPreview(currentAnim.name);
      }
    }
  }

  public show() {
    this.isVisible = true;
    this.modal.style.display = 'block';
    this.currentFrame = 0;
    this.updateDisplay();
  }

  public hide() {
    this.isVisible = false;
    this.modal.style.display = 'none';
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  public toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
}

// Global instance
let animationViewer: AnimationViewer | null = null;

export function getAnimationViewer(): AnimationViewer {
  if (!animationViewer) {
    animationViewer = new AnimationViewer();
  }
  return animationViewer;
}

// Add global function for easy access
(window as any).showAnimationViewer = () => getAnimationViewer().show();
(window as any).hideAnimationViewer = () => getAnimationViewer().hide();
(window as any).toggleAnimationViewer = () => getAnimationViewer().toggle();
