// Registry for NPC Behaviors used by NPCController/SimpleAI
// Provides a simple factory/registry so different NPC "personalities"
// can be registered and instantiated by key.

import type { Projectile } from '../fighter';

export interface BehaviorContext {
  dt: number;
  p1: any | null;
  p2: any | null;
  projectiles: Projectile[];
  isSolidAt?: (x: number, y: number) => boolean;
  canvasW?: number;
  canvasH?: number;
}

export type InputIntent = Partial<Record<string, boolean>>;

export interface NPCBehavior {
  // Called once when behavior is attached (optional)
  init?: (opts?: any) => void;
  // Called every frame. Should return a mapping of keys -> boolean
  // representing the desired inputs for this frame (left/right/up/attack1/parry...)
  update: (ctx: BehaviorContext, opts?: any) => InputIntent;
}

export type BehaviorFactory = (opts?: any) => NPCBehavior;

const REGISTRY: Record<string, BehaviorFactory> = {};

export function registerBehavior(key: string, factory: BehaviorFactory) {
  if (!key || typeof key !== 'string') throw new Error('behavior key must be a string');
  REGISTRY[key] = factory;
}

export function createBehavior(key: string, opts?: any): NPCBehavior | null {
  const f = REGISTRY[key];
  if (!f) return null;
  const b = f(opts || {});
  try { if (typeof b.init === 'function') b.init(opts); } catch (e) { /* defensive */ }
  return b;
}

// Helper to list available behavior keys
export function listAvailableBehaviors() { return Object.keys(REGISTRY); }

// ------------------------
// Built-in example behaviors
// ------------------------

// Patrol: simple left/right patrol between bounds
registerBehavior('patrol', (opts = {}) => {
  const minX = typeof opts.minX === 'number' ? opts.minX : 0;
  const maxX = typeof opts.maxX === 'number' ? opts.maxX : (opts.canvasW || 800) - 100;
  let dir: 1 | -1 = typeof opts.startDir === 'number' && opts.startDir > 0 ? 1 : -1;

  return {
    update(ctx: BehaviorContext) {
      const out: InputIntent = {};
      if (!ctx.p2) return out;
      const x = ctx.p2.x || 0;
      if (x <= minX) dir = 1;
      if ((x + (ctx.p2.w || 0)) >= maxX) dir = -1;
      if (dir === 1) out[opts.keys?.right || 'right'] = true;
      else out[opts.keys?.left || 'left'] = true;
      return out;
    }
  };
});

// Aggressive melee: chase while outside attackRange, attack when close
registerBehavior('aggressive_melee', (opts = {}) => {
  const attackRange = typeof opts.attackRange === 'number' ? opts.attackRange : 90;
  const aggroRange = typeof opts.aggroRange === 'number' ? opts.aggroRange : 240;
  let attackCooldown = 0;
  // internal patrol state for fallback
  let dir: 1 | -1 = -1;

  return {
    update(ctx: BehaviorContext) {
      const out: InputIntent = {};
      const p1 = ctx.p1, p2 = ctx.p2;
      if (!p1 || !p2) return out;
      attackCooldown = Math.max(0, attackCooldown - ctx.dt);
      const dx = (p1.x || 0) - (p2.x || 0);
      const dist = Math.abs(dx);

      if (dist <= aggroRange) {
        // move towards player
        if (dx > attackRange) out[opts.keys?.right || 'right'] = true;
        else if (dx < -attackRange) out[opts.keys?.left || 'left'] = true;

        // in attack range: trigger attack input
        if (dist <= attackRange && attackCooldown <= 0 && (opts.keys?.attack1 || 'attack1')) {
          out[opts.keys?.attack1 || 'attack1'] = true;
          attackCooldown = typeof opts.attackCooldown === 'number' ? opts.attackCooldown : 0.9;
        }
      } else {
        // Patrol fallback: maintain direction and flip at bounds
        if (opts.fallback === 'patrol' && opts.patrolBounds) {
          const [minX, maxX] = opts.patrolBounds;
          try {
            if ((p2.x || 0) <= minX) dir = 1;
            if (((p2.x || 0) + (p2.w || 0)) >= maxX) dir = -1;
          } catch (e) {}
          if (dir === 1) out[opts.keys?.right || 'right'] = true;
          else out[opts.keys?.left || 'left'] = true;
        }
      }

      return out;
    }
  };
});

