import { createKeyboardListener, readGamepadsUnified, P1_KEYS, P2_KEYS } from "./input";
import { buildSpriteConfig, P1_BLAST_SRC, P2_BLAST_SRC, CHARACTERS, getCharacterConfig } from "./assetRegistry";
import { loadAtlas } from "./atlasLoader";
import { Fighter, Projectile, Blast } from "./fighter";
import { getAnimationViewer } from "./animationViewer";
import { SpriteAnimator } from "./spriteAnimator";
import { SimpleAI, NPCController } from "./simpleAi";

// Game states
enum GameState {
  CHARACTER_SELECTION = "character_selection",
  GAME = "game"
}

export function createGame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  // Make canvas fill the viewport while keeping logical coordinates in CSS pixels.
  let WIDTH = window.innerWidth;
  let HEIGHT = window.innerHeight;
  const DPR = window.devicePixelRatio || 1;
  function updateCanvasSize() {
    WIDTH = window.innerWidth;
    HEIGHT = window.innerHeight;
    canvas.style.width = WIDTH + 'px';
    canvas.style.height = HEIGHT + 'px';
    canvas.width = Math.max(1, Math.floor(WIDTH * DPR));
    canvas.height = Math.max(1, Math.floor(HEIGHT * DPR));
    // scale drawing so 1 unit == 1 CSS pixel
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  updateCanvasSize();
  window.addEventListener('resize', updateCanvasSize);
  // Debug: log when this module is actually instantiated so we can confirm if the rebuilt module is loaded
  // Visible in the browser console immediately after page load
  console.log(`[qte] createGame initialized ${JSON.stringify({ WIDTH, HEIGHT })}`);

  // Game state management
  let currentState: GameState = GameState.CHARACTER_SELECTION;
  let selectedCharacters: { p1: string | null; p2: string | null } = { p1: null, p2: null };
  let currentPlayerSelecting: 1 | 2 = 1;
  let characterSelectionIndex = 0;

  function clamp(v: number, min: number, max: number) {
    return v < min ? min : v > max ? max : v;
  }

  const input = createKeyboardListener(canvas);
  // track previous held keys to detect edge (keydown) events for one-shot actions
  const prevHeldInput: Record<string, boolean> = {};

  // Character selection state
  let characterSelectionAnimator: SpriteAnimator | null = null;
  let characterSelectionAtlas: any = null;
  let spawnAnimationComplete = false;
  let lastInputTime = 0;
  const INPUT_DEBOUNCE = 200; // ms

  // Create animation viewer button
  const animationViewerBtn = document.createElement('button');
  animationViewerBtn.textContent = '🎬 View Animations';
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
  animationViewerBtn.onclick = () => getAnimationViewer().show();
  document.body.appendChild(animationViewerBtn);

  // Singleplayer (Laurin) quick-launch button
  const singleplayerBtn = document.createElement('button');
  singleplayerBtn.textContent = '🎯 Singleplayer (Laurin)';
  singleplayerBtn.style.cssText = `
    position: fixed;
    top: 50px;
    left: 10px;
    z-index: 1000;
    background: #10b981;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  `;
  singleplayerBtn.onclick = () => {
    try {
      console.log(`[DEBUG] Singleplayer button clicked! Setting up Laurin vs Cyboard...`);
      // Start singleplayer using the same initialization path as PvP so
      // atlas loading/patching and animator setup are identical to the
      // functioning PvP code path.
      selectedCharacters.p1 = 'laurin';
      // spawn a cyboard NPC as P2 to reuse the same game initialization
      // and patching logic used in PvP mode.
      selectedCharacters.p2 = 'cyboard';
      // Enable the SimpleAI for P2 in singleplayer so the NPC will patrol the platform
      // and behave like the PvP opponent.
      useAIForP2 = true;
      console.log(`[DEBUG] useAIForP2 set to: ${useAIForP2}`);
      currentState = GameState.GAME;
      initializeGame();
    } catch (e) { console.error('[DEBUG] Error in singleplayer setup:', e); }
  };
  document.body.appendChild(singleplayerBtn);

  // Test button to trigger section 2 (for Granny NPC testing)
  const testSection2Btn = document.createElement('button');
  testSection2Btn.textContent = '🧪 Test Section 2 (Granny)';
  testSection2Btn.style.cssText = `
    position: fixed;
    top: 90px;
    left: 10px;
    z-index: 1000;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  `;
  testSection2Btn.onclick = () => {
    if (currentState === GameState.GAME && !transitioning) {
      console.log('[qte] Test: Triggering transition to section 2 for Granny NPC test');
      startSectionTransition(2, 'right');
    } else {
      console.log('[qte] Test: Cannot trigger section transition - game not running or already transitioning');
    }
  };
  document.body.appendChild(testSection2Btn);

  // Simple AI state (toggle) - declared once
  let simpleAi: any = null;
  let useAIForP2 = false; // toggled by UI (default: human)
  let npcController: any = null; // singleplayer NPC controller

  // Helper: detect if running in any singleplayer mode (NPC controller or simple AI)
  function isSingleplayerMode() {
    return !!npcController || !!simpleAi || !!useAIForP2;
  }

  // AI toggle UI (visible during character selection)
  const aiToggleContainer = document.createElement('div');
  aiToggleContainer.style.cssText = `position: fixed; top: 50px; right: 10px; z-index:1000; color: white;`;
  const aiLabel = document.createElement('label');
  aiLabel.style.cssText = 'font-family: Arial; font-size: 14px; display: flex; align-items: center; gap:8px;';
  const aiCheckbox = document.createElement('input');
  aiCheckbox.type = 'checkbox';
  // initialize checked state based on variable below (will be set after declaration)
  aiCheckbox.checked = false;
  aiCheckbox.onchange = () => { useAIForP2 = !!aiCheckbox.checked; };
  aiLabel.appendChild(aiCheckbox);
  const aiText = document.createElement('span');
  aiText.textContent = 'Play vs AI (P2)';
  aiLabel.appendChild(aiText);
  aiToggleContainer.appendChild(aiLabel);
  document.body.appendChild(aiToggleContainer);

  // Game objects (will be initialized dynamically)
  let p1: Fighter | null = null;
  let p2: Fighter | null = null;

  // Additional NPCs
  let grannyNpc: Fighter | null = null;
  let grannyController: NPCController | null = null;
  // Stage definition for Smash-style play
  // Stage computed from current viewport size; platform stays centered near bottom.
  let stage = {
    bounds: { x: 0, y: 0, w: WIDTH, h: HEIGHT },
    // platforms are deprecated in favor of heatmap-based collision. keep empty.
    platforms: [] as { x: number; y: number; w: number; h: number }[],
    // vertical fall threshold unused for this stage; we consider only lateral outs
    fallThreshold: HEIGHT + 300,
  };
  // update stage when canvas size changes
  function updateStageForSize() {
    stage.bounds.w = WIDTH;
    stage.bounds.h = HEIGHT;
    // fall threshold remains viewport-based
    stage.fallThreshold = HEIGHT + 300;
    // platforms removed — main platform top is computed from heatmap at runtime

    // Update Granny's position if she's outside the new canvas bounds
    if (grannyNpc) {
      const wasOutside = grannyNpc.x > WIDTH || grannyNpc.y > HEIGHT;
      if (wasOutside) {
        console.log(`[qte] 🔄 Canvas resized - repositioning Granny from (${grannyNpc.x}, ${grannyNpc.y}) to fit new canvas ${WIDTH}x${HEIGHT}`);
        // Reposition Granny within new canvas bounds
        grannyNpc.x = Math.min(grannyNpc.x, WIDTH - 100);
        grannyNpc.y = Math.min(grannyNpc.y, HEIGHT - 200);
        console.log(`[qte] ✅ Granny repositioned to (${grannyNpc.x}, ${grannyNpc.y})`);
      }
    }
  }
  // Helper to map section coordinates (1920x1080) to canvas coordinates
  function mapSectionToCanvas(sectionX: number, sectionY: number): { x: number; y: number } {
    if (!sectionData || !sectionData.resolution) {
      // Fallback to old behavior if no section data
      return { x: sectionX, y: sectionY };
    }

    const [sectionW, sectionH] = sectionData.resolution;
    const canvasX = Math.floor((sectionX / sectionW) * WIDTH);
    const canvasY = Math.floor((sectionY / sectionH) * HEIGHT);
    return { x: canvasX, y: canvasY };
  }

  // Helper to compute a reasonable main platform top from the heatmap (fallbacks to fixed offset)
  function getMainPlatformTop(): number {
    try {
      if (heatmapCtx && heatmapCanvas && heatmapCanvas.width > 0 && stageImg && stageImg.naturalWidth > 0) {
        const imgW = stageImg.naturalWidth;
        const imgH = stageImg.naturalHeight;
        const canvasRatio = WIDTH / HEIGHT;
        const imgRatio = imgW / imgH;
        let sx = 0, sy = 0, sw = imgW, sh = imgH;
        if (imgRatio > canvasRatio) {
          sw = Math.round(imgH * canvasRatio);
          sx = Math.round((imgW - sw) * 0.5);
        } else {
          sh = Math.round(imgW / canvasRatio);
          sy = Math.round((imgH - sh) * 0.5);
        }

        const sampleX = Math.floor(sx + 0.5 * sw);
        // search downward from ~30% height to bottom for the first solid pixel
        const startY = Math.max(0, Math.floor(HEIGHT * 0.3));
        for (let cy = startY; cy < HEIGHT; cy++) {
          const srcY = Math.floor(sy + (cy / HEIGHT) * sh);
          if (srcY < 0 || srcY >= heatmapCanvas.height || sampleX < 0 || sampleX >= heatmapCanvas.width) continue;
          const d = heatmapCtx.getImageData(sampleX, srcY, 1, 1).data;
          // Enhanced solid detection: accept black, dark gray, or any non-transparent pixel
      // (original: only nearly-black pixels, now: any visible pixel is considered solid)
      const isSolid = d[3] > 128; // Any pixel with >50% opacity is solid
          if (isSolid) return cy;
        }
      }
    } catch (e) { /* ignore and fallback */ }
    return HEIGHT - 220;
  }

  // Helper: check heatmap solidity at a canvas coordinate (x,y)
  function isSolidAtCanvasPoint(canvasX: number, canvasY: number): boolean {
    try {
      if (!(heatmapCtx && heatmapCanvas && heatmapCanvas.width > 0 && stageImg && stageImg.naturalWidth > 0)) {
        console.warn('[qte][heatmap] isSolidAtCanvasPoint: heatmap not ready', {
          hasCtx: !!heatmapCtx,
          hasCanvas: !!heatmapCanvas,
          canvasW: heatmapCanvas?.width,
          hasImg: !!stageImg,
          imgW: stageImg?.naturalWidth
        });
        return false;
      }
      // Clamp canvas sampling coordinates to valid canvas range to avoid
      // accidental out-of-bounds mapping when entities sit slightly outside
      // the logical viewport due to rounding or spawn offsets.
      const safeCanvasX = Math.max(0, Math.min(WIDTH - 1, Math.floor(canvasX)));
      const safeCanvasY = Math.max(0, Math.min(HEIGHT - 1, Math.floor(canvasY)));
      const imgW = stageImg.naturalWidth;
      const imgH = stageImg.naturalHeight;
      const canvasRatio = WIDTH / HEIGHT;
      const imgRatio = imgW / imgH;
      let sx = 0, sy = 0, sw = imgW, sh = imgH;
      if (imgRatio > canvasRatio) {
        sw = Math.round(imgH * canvasRatio);
        sx = Math.round((imgW - sw) * 0.5);
      } else {
        sh = Math.round(imgW / canvasRatio);
        sy = Math.round((imgH - sh) * 0.5);
      }

      const srcX = Math.floor(sx + (safeCanvasX / WIDTH) * sw);
      const srcY = Math.floor(sy + (safeCanvasY / HEIGHT) * sh);
      // If mapped source coords fall outside the heatmap image, clamp into
      // range instead of treating as empty — this reduces false negatives
      // when sampling near image edges.
      const clampedSrcX = Math.max(0, Math.min(heatmapCanvas.width - 1, srcX));
      const clampedSrcY = Math.max(0, Math.min(heatmapCanvas.height - 1, srcY));
      const d = heatmapCtx.getImageData(clampedSrcX, clampedSrcY, 1, 1).data;
      // Enhanced solid detection: accept black, dark gray, or any non-transparent pixel
      // (original: only nearly-black pixels, now: any visible pixel is considered solid)
      const isSolid = d[3] > 128; // Any pixel with >50% opacity is solid

      // Debug logging removed to reduce spam

      return isSolid;
    } catch (e) {
      return false;
    }
  }
  // ensure stage reflects initial size
  updateStageForSize();
  const projectiles: Projectile[] = [];
  const blasts: Blast[] = [];
  // Game state

  // Game state
  let gameOver = false;
  let winner: Fighter | null = null;

  // Load section data and stage assets
  let sectionData: any = null;
  let stageImg = new Image();
  let stageForegroundImg = new Image(); // Cosmetic foreground overlay
  let heatmapImg = new Image();
  // Section management
  let currentSectionIdx = 1; // start in section_01
  let transitioning = false;
  let transitionPhase: 'fade_out' | 'fade_in' | null = null;
  let transitionOpacity = 0;
  let targetSectionIdx = 0;
  let pendingSectionPromise: Promise<void> | null = null;
  let pendingSectionData: any = null;
  let pendingAssetsPromise: Promise<void> | null = null;
  let assetsReadyForSwitch = false;
  let transitionDirection: 'right' | 'left' | null = null;
  const sectionCache: Record<number, any> = {};

  // Helpers to load/apply sections
  function sectionBasePath(idx: number) {
    const num = String(idx).padStart(2, '0');
    return `/levels/sidescroller/ninja_stage/sections/section_${num}`;
  }

  async function loadSectionDataFor(idx: number): Promise<any> {
    try {
      console.log(`[qte] Attempting to load section_${String(idx).padStart(2, '0')} data...`);
      const base = sectionBasePath(idx);
      const response = await fetch(`${base}/section.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      console.log('[qte] ✅ Loaded section data:', data);
      sectionCache[idx] = data;
      return data;
    } catch (e) {
      console.error('[qte] ❌ Failed to load section data:', e);
      const base = sectionBasePath(idx);
      console.log('[qte] Using fallback paths for section:', base);
      const fallback = { background: `${base}/stage.png`, heatmap: `${base}/heatmap.png`, spawn_points: null };
      sectionCache[idx] = fallback;
      return fallback;
    }
  }

  function applySectionAssets(data: any, idx?: number) {
    sectionData = data || null;
    try {
      if (data && data.background) stageImg.src = data.background;
      if (data && data.heatmap) heatmapImg.src = data.heatmap;
      // Load foreground overlay (cosmetic only)
      // Prefer an explicit `foreground` field if present. Otherwise derive
      // the foreground path from the provided background or fall back to
      // a section base path. This avoids using `currentSectionIdx` which
      // may still point to the previous section during preloads.
      let fgSrc: string | null = null;
      if (data && data.foreground) {
        fgSrc = String(data.foreground);
      } else if (data && data.background) {
        fgSrc = String(data.background).replace(/\/stage\.(png|jpg|jpeg|webp)$/i, '/stage_foreground.png');
      } else {
        const base = (typeof idx === 'number') ? sectionBasePath(idx) : sectionBasePath(currentSectionIdx);
        fgSrc = `${base}/stage_foreground.png`;
      }
      if (fgSrc) stageForegroundImg.src = fgSrc;
    } catch (e) {
      // ignore
    }

    // Reposition P2 (NPC1/Cyboard) to the current section's npc_spawn_1 if present.
    // BUT ONLY in section 1 - NPC1 should not spawn in other sections
    try {
      if (sectionData && p2 && currentSectionIdx === 1) {
        const sp = sectionData.spawn_points && sectionData.spawn_points.find((s: any) => s.name === 'npc_spawn_1');
        if (sp) {
          const c = mapSectionToCanvas(sp.x, sp.y);
          c.y -= 250;
          p2.x = c.x; p2.y = c.y; p2.vx = 0; p2.vy = 0; p2.facing = -1;
          console.log('[qte] ✅ Repositioned P2 (NPC1) to section 1 spawn npc_spawn_1:', sp, '->', c);
        }
      } else if (currentSectionIdx > 1 && p2) {
        // Remove P2 (NPC1) when leaving section 1
        console.log(`[qte] Removing P2 (NPC1) - current section ${currentSectionIdx} > 1`);
        p2 = null;
        // Also clear AI controller references
        simpleAi = null;
        npcController = null;
      }
    } catch (e) { /* defensive */ }

    // Create or update Granny NPC based on current section
    try {
      console.log(`[qte] 🔍 Granny spawn check - currentSectionIdx: ${currentSectionIdx}, sectionData:`, sectionData?.section_key);
      console.log(`[qte] 🔍 Granny already exists:`, !!grannyNpc);

      // Only create Granny when transitioning to section 2 or higher
      if (currentSectionIdx >= 2) {
        console.log(`[qte] ✅ Section check passed (${currentSectionIdx} >= 2), calling createGrannyNpc()`);
        createGrannyNpc();
      } else {
        console.log(`[qte] ❌ Section check failed (${currentSectionIdx} < 2)`);
        // Remove Granny if we're in section 1 or lower
        if (grannyNpc) {
          console.log(`[qte] Removing Granny NPC - current section ${currentSectionIdx} < 2`);
          grannyNpc = null;
          grannyController = null;
        }
      }
    } catch (e) {
      console.error('[qte] Failed to create/update Granny NPC:', e);
    }
  }

  async function preloadAndApplySection(idx: number) {
    console.log(`[qte] 📥 preloadAndApplySection called for section ${idx}`);
    const data = await loadSectionDataFor(idx);

    // Update currentSectionIdx BEFORE applying assets
    console.log(`[qte] 🔄 Updating currentSectionIdx: ${currentSectionIdx} -> ${idx}`);
    currentSectionIdx = idx;

    console.log(`[qte] 📝 Applying section assets for section ${idx}`);
    applySectionAssets(data, idx);
    sectionCache[idx] = data;

    console.log(`[qte] ✅ preloadAndApplySection completed for section ${idx}`);
  }

  async function preloadSection(idx: number) {
    pendingSectionData = await loadSectionDataFor(idx);
  }

  function startSectionTransition(nextIdx: number, dir: 'right' | 'left' = 'right') {
    console.log(`[qte] 🚀 startSectionTransition called: ${currentSectionIdx} -> ${nextIdx} (${dir})`);

    if (transitioning) {
      console.log('[qte] ❌ Already transitioning, ignoring request');
      return;
    }

    console.log(`[qte] 🔄 Starting transition - currentSectionIdx: ${currentSectionIdx}, targetSectionIdx: ${nextIdx}`);

    transitioning = true;
    transitionPhase = 'fade_out';
    transitionOpacity = 0;
    targetSectionIdx = nextIdx;
    transitionDirection = dir;
    pendingSectionData = null;
    try { pendingSectionPromise = preloadSection(nextIdx); } catch (e) { pendingSectionPromise = null; }
    // freeze fighters during transition
    try { if (p1) (p1 as any)._frozen = true; } catch (e) {}
    try { if (p2) (p2 as any)._frozen = true; } catch (e) {}
    try { if (grannyNpc) (grannyNpc as any)._frozen = true; } catch (e) {}
    assetsReadyForSwitch = false;

    console.log(`[qte] 🔄 Transition initialized - pendingSectionPromise: ${!!pendingSectionPromise}`);
  }

  function loadImageOnce(img: HTMLImageElement, src: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const done = () => resolve();
        if (img.complete && img.naturalWidth > 0 && img.src === src) { resolve(); return; }
        const onLoad = () => { img.removeEventListener('load', onLoad); done(); };
        img.addEventListener('load', onLoad);
        img.src = src;
        if (img.complete && img.naturalWidth > 0) { img.removeEventListener('load', onLoad); resolve(); }
      } catch (e) { resolve(); }
    });
  }

  function switchSectionAssetsWithPreload(data: any): Promise<void> {
    const bg = (data && data.background) ? String(data.background) : sectionBasePath(targetSectionIdx) + '/stage.png';
    const hm = (data && data.heatmap) ? String(data.heatmap) : sectionBasePath(targetSectionIdx) + '/heatmap.png';
    const fg = sectionBasePath(targetSectionIdx) + '/stage_foreground.png'; // Cosmetic foreground
    return Promise.all([
      loadImageOnce(stageImg, bg),
      loadImageOnce(heatmapImg, hm),
      loadImageOnce(stageForegroundImg, fg)
    ]).then(() => {
      // ensure sectionData reference is swapped last
      sectionData = data || sectionData;
      if (targetSectionIdx) sectionCache[targetSectionIdx] = sectionData;
    });
  }

  // Load initial section
  // fire and forget — assets will appear once loaded
  preloadAndApplySection(1);

  // Function to create Granny NPC based on current section
  async function createGrannyNpc() {
    try {
      console.log(`[qte] 🚀 createGrannyNpc() called - currentSectionIdx: ${currentSectionIdx}`);
      console.log(`[qte] 🚀 sectionData:`, sectionData?.section_key);
      console.log(`[qte] 🚀 grannyNpc exists:`, !!grannyNpc);

      // Only spawn Granny in section 2 and later
      if (currentSectionIdx < 2) {
        console.log(`[qte] ❌ Granny not spawned - current section ${currentSectionIdx} < 2`);
        return;
      }

      // Don't create multiple Granny NPCs
      if (grannyNpc) {
        console.log(`[qte] ❌ Granny already exists, skipping creation`);
        return;
      }

      // Double-check section requirement
      if (currentSectionIdx < 2) {
        console.log(`[qte] ❌ Granny creation blocked - current section ${currentSectionIdx} < 2`);
        return;
      }

      // Additional check: ensure we're actually in section 2 or higher
      // BUT: If currentSectionIdx is 2+, we should trust that over sectionData
      // because sectionData might be stale during respawns
      if (currentSectionIdx >= 2) {
        console.log(`[qte] ✅ currentSectionIdx check passed (${currentSectionIdx} >= 2), ignoring stale sectionData: ${sectionData?.section_key}`);
      } else if (sectionData && sectionData.section_key && !sectionData.section_key.includes('section_02')) {
        console.log(`[qte] ❌ Granny creation blocked - not in section 2, current: ${sectionData.section_key}`);
        return;
      }

      // Final check: ensure we're not in section 1 (only if currentSectionIdx is also 1)
      if (currentSectionIdx === 1 || (sectionData && sectionData.section_key && sectionData.section_key.includes('section_01'))) {
        console.log(`[qte] ❌ Granny creation blocked - in section 1, currentSectionIdx: ${currentSectionIdx}, sectionData: ${sectionData?.section_key}`);
        return;
      }

      console.log(`[qte] ✅ All checks passed, proceeding with Granny creation...`);

      console.log(`[qte] Creating Granny NPC for section ${currentSectionIdx}...`);
      console.log(`[qte] Current section data:`, sectionData?.section_key || 'none');

      const grannyConfig = getCharacterConfig('granny');
      if (!grannyConfig) {
        console.error('[qte] Granny character config not found');
        return;
      }

      // Load Granny's atlas
      const grannyAtlas = await loadAtlas(grannyConfig.atlasPath);
      const grannySprite = buildSpriteConfig(grannyConfig.folder, grannyConfig.overrides);

      // Determine spawn position based on section
      // Ensure spawn position is within canvas bounds
      let spawnX = Math.min(1030, WIDTH - 100); // 630 + 400 pixels to the right, but within canvas
      let spawnY = Math.min(HEIGHT * 0.25, HEIGHT - 200); // Spawn im oberen Viertel des Gesamtbildes

      console.log(`[qte] Canvas bounds check - WIDTH: ${WIDTH}, HEIGHT: ${HEIGHT}`);
      console.log(`[qte] Adjusted spawn position: (${spawnX}, ${spawnY})`);

      // Look for granny-specific spawn point in section data
      if (sectionData && sectionData.spawn_points) {
        const grannySpawn = sectionData.spawn_points.find((sp: any) => sp.name === 'granny_spawn' || sp.name === 'npc_spawn_2');
        if (grannySpawn) {
          const canvasPos = mapSectionToCanvas(grannySpawn.x, grannySpawn.y);
          spawnX = canvasPos.x;
          spawnY = canvasPos.y - 250; // Adjust for sprite height
          console.log(`[qte] Using section spawn point for Granny:`, grannySpawn, '-> canvas:', canvasPos);
        } else {
          // Use default position for section 2
          console.log(`[qte] Using default spawn position for Granny in section 2: (${spawnX}, ${spawnY})`);
        }
      }

      // Create Granny NPC
      grannyNpc = new Fighter({
        x: spawnX,
        y: spawnY,
        color: grannyConfig.color,
        keys: P2_KEYS as any, // Use P2 keys for AI control
        name: 'Granny',
        characterId: grannyConfig.name,
        spriteConfig: grannySprite,
        ctx,
        canvasWidth: WIDTH,
        canvasHeight: HEIGHT,
        muzzleOffset: { x: -36, y: -48 }
      });

      // Configure Granny's properties
      grannyNpc.facing = -1;
      grannyNpc.hp = 3;
      grannyNpc.maxHp = 3;
      grannyNpc.allowGroundCollision = false;

      // Ensure Granny starts on ground - find solid ground below spawn point
      let groundY = spawnY;
      let foundGround = false;

      // Search for solid ground below spawn point (max 200px down)
      for (let testY = spawnY; testY < spawnY + 200; testY += 10) {
        if (isSolidAtCanvasPoint(spawnX, testY)) {
          groundY = testY - 50; // Place 50px above solid ground
          foundGround = true;
          console.log(`[qte] Found solid ground for Granny at Y=${testY}, placing at Y=${groundY}`);
          break;
        }
      }

      if (!foundGround) {
        // Fallback: use main platform top
        const mainPlatTop = getMainPlatformTop();
        groundY = mainPlatTop - 50;
        console.log(`[qte] No solid ground found, using main platform top: Y=${groundY}`);
      }

      // Position Granny on solid ground
      grannyNpc.y = groundY;
      grannyNpc.onGround = true;
      grannyNpc.vy = 0;
      grannyNpc.vx = 0;

      console.log(`[qte] Granny positioned at ground level: (${spawnX}, ${groundY})`);
      console.log(`[qte] Canvas dimensions: ${WIDTH}x${HEIGHT}`);
      console.log(`[qte] Granny spawn within canvas bounds: X=${spawnX >= 0 && spawnX <= WIDTH}, Y=${groundY >= 0 && groundY <= HEIGHT}`);

      // Patch animator with atlas data
      if (grannyNpc && grannyNpc.anim && grannyAtlas) {
        const allStates = Object.keys(grannyNpc.anim.animations);
        for (const state of allStates) {
          const atlasState = grannyAtlas.animations[state];
          const dest = grannyNpc.anim.animations[state];
          if (!dest) continue;
          dest.image = grannyAtlas.image;
          dest.src = grannyAtlas.image.src;
          dest.imageLoaded = true;
          dest.imageBroken = false;
          if (atlasState) {
            dest.rects = atlasState.frames;
            dest.frameW = grannyAtlas.frameW;
            dest.frameH = grannyAtlas.frameH;
            dest.frames = atlasState.frames.length;
            dest.fps = dest.fps || ((typeof atlasState.fps === 'number') ? atlasState.fps : ((grannyAtlas && grannyAtlas.meta && grannyAtlas.meta.fps) || 12));
            dest.loop = (typeof atlasState.loop === 'boolean') ? atlasState.loop : (dest.loop ?? true);
          }
        }
      }

      // Create AI controller for Granny
      const isSolid = (x: number, y: number) => isSolidAtCanvasPoint(x, y);
      grannyController = new NPCController({
        keys: { left: P2_KEYS.left, right: P2_KEYS.right, up: P2_KEYS.up, attack1: P2_KEYS.attack1 },
        isSolidAt: isSolid,
        canvasW: WIDTH,
        canvasH: HEIGHT,
        spawnX: spawnX,
        simplePatrol: true,
        patrolDistance: 100 // Smaller patrol distance for Granny
      });

      // Update AI controller spawn position to match actual ground position
      if (grannyController && typeof (grannyController as any).spawnX === 'number') {
        (grannyController as any).spawnX = spawnX;
        console.log(`[qte] Updated Granny AI controller spawn position to: ${spawnX}`);
      }

      console.log(`[qte] ✅ Granny NPC created successfully in section ${currentSectionIdx} at (${spawnX}, ${groundY})`);
      console.log(`[qte] 🎯 Granny will patrol around spawn point with 100px radius`);
    } catch (e) {
      console.error('[qte] Failed to create Granny NPC:', e);
    }
  }
  const heatmapCanvas = document.createElement('canvas');
  const heatmapCtx = heatmapCanvas.getContext('2d');
  // Flag to indicate whether the heatmap image has been successfully loaded
  let heatmapReady = false;
  heatmapImg.onload = () => {
    try {
      heatmapCanvas.width = heatmapImg.naturalWidth || heatmapImg.width;
      heatmapCanvas.height = heatmapImg.naturalHeight || heatmapImg.height;
      if (heatmapCtx) heatmapCtx.drawImage(heatmapImg, 0, 0);
      heatmapReady = true;
      console.info('[qte][heatmap] Heatmap loaded successfully', {
        src: heatmapImg.src,
        size: { w: heatmapCanvas.width, h: heatmapCanvas.height },
        section: currentSectionIdx
      });
      // After heatmap load, detect any magenta (#ff00ff) marked patrol regions
      try { detectPatrolRegionFromHeatmap('#ff00ff', 30); } catch (e) {}
    } catch (e) {
      // defensive: don't break the game if heatmap fails
      // eslint-disable-next-line no-console
      console.error('[qte][heatmap] Failed to initialize heatmap canvas', e);
    }
  };

  // Cache for detected patrol bbox per section
  const patrolRegionCache: Record<string, { minX: number; maxX: number } | null> = {};

  // Detect a patrol region on the heatmap by scanning for a marker color.
  // colorHex: '#rrggbb'
  // tol: color distance tolerance (0-255)
  function detectPatrolRegionFromHeatmap(colorHex: string, tol = 30, step = 2) {
    try {
      if (!heatmapCtx || !heatmapCanvas || heatmapCanvas.width === 0) return null;
      // derive a stable cache key from the current section index (e.g. 'section_01')
      const key = (typeof currentSectionIdx === 'number') ? (`section_${String(currentSectionIdx).padStart(2,'0')}`) : 'default';
      if (patrolRegionCache[key]) return patrolRegionCache[key];
      const imgW = heatmapCanvas.width;
      const imgH = heatmapCanvas.height;
      const data = heatmapCtx.getImageData(0, 0, imgW, imgH).data;
      const target = hexToRgb(colorHex);
      if (!target) return null;
      let minX = imgW, maxX = 0, found = false;
      for (let y = 0; y < imgH; y += step) {
        for (let x = 0; x < imgW; x += step) {
          const idx = (y * imgW + x) * 4;
          const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
          if (a === 0) continue;
          const dist = colorDistance(r, g, b, target.r, target.g, target.b);
          if (dist <= tol) {
            found = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
      }
      if (!found) { patrolRegionCache[key] = null; return null; }
      // map src-space bbox to canvas coordinates (same math used elsewhere)
      const canvasMinX = Math.floor((minX / imgW) * WIDTH);
      const canvasMaxX = Math.floor((maxX / imgW) * WIDTH);
      const res = { minX: canvasMinX, maxX: canvasMaxX };
      patrolRegionCache[key] = res;

      console.info('[qte] Detected patrol region on heatmap', res, 'section=', key);
      return res;
    } catch (e) { return null; }
  }

  function hexToRgb(hex: string) {
    const m = /^#?([a-fA-F0-9]{6})$/.exec(hex);
    if (!m) return null;
    const v = m[1];
    return { r: parseInt(v.slice(0,2),16), g: parseInt(v.slice(2,4),16), b: parseInt(v.slice(4,6),16) };
  }

  function colorDistance(r1:number,g1:number,b1:number,r2:number,g2:number,b2:number){
    const dr = r1-r2, dg = g1-g2, db = b1-b2; return Math.sqrt(dr*dr+dg*dg+db*db);
  }

  // Store atlases globally for projectiles/blasts
  let globalAtlas1: any = null;
  let globalAtlas2: any = null;

  // Atlases will be loaded dynamically when characters are selected

  // Asset diagnostics will be logged when characters are selected and loaded

  function framesFromFilename(src: string, fallback: number) {
    try {
      const m = /_(\d+)\.(png|jpg|jpeg|webp)$/i.exec(src);
      const n = m ? parseInt(m[1], 10) : NaN;
      return Number.isFinite(n) ? n : fallback;
    } catch (e) {
      return fallback;
    }
  }

  // Character selection functions
  async function loadCharacterForSelection(characterName: string) {
    const charConfig = getCharacterConfig(characterName);
    if (!charConfig) return;

    try {
      console.log(`[qte] Loading character ${characterName} for selection`);
      const atlas = await loadAtlas(charConfig.atlasPath);
      characterSelectionAtlas = atlas;

      // Create sprite config for this character
      const spriteConfig = buildSpriteConfig(charConfig.folder, charConfig.overrides);
      const img = new Image();
      img.src = spriteConfig.animations.idle.src || "";
      characterSelectionAnimator = new SpriteAnimator(img, spriteConfig.frameW, spriteConfig.frameH, spriteConfig.animations);

      // Patch with atlas data
      if (atlas && atlas.image) {
        const allStates = Object.keys(characterSelectionAnimator.animations);
        for (const state of allStates) {
          const atlasState = atlas.animations[state];
          const dest = characterSelectionAnimator.animations[state];

          // Always set the atlas image and mark as loaded
          dest.image = atlas.image;
          dest.src = atlas.image.src;
          dest.imageLoaded = true;
          dest.imageBroken = false;

          if (atlasState) {
            dest.rects = atlasState.frames;
            dest.frameW = atlas.frameW;
            dest.frameH = atlas.frameH;
            dest.frames = atlasState.frames.length;
            // Ensure 'hurt' animation does not loop in selection preview
            if (state === 'hurt') dest.loop = false;
            console.debug(`[qte] Character Selection: Patched ${state} with ${atlasState.frames.length} atlas frames`);
          } else {
            // No atlas frames for this state, but still use atlas image
            console.debug(`[qte] Character Selection: No atlas frames for ${state}, using atlas image fallback`);
          }
        }
      }

      // Start with spawn animation
      characterSelectionAnimator.setState("spawn");
      spawnAnimationComplete = false;
      console.log(`[qte] Character ${characterName} loaded for selection`);
    } catch (e) {
      console.warn(`[qte] Failed to load character ${characterName}: ${String(e)}`);
    }
  }

  function drawCharacterSelection(dt: number) {
    // Background
    ctx.fillStyle = "#071428";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Title
    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("CHARACTER SELECTION", WIDTH / 2, 80);

    // Player indicator
    ctx.font = "bold 32px Arial";
    ctx.fillStyle = currentPlayerSelecting === 1 ? "#4aa3ff" : "#ff7a7a";
    ctx.fillText(`Player ${currentPlayerSelecting} - Choose Your Fighter`, WIDTH / 2, 140);

    // Character preview
    if (characterSelectionAnimator) {
      const currentChar = CHARACTERS[characterSelectionIndex];
      const charX = WIDTH / 2 - 128;
      const charY = HEIGHT / 2 - 128;

      // Update animation
      characterSelectionAnimator.update(dt);

      // Check if spawn animation is complete
      if (characterSelectionAnimator.state === "spawn" &&
          characterSelectionAnimator.frame >= (characterSelectionAnimator.animations.spawn?.frames || 6) - 1) {
        if (!spawnAnimationComplete) {
          spawnAnimationComplete = true;
          characterSelectionAnimator.setState("idle");
        }
      }

      // Draw character
      characterSelectionAnimator.draw(ctx, charX, charY, 256, 256);

      // Minimal UI: only title and player indicator visible per user request
    }

    // ensure default text alignment
    ctx.textAlign = "left";
  }

  function handleCharacterSelectionInput(dt: number) {
    const now = performance.now();
    if (now - lastInputTime < INPUT_DEBOUNCE) return;

    const gp = readGamepadsUnified(P1_KEYS as any, P2_KEYS as any);
    // Also read raw gamepad buttons for selection-specific mappings (e.g. X button)
    const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    const rawP1Pad = pads[0] || null;
    const mergedInput: Record<string, boolean> = {};

    function getKeyboard(code: string) {
      return !!input[code];
    }

    // Use P1 keys for character selection navigation
    [P1_KEYS.left, P1_KEYS.right, P1_KEYS.attack1].forEach((k) => {
      if (k) mergedInput[k] = !!gp[k] || getKeyboard(k);
    });

    // Navigation
    if (mergedInput[P1_KEYS.left]) {
      lastInputTime = now;
      characterSelectionIndex = (characterSelectionIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
      loadCharacterForSelection(CHARACTERS[characterSelectionIndex].name);
    }

    if (mergedInput[P1_KEYS.right]) {
      lastInputTime = now;
      characterSelectionIndex = (characterSelectionIndex + 1) % CHARACTERS.length;
      loadCharacterForSelection(CHARACTERS[characterSelectionIndex].name);
    }

    // Selection (confirm): allow either the mapped attack1 or the gamepad X button (b[0])
    const confirmPressed = !!(mergedInput[P1_KEYS.attack1] || (rawP1Pad && rawP1Pad.buttons && rawP1Pad.buttons[0] && rawP1Pad.buttons[0].pressed));

    if (confirmPressed) {
      lastInputTime = now;
      const selectedChar = CHARACTERS[characterSelectionIndex].name;

      if (currentPlayerSelecting === 1) {
        selectedCharacters.p1 = selectedChar;
        currentPlayerSelecting = 2;
        console.log(`[qte] Player 1 selected: ${selectedChar}`);
      } else {
        selectedCharacters.p2 = selectedChar;
        console.log(`[qte] Player 2 selected: ${selectedChar}`);
        console.log(`[qte] Starting game with P1: ${selectedCharacters.p1}, P2: ${selectedCharacters.p2}`);
        currentState = GameState.GAME;
        initializeGame();
        return;
      }

      // Load character for next player
      loadCharacterForSelection(CHARACTERS[characterSelectionIndex].name);
    }
  }

  async function initializeGame() {
    // This will be called when both players have selected their characters
    // Initializing game with selected characters (silent)

    if (!selectedCharacters.p1 || !selectedCharacters.p2) {
      console.error("[qte] Cannot initialize game - missing character selections");
      return;
    }

    try {
      // Load atlases for both characters
      const p1Config = getCharacterConfig(selectedCharacters.p1);
      const p2Config = getCharacterConfig(selectedCharacters.p2);

      if (!p1Config || !p2Config) {
        console.error("[qte] Invalid character configurations");
        return;
      }

      // Loading atlases for P1/P2 (silent)
      // Load primary atlases
      const atlasPromises = [loadAtlas(p1Config.atlasPath), loadAtlas(p2Config.atlasPath)];
      // If character defines extraAtlas entries, load them as well (used for Laurin extra atlas)
      const extraPromises: Promise<any>[] = [];
      if (p1Config.extraAtlas && Array.isArray(p1Config.extraAtlas)) {
        for (const ea of p1Config.extraAtlas) extraPromises.push(loadAtlas(ea.replace(/\.json$/, '')));
      }
      if (p2Config.extraAtlas && Array.isArray(p2Config.extraAtlas)) {
        for (const ea of p2Config.extraAtlas) extraPromises.push(loadAtlas(ea.replace(/\.json$/, '')));
      }

      const allAtlases = await Promise.all([...atlasPromises, ...extraPromises]);
      const atlas1 = allAtlases[0];
      const atlas2 = allAtlases[1];
      const extraAtlases = allAtlases.slice(2);

      // Create sprite configs
      const p1Sprite = buildSpriteConfig(p1Config.folder, p1Config.overrides);
      const p2Sprite = buildSpriteConfig(p2Config.folder, p2Config.overrides);

      // Preload common blast images to avoid grey fallback on first-fired blasts.
      // We don't want to block forever, so cap wait with a small timeout.
      const preloadImage = (src: string, timeoutMs = 800) => new Promise<void>((resolve) => {
        try {
          const img = new Image();
          let done = false;
          const onDone = () => { if (done) return; done = true; resolve(); };
          img.onload = onDone;
          img.onerror = onDone;
          img.src = src;
          // If the image is already cached/complete, resolve immediately
          if (img.complete && img.naturalWidth > 0) { onDone(); return; }
          setTimeout(onDone, timeoutMs);
        } catch (e) { resolve(); }
      });

      await Promise.all([
        preloadImage(P1_BLAST_SRC),
        preloadImage(P2_BLAST_SRC),
      ]);

      // Create fighters using section spawn points
      let p1Spawn = { x: 100, y: 400 }; // fallback
      let p2Spawn: { x: number; y: number } | null = { x: WIDTH - 100 - 256, y: 400 }; // fallback

      console.log('[qte] 🔍 Checking section data for spawn points...');
      console.log('[qte] sectionData exists:', !!sectionData);
      console.log('[qte] sectionData.spawn_points exists:', !!(sectionData && sectionData.spawn_points));

      if (sectionData && sectionData.spawn_points) {
        const playerStart = sectionData.spawn_points.find((sp: any) => sp.name === 'player_start');
        const npcSpawn = sectionData.spawn_points.find((sp: any) => sp.name === 'npc_spawn_1');

        console.log('[qte] Found playerStart:', playerStart);
        console.log('[qte] Found npcSpawn:', npcSpawn);

        if (playerStart) {
          p1Spawn = mapSectionToCanvas(playerStart.x, playerStart.y);
          p1Spawn.y -= 250; // 250 pixels higher
          console.log('[qte] ✅ P1 spawn from section:', playerStart, '-> canvas:', p1Spawn);
        }
        // Only create P2 (NPC1) if we're in section 1
        if (npcSpawn && currentSectionIdx === 1) {
          p2Spawn = mapSectionToCanvas(npcSpawn.x, npcSpawn.y);
          p2Spawn.y -= 250; // 250 pixels higher
          console.log('[qte] ✅ P2 (NPC1) spawn from section 1:', npcSpawn, '-> canvas:', p2Spawn);
        } else if (currentSectionIdx > 1) {
          console.log('[qte] P2 (NPC1) not created - current section', currentSectionIdx, '> 1');
          // Don't create P2 in sections other than 1
          p2Spawn = null;
        }
      } else {
        console.warn('[qte] ⚠️ No section data available, using fallback spawn positions');
        console.log('[qte] Fallback P1 spawn:', p1Spawn);
        if (currentSectionIdx === 1) {
          console.log('[qte] Fallback P2 spawn:', p2Spawn);
        } else {
          console.log('[qte] P2 (NPC1) not created - current section', currentSectionIdx, '> 1');
          p2Spawn = null;
        }
      }

      p1 = new Fighter({
        x: p1Spawn.x,
        y: p1Spawn.y,
        color: p1Config.color,
        keys: P1_KEYS as any,
        name: "P1",
        characterId: p1Config.name,
        spriteConfig: p1Sprite,
        ctx,
        canvasWidth: WIDTH,
        canvasHeight: HEIGHT,
        muzzleOffset: { x: 36, y: -48 }
      });

      // Only create P2 (NPC1) if we're in section 1
      if (p2Spawn && currentSectionIdx === 1) {
        p2 = new Fighter({
          x: p2Spawn.x,
          y: p2Spawn.y,
          color: p2Config.color,
          keys: P2_KEYS as any,
          name: "P2",
          characterId: p2Config.name,
          spriteConfig: p2Sprite,
          ctx,
          canvasWidth: WIDTH,
          canvasHeight: HEIGHT,
          muzzleOffset: { x: -36, y: -48 }
        });
        p2.facing = -1;
        console.log('[qte] ✅ P2 (NPC1) created in section 1');
      } else {
        console.log('[qte] P2 (NPC1) not created - current section', currentSectionIdx, '> 1');
        p2 = null;
      }

      // Disable legacy ground collision on fighters so heatmap controls grounding
      if (p1) (p1 as any).allowGroundCollision = false;
      if (p2) (p2 as any).allowGroundCollision = false;

      // Create simple AI for P2 if requested
      // BUT ONLY in section 1 - NPC1 should not have AI in other sections
      console.log(`[DEBUG] useAIForP2 = ${useAIForP2}, creating AI for P2...`);
      if (useAIForP2 && currentSectionIdx === 1) {
        try {
          console.log('[DEBUG] Step 1: Using imported SimpleAI...');
          console.log('[DEBUG] Step 2: SimpleAI available:', !!SimpleAI);
          // provide mapping of P2 keys used in mergedInput and heatmap query function
          const isSolid = (x: number, y: number) => isSolidAtCanvasPoint(x, y);
          console.log('[DEBUG] Step 3: isSolid function created');
          // Provide patrol bounds that correspond to the right platform area so
          // the NPC will spawn and patrol on that platform. Also offset spawn
          // positions slightly upward (5% of canvas height) to avoid falling
          // through the platform heatmap on spawn.
          // Limit patrol bounds to at most +/- 300px from the NPC spawn position
          const spawnXForAI = (p2Spawn && typeof p2Spawn.x === 'number') ? p2Spawn.x : (WIDTH - 220);
          console.log('[DEBUG] Step 4: spawnXForAI calculated:', spawnXForAI);
          const leftEdge = Math.max(0, Math.floor(spawnXForAI - 300));
          const rightEdge = Math.min(WIDTH, Math.floor(spawnXForAI + 300));
          // Create patrol bounds around spawn point (200px radius)
          const patrolRadius = 200;
          const patrolMinX = Math.max(0, Math.floor(spawnXForAI - patrolRadius));
          const patrolMaxX = Math.min(WIDTH, Math.floor(spawnXForAI + patrolRadius));

          console.info('[qte][ai] Setting up P2 patrol around spawn point:', {
            spawnX: spawnXForAI,
            patrolRadius,
            bounds: { minX: patrolMinX, maxX: patrolMaxX }
          });

          console.log('[DEBUG] Step 5: About to create SimpleAI instance...');
          simpleAi = new SimpleAI({
            keys: { left: P2_KEYS.left, right: P2_KEYS.right, up: P2_KEYS.up, attack1: P2_KEYS.attack1, parry: P2_KEYS.parry },
            isSolidAt: isSolid,
            canvasW: WIDTH,
            canvasH: HEIGHT,
            spawnX: spawnXForAI,
            simplePatrol: true, // Enable simple patrol behavior
            patrolDistance: 150 // 150 pixels from spawn
          });
          console.log('[DEBUG] Step 6: SimpleAI constructor completed successfully');
          console.log(`[NPC] 🤖 SimpleAI initialized with simple patrol: spawn=${spawnXForAI.toFixed(1)}, distance=150px`);
        } catch (e) {
          console.error('[DEBUG] Error creating SimpleAI:', e);
          simpleAi = null;
        }
      }

      // If we are in singleplayer mode (p2 null) and no AI requested, create an NPCController that uses cyboard animations
      // BUT ONLY in section 1 - NPC1 should not have AI in other sections
      if (!useAIForP2 && !p2 && currentSectionIdx === 1) {
        try {
          // Using imported NPCController
          const isSolid = (x: number, y: number) => isSolidAtCanvasPoint(x, y);
          // Patrol on the rightmost platform: approximate patrol bounds near right edge
          // Limit patrol bounds to at most +/- 300px from a reasonable spawn point
          const approxSpawnX = (typeof p2Spawn === 'object' && p2Spawn && typeof p2Spawn.x === 'number') ? p2Spawn.x : (WIDTH - 220);
          // Limit NPC patrol to a corridor of ±150 px from its spawn position in section 01.
          const PATROL_RADIUS = 150;
          const leftEdge = Math.max(0, Math.floor(approxSpawnX - PATROL_RADIUS));
          const rightEdge = Math.min(WIDTH, Math.floor(approxSpawnX + PATROL_RADIUS));
          npcController = new NPCController({
            keys: { left: P2_KEYS.left, right: P2_KEYS.right, up: P2_KEYS.up, attack1: P2_KEYS.attack1 },
            isSolidAt: isSolid,
            canvasW: WIDTH,
            canvasH: HEIGHT,
            patrolMinX: leftEdge,
            patrolMaxX: rightEdge,
            aggroRange: 240,
            attackRange: 100
          });
        } catch (e) {
          npcController = null;
        }
      }

      // Patch animators with atlas data
      const patchAnimator = (anim: any, atlas: any) => {
        if (!atlas || !atlas.image) return;

        anim.defaultImage = atlas.image;
        const allStates = Object.keys(anim.animations);
        for (const state of allStates) {
          const atlasState = atlas.animations[state];
          if (!anim.animations[state]) anim.animations[state] = {} as any;
          const dest = anim.animations[state];

          // Always set the atlas image and mark as loaded
          dest.image = atlas.image;
          dest.src = atlas.image.src;
          dest.imageLoaded = true;
          dest.imageBroken = false;

          if (atlasState) {
            const a = atlasState;
            dest.rects = a.frames;
            dest.frameW = atlas.frameW;
            dest.frameH = atlas.frameH;
            dest.frames = a.frames.length;
            // Preserve original fps if already set (for overrides), otherwise use atlas values
            dest.fps = dest.fps || ((typeof a.fps === 'number') ? a.fps : (atlas.meta?.fps || 12));
            dest.loop = (typeof a.loop === 'boolean') ? a.loop : (dest.loop ?? true);
            // Non-looping hurt animation globally
            if (state === 'hurt') dest.loop = false;
            // Patched atlas frames for state (silent)
          } else {
            // No atlas frames but still use atlas image
            dest.frameW = dest.frameW || atlas.frameW;
            dest.frameH = dest.frameH || atlas.frameH;
            // No atlas frames for state, using atlas image fallback (silent)
          }
        }
      };

      patchAnimator(p1.anim, atlas1);
      if (p2) patchAnimator(p2.anim, atlas2);

      // Per-character tweaks: ensure Laurin's jump plays once (non-looping)
      try {
        if (p1Config && (p1Config.name === 'laurin' || p1Config.name === 'Laurin') && p1 && p1.anim && p1.anim.animations['jump']) {
          p1.anim.animations['jump'].loop = false;
          // Laurin P1 jump set to non-looping (silent)
        }
        if (p2Config && (p2Config.name === 'laurin' || p2Config.name === 'Laurin') && p2 && p2.anim && p2.anim.animations['jump']) {
          p2.anim.animations['jump'].loop = false;
          // Laurin P2 jump set to non-looping (silent)
        }
      } catch (e) { /* defensive */ }

      // Per-character tuning: Laurin has slower idle — halve idle FPS when Laurin is loaded
      try {
        if (p1Config && p1Config.name && p1 && p1.anim && (p1Config.name === 'laurin' || p1Config.name === 'Laurin')) {
          const idleAnim = p1.anim.animations['idle'];
          if (idleAnim) {
            const original = idleAnim.fps || atlas1?.meta?.fps || 12;
            idleAnim.fps = Math.max(1, Math.floor(original / 2));
            // Laurin P1 idle fps adjusted (silent)
          }
        }
        if (p2Config && p2Config.name && p2 && p2.anim && (p2Config.name === 'laurin' || p2Config.name === 'Laurin')) {
          const idleAnim = p2.anim.animations['idle'];
          if (idleAnim) {
            const original = idleAnim.fps || atlas2?.meta?.fps || 12;
            idleAnim.fps = Math.max(1, Math.floor(original / 2));
            // Laurin P2 idle fps adjusted (silent)
          }
        }
      } catch (e) { /* defensive */ }

      // If extra atlases provided, patch their animations into the corresponding animators
      try {
        // atlas loader returns { image, animations }
        if (extraAtlases && extraAtlases.length > 0) {
          // For now we only support one extra atlas per player; merge animations into both animators
          for (const e of extraAtlases) {
            if (!e || !e.image) continue;
            // merge into p1
            if (p1 && p1.anim) {
              for (const s of Object.keys(e.animations)) {
                p1.anim.animations[s] = p1.anim.animations[s] || {};
                const dest = p1.anim.animations[s];
                dest.image = e.image;
                dest.src = e.image.src;
                dest.imageLoaded = true;
                dest.imageBroken = false;
                dest.rects = e.animations[s].frames;
                dest.frameW = e.frameW;
                dest.frameH = e.frameH;
                dest.frames = e.animations[s].frames.length;
                // Preserve original fps if already set (for overrides), otherwise use extra atlas values
                dest.fps = dest.fps || ((e.animations[s] && typeof (e.animations[s] as any).fps === 'number') ? (e.animations[s] as any).fps : (e.meta?.fps || atlas1?.meta?.fps || 12));
                dest.loop = (e.animations[s] && typeof (e.animations[s] as any).loop === 'boolean') ? (e.animations[s] as any).loop : (dest.loop ?? true);
                // Ensure hurt animation from extra atlas does not loop
                if (s === 'hurt') dest.loop = false;
                // Debug projectile3 specifically
                if (s === 'projectile3') {
                  console.log(`[qte] PATCHED PROJECTILE3 INTO P1:`, {
                    state: s,
                    frames: dest.frames,
                    rects: dest.rects?.length,
                    image: !!dest.image,
                    fps: dest.fps,
                    loop: dest.loop
                  });
                }
                // Patched extra atlas animation into P1 (silent)
              }
            }
            // merge into p2
            if (p2 && p2.anim) {
              for (const s of Object.keys(e.animations)) {
                p2.anim.animations[s] = p2.anim.animations[s] || {};
                const dest = p2.anim.animations[s];
                dest.image = e.image;
                dest.src = e.image.src;
                dest.imageLoaded = true;
                dest.imageBroken = false;
                dest.rects = e.animations[s].frames;
                dest.frameW = e.frameW;
                dest.frameH = e.frameH;
                dest.frames = e.animations[s].frames.length;
                dest.fps = dest.fps || ((e.animations[s] && typeof (e.animations[s] as any).fps === 'number') ? (e.animations[s] as any).fps : (e.meta?.fps || atlas2?.meta?.fps || 12));
                dest.loop = (e.animations[s] && typeof (e.animations[s] as any).loop === 'boolean') ? (e.animations[s] as any).loop : (dest.loop ?? true);
                // Ensure hurt animation from extra atlas does not loop for P2
                if (s === 'hurt') dest.loop = false;
                // Patched extra atlas animation into P2 (silent)
              }
            }
          }
        }
      } catch (e) { console.warn('[qte] failed to patch extra atlases', e); }

      // Store atlases globally for projectiles/blasts
      globalAtlas1 = atlas1;
      globalAtlas2 = atlas2;

      // Note: Granny NPC will be created automatically when transitioning to section 2+

      // Game initialized successfully (silent)
    } catch (e) {
      console.error("[qte] Failed to initialize game:", e);
    }
  }

  // Initialize game for singleplayer (P1 only). Creates P1 and avoids creating P2.
  async function initializeSingleplayer() {
    console.log('[qte] Initializing singleplayer with P1=laurin');

    try {
      const p1Config = getCharacterConfig(selectedCharacters.p1 || 'laurin');
      if (!p1Config) {
        console.error('[qte] Invalid P1 configuration for singleplayer');
        return;
      }

      console.log(`[qte] Loading atlas for P1: ${p1Config.name}`);
      const atlas1: any = await loadAtlas(p1Config.atlasPath);

      const p1Sprite = buildSpriteConfig(p1Config.folder, p1Config.overrides);

      // Preload P1 blast image to avoid grey fallback
      const preloadImage = (src: string, timeoutMs = 800) => new Promise<void>((resolve) => {
        try {
          const img = new Image();
          let done = false;
          const onDone = () => { if (done) return; done = true; resolve(); };
          img.onload = onDone;
          img.onerror = onDone;
          img.src = src;
          if (img.complete && img.naturalWidth > 0) { onDone(); return; }
          setTimeout(onDone, timeoutMs);
        } catch (e) { resolve(); }
      });

      await preloadImage(P1_BLAST_SRC);

      // Create P1 fighter using section spawn points
      let p1Spawn = { x: WIDTH / 2 - 256 / 2, y: 400 }; // fallback

      console.log('[qte] 🔍 Singleplayer: Checking section data for P1 spawn...');
      console.log('[qte] sectionData exists:', !!sectionData);

      if (sectionData && sectionData.spawn_points) {
        const playerStart = sectionData.spawn_points.find((sp: any) => sp.name === 'player_start');
        console.log('[qte] Found playerStart for singleplayer:', playerStart);
        if (playerStart) {
          p1Spawn = mapSectionToCanvas(playerStart.x, playerStart.y);
          p1Spawn.y -= 250; // 250 pixels higher
          console.log('[qte] ✅ Singleplayer P1 spawn from section:', playerStart, '-> canvas:', p1Spawn);
        }
      } else {
        console.log('[qte] ⚠️ Singleplayer: Using fallback P1 spawn:', p1Spawn);
      }

      p1 = new Fighter({
        x: p1Spawn.x,
        y: p1Spawn.y,
        color: p1Config.color,
        keys: P1_KEYS as any,
        name: 'P1',
        characterId: p1Config.name,
        spriteConfig: p1Sprite,
        ctx,
        canvasWidth: WIDTH,
        canvasHeight: HEIGHT,
        muzzleOffset: { x: 36, y: -48 }
      });
      // Configure Laurin HP for singleplayer
      p1.hp = 6;
      p1.maxHp = 6;

      // Patch animator with atlas (avoid private API access)
      if (p1 && p1.anim && atlas1) {
        const allStates = Object.keys(p1.anim.animations);
        for (const state of allStates) {
          const atlasState = atlas1.animations[state];
          const dest = p1.anim.animations[state];
          if (!dest) continue;
          dest.image = atlas1.image;
          dest.src = atlas1.image.src;
          dest.imageLoaded = true;
          dest.imageBroken = false;
          if (atlasState) {
            dest.rects = atlasState.frames;
            dest.frameW = atlas1.frameW;
            dest.frameH = atlas1.frameH;
            dest.frames = atlasState.frames.length;
            dest.fps = dest.fps || ((typeof atlasState.fps === 'number') ? atlasState.fps : ((atlas1 && atlas1.meta && atlas1.meta.fps) || 12));
            dest.loop = (typeof atlasState.loop === 'boolean') ? atlasState.loop : (dest.loop ?? true);
          }
        }
      }

      // Per-character tweaks for Laurin (idle/jump) if applicable
      try {
        if (p1Config && (p1Config.name === 'laurin' || p1Config.name === 'Laurin') && p1 && p1.anim && p1.anim.animations['jump']) {
          p1.anim.animations['jump'].loop = false;
        }
        if (p1Config && p1Config.name && p1 && p1.anim && (p1Config.name === 'laurin' || p1Config.name === 'Laurin')) {
          const idleAnim = p1.anim.animations['idle'];
          if (idleAnim) {
            const original = idleAnim.fps || ((atlas1 && atlas1.meta && atlas1.meta.fps) || 12);
            idleAnim.fps = Math.max(1, Math.floor(original / 2));
          }
        }
      } catch (e) { /* defensive */ }

      // Create P2 NPC using cyboard assets and place it at provided heatmap spawn coords
      try {
        const p2Config = getCharacterConfig('cyboard');
        if (p2Config) {
          const atlas2: any = await loadAtlas(p2Config.atlasPath);
          const p2Sprite = buildSpriteConfig(p2Config.folder, p2Config.overrides);

          // Use section spawn points for P2 NPC
          let p2Spawn = { x: WIDTH - 100 - 256, y: 400 }; // fallback

          console.log('[qte] 🔍 Singleplayer: Checking section data for P2 spawn...');
          if (sectionData && sectionData.spawn_points) {
            const npcSpawn = sectionData.spawn_points.find((sp: any) => sp.name === 'npc_spawn_1');
            console.log('[qte] Found npcSpawn for singleplayer:', npcSpawn);
            if (npcSpawn) {
              p2Spawn = mapSectionToCanvas(npcSpawn.x, npcSpawn.y);
              p2Spawn.y -= 250; // 250 pixels higher
              console.log('[qte] ✅ Singleplayer P2 spawn from section:', npcSpawn, '-> canvas:', p2Spawn);
            }
          } else {
            console.log('[qte] ⚠️ Singleplayer: Using fallback P2 spawn:', p2Spawn);
          }

          p2 = new Fighter({
            x: p2Spawn.x,
            y: p2Spawn.y,
            color: p2Config.color,
            keys: P2_KEYS as any,
            name: 'P2',
            characterId: p2Config.name,
            spriteConfig: p2Sprite,
            ctx,
            canvasWidth: WIDTH,
            canvasHeight: HEIGHT,
            muzzleOffset: { x: -36, y: -48 }
          });
          p2.facing = -1;
          // Configure HP for cyboard: 3 hits total
          p2.hp = 3;
          p2.maxHp = 3;
          if (p2) (p2 as any).allowGroundCollision = false;

          // Patch animator for P2 with atlas2
          try {
            if (p2 && p2.anim && atlas2) {
              const allStates = Object.keys(p2.anim.animations);
              for (const state of allStates) {
                const atlasState = atlas2.animations[state];
                const dest = p2.anim.animations[state];
                if (!dest) continue;
                dest.image = atlas2.image;
                dest.src = atlas2.image.src;
                dest.imageLoaded = true;
                dest.imageBroken = false;
                if (atlasState) {
                  dest.rects = atlasState.frames;
                  dest.frameW = atlas2.frameW;
                  dest.frameH = atlas2.frameH;
                  dest.frames = atlasState.frames.length;
                  dest.fps = dest.fps || ((typeof atlasState.fps === 'number') ? atlasState.fps : ((atlas2 && atlas2.meta && atlas2.meta.fps) || 12));
                  dest.loop = (typeof atlasState.loop === 'boolean') ? atlasState.loop : (dest.loop ?? true);
                }
              }
            }
          } catch (e) { /* defensive */ }

          // set global atlas for p2
          globalAtlas2 = atlas2;

          // Ensure attack1 and defeat animations exist for P2 (fallbacks if atlas missing them)
          try {
            if (p2 && p2.anim) {
              const hasAttack1 = !!(p2.anim.animations['attack1'] && ((p2.anim.animations['attack1'].frames && p2.anim.animations['attack1'].frames > 0) || (p2.anim.animations['attack1'].rects && p2.anim.animations['attack1'].rects.length > 0)));
              if (!hasAttack1) {
                // Try to build attack1 from attack2 last frame or idle last frame
                const srcCandidates = ['attack2', 'idle', 'walk', 'hurt'];
                for (const c of srcCandidates) {
                  const a = p2.anim.animations[c];
                  if (a && (a.rects && a.rects.length > 0)) {
                    const lastRect = a.rects[a.rects.length - 1];
                    p2.anim.animations['attack1'] = {
                      src: a.src || '',
                      frames: 1,
                      fps: a.fps || 12,
                      loop: false,
                      frameW: a.frameW || 256,
                      frameH: a.frameH || 256,
                      image: a.image,
                      rects: [ lastRect ]
                    } as any;
                    // Fallback: created attack1 animation for P2 from candidate (silent)
                    break;
                  }
                }
              }

              const hasDefeat = !!(p2.anim.animations['defeat'] && ((p2.anim.animations['defeat'].frames && p2.anim.animations['defeat'].frames > 0) || (p2.anim.animations['defeat'].rects && p2.anim.animations['defeat'].rects.length > 0)));
              if (!hasDefeat) {
                // Build a one-frame defeat from hurt last frame or idle last frame
                const srcCandidates2 = ['hurt', 'attack2', 'idle', 'walk'];
                for (const c of srcCandidates2) {
                  const a = p2.anim.animations[c];
                  if (a && (a.rects && a.rects.length > 0)) {
                    const lastRect = a.rects[a.rects.length - 1];
                    p2.anim.animations['defeat'] = {
                      src: a.src || '',
                      frames: 1,
                      fps: 1,
                      loop: false,
                      frameW: a.frameW || 256,
                      frameH: a.frameH || 256,
                      image: a.image,
                      rects: [ lastRect ]
                    } as any;
                    // Fallback: created defeat animation for P2 from candidate (silent)
                    break;
                  }
                }
              }
            }
          } catch (e) { /* defensive */ }

          // create NPC controller for this p2 and set patrol bounds around spawn
          try {
            // Using imported NPCController
            const isSolid = (x: number, y: number) => isSolidAtCanvasPoint(x, y);
          // Create patrol bounds around spawn point (200px radius)
          const patrolRadius = 200;
          const patrolMinX = Math.max(0, Math.floor(p2Spawn.x - patrolRadius));
          const patrolMaxX = Math.min(WIDTH, Math.floor(p2Spawn.x + patrolRadius));
          npcController = new NPCController({
            keys: { left: P2_KEYS.left, right: P2_KEYS.right, up: P2_KEYS.up, attack1: P2_KEYS.attack1 },
            isSolidAt: isSolid,
            canvasW: WIDTH,
            canvasH: HEIGHT,
            spawnX: p2Spawn.x,
            simplePatrol: true, // Enable simple patrol behavior
            patrolDistance: 150 // 150 pixels from spawn
          });
          console.log(`[NPC] 🤖 NPCController initialized with simple patrol: spawn=${p2Spawn.x.toFixed(1)}, distance=150px`);
          } catch (e) { npcController = null; }
          // Ensure cyboard has correct HP config
          p2.hp = 3;
          p2.maxHp = 3;
        } else {
          p2 = null;
        }
      } catch (e) {
        p2 = null;
      }

      // Load and merge any extra atlases for this character (e.g. Laurin alt atlas)
      try {
        if (p1Config.extraAtlas && Array.isArray(p1Config.extraAtlas) && p1) {
          const extraPromises: Promise<any>[] = [];
          for (const ea of p1Config.extraAtlas) extraPromises.push(loadAtlas(ea.replace(/\.json$/, '')));
          const extraAtlases = await Promise.all(extraPromises);
          for (const e of extraAtlases) {
            if (!e || !e.image) continue;
            for (const s of Object.keys(e.animations)) {
              p1.anim.animations[s] = p1.anim.animations[s] || {} as any;
              const dest = p1.anim.animations[s];
              dest.image = e.image;
              dest.src = e.image.src;
              dest.imageLoaded = true;
              dest.imageBroken = false;
              dest.rects = e.animations[s].frames;
              dest.frameW = e.frameW;
              dest.frameH = e.frameH;
              dest.frames = e.animations[s].frames.length;
              dest.fps = (e.animations[s] && typeof (e.animations[s] as any).fps === 'number') ? (e.animations[s] as any).fps : ((e && e.meta && e.meta.fps) || dest.fps || 12);
              dest.loop = (e.animations[s] && typeof (e.animations[s] as any).loop === 'boolean') ? (e.animations[s] as any).loop : (dest.loop ?? true);
              console.log(`[qte] Patched extra atlas animation ${s} into P1 (singleplayer)`);
            }
            // Merge extra animations into atlas1.animations map so other systems can reference them via globalAtlas1
            atlas1.animations = atlas1.animations || {};
            for (const s of Object.keys(e.animations)) {
              atlas1.animations[s] = atlas1.animations[s] || e.animations[s];
            }
          }
        }
      } catch (err) {
        console.warn('[qte] failed to load/patch extra atlases for singleplayer', err);
      }

      // Ensure globalAtlas1 points to atlas1 so projectiles/blasts can use merged animations
      globalAtlas1 = atlas1;

      // Note: Granny NPC will be created automatically when transitioning to section 2+

      console.log('[qte] Singleplayer initialized');
    } catch (e) {
      console.error('[qte] Singleplayer init failed', e);
    }
  }

  // Initialize character selection
  loadCharacterForSelection(CHARACTERS[0].name);

  let last = performance.now();
  function loop(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (currentState === GameState.CHARACTER_SELECTION) {
      handleCharacterSelectionInput(dt);
      drawCharacterSelection(dt);
      requestAnimationFrame(loop);
      return;
    }

    // merge inputs
    const gp = readGamepadsUnified(P1_KEYS as any, P2_KEYS as any);
    const mergedInput: Record<string, boolean> = {};
    function getKeyboard(code: string) {
      return !!input[code];
    }
    [P1_KEYS.left, P1_KEYS.right, P1_KEYS.up, P1_KEYS.down, P1_KEYS.attack1, P1_KEYS.attack2, P1_KEYS.parry, P1_KEYS.ranged1, P1_KEYS.ranged2, P1_KEYS.transform, P1_KEYS.dodge].forEach((k) => {
      if (k) mergedInput[k] = !!gp[k] || getKeyboard(k);
    });
    [P2_KEYS.left, P2_KEYS.right, P2_KEYS.up, P2_KEYS.down, P2_KEYS.attack1, P2_KEYS.attack2, P2_KEYS.parry, P2_KEYS.ranged1, P2_KEYS.ranged2, P2_KEYS.transform, P2_KEYS.dodge].forEach((k) => {
      if (k) mergedInput[k] = !!gp[k] || getKeyboard(k);
    });

    // Convert parry input to edge (keydown) so holding the key doesn't retrigger parry
    try {
      const p1Held = !!mergedInput[P1_KEYS.parry];
      const p2Held = !!mergedInput[P2_KEYS.parry];
      // only true on the frame the key transitioned from up -> down
      mergedInput[P1_KEYS.parry] = p1Held && !prevHeldInput[P1_KEYS.parry];
      mergedInput[P2_KEYS.parry] = p2Held && !prevHeldInput[P2_KEYS.parry];
      prevHeldInput[P1_KEYS.parry] = p1Held;
      prevHeldInput[P2_KEYS.parry] = p2Held;
    } catch (e) { /* defensive */ }

    // If AI is enabled, let it mutate the mergedInput for P2
    // Pause AI updates during section transitions to avoid NPC running off
    // platforms while the heatmap/background are being reloaded.
    if (!transitioning && simpleAi && p2) {
      try {
        // Respect temporary AI pause timer on the fighter (set on spawn)
        try {
          const t = (p2 as any)._aiPauseTimer;
          if (typeof t === 'number' && t > 0) {
            (p2 as any)._aiPauseTimer = Math.max(0, t - dt);
            // simpleAi paused for P2 (debug log removed)
          } else {
            // AI state logging removed to reduce spam
            simpleAi.update(dt, mergedInput, p2, p1, projectiles);
            // AI input logging removed to reduce spam
          }
        } catch (e) { simpleAi.update(dt, mergedInput, p2, p1, projectiles); }
      } catch (e) {
        // swallow AI errors to avoid breaking the loop
      }
    } else if (transitioning && simpleAi) {
      // Debug: indicate AI update skipped during section transition
      // simpleAi.update skipped due to section transition (debug log removed)
    }

    // NPC controller for singleplayer (p2 exists but controlled by NPCController when present)
    if (!transitioning && npcController && p2) {
      try {
        const t = (p2 as any)._aiPauseTimer;
        if (typeof t === 'number' && t > 0) {
          (p2 as any)._aiPauseTimer = Math.max(0, t - dt);
          // npcController paused for P2 (debug log removed)
        } else {
          npcController.update(dt, mergedInput, p2, p1, projectiles);
        }
      } catch (e) {}
    } else if (transitioning && npcController) {
      // npcController.update skipped due to section transition (debug log removed)
    }

    // Granny NPC controller
    if (!transitioning && grannyController && grannyNpc) {
      try {
        const t = (grannyNpc as any)._aiPauseTimer;
        if (typeof t === 'number' && t > 0) {
          (grannyNpc as any)._aiPauseTimer = Math.max(0, t - dt);
          // grannyController paused (debug log removed)
        } else {
          grannyController.update(dt, mergedInput, grannyNpc, p1, projectiles);
        }
      } catch (e) {}
    } else if (transitioning && grannyController) {
      // grannyController.update skipped due to section transition (debug log removed)
    }

    // Debug input (only log once per press) - only if fighters are initialized
    if (p1 && p2) {
    if ((mergedInput[P1_KEYS.parry] && !p1.parrying) || (mergedInput[P2_KEYS.parry] && !p2.parrying)) {
      console.log(`[qte] PARRY INPUT DETECTED:`, {
        P1_parry: mergedInput[P1_KEYS.parry],
        P2_parry: mergedInput[P2_KEYS.parry],
        P1_key: P1_KEYS.parry,
        P2_key: P2_KEYS.parry
      });
    }
    if ((mergedInput[P1_KEYS.attack1] && !p1.attacking1) || (mergedInput[P2_KEYS.attack1] && !p2.attacking1)) {
      console.log(`[qte] ATTACK1 INPUT DETECTED:`, {
        P1_attack1: mergedInput[P1_KEYS.attack1],
        P2_attack1: mergedInput[P2_KEYS.attack1]
      });
    }
    if ((mergedInput[P1_KEYS.attack2] && !p1.attacking2) || (mergedInput[P2_KEYS.attack2] && !p2.attacking2)) {
      console.log(`[qte] ATTACK2 INPUT DETECTED:`, {
        P1_attack2: mergedInput[P1_KEYS.attack2],
        P2_attack2: mergedInput[P2_KEYS.attack2]
      });
      }
    }

    // draw background using CSS-cover style (cover the canvas, preserve aspect)
    if (stageImg.complete && stageImg.naturalWidth > 0) {
      const imgW = stageImg.naturalWidth;
      const imgH = stageImg.naturalHeight;
      const canvasRatio = WIDTH / HEIGHT;
      const imgRatio = imgW / imgH;
      let sx = 0, sy = 0, sw = imgW, sh = imgH;
      if (imgRatio > canvasRatio) {
        // image is wider — crop horizontally
        sw = Math.round(imgH * canvasRatio);
        sx = Math.round((imgW - sw) * 0.5);
      } else {
        // image is taller — crop vertically
        sh = Math.round(imgW / canvasRatio);
        sy = Math.round((imgH - sh) * 0.5);
      }
      ctx.drawImage(stageImg, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);
    } else {
      ctx.fillStyle = "#071428";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    // NOTE: removed bottom gray bar which was previously drawn as a visual
    // element and accidentally treated as solid by heatmap sampling. We now
    // rely solely on the heatmap for solidity and let entities fall through
    // anywhere the heatmap is absent.

    // NOTE: foreground overlay intentionally not drawn here anymore.
    // It will be rendered after characters/effects so it appears above them.

    // update (if fighters are initialized)
    if (p1) {
      // Prevent updating defeated/frozen fighters
      if (!(p1 as any)._frozen) p1.update(dt, mergedInput, projectiles, blasts);
    }
    if (p2) {
      if (!(p2 as any)._frozen) p2.update(dt, mergedInput, projectiles, blasts);
      // ensure newly spawned NPC has a short AI pause to avoid immediate fall-through
      try { if ((p2 as any)._aiPauseTimer == null) (p2 as any)._aiPauseTimer = 0.25; } catch (e) {}
    }

    // Update Granny NPC
    if (grannyNpc) {
      if (!(grannyNpc as any)._frozen) grannyNpc.update(dt, mergedInput, projectiles, blasts);
      // ensure newly spawned Granny has a short AI pause to avoid immediate fall-through
      try { if ((grannyNpc as any)._aiPauseTimer == null) (grannyNpc as any)._aiPauseTimer = 0.25; } catch (e) {}
    }

    // Stage collision: prefer heatmap-based collision (if provided), fallback to AABB platforms
    // Run collision/update logic for any existing fighter (p1, p2, and grannyNpc)
    [p1, p2, grannyNpc].forEach((f) => {
      if (!f) return;

      // PHYSICS BUG FIX: If P2 is not on ground, not flying, and has zero vy,
      // force gravity to kick in to prevent infinite hover state
      if (f.name === 'P2' && !f.onGround && !f.flying && f.vy === 0) {
        f.vy = 40; // Force downward velocity
        // P2 hover bug fix applied (log removed to reduce spam)
      }

      // EMERGENCY TELEPORT: If P2 falls too far below screen, teleport back to safe position
      if (f.name === 'P2' && f.y > HEIGHT + 500) {
        const mainPlatTop = getMainPlatformTop();
        f.y = mainPlatTop - f.h - 20; // Place slightly above platform
        f.x = Math.max(100, Math.min(WIDTH - 100, f.x)); // Keep within screen bounds
        f.vy = 0;
        f.vx = 0;
        f.onGround = false; // Let normal physics take over
        console.error('[qte][physics] EMERGENCY TELEPORT: P2 fell too far, teleporting to safe position. new pos=', { x: f.x, y: f.y });
      }
      const prevFoot = f.y + f.h - f.vy * dt; // estimated previous foot y (canvas coords)
      const foot = f.y + f.h;

      // If player is holding down while standing on ground, enable drop-through
      // (only when standing on a platform — conservatively allow for main platform)
      try {
        if (f.onGround && mergedInput[f.keys.down]) {
          f.onGround = false;
          // give a small downward nudge so the character starts to fall through
          f.vy = Math.max(f.vy, 40);
          // Debug: log when an entity (esp. NPC) intentionally drops through a platform
          try {
            // P2 drop-through triggered (log removed to reduce spam)
          } catch (e) {}
        }
      } catch (e) { /* defensive: missing keys mapping -> ignore */ }

      let landed = false;

      // Heatmap-based collision (if heatmap is available)
      if (heatmapCtx && heatmapCanvas && heatmapCanvas.width > 0 && stageImg && stageImg.naturalWidth > 0) {
        try {
          // Compute background draw parameters (same logic used when drawing the stage image)
          const imgW = stageImg.naturalWidth;
          const imgH = stageImg.naturalHeight;
          const canvasRatio = WIDTH / HEIGHT;
          const imgRatio = imgW / imgH;
          let sx = 0, sy = 0, sw = imgW, sh = imgH;
          if (imgRatio > canvasRatio) {
            sw = Math.round(imgH * canvasRatio);
            sx = Math.round((imgW - sw) * 0.5);
          } else {
            sh = Math.round(imgW / canvasRatio);
            sy = Math.round((imgH - sh) * 0.5);
          }

          // Map a canvas point to the stage source image coordinates:
          // srcX = sx + (canvasX / WIDTH) * sw
          // srcY = sy + (canvasY / HEIGHT) * sh
          const centerX = f.x + f.w * 0.5;
          const srcX = Math.floor(sx + (centerX / WIDTH) * sw);
          const prevSrcY = Math.floor(sy + (prevFoot / HEIGHT) * sh);
          const currSrcY = Math.floor(sy + (foot / HEIGHT) * sh);

          if (f.vy >= 0 && currSrcY >= prevSrcY) {
            // Physics collision scan logging removed to reduce spam

            // scan from previous foot to current foot in source-space for first solid pixel
            for (let syi = prevSrcY; syi <= currSrcY; syi++) {
              if (syi < 0 || syi >= heatmapCanvas.height || srcX < 0 || srcX >= heatmapCanvas.width) continue;
              const d = heatmapCtx.getImageData(srcX, syi, 1, 1).data;
              // consider nearly-black pixels with non-zero alpha as solid
              // Enhanced solid detection: accept black, dark gray, or any non-transparent pixel
      // (original: only nearly-black pixels, now: any visible pixel is considered solid)
      const isSolid = d[3] > 128; // Any pixel with >50% opacity is solid
              if (isSolid) {
                // If player is holding down, skip landing (allow drop-through)
                if (mergedInput[f.keys.down]) {
                  // P2 drop-through: holding down, skipping landing (log removed)
                  break;
                }
                // Map source y back to canvas coordinates
                const canvasY = ((syi - sy) / sh) * HEIGHT;
                if (typeof (f as any).landAt === 'function') (f as any).landAt(canvasY - f.h);
                else { f.y = canvasY - f.h; f.vy = 0; f.onGround = true; }
                // Debug: landing detected — log for NPCs to trace repeated falls
                try {
                  // P2 landing log removed to reduce console spam
                } catch (e) {}
                landed = true;
                break;
              }
            }
          }
        } catch (e) {
          // if sampling fails for any reason, fall back to platform AABB below
          // eslint-disable-next-line no-console
          console.warn('[qte] heatmap sampling failed, falling back to platform AABB', e);
        }
      }

      // Fallback AABB platform collision (existing logic) if heatmap didn't produce a landing
      if (!landed) {
        // choose the lowest platform under the fighter to avoid landing on higher invisible plates
        let candidate: any = null;
        let candidateY = -Infinity;
        for (const plat of stage.platforms) {
          const withinX = f.x + f.w > plat.x && f.x < plat.x + plat.w;
          // Consider this platform if the fighter is currently at/ below its top
          // and previously was above or at it (crossing downwards)
          if (withinX && foot >= plat.y && prevFoot <= plat.y && f.vy >= 0) {
            if (plat.y > candidateY) {
              candidate = plat;
              candidateY = plat.y;
            }
          }
        }
        if (candidate) {
          // If player is holding down, allow drop-through (skip landing)
          if (!mergedInput[f.keys.down]) {
            if (typeof (f as any).landAt === 'function') (f as any).landAt(candidate.y - f.h);
            else { f.y = candidate.y - f.h; f.vy = 0; f.onGround = true; }
          }
        } else {
          // EMERGENCY FALLBACK: Only create a virtual ground if a heatmap is
          // present but sampling failed. If no heatmap is loaded at all we want
          // entities to fall through (die) when off the mapped area.
          if (heatmapReady) {
            const mainPlatTop = getMainPlatformTop();
            if (f.vy >= 0 && foot >= mainPlatTop && prevFoot <= mainPlatTop) {
              if (typeof (f as any).landAt === 'function') (f as any).landAt(mainPlatTop - f.h);
              else { f.y = mainPlatTop - f.h; f.vy = 0; f.onGround = true; }
              console.warn('[qte][physics] EMERGENCY FALLBACK: Using virtual ground at main platform level for', f.name);
            }
          }
        }
      }

      // Note: platform clamping removed — collision is now heatmap-driven.

      // If player appears to be standing but there's no solid pixels under their feet
      // according to the heatmap, make them fall through (handles removed legacy platforms)
      try {
        if (f.onGround) {
          const footY = Math.floor(f.y + f.h + 1);
          // sample several points across the foot to decide support
          const samples = 3;
          let supported = false;
          const sampleResults = [];
          for (let i = 0; i < samples; i++) {
            const sx = Math.floor(f.x + 2 + (i / (samples - 1)) * Math.max(0, f.w - 4));
            const isSupported = isSolidAtCanvasPoint(sx, footY);
            sampleResults.push({ x: sx, supported: isSupported });
            if (isSupported) { supported = true; break; }
          }

          // Ground support check logging removed to reduce spam

          if (!supported) {
            // no support: start falling
            f.onGround = false;
            f.vy = Math.max(f.vy, 40);
            // Debug: no support under feet -> entity will fall. Log NPC-specific info.
            try {
              // P2 lost ground under feet (log removed to reduce spam)
            } catch (e) {}
          }
        }
      } catch (e) { /* defensive */ }

      // Previously: check fall out of stage or fully off-screen (side-out)
      // Side-out based death/stock loss when moving off the left/right of the canvas
      // has been removed per task request. We still preserve bottom-fall handling
      // (offBottom) to allow vertical outs to function.
      const offBottom = f.y > stage.fallThreshold;
      if (offBottom) {
        const reason = 'fell off stage';
        const other = (f === p1) ? p2 : p1;

        // For P1: respawn and lose stock (normal behavior)
        if (f.name === 'P1') {
          console.log(`[qte] P1 ${reason} — respawning and losing a stock`);

          // decrement stocks and handle defeat
          f.stocks = (typeof f.stocks === 'number') ? Math.max(0, f.stocks - 1) : 0;
          if (f.stocks <= 0) {
            // game over for P1
            f.state = 'defeat';
            f.attacking1 = false;
            f.attacking2 = false;
            f.parrying = false;
            f.ranging1 = false;
            f.ranging2 = false;
            f.vx = 0;
            f.vy = 0;
            if (f.anim && typeof f.anim.setState === 'function') f.anim.setState('defeat');
            // In singleplayer we don't flip to a global game-over state; treat as P1 defeat animation only
            if (!isSingleplayerMode()) {
              gameOver = true;
              winner = other || null;
            }
            console.log(`[qte] P1 has no stocks left — ${other?.name || 'unknown'} wins`);
          } else {
            // Respawn in current section, not always section_01
            try {
              const currentData = sectionCache[currentSectionIdx] || sectionCache[1] || null;
              if (currentData) {
                // switch assets to current section (or fallback to section_01)
                applySectionAssets(currentData);
                // Don't reset currentSectionIdx - stay in current section
                console.log(`[qte] P1 respawned in section ${currentSectionIdx} (not resetting to section 1)`);
                // P1 spawn
                const sp1 = currentData.spawn_points && currentData.spawn_points.find((sp: any) => sp.name === 'player_start');
                if (sp1) {
                  const c1 = mapSectionToCanvas(sp1.x, sp1.y);
                  c1.y -= 250;
                  f.x = c1.x; f.y = c1.y;
                  console.log(`[qte] P1 respawned at section ${currentSectionIdx} spawn point:`, sp1, '->', c1);
                } else {
                  const mainPlatTop = getMainPlatformTop();
                  f.x = 100; f.y = mainPlatTop - f.h;
                  console.log(`[qte] P1 respawned at fallback position in section ${currentSectionIdx}`);
                }
                // NPC spawn (if present and in section 1)
                if (p2 && currentSectionIdx === 1) {
                  const sp2 = currentData.spawn_points && currentData.spawn_points.find((sp: any) => sp.name === 'npc_spawn_1');
                  if (sp2) {
                    const c2 = mapSectionToCanvas(sp2.x, sp2.y);
                    c2.y -= 250;
                    p2.x = c2.x; p2.y = c2.y; p2.vx = 0; p2.vy = 0; p2.facing = -1;
                    console.log(`[qte] P2 (NPC1) respawned at section ${currentSectionIdx} spawn point:`, sp2, '->', c2);
                  }
                } else if (currentSectionIdx > 1) {
                  console.log(`[qte] P2 (NPC1) not respawned - current section ${currentSectionIdx} > 1`);
                }
              } else {
                // If cache missing, fall back to a safe placement
                const mainPlatTop = getMainPlatformTop();
                f.x = 100; f.y = mainPlatTop - f.h;
              }
            } catch (e) {
              const mainPlatTop = getMainPlatformTop();
              f.x = 100; f.y = mainPlatTop - f.h;
            }
            f.vx = 0;
            f.vy = 0;
            f.damagePercent = 0;
            f.launchedFromHit = false;
            f.hurt = false;
            f.hurtTimer = 0;
            f.stunTimer = 0;
          }
        } else {
          // For P2 (NPC): permanent defeat - no respawn (log suppressed)
          f.state = 'defeat';
          // Immediately remove defeated NPC from the scene so it is not drawn
          try {
            // clear AI/controllers
            npcController = null;
            simpleAi = null;
            // if we're iterating over p1/p2, remove the p2 reference
            if (f.name === 'P2') p2 = null;
          } catch (e) {}
          f.attacking1 = false;
          f.attacking2 = false;
          f.parrying = false;
          f.ranging1 = false;
          f.ranging2 = false;
          f.vx = 0;
          f.vy = 0;
          f.maxHp = 0;
          f.hp = 0;
          if (f.anim && typeof f.anim.setState === 'function') f.anim.setState('defeat');
          if (!isSingleplayerMode()) {
            gameOver = true;
            winner = p1 || null;
          }
          // P2 (NPC) defeated — log suppressed
        }
      }
    });

    // Section transition trigger: if P1 exits section_01 to the right, start transition to section_02
    try {
      if (!transitioning && currentSectionIdx === 1 && p1 && (p1.x > WIDTH)) {
        startSectionTransition(2, 'right');
      }
    } catch (e) { /* defensive */ }

    projectiles.forEach((pr) => pr.update(dt));
    blasts.forEach((b) => b.update(dt));

    // cleanup
    for (let i = projectiles.length - 1; i >= 0; i--) if (!projectiles[i].alive) projectiles.splice(i, 1);
    for (let i = blasts.length - 1; i >= 0; i--) if (!blasts[i].alive) blasts.splice(i, 1);

    // NPC corpse timer: decrement and remove defeated NPC bodies after timeout
    try {
      if (p2 && typeof (p2 as any)._corpseTimer === 'number') {
        (p2 as any)._corpseTimer = Math.max(0, (p2 as any)._corpseTimer - dt);
        if ((p2 as any)._corpseTimer <= 0) {
          // remove NPC and any controllers/AI associated with it
          try { npcController = null; } catch (e) {}
          try { simpleAi = null; } catch (e) {}
          p2 = null;
        }
      }
    } catch (e) {}

    // draw fighters and effects for any existing fighter
    if (p1 || p2 || grannyNpc) {
      if (p1) p1.draw();
      if (p2) p2.draw();
      if (grannyNpc) {
        // Debug: Check if Granny is within visible bounds
        const grannyVisible = grannyNpc.x >= -100 && grannyNpc.x <= WIDTH + 100 &&
                             grannyNpc.y >= -100 && grannyNpc.y <= HEIGHT + 100;
        if (!grannyVisible) {
          console.log(`[qte] ⚠️ Granny outside visible bounds: (${grannyNpc.x}, ${grannyNpc.y}) - Canvas: ${WIDTH}x${HEIGHT}`);
        }
        grannyNpc.draw();
      }

      // Remove defeated NPCs immediately after their defeat animation finished
      try {
        if (p2 && (p2 as any).shouldRemove) {
          console.log('[qte] Removing defeated NPC (P2) from game');
          p2 = null;
          // also clear any AI/controller references
          try { simpleAi = null; } catch (e) {}
          try { npcController = null; } catch (e) {}
        }
        if (grannyNpc && (grannyNpc as any).shouldRemove) {
          console.log('[qte] Removing defeated Granny NPC from game');
          grannyNpc = null;
          // also clear Granny controller reference
          try { grannyController = null; } catch (e) {}
        }
      } catch (e) {}
      // If NPC has a pending attack effect, draw it above the NPC using atlas rects
      try {
        if (p2 && (p2 as any).pendingAttackEffect) {
          const pa = (p2 as any).pendingAttackEffect;
          if (pa && pa.rects && pa.image) {
            // If this effect is waiting for the fighter to reach a specific
            // attack frame, check readiness first. If not ready, skip drawing
            // and do not advance the effect timer.
            if (pa.waitForAttack) {
              const anim = p2.anim;
              const animState = anim && anim.state;
              const animFrame = anim && typeof anim.frame === 'number' ? anim.frame : -1;
              const spawnFrame = typeof pa.spawnFrame === 'number' ? pa.spawnFrame : 0;
              const ready = (animState === 'attack1' && animFrame >= spawnFrame);
              if (!ready) {
                // still waiting for the attack to reach spawnFrame
              } else {
                // start playing the effect now
                pa.waitForAttack = false;
                pa.elapsed = 0;
              }
            }

            // Only advance/draw when not waiting
            if (!pa.waitForAttack) {
              // advance local elapsed time and choose current frame
              pa.elapsed = (pa.elapsed || 0) + dt;
              const fps = pa.fps || 12;
              const frames = pa.frames || (pa.rects && pa.rects.length) || 1;
              const frameIdx = Math.min(frames - 1, Math.floor(pa.elapsed * fps));
              const r = pa.rects[frameIdx];
              // If the fighter is currently rendering the exact same atlas image
              // and rect at the same frame, skip drawing the effect to avoid a
              // duplicated/mirrored overlay. This handles the case where the
              // effect uses the same frames as the attack animation.
              let _skipEffectFrame = false;
              try {
                const fighterAnim = p2.anim && p2.anim.animations && p2.anim.animations['attack1'];
                const isAttackState = p2.anim && p2.anim.state === 'attack1';
                if (isAttackState && fighterAnim && fighterAnim.rects && fighterAnim.rects.length > 0 && fighterAnim.image && fighterAnim.image === pa.image) {
                  const fighterFrameIdx = typeof p2.anim.frame === 'number' ? p2.anim.frame : -1;
                  const fighterRect = fighterAnim.rects[fighterFrameIdx];
                  const effectRect = r;
                  if (fighterRect && effectRect && fighterFrameIdx === frameIdx && fighterRect.x === effectRect.x && fighterRect.y === effectRect.y && fighterRect.w === effectRect.w && fighterRect.h === effectRect.h) {
                    // duplicate frame — skip drawing this effect frame
                    // still advance elapsed so it will finish eventually
                    _skipEffectFrame = true;
                    if (pa.elapsed >= frames / fps) {
                      try { delete (p2 as any).pendingAttackEffect; } catch (e) {}
                    }
                  }
                }
              } catch (e) {}
              if (_skipEffectFrame) {
                // skip the draw for this effect frame
              } else {
              const drawX = p2.x + p2.w * 0.5 - r.w * 0.5;
              const drawY = p2.y - r.h - 8;
              // Respect fighter facing when drawing the effect so it
              // matches the actor's flipped rendering and doesn't appear
              // as a mirrored duplicate above the sprite.
              const flip = (p2.facing || 1) < 0;
              if (flip) {
                try {
                  ctx.save();
                  // translate to the right edge of the destination rect and flip horizontally
                  ctx.translate(drawX + r.w, 0);
                  ctx.scale(-1, 1);
                  ctx.drawImage(pa.image, r.x, r.y, r.w, r.h, 0, drawY, r.w, r.h);
                  ctx.restore();
                } catch (e) {
                  // fallback to non-flipped draw on error
                  ctx.drawImage(pa.image, r.x, r.y, r.w, r.h, drawX, drawY, r.w, r.h);
                }
              } else {
                ctx.drawImage(pa.image, r.x, r.y, r.w, r.h, drawX, drawY, r.w, r.h);
              }
            }
              // remove effect after it played through all frames
              if (pa.elapsed >= frames / fps) {
                try { delete (p2 as any).pendingAttackEffect; } catch (e) {}
              }
            }
          } else {
            try { delete (p2 as any).pendingAttackEffect; } catch (e) {}
          }
        }
      } catch (e) {}
      projectiles.forEach((pr) => pr.draw(ctx));
      blasts.forEach((b) => b.draw(ctx));

      // draw foreground overlay after characters/effects so characters appear behind it
      if (stageForegroundImg.complete && stageForegroundImg.naturalWidth > 0) {
        try {
          const imgW = stageForegroundImg.naturalWidth;
          const imgH = stageForegroundImg.naturalHeight;
          const canvasRatio = WIDTH / HEIGHT;
          const imgRatio = imgW / imgH;
          let sx = 0, sy = 0, sw = imgW, sh = imgH;
          if (imgRatio > canvasRatio) {
            // image is wider — crop horizontally
            sw = Math.round(imgH * canvasRatio);
            sx = Math.round((imgW - sw) * 0.5);
          } else {
            // image is taller — crop vertically
            sh = Math.round(imgW / canvasRatio);
            sy = Math.round((imgH - sh) * 0.5);
          }
          ctx.drawImage(stageForegroundImg, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);
        } catch (e) { /* defensive: ignore draw errors */ }
      }

      // Draw percent bars (damage %) and stocks for P1
      if (p1) {
        drawPercentBar(ctx, 20, 20, p1.damagePercent, p1.stocks ?? 3, p1.color, "P1");
        // Parry cooldown indicator for P1 (3s max)
        drawParryCooldown(ctx, 20, 46, p1.parryCooldown ?? 0, 3, p1.color);
      }

      // Draw percent bars (damage %) and stocks for P2 if present
      if (p2) {
        drawPercentBar(ctx, WIDTH - 220, 20, p2.damagePercent, p2.stocks ?? 3, p2.color, "P2");
        // Parry cooldown indicator for P2
        drawParryCooldown(ctx, WIDTH - 220, 46, p2.parryCooldown ?? 0, 3, p2.color);
      }

      // Draw parry indicators
      if (p1 && p1.parrying) {
        drawParryIndicator(ctx, p1.x + p1.w/2, p1.y - 20, p1.parryTimer, p1.parryDurationDefault, 0, p1.color); // No parry window
      }
      if (p2 && p2.parrying) {
        drawParryIndicator(ctx, p2.x + p2.w/2, p2.y - 20, p2.parryTimer, p2.parryDurationDefault, 0, p2.color); // No parry window
      }
    }

    // Draw game over screen only in non-singleplayer modes
    if (!isSingleplayerMode() && gameOver && winner) {
      drawGameOverScreen(ctx, WIDTH, HEIGHT, winner);
    }

    // Handle section transition fade and apply of next section
    if (transitioning) {
      const FADE_TIME = 0.4; // seconds
      if (transitionPhase === 'fade_out') {
        transitionOpacity = Math.min(1, transitionOpacity + dt / FADE_TIME);
        // Once fully faded out, switch section (when data ready)
        if (transitionOpacity >= 1 - 1e-6) {
          // Ensure we have data and assets ready; if not start preloading and wait here at full black
          if (pendingSectionData && !assetsReadyForSwitch && !pendingAssetsPromise) {
            pendingAssetsPromise = switchSectionAssetsWithPreload(pendingSectionData).then(() => {
              console.log(`[qte] 🔄 Assets ready - updating currentSectionIdx: ${currentSectionIdx} -> ${targetSectionIdx}`);
              currentSectionIdx = targetSectionIdx;
              assetsReadyForSwitch = true;

              // Reposition fighters using new section spawn points
              try {
                // Seamless carry-over: keep relative positions
                if (transitionDirection === 'right') {
                  // entering from left edge of next section (slightly inside)
                  if (p1) { p1.x = 4; }
                  if (p2) { /* keep NPC where it was unless desired otherwise */ }
                } else if (transitionDirection === 'left') {
                  if (p1) { p1.x = WIDTH - 4; } // from right edge
                }
                if (p1) { p1.vx = 0; p1.vy = 0; p1.onGround = false; }
                if (p2) { p2.vx = 0; p2.vy = 0; }
              } catch (e) { /* defensive */ }

              pendingSectionData = null;
              pendingAssetsPromise = null;
              transitionPhase = 'fade_in';
            }).catch(() => {
              // even on failure, attempt to proceed to avoid lock
              assetsReadyForSwitch = true;
              pendingAssetsPromise = null;
              transitionPhase = 'fade_in';
            });
          }
        }
      } else if (transitionPhase === 'fade_in') {
        transitionOpacity = Math.max(0, transitionOpacity - dt / FADE_TIME);
        if (transitionOpacity <= 0 + 1e-6) {
          transitionOpacity = 0;
          transitionPhase = null;
          transitioning = false;
          // unfreeze fighters
          try { if (p1) (p1 as any)._frozen = false; } catch (e) {}
          try { if (p2) (p2 as any)._frozen = false; } catch (e) {}
          try { if (grannyNpc) (grannyNpc as any)._frozen = false; } catch (e) {}
        }
      }

      // Draw fade overlay
      try {
        ctx.save();
        const a = Math.max(0, Math.min(1, transitionOpacity));
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
      } catch (e) { /* ignore */ }
    }

    // collisions (only if fighters are initialized)
    if (p1 && p2) {
    const h1 = p1.hitbox(), h2 = p2.hitbox();
    if (h1 && aabb(h1, p2.rect())) {
      // Only trigger the attack effect once per attack animation
      if (p1.attacking1 || p1.attacking2) {
        const launchFlag = p1.attacking1 ? 'attack1Launched' : 'attack2Launched';
        if (!(p1 as any)[launchFlag]) {
          (p1 as any)[launchFlag] = true;
          // Check if P2 can parry P1's attack (no window restriction)
          if (p2.parrying && !p2.parryConsumed) {
            // Successful parry - handle based on attack type
            p2.parryConsumed = true;
            p2.parryFreezeTimer = 0.15;
            // If the attack was ranged (p1.ranging1||ranging2) -> negate damage
            if (p1.ranging1 || p1.ranging2) {
              // negate damage: do nothing to p2, maybe play feedback
              console.log(`[qte] P2 successfully ranged-parried P1's ranged attack: damage negated`);
            } else {
              // attack parry: reflect damage+knockback back to attacker
              console.log(`[qte] P2 successfully attack-parried P1's melee attack: reflecting`);
              // reflect a smaller percent back
              p1.receiveHit(20, 120, 1.0, (p2.x < p1.x) ? Math.PI : 0);
            }
          } else if (!p2.parrying || p2.parryConsumed) {
            // No parry or parry already consumed - melee hit
            const isSingleplayer = !!npcController;
            if (isSingleplayer) {
              // melee should subtract 1/3 of target max HP
              try { if (p2 && typeof p2.takeDamage === 'function') p2.takeDamage(Math.ceil((p2.maxHp || 1) / 3)); } catch(e) {}
            } else {
              // default percent/knockback behavior
              p2.receiveHit(30, 140, 0.6, (p1.x < p2.x) ? Math.PI : 0);
            }
          }
        }
      }
    }
    if (h2 && aabb(h2, p1.rect())) {
      // Only trigger the attack effect once per attack animation
      if (p2.attacking1 || p2.attacking2) {
        const launchFlag = p2.attacking1 ? 'attack1Launched' : 'attack2Launched';
        if (!(p2 as any)[launchFlag]) {
          (p2 as any)[launchFlag] = true;
          // Check if P1 can parry P2's attack (no window restriction)
          if (p1.parrying && !p1.parryConsumed) {
            // Successful parry - handle based on attack type
            p1.parryConsumed = true;
            p1.parryFreezeTimer = 0.15;
            if (p2.ranging1 || p2.ranging2) {
              console.log(`[qte] P1 successfully ranged-parried P2's ranged attack: damage negated`);
            } else {
              console.log(`[qte] P1 successfully attack-parried P2's melee attack: reflecting`);
              p2.receiveHit(20, 120, 1.0, (p1.x < p2.x) ? Math.PI : 0);
            }
          } else if (!p1.parrying || p1.parryConsumed) {
            // No parry or parry already consumed - melee hit
            const isSingleplayer = !!npcController;
            if (isSingleplayer) {
              // NPC attack: subtract 1/3 of P1 max HP per hit
              try { if (p1 && typeof p1.takeDamage === 'function') p1.takeDamage(Math.ceil((p1.maxHp || 1) / 3)); } catch(e) {}
            } else {
              p1.receiveHit(30, 140, 0.6, (p2.x < p1.x) ? Math.PI : 0);
            }
          }
        }
      }
    }

    for (const pr of projectiles) {
      if (!pr.alive) continue;
      // Ground / platform collision for projectiles (heatmap or platform AABB)
      try {
        const r = pr.rect();
        const centerX = r.x + r.w * 0.5;
        const bottomY = r.y + r.h;
        if (isSolidAtCanvasPoint(centerX, bottomY)) {
          // spawn blast at impact point and kill projectile
          let blastImage = null;
          let blastRects = null;
          let blastFrames = 4;
          if (pr.owner && pr.owner.name === 'P1' && globalAtlas1 && globalAtlas1.animations.blast) {
            blastImage = globalAtlas1.image;
            blastRects = globalAtlas1.animations.blast.frames;
            blastFrames = globalAtlas1.animations.blast.frames.length;
          } else if (pr.owner && pr.owner.name === 'P2' && globalAtlas2 && globalAtlas2.animations.blast) {
            blastImage = globalAtlas2.image;
            blastRects = globalAtlas2.animations.blast.frames;
            blastFrames = globalAtlas2.animations.blast.frames.length;
          }
          blasts.push(new Blast(centerX, bottomY, pr.owner && pr.owner.name === 'P1' ? P1_BLAST_SRC : P2_BLAST_SRC, blastFrames, blastImage, blastRects));
          pr.alive = false;
          continue;
        }
      } catch (e) { /* defensive */ }
      if (!pr.alive) continue;
      if (pr.owner !== p1 && aabb(pr.rect(), p1.rect())) {
        // Check if P1 can parry the projectile (no window restriction)
        if (p1.parrying && !p1.parryConsumed) {
          // Successful parry - no damage, stun attacker
          p1.parryConsumed = true;
          p1.parryFreezeTimer = 0.15;
          pr.owner.stunTimer = 1.2;
          pr.alive = false;
          console.log(`[qte] P1 successfully parried P2's projectile! (parry window active)`);
        } else if (!p1.parrying || p1.parryConsumed) {
          // No parry or parry already consumed - apply HP damage for ranged hit
          try {
            const hpDamage = Math.max(1, Math.ceil((p1.maxHp || 1) / 12));
            if (typeof p1.takeDamage === 'function') p1.takeDamage(hpDamage);
          } catch (e) {}
          // Additionally apply percent/knockback when projectile carries knockback
          if (pr.applyKnockbackOnHit) {
            p1.receiveHit(8, 90, 0.9, (pr.vx < 0) ? Math.PI : 0);
          } else {
            // fallback: small percent increase
            p1.damagePercent += 8;
            console.log(`[qte] ${p1.name} percent increased to ${p1.damagePercent}`);
          }
          pr.alive = false;
        }
        // Debug: log hit and blast chosen
        // eslint-disable-next-line no-console
        console.debug("[qte] projectile hit P1", { projectileSrc: pr.anim.animations["fly"]?.src, blastSrc: P2_BLAST_SRC });
        // Use atlas for blast if available
        let blastImage = null;
        let blastRects = null;
        let blastFrames = 4;

        if (globalAtlas2 && globalAtlas2.animations.blast) {
          blastImage = globalAtlas2.image;
          blastRects = globalAtlas2.animations.blast.frames;
          blastFrames = globalAtlas2.animations.blast.frames.length;
          console.log(`[qte] Blast using atlas frames from cyboard`);
        } else {
          console.log(`[qte] Blast: No atlas frames for 'blast' in cyboard, falling back to individual image.`);
        }

        // spawn blast at projectile impact position (use projectile rect if available)
        try {
          const r = pr.rect();
          const blastX = r.x + r.w * 0.5;
          const blastY = r.y + r.h * 0.5;
          blasts.push(new Blast(blastX, blastY, P2_BLAST_SRC, blastFrames, blastImage, blastRects));
        } catch (e) {
          blasts.push(new Blast(p1.x + p1.w * 0.5, p1.y + p1.h * 0.5, P2_BLAST_SRC, blastFrames, blastImage, blastRects));
        }
      }
      if (pr.owner !== p2 && aabb(pr.rect(), p2.rect())) {
        // Check if P2 can parry the projectile (no window restriction)
        if (p2.parrying && !p2.parryConsumed) {
          // Successful parry - no damage, stun attacker
          p2.parryConsumed = true;
          p2.parryFreezeTimer = 0.15;
          pr.owner.stunTimer = 1.2;
          pr.alive = false;
          console.log(`[qte] P2 successfully parried P1's projectile! (parry window active)`);
        } else if (!p2.parrying || p2.parryConsumed) {
          // No parry or parry already consumed - apply HP damage for ranged hit
          try {
            const hpDamage = Math.max(1, Math.ceil((p2.maxHp || 1) / 12));
            if (typeof p2.takeDamage === 'function') p2.takeDamage(hpDamage);
          } catch (e) {}
          // Additionally apply percent/knockback when projectile carries knockback
          if (pr.applyKnockbackOnHit) {
            p2.receiveHit(8, 90, 0.9, (pr.vx < 0) ? Math.PI : 0);
          } else {
            // fallback: small percent increase
            p2.damagePercent += 8;
            console.log(`[qte] ${p2.name} percent increased to ${p2.damagePercent}`);
          }
          pr.alive = false;
        }
        // Debug: log hit and blast chosen
        // eslint-disable-next-line no-console
        console.debug("[qte] projectile hit P2", { projectileSrc: pr.anim.animations["fly"]?.src, blastSrc: P1_BLAST_SRC });
        // Use atlas for blast if available
        let blastImage = null;
        let blastRects = null;
        let blastFrames = 4;

        if (globalAtlas1 && globalAtlas1.animations.blast) {
          blastImage = globalAtlas1.image;
          blastRects = globalAtlas1.animations.blast.frames;
          blastFrames = globalAtlas1.animations.blast.frames.length;
          console.log(`[qte] Blast using atlas frames from ninja`);
        } else {
          console.log(`[qte] Blast: No atlas frames for 'blast' in ninja, falling back to individual image.`);
        }

        try {
          const r = pr.rect();
          const blastX = r.x + r.w * 0.5;
          const blastY = r.y + r.h * 0.5;
          blasts.push(new Blast(blastX, blastY, P1_BLAST_SRC, blastFrames, blastImage, blastRects));
        } catch (e) {
          blasts.push(new Blast(p2.x + p2.w * 0.5, p2.y + p2.h * 0.5, P1_BLAST_SRC, blastFrames, blastImage, blastRects));
        }
      }
    }

    // auto-defeat and game over logic
    if (p1.isDefeated() && p1.state !== "defeat") {
      p1.state = "defeat";
      p1.attacking1 = false;
      p1.attacking2 = false;
      p1.parrying = false;
      p1.ranging1 = false;
      p1.ranging2 = false;
      p1.vx = 0;
      p1.vy = 0;
      p1.anim.setState("defeat");
      // Only set global game-over in non-singleplayer modes
      if (!isSingleplayerMode()) {
        gameOver = true;
        winner = p2;
      }
      console.log(`[qte] P1 DEFEATED! P2 WINS!`);
    }
    if (p2.isDefeated() && p2.state !== "defeat") {
      p2.state = "defeat";
      p2.attacking1 = false;
      p2.attacking2 = false;
      p2.parrying = false;
      p2.ranging1 = false;
      p2.ranging2 = false;
      p2.vx = 0;
      p2.vy = 0;
      p2.anim.setState("defeat");
      if (!isSingleplayerMode()) {
        gameOver = true;
        winner = p1;
      }
      console.log(`[qte] P2 DEFEATED! P1 WINS!`);
      }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

  function aabb(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  function drawHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number, currentHp: number, maxHp: number, color: string, playerName: string) {
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
      const heartX = x + (i * heartSpacing);
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

  function drawPercentBar(ctx: CanvasRenderingContext2D, x: number, y: number, percent: number, stocks: number, color: string, playerName: string) {
    const barWidth = 160;
    const barHeight = 20;
    ctx.fillStyle = "#333";
    ctx.fillRect(x, y, barWidth, barHeight);
    const pct = Math.min(100, percent) / 100;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth * pct, barHeight);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#fff";
    ctx.font = "12px Arial";
    ctx.fillText(`${playerName} ${Math.round(percent)}% (${stocks})`, x, y - 5);
  }

  function drawParryCooldown(ctx: CanvasRenderingContext2D, x: number, y: number, cooldown: number, max: number, color: string) {
    const w = 160;
    const h = 8;
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, w, h);
    const pct = Math.max(0, Math.min(1, cooldown / max));
    // fill remaining cooldown as red proportion
    ctx.fillStyle = pct > 0 ? 'rgba(200,50,50,0.9)' : 'rgba(50,200,50,0.9)';
    ctx.fillRect(x, y, w * (1 - pct), h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    const text = cooldown > 0 ? `${cooldown.toFixed(1)}s` : 'Ready';
    ctx.fillText(text, x + w + 6, y + h);
  }

  function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.beginPath();
    ctx.moveTo(x + size/2, y + size);
    ctx.bezierCurveTo(x, y + size, x, y + size/2, x + size/2, y + size/2);
    ctx.bezierCurveTo(x + size, y + size/2, x + size, y + size, x + size/2, y + size);
    ctx.bezierCurveTo(x + size, y + size/2, x + size, y, x + size/2, y);
    ctx.bezierCurveTo(x, y, x, y + size/2, x + size/2, y + size/2);
    ctx.fill();
  }

  function drawHeartOutline(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.beginPath();
    ctx.moveTo(x + size/2, y + size);
    ctx.bezierCurveTo(x, y + size, x, y + size/2, x + size/2, y + size/2);
    ctx.bezierCurveTo(x + size, y + size/2, x + size, y + size, x + size/2, y + size);
    ctx.bezierCurveTo(x + size, y + size/2, x + size, y, x + size/2, y);
    ctx.bezierCurveTo(x, y, x, y + size/2, x + size/2, y + size/2);
    ctx.stroke();
  }

  function drawParryIndicator(ctx: CanvasRenderingContext2D, x: number, y: number, currentTimer: number, totalDuration: number, windowLength: number, color: string) {
    const barWidth = 60;
    const barHeight = 8;

    // Background
    ctx.fillStyle = "#333";
    ctx.fillRect(x - barWidth/2, y, barWidth, barHeight);

    // Progress bar
    const progress = (totalDuration - currentTimer) / totalDuration;
    ctx.fillStyle = color;
    ctx.fillRect(x - barWidth/2, y, barWidth * progress, barHeight);

    // Parry window indicator
    const windowStart = (totalDuration - windowLength) / totalDuration;
    const windowEnd = 1.0;
    const windowX = x - barWidth/2 + barWidth * windowStart;
    const windowW = barWidth * (windowEnd - windowStart);

    ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
    ctx.fillRect(windowX, y, windowW, barHeight);

    // Border
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - barWidth/2, y, barWidth, barHeight);

    // "PARRY" text
    ctx.fillStyle = "#fff";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PARRY", x, y - 5);
    ctx.textAlign = "left";
  }

  function drawGameOverScreen(ctx: CanvasRenderingContext2D, width: number, height: number, winner: Fighter) {
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
