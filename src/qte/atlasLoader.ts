// src/qte/atlasLoader.ts - simple runtime loader for TexturePacker JSON (ARRAY) format
// The JSON layout we expect (TexturePacker "JSON (Hash)" or "JSON (Array)" works):
// {
//   "frames": {
//      "idle_0": { "frame": {"x":0,"y":0,"w":256,"h":256}, ... },
//      "idle_1": {...},
//      "walk_0": {...}
//   },
//   "meta": { "image": "atlas.png" }
// }
// Each frame key is expected to be <state>_<index> (index starting at 0).
// We group them into an array per state and keep the order of index.

export interface Rect { x: number; y: number; w: number; h: number }
export interface AtlasAnimation {
  frames: Rect[];
  fps: number;
  loop: boolean;
}

export interface LoadedAtlas {
  image: HTMLImageElement;
  animations: Record<string, AtlasAnimation>;
  frameW: number;
  frameH: number;
  frames?: Record<string, any>; // Raw frames data for fallback frame counting
  meta?: any; // optional meta object from the atlas JSON (image, size, fps, etc.)
}

export async function loadAtlas(basePath: string): Promise<LoadedAtlas> {
  // basePath may be a directory or a path to a JSON file (e.g. "/qte/ninja" or "/qte/ninja/atlas2.json")
  const cacheBuster = Date.now();

  const candidates: string[] = [];
  if (basePath.match(/\.json$/i)) {
    candidates.push(basePath);
  } else {
    candidates.push(`${basePath}/atlas.json`);
    candidates.push(`${basePath}.json`);
    // allow explicit atlas2 naming (common in this project)
    candidates.push(`${basePath}/atlas2.json`);
    candidates.push(`${basePath}/atlas2`);
    // Also try other common atlas filenames used in this project
    candidates.push(`${basePath}/atlas3.json`);
    candidates.push(`${basePath}/atlas4.json`);
    candidates.push(`${basePath}/atlas4_1.json`);
    candidates.push(`${basePath}/atlas4-1.json`);
    candidates.push(`${basePath}/atlas3`);
    candidates.push(`${basePath}/atlas4`);
    // Additional fallbacks for projects that use capitalized filenames
    candidates.push(`${basePath}/Atlas.json`);
    candidates.push(`${basePath}.Atlas.json`); // if basePath already points to atlas directory
    candidates.push(`${basePath}/Atlas2.json`);
    candidates.push(`${basePath}/Atlas2`);
  }

  let text: string | null = null;
  let usedJsonUrl: string | null = null;
  const tried: string[] = [];

  // Try candidates in order, but validate parsed JSON and ensure we don't
  // accidentally accept an atlas that belongs to a different character folder
  // (common when server returns a directory index or fallback file).
  for (const cand of candidates) {
    const url = `${cand}?v=${cacheBuster}`;
    tried.push(url);
    console.log(`[atlas] Trying ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`[atlas] ${url} responded ${res.status}`);
        continue;
      }

      const contentType = res.headers.get('content-type') || '';
      const body = await res.text();

      // If server returned HTML (e.g. index.html), skip and try next candidate
      if (contentType.includes('text/html') || body.trim().startsWith('<!DOCTYPE')) {
        console.warn(`[atlas] ${url} looks like HTML (skipping)`);
        continue;
      }

      // Try parsing JSON early so we can validate the file belongs to the
      // expected character folder. If parse fails, treat as non-match.
      let parsed: any = null;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        console.warn(`[atlas] ${url} returned non-JSON content (skipping)`);
        continue;
      }

      // Basic shape check
      if (!parsed || typeof parsed !== 'object' || !parsed.frames) {
        console.warn(`[atlas] ${url} JSON missing 'frames' key (skipping)`);
        continue;
      }

      // If caller passed a basePath under /qte/<char>/..., ensure the loaded
      // JSON comes from the same character folder. This prevents accidental
      // cross-loading when the server returns an index/fallback.
      const expectedCharMatch = String(basePath).match(/\/qte\/([^\/]+)/i);
      const usedCharMatch = String(url).match(/\/qte\/([^\/]+)/i);
      const expectedChar = expectedCharMatch ? expectedCharMatch[1].toLowerCase() : null;
      const usedChar = usedCharMatch ? usedCharMatch[1].toLowerCase() : null;
      if (expectedChar && usedChar && expectedChar !== usedChar) {
        console.warn(`[atlas] ${url} appears to belong to '${usedChar}' not requested '${expectedChar}' (skipping)`);
        continue;
      }

      // Accept this JSON
      text = body;
      usedJsonUrl = url.replace(/\?v=\d+$/, '');
      console.log(`[atlas] Loaded JSON from ${url} (len=${text.length})`);
      break;
    } catch (e) {
      console.warn(`[atlas] fetch failed for ${url}`, e);
      continue;
    }
  }

  if (!text || !usedJsonUrl) {
    throw new Error(`Atlas JSON not found. Tried: ${tried.join(', ')}`);
  }

  console.log(`[atlas] JSON response length: ${text.length}, starts with: ${text.substring(0, 100)}`);

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error(`[atlas] JSON parse error:`, e);
    console.error(`[atlas] Invalid JSON text:`, text.substring(0, 200));
    throw e;
  }

  const framesData = data.frames;
  const meta = data.meta || {};
  // compute base directory from usedJsonUrl
  const baseDir = usedJsonUrl.replace(/\/[^/]*$/, '');
  const imgPath = `${baseDir}/${meta.image || 'atlas.png'}?v=${cacheBuster}`;
  console.log(`[atlas] Loading image ${imgPath}`);
  const image = await loadImage(imgPath);

  const stateMap: Record<string, Rect[]> = {};
  for (const key in framesData) {
    const state = key.replace(/_\d+$/, "");
    const idxMatch = /_(\d+)$/.exec(key);
    const idx = idxMatch ? parseInt(idxMatch[1], 10) : 0;
    if (!stateMap[state]) stateMap[state] = [];
    const f = framesData[key].frame as { x: number; y: number; w: number; h: number };
    stateMap[state][idx] = { x: f.x, y: f.y, w: f.w, h: f.h };
  }

  // Sort frames by index to ensure correct order
  for (const state in stateMap) {
    stateMap[state].sort((a, b) => {
      // Find the original indices for sorting
      const aIdx = Object.keys(framesData).find(k => k.startsWith(`${state}_`) && framesData[k].frame.x === a.x && framesData[k].frame.y === a.y);
      const bIdx = Object.keys(framesData).find(k => k.startsWith(`${state}_`) && framesData[k].frame.x === b.x && framesData[k].frame.y === b.y);
      if (aIdx && bIdx) {
        const aNum = parseInt(aIdx.split('_')[1], 10);
        const bNum = parseInt(bIdx.split('_')[1], 10);
        return aNum - bNum;
      }
      return 0;
    });
  }

  // If animations are provided in the JSON, use them instead of auto-generated stateMap
  if (data.animations) {
    const animationsFromJson: Record<string, Rect[]> = {};
    for (const animName in data.animations) {
      const frameNames = data.animations[animName];
      animationsFromJson[animName] = frameNames.map((frameName: string) => {
        const frame = framesData[frameName];
        if (frame) {
          return { x: frame.frame.x, y: frame.frame.y, w: frame.frame.w, h: frame.frame.h };
        }
        return { x: 0, y: 0, w: 256, h: 256 }; // fallback
      });
    }
    // Override stateMap with animations from JSON
    Object.assign(stateMap, animationsFromJson);
  }

  // Determine frame size: prefer meta.tileSize if provided
  const firstState = Object.keys(stateMap)[0];
  const firstFrame = firstState ? stateMap[firstState][0] : { w: 64, h: 64 };
  const tileSize = (meta.tileSize && Array.isArray(meta.tileSize) && meta.tileSize.length >= 2) ? meta.tileSize : [firstFrame.w, firstFrame.h];
  const frameW = tileSize[0];
  const frameH = tileSize[1];

  // Build animations; prefer loop/fps from data.animations if present
  const providedAnims = data.animations || {};
  const animationSettings = data.animationSettings || {};
  const animations: Record<string, AtlasAnimation> = {};
  for (const s of Object.keys(stateMap)) {
    // stateMap[s] was filled using explicit indices earlier -> filter out any undefined gaps
    const framesList = stateMap[s].filter((f) => f !== undefined && f !== null);
    const provided = providedAnims[s] || providedAnims[s + ''];
    const settings = animationSettings[s] || {};

    // Priority: animationSettings > provided > meta default
    const fps = settings.fps || (provided && provided.fps ? provided.fps : (meta.fps || 12));
    const loop = settings.loop !== undefined ? settings.loop : (provided && typeof provided.loop === 'boolean' ? provided.loop : true);
    animations[s] = { frames: framesList, fps, loop };

    // Debug parry animation specifically
    if (s === "parry") {
      console.log(`[atlas] PARRY ANIMATION LOADED:`, {
        state: s,
        frames: framesList.length,
        rects: framesList,
        fps,
        loop,
        providedAnims: providedAnims[s]
      });
    }

    // Debug projectile3 animation specifically
    if (s === "projectile3") {
      console.log(`[atlas] PROJECTILE3 ANIMATION LOADED:`, {
        state: s,
        frames: framesList.length,
        rects: framesList,
        fps,
        loop,
        providedAnims: providedAnims[s]
      });
    }
  }

  // Return meta as well so callers can rely on atlas.meta properties
  return { image, animations, frameW, frameH, frames: framesData, meta };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
