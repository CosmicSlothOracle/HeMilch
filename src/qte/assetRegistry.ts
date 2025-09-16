// Central asset registry for QTE demo – can later be replaced by JSON generated list
export type AnimationOverride = Partial<{
  src: string;
  frames: number;
  fps: number;
  loop: boolean;
  frameW: number;
  frameH: number;
}>;

// --- Asset paths per character folder ----
// Asset paths are resolved relative to the location of the HTML file (public/qte/index.html).
// We use relative URLs (no leading slash) to avoid issues when the demo is deployed under a sub-path.
export const P1_PROJECTILE_SRC = "/qte/ninja/projectile_256x256_6.png";
export const P1_BLAST_SRC = "/qte/ninja/blast_256x256_4.png";

export const P2_PROJECTILE_SRC = "/qte/cyboard/projectile_256x256_6.png";
// cyboard currently has no dedicated blast sprite – fallback to the neutral ninja blast
export const P2_BLAST_SRC = "/qte/cyboard/blast_256x256_4.png";

function framesFromFilename(src: string, fallback: number): number {
  const m = /_(\d+)\.(png|jpg|jpeg|webp)$/i.exec(src || "");
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

// Character definitions with their specific configurations
export interface CharacterConfig {
  name: string;
  displayName: string;
  folder: string;
  atlasPath: string;
  color: string;
  emoji: string;
  overrides?: Record<string, AnimationOverride>;
  extraAtlas?: string[];
}

export const CHARACTERS: CharacterConfig[] = [
  {
    name: "ninja",
    displayName: "Ninja",
    folder: "ninja",
    atlasPath: "/qte/ninja",
    color: "#4aa3ff",
    emoji: "🥷",
    overrides: {
      attack1: { src: "/qte/ninja/attack_256x256_7.png", frames: 7, fps: 12 },
      attack2: { src: "/qte/ninja/attack2_256x256_7.png", frames: 7, fps: 12 },
      ranged1: { src: "/qte/ninja/ranged_256x256_4.png", frames: 4, fps: 12 },
      ranged2: { src: "/qte/ninja/ranged2_256x256_4.png", frames: 4, fps: 12 },
    }
  },
  {
    name: "cyboard",
    displayName: "Cyborg",
    folder: "cyboard",
    atlasPath: "/qte/cyboard/atlas2",
    color: "#ff7a7a",
    emoji: "🦾",
    overrides: {
      idle: { src: "/qte/cyboard/idle_256x256_4.png", frames: 4, fps: 6 },
      walk: { src: "/qte/cyboard/walk_256x256_4.png", frames: 4, fps: 10 },
      attack1: { src: "/qte/cyboard/attack_256x256_7.png", frames: 7, fps: 12 },
      attack2: { src: "/qte/cyboard/attack2_256x256_7.png", frames: 7, fps: 12 },
      ranged1: { src: "/qte/cyboard/ranged_256x256_4.png", frames: 4, fps: 12 },
      ranged2: { src: "/qte/cyboard/ranged2_256x256_4.png", frames: 4, fps: 12 },
      parry: { src: "", frames: 6, fps: 3.33 },
      blast: { src: "/qte/cyboard/blast_256x256_4.png", frames: 4, fps: 12 },
      projectile: { src: "/qte/cyboard/projectile_256x256_6.png", frames: 6, fps: 15, loop: true },
      hurt: { src: "/qte/cyboard/hurt_256x256_4.png", frames: 4, fps: 15 },
    }
  },
  {
    name: "laurin",
    displayName: "Laurin",
    folder: "Laurin",
    atlasPath: "/qte/Laurin/atlas4",
    color: "#9c27b0",
    emoji: "🧑‍💼",
    overrides: {
      // Laurin uses atlas, so most animations will be patched by atlas system
      // Only specify overrides for animations that might not be in atlas
      projectile: { src: "", frames: 6, fps: 15, loop: true }, // Fallback
      hurt: { src: "", frames: 4, fps: 15 }, // Fallback
      defeat: { src: "", frames: 4, fps: 6 }, // Fallback
      parry: { src: "", frames: 4, fps: 3.33, loop: false }, // Laurin's slow parry animation
    }
    ,
    extraAtlas: ["/qte/Laurin/atlas4_1.json", "/qte/Laurin/atlas4.json"]
  }
  ,
  {
    name: "laurin2",
    displayName: "Laurin (alt)",
    folder: "Laurin",
    atlasPath: "/qte/Laurin/atlas4_1",
    color: "#7b1fa2",
    emoji: "🧑‍💼",
    overrides: {
      // atlas4_1 provides additional frames/animations; no overrides required
    }
  }
  ,
  {
    name: "granny",
    displayName: "Granny",
    folder: "granny",
    atlasPath: "/qte/granny/atlas3.json",
    color: "#6ab04c",
    emoji: "👵",
    overrides: {
      idle: { src: "/qte/granny/idle_256x256_6.png", frames: 6, fps: 6, loop: true },
      spawn: { src: "/qte/granny/spawn_256x256_6.png", frames: 6, fps: 8 },
      attack1: { src: "/qte/granny/attack_256x256_7.png", frames: 7, fps: 12 },
      attack2: { src: "/qte/granny/attack2_256x256_7.png", frames: 7, fps: 12 },
      ranged1: { src: "/qte/granny/ranged_256x256_4.png", frames: 4, fps: 12 },
      ranged2: { src: "/qte/granny/ranged2_256x256_4.png", frames: 4, fps: 12 },
      parry: { src: "", frames: 6, fps: 3.33 },
      projectile: { src: "/qte/granny/projectile_256x256_6.png", frames: 6, fps: 15, loop: true },
      hurt: { src: "/qte/granny/hurt_256x256_4.png", frames: 4, fps: 15 },
    }
  }
];

export function getCharacterConfig(name: string): CharacterConfig | null {
  return CHARACTERS.find(char => char.name === name) || null;
}

export function buildSpriteConfig(
  folder: string,
  overrides?: Record<string, AnimationOverride>
) {
  // Ensure no trailing slashes and keep the path RELATIVE (no leading '/')
  const base = folder.replace(/\/+$|\/+$/g, "");
  const anims: Record<string, AnimationOverride> = {
    idle: {
      src: `/qte/${base}/idle_256x256_6.png`,
      frames: framesFromFilename(`/qte/${base}/idle_256x256_6.png`, 6),
      fps: 6,
      loop: true,
      frameW: 256,
      frameH: 256,
    },
    walk: {
      src: `/qte/${base}/walk_256x256_6.png`,
      frames: framesFromFilename(`/qte/${base}/walk_256x256_6.png`, 6),
      fps: 10,
      loop: true,
      frameW: 256,
      frameH: 256,
    },
    jump: {
      src: `/qte/${base}/jump_256x256_8.png`,
      frames: framesFromFilename(`/qte/${base}/jump_256x256_8.png`, 8),
      fps: 12,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    attack1: {
      src: `/qte/${base}/attack_256x256_7.png`,
      frames: framesFromFilename(`/qte/${base}/attack_256x256_7.png`, 7),
      fps: 12,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    attack2: {
      src: `/qte/${base}/attack2_256x256_7.png`,
      frames: framesFromFilename(`/qte/${base}/attack2_256x256_7.png`, 7),
      fps: 12,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    parry: {
      src: "", // Will be patched by atlas system
      frames: 6,
      fps: 3.33, // Slower parry animation for better gameplay
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    spawn: {
      src: `/qte/${base}/spawn_256x256_6.png`,
      frames: framesFromFilename(`/qte/${base}/spawn_256x256_6.png`, 6),
      fps: 8,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    defeat: {
      src: `/qte/${base}/defeat_256x256_4.png`,
      frames: framesFromFilename(`/qte/${base}/defeat_256x256_4.png`, 4),
      fps: 6,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    projectile: {
      src: `/qte/${base}/projectile_256x256_6.png`,
      frames: framesFromFilename(`/qte/${base}/projectile_256x256_6.png`, 6),
      fps: 15, // Match the improved projectile animation FPS
      loop: true,
      frameW: 256,
      frameH: 256,
    },
    ranged1: {
      src: `/qte/${base}/ranged_256x256_4.png`,
      frames: framesFromFilename(`/qte/${base}/ranged_256x256_4.png`, 4),
      fps: 12,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    ranged2: {
      src: `/qte/${base}/ranged2_256x256_4.png`,
      frames: framesFromFilename(`/qte/${base}/ranged2_256x256_4.png`, 4),
      fps: 12,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    blast: {
      src: `/qte/${base}/blast_256x256_4.png`,
      frames: framesFromFilename(`/qte/${base}/blast_256x256_4.png`, 4),
      fps: 12,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
    hurt: {
      src: `/qte/${base}/hurt_256x256_4.png`,
      frames: framesFromFilename(`/qte/${base}/hurt_256x256_4.png`, 4),
      fps: 15,
      loop: false,
      frameW: 256,
      frameH: 256,
    },
  };
  if (overrides) {
    for (const k of Object.keys(overrides)) {
      anims[k] = { ...anims[k], ...overrides[k] };
    }
  }
  return { frameW: 256, frameH: 256, animations: anims };
}
