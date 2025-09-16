import type { Projectile } from './fighter';
import { createBehavior } from './npc/behaviorRegistry';

interface KeysMap { left?: string; right?: string; up?: string; attack1?: string; parry?: string }

export interface SimpleAiOptions {
  keys: KeysMap;
  // function to query heatmap solidity at canvas coordinates
  isSolidAt?: (x: number, y: number) => boolean;
  canvasW?: number;
  canvasH?: number;
  patrolMinX?: number;
  patrolMaxX?: number;
  // how far ahead (pixels) the AI should sample to detect platform edges
  edgeLookahead?: number;
  // if set, force a direction flip after this many seconds of continuous movement
  // without finding ground ahead (defensive failsafe). default: 2.0
  forcedFlipAfter?: number;
  // Optional behavior key to select a behavior from the behavior registry
  behaviorKey?: string;
  // Optional options passed to the behavior factory
  behaviorOpts?: any;
  // Aggro/attack ranges for tuning (kept for backward compatibility)
  aggroRange?: number;
  attackRange?: number;
  // position-based spawn clamp: if set, AI will not allow moving further than
  // spawnX +/- spawnClamp (pixels). Default 300 when provided via NPC creation.
  spawnX?: number;
  spawnClamp?: number;
  // Simple patrol behavior: just walk 150px from spawn and back
  simplePatrol?: boolean;
  patrolDistance?: number;
}

export class SimpleAI {
  private lastJump = 0;
  private attackCooldown = 0;
  private parryCooldown = 0; // local fallback
  private keys: KeysMap;
  private isSolidAt?: (x: number, y: number) => boolean;
  private canvasW = 800;
  private canvasH = 600;
  private patrolMinX = 0;
  private patrolMaxX = 800;
  private patrolDirection: 1 | -1 = -1;
  private edgeLookahead = 48;
  private forcedFlipAfter = 2.0; // seconds
  private noGroundTimer = 0; // seconds without ground detected ahead
  private behavior: any = null;
  private aggroRange = 300; // 300 pixels detection range
  private attackRange = 90; // 90 pixels attack range
  private spawnX: number | null = null;
  private spawnClamp = 300;

  // Simple patrol behavior variables
  private simplePatrol = false;
  private patrolDistance = 150; // 150 pixels from spawn
  private patrolTargetX: number | null = null;
  private returningToSpawn = false;
  private _lastPatrolLog = 0; // Rate limiting for patrol logs

  // Enhanced behavior: patrol + aggro
  private isAggro = false;
  private lastAggroLog = 0; // Rate limiting for aggro logs

  constructor(opts: SimpleAiOptions) {
    this.keys = opts.keys;
    this.isSolidAt = opts.isSolidAt;
    if (opts.canvasW) this.canvasW = opts.canvasW;
    if (opts.canvasH) this.canvasH = opts.canvasH;
    if (typeof opts.patrolMinX === 'number') this.patrolMinX = opts.patrolMinX;
    if (typeof opts.patrolMaxX === 'number') this.patrolMaxX = opts.patrolMaxX;
    if (typeof opts.edgeLookahead === 'number') this.edgeLookahead = opts.edgeLookahead;
    if (typeof opts.forcedFlipAfter === 'number') this.forcedFlipAfter = opts.forcedFlipAfter;
    if (typeof opts.aggroRange === 'number') this.aggroRange = opts.aggroRange;
    if (typeof opts.attackRange === 'number') this.attackRange = opts.attackRange;
    if (opts.behaviorKey) {
      try { this.behavior = createBehavior(opts.behaviorKey, opts.behaviorOpts || {}); } catch (e) { this.behavior = null; }
    }
    if (typeof opts.spawnX === 'number') this.spawnX = opts.spawnX;
    if (typeof opts.spawnClamp === 'number') this.spawnClamp = opts.spawnClamp;
    if (opts.simplePatrol) this.simplePatrol = true;
    if (typeof opts.patrolDistance === 'number') this.patrolDistance = opts.patrolDistance;
  }