// Ranged kite: keep distance, fire ranged when safe, dodge/projectile-aware
registerBehavior('ranged_kite', (opts = {}) => {
  const preferredDistance = typeof opts.preferredDistance === 'number' ? opts.preferredDistance : 220;
  const safeDistance = typeof opts.safeDistance === 'number' ? opts.safeDistance : 160;
  let rangedCooldown = 0;

  return {
    update(ctx: BehaviorContext) {
      const out: InputIntent = {};
      const p1 = ctx.p1, p2 = ctx.p2;
      if (!p1 || !p2) return out;
      rangedCooldown = Math.max(0, rangedCooldown - ctx.dt);
      const dx = (p1.x || 0) - (p2.x || 0);
      const dist = Math.abs(dx);

      // Move to maintain preferredDistance
      if (dist < safeDistance) {
        // move away
        if (dx > 0) out[opts.keys?.left || 'left'] = true;
        else out[opts.keys?.right || 'right'] = true;
      } else if (dist > preferredDistance) {
        // close in
        if (dx > 0) out[opts.keys?.right || 'right'] = true;
        else out[opts.keys?.left || 'left'] = true;
      }

      // Fire ranged when at preferred range and cooldown allows
      if (dist >= safeDistance && dist <= preferredDistance && rangedCooldown <= 0 && (opts.keys?.ranged1 || 'ranged1')) {
        out[opts.keys?.ranged1 || 'ranged1'] = true;
        rangedCooldown = typeof opts.rangedCooldown === 'number' ? opts.rangedCooldown : 1.2;
      }

      // Simple projectile awareness: if any projectile is incoming, try to parry/dodge
      try {
        const threat = ctx.projectiles.some(pr => pr.alive && pr.owner !== p2 && Math.abs(pr.x - p2.x) < 140);
        if (threat && (opts.keys?.parry || 'parry')) out[opts.keys?.parry || 'parry'] = true;
      } catch (e) {}

      return out;
    }
  };
});

// Defensive evade: focus on avoiding damage, edge-aware, jump/dodge when threatened
registerBehavior('defensive_evade', (opts = {}) => {
  let dodgeCooldown = 0;
  return {
    update(ctx: BehaviorContext) {
      const out: InputIntent = {};
      const p1 = ctx.p1, p2 = ctx.p2;
      if (!p1 || !p2) return out;
      dodgeCooldown = Math.max(0, dodgeCooldown - ctx.dt);

      // If projectiles near, try parry or move perpendicular
      try {
        const projThreat = ctx.projectiles.find(pr => pr.alive && pr.owner !== p2 && Math.abs(pr.x - p2.x) < 160);
        if (projThreat) {
          if ((opts.keys?.parry || 'parry')) out[opts.keys?.parry || 'parry'] = true;
          else if ((opts.keys?.up || 'up') && dodgeCooldown <= 0) { out[opts.keys?.up || 'up'] = true; dodgeCooldown = 0.5; }
        }
      } catch (e) {}

      // If near edge, move inward
      try {
        const canvasW = ctx.canvasW || 800;
        const edgeMargin = 120;
        if ((p2.x || 0) < edgeMargin) out[opts.keys?.right || 'right'] = true;
        else if ((p2.x || 0) + (p2.w || 0) > canvasW - edgeMargin) out[opts.keys?.left || 'left'] = true;
      } catch (e) {}

      return out;
    }
  };
});

// Export registry introspection helpers
export function listRegisteredBehaviors(): string[] { return Object.keys(REGISTRY); }