  // Check if player is in line of sight (not blocked by walls)
  private isPlayerInSight(p1: any, p2: any): boolean {
    try {
      if (!this.isSolidAt) return true; // If no heatmap, assume always in sight

      const npcX = p2.x || 0;
      const npcY = p2.y || 0;
      const playerX = p1.x || 0;
      const playerY = p1.y || 0;

      // Simple line of sight check: sample points between NPC and player
      const distance = Math.abs(playerX - npcX);
      const steps = Math.max(1, Math.floor(distance / 20)); // Sample every 20 pixels

      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const sampleX = npcX + (playerX - npcX) * t;
        const sampleY = npcY + (playerY - npcY) * t;

        // Check if there's a solid wall blocking the line of sight
        if (this.isSolidAt(Math.floor(sampleX), Math.floor(sampleY))) {
          return false; // Wall blocks line of sight
        }
      }

      return true; // No walls blocking line of sight
    } catch (e) {
      return true; // On error, assume in sight
    }
  }

  // Mutates mergedInput for P2 keys based on simple heuristics
  update(dt: number, mergedInput: Record<string, boolean>, p2: any, p1: any, projectiles: Projectile[]) {
    if (!p2 || !p1) return;

    // Enhanced patrol behavior: patrol + aggro when player is in range
    if (this.simplePatrol && this.spawnX !== null) {
      // Reset inputs first
      if (this.keys.left) mergedInput[this.keys.left] = false;
      if (this.keys.right) mergedInput[this.keys.right] = false;
      if (this.keys.up) mergedInput[this.keys.up] = false;
      if (this.keys.attack1) mergedInput[this.keys.attack1] = false;
      if (this.keys.parry) mergedInput[this.keys.parry] = false;

      const currentX = p2.x || 0;
      const spawnX = this.spawnX as number;
      const playerX = p1.x || 0;
      const distanceToPlayer = Math.abs(currentX - playerX);

      // Check if player is in aggro range and in line of sight
      const playerInRange = distanceToPlayer <= this.aggroRange;
      const playerInSight = this.isPlayerInSight(p1, p2);

      if (playerInRange && playerInSight) {
        // AGGRO MODE: Chase and attack player
        if (!this.isAggro) {
          this.isAggro = true;
          console.log(`[NPC] 🔥 AGGRO! Player detected at ${distanceToPlayer.toFixed(1)}px - switching to chase mode`);
        }

        // Move towards player
        if (currentX < playerX - 5) {
          if (this.keys.right) mergedInput[this.keys.right] = true;
        } else if (currentX > playerX + 5) {
          if (this.keys.left) mergedInput[this.keys.left] = true;
        }

        // Attack if in range
        if (distanceToPlayer <= this.attackRange && this.attackCooldown <= 0) {
          if (this.keys.attack1) {
            mergedInput[this.keys.attack1] = true;
            this.attackCooldown = 1.0; // 1 second cooldown
            console.log(`[NPC] ⚔️ ATTACK! Player at ${distanceToPlayer.toFixed(1)}px`);
          }
        }

        // Log aggro status every 3 seconds
        if (!this.lastAggroLog || Date.now() - this.lastAggroLog > 3000) {
          console.log(`[NPC] 🔥 AGGRO: chasing player at ${distanceToPlayer.toFixed(1)}px (attack range: ${this.attackRange}px)`);
          this.lastAggroLog = Date.now();
        }

        // Return early - we're in aggro mode
        return;
      } else {
        // PATROL MODE: Return to normal patrol behavior
        if (this.isAggro) {
          this.isAggro = false;
          console.log(`[NPC] 😴 Lost player - returning to patrol mode`);
        }

        // If we don't have a target yet, set one
        if (this.patrolTargetX === null) {
          // Start by going right (positive direction)
          this.patrolTargetX = spawnX + this.patrolDistance;
          this.returningToSpawn = false;
          console.log(`[NPC] 🚀 Starting patrol: spawn=${spawnX.toFixed(1)}, target=${this.patrolTargetX.toFixed(1)}, distance=${this.patrolDistance}px`);
        }

        // Check if we've reached our target
        const targetReached = Math.abs(currentX - this.patrolTargetX) < 10; // 10px tolerance

        if (targetReached) {
          if (this.returningToSpawn) {
            // We're back at spawn, start a new patrol cycle
            this.patrolTargetX = spawnX + this.patrolDistance;
            this.returningToSpawn = false;
            console.log(`[NPC] 🔄 Back at spawn! Starting new patrol cycle: target=${this.patrolTargetX.toFixed(1)}`);
          } else {
            // We've reached the patrol point, now return to spawn
            this.patrolTargetX = spawnX;
            this.returningToSpawn = true;
            console.log(`[NPC] 🎯 Reached patrol point! Returning to spawn: target=${this.patrolTargetX.toFixed(1)}`);
          }
        }

        // Move towards the target
        if (this.patrolTargetX !== null) {
          if (currentX < this.patrolTargetX - 5) {
            // Move right
            if (this.keys.right) mergedInput[this.keys.right] = true;
          } else if (currentX > this.patrolTargetX + 5) {
            // Move left
            if (this.keys.left) mergedInput[this.keys.left] = true;
          }
        }

        // Log current status every 2 seconds (rate limited)
        if (!this._lastPatrolLog || Date.now() - this._lastPatrolLog > 2000) {
          const direction = this.returningToSpawn ? "← returning to spawn" : "→ going to patrol point";
          const distanceToTarget = Math.abs(currentX - this.patrolTargetX);
          console.log(`[NPC] 📍 Status: pos=${currentX.toFixed(1)}, target=${this.patrolTargetX.toFixed(1)}, dist=${distanceToTarget.toFixed(1)}px ${direction}`);
          this._lastPatrolLog = Date.now();
        }
      }

      // Enhanced patrol behavior complete - return early
      return;
    }

    // Helper: prevent AI from issuing movement that would move NPC further than
    // spawnX +/- spawnClamp. If spawnX is not set, allow free movement.
    const disallowMoveBeyondSpawn = (dir: 1 | -1) => {
      try {
        if (this.spawnX === null) return false;
        const sx = this.spawnX as number;
        if (dir === 1) {
          const blocked = (p2.x || 0) >= (sx + this.spawnClamp);
          // Spawn clamp logging removed to reduce spam
          return blocked;
        } else {
          const blocked = (p2.x || 0) <= (sx - this.spawnClamp);
          // Spawn clamp logging removed to reduce spam
          return blocked;
        }
      } catch (e) { return false; }
    };

    // If a behavior is provided from the registry, delegate to it but filter
    // its intents through our safety layer (spawnClamp and edge-check).
    if (this.behavior && typeof this.behavior.update === 'function') {
      try {
        const ctx = { dt, p1, p2, projectiles, isSolidAt: this.isSolidAt, canvasW: this.canvasW, canvasH: this.canvasH };
        const intent = this.behavior.update(ctx, {}) || {};

        // Filter movement intents
        const leftKey = this.keys.left || 'left';
        const rightKey = this.keys.right || 'right';

        const safeIntent: Record<string, boolean> = {};
        for (const k of Object.keys(intent)) safeIntent[k] = !!(intent as any)[k];

        // Edge-safety: if AI would move into missing ground, block that move
        try {
          const footY = Math.floor(p2.y + p2.h + 2);
          if (safeIntent[leftKey]) {
            const disallowed = disallowMoveBeyondSpawn(-1);
            if (disallowed) safeIntent[leftKey] = false;
                  else if (this.isSolidAt && p2.onGround) {
                    const cx = Math.floor((p2.x || 0) + (p2.w || 0) * 0.5 - this.edgeLookahead);
                    const can = this.isSolidAt(cx, footY);
                    if (can === false) {
                      safeIntent[leftKey] = false;
                      // Edge check logging removed to reduce spam
                    }
                  }
          }
          if (safeIntent[rightKey]) {
            const disallowed = disallowMoveBeyondSpawn(1);
            if (disallowed) safeIntent[rightKey] = false;
            else if (this.isSolidAt && p2.onGround) {
              const cx = Math.floor((p2.x || 0) + (p2.w || 0) * 0.5 + this.edgeLookahead);
              const can = this.isSolidAt(cx, footY);
              if (can === false) {
                safeIntent[rightKey] = false;
                // Edge check logging removed to reduce spam
              }
            }
          }
        } catch (e) {}

        for (const k of Object.keys(safeIntent || {})) mergedInput[k] = !!safeIntent[k];
      } catch (e) {}
      // Do not return early here; we merged intents and will continue so
      // other fallback behaviors (parry, etc.) still run if needed.
    }


    this.lastJump += dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.parryCooldown > 0) this.parryCooldown -= dt;

    const dx = p1.x - p2.x;
    const dist = Math.abs(dx);

    // Reset inputs
    if (this.keys.left) mergedInput[this.keys.left] = false;
    if (this.keys.right) mergedInput[this.keys.right] = false;
    if (this.keys.up) mergedInput[this.keys.up] = false;
    if (this.keys.attack1) mergedInput[this.keys.attack1] = false;
    if (this.keys.parry) mergedInput[this.keys.parry] = false;

    // Decide defensive mode: if AI has high percent or low stocks, be defensive
    const highDamage = (p2.damagePercent || 0) >= 50;
    const lowStocks = (typeof p2.stocks === 'number') ? p2.stocks <= 1 : false;

    // Edge avoidance: nudge away from edges if near platform edges
    try {
      const canvasW = (p2 as any).canvasW || (p2 as any).canvasWidth || this.canvasW || 800;
      const edgeMargin = 140;
      if ((p2.x < edgeMargin) && this.keys.right) mergedInput[this.keys.right] = true;
      else if ((p2.x + p2.w > canvasW - edgeMargin) && this.keys.left) mergedInput[this.keys.left] = true;
    } catch (e) {}

    // Compute threat and opponent attack
    const threat = projectiles.some(pr => pr.alive && pr.owner !== p2 && Math.abs(pr.x - p2.x) < 140);
    const oppAttacking = (p1.attacking1 || p1.attacking2);

    // Use fighter's own parryCooldown if available
    const fighterParryCooldown = (typeof p2.parryCooldown === 'number') ? p2.parryCooldown : this.parryCooldown;

    // Parry logic: prefer ranged parry for projectiles, attack-parry for close melee
    if (fighterParryCooldown <= 0) {
      if (threat && this.keys.parry) {
        // attempt ranged parry
        mergedInput[this.keys.parry] = true;
        this.parryCooldown = 0.1; // local debounce
        try { if (p2) { p2.parrying = true; p2.parryTimer = (p2.parryDurationDefault || 0.25) * 0.6; p2.parryConsumed = false; if (p2.anim) p2.anim.setState('parry'); } } catch(e){}
      } else if (oppAttacking && dist < 180 && this.keys.parry) {
        // attempt attack parry if in range
        mergedInput[this.keys.parry] = true;
        this.parryCooldown = 0.1;
        try { if (p2) { p2.parrying = true; p2.parryTimer = (p2.parryDurationDefault || 0.25) * 0.6; p2.parryConsumed = false; if (p2.anim) p2.anim.setState('parry'); } } catch(e){}
      }
    }

    // Heatmap-aware movement: avoid walking off gaps by sampling ahead.
    // NPCs are not allowed to jump in the simpler singleplayer behavior.
    try {
      if (this.isSolidAt && (this.keys.left || this.keys.right)) {
        const footY = Math.floor(p2.y + p2.h + 2);
        const sampleAhead = (dir: number, distance = 40) => {
          const cx = Math.floor(p2.x + p2.w * 0.5 + dir * distance);
          return this.isSolidAt!(cx, footY);
        };
        const canStandAheadRight = sampleAhead(1, 48);
        const canStandAheadLeft = sampleAhead(-1, 48);

        // If currently on ground and the next step is not solid, do NOT jump;
        // instead avoid walking that way by nudging in the opposite direction.
        if (p2.onGround) {
          if (this.keys.right && !canStandAheadRight && this.keys.left) mergedInput[this.keys.left] = true;
          else if (this.keys.left && !canStandAheadLeft && this.keys.right) mergedInput[this.keys.right] = true;
        }
      }
    } catch (e) {}

    // If defensive, avoid attacking; otherwise attempt basic attacks when in range
    if (!highDamage && !lowStocks) {
      if (dist > 250) {
        // close distance
        if (this.keys.right && dx > 0) mergedInput[this.keys.right] = true;
        else if (this.keys.left && dx < 0) mergedInput[this.keys.left] = true;
      } else {
        // in range: try attack occasionally
        if (this.attackCooldown <= 0 && this.keys.attack1) {
          mergedInput[this.keys.attack1] = true;
          this.attackCooldown = 0.8;
        }
      }
    } else {
      // defensive: move towards center
      try {
        const canvasW = (p2 as any).canvasW || (p2 as any).canvasWidth || 800;
        const centerX = (canvasW - p2.w) * 0.5;
        if (p2.x < centerX - 10 && this.keys.right) mergedInput[this.keys.right] = true;
        else if (p2.x > centerX + 10 && this.keys.left) mergedInput[this.keys.left] = true;
      } catch(e) {}
    }

    // Old patrol behavior removed - now handled by enhanced patrol logic above
  }
}

export default SimpleAI;

// NPCController: simple patrol + aggro controller for singleplayer NPCs
export interface NPCControllerOptions extends SimpleAiOptions {
  patrolMinX?: number;
  patrolMaxX?: number;
  aggroRange?: number;
  attackRange?: number;
  simplePatrol?: boolean;
  patrolDistance?: number;
}

export class NPCController {
  // Delegate wrapper: use the single SimpleAI implementation for NPC behavior
  private inner: SimpleAI;

  constructor(opts: NPCControllerOptions) {
    const simpleOpts: SimpleAiOptions = {
      keys: opts.keys || {},
      isSolidAt: opts.isSolidAt,
      canvasW: opts.canvasW,
      canvasH: opts.canvasH,
      patrolMinX: opts.patrolMinX,
      patrolMaxX: opts.patrolMaxX,
      edgeLookahead: opts.edgeLookahead,
      forcedFlipAfter: (opts as any).forcedFlipAfter,
      spawnX: opts.spawnX,
      spawnClamp: opts.spawnClamp,
      simplePatrol: opts.simplePatrol,
      patrolDistance: opts.patrolDistance
    };
    this.inner = new SimpleAI(simpleOpts);
  }

  update(dt: number, mergedInput: Record<string, boolean>, p2: any, p1: any, projectiles: Projectile[]) {
    try { this.inner.update(dt, mergedInput, p2, p1, projectiles); } catch (e) { /* swallow */ }
  }
}


