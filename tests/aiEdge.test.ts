import { SimpleAI, NPCController } from '../src/qte/simpleAi';

describe('AI edge-aware lookahead', () => {
  test('SimpleAI flips direction when no ground ahead', () => {
    const ai = new SimpleAI({
      keys: { left: 'left', right: 'right' },
      // solid only for x >= 300 to simulate an edge on the left
      isSolidAt: (x: number, y: number) => x >= 300,
      canvasW: 800,
      canvasH: 600,
      patrolMinX: 0,
      patrolMaxX: 800,
      forcedFlipAfter: 0.01, // speed up test
    });

    const p2: any = {
      x: 300,
      y: 200,
      w: 64,
      h: 64,
      onGround: true,
      anim: { setState: () => {} },
    };
    const p1: any = { x: 2000, y: 0 };
    const merged: Record<string, boolean> = {};

    ai.update(0.016, merged, p2, p1, []);

    // default patrolDirection is -1 (left). Since ground to the left is missing,
    // the AI should flip and press the right key instead.
    expect(merged.right).toBeTruthy();
  });

  test('SimpleAI keeps direction when ground ahead', () => {
    const ai = new SimpleAI({
      keys: { left: 'left', right: 'right' },
      isSolidAt: () => true,
      canvasW: 800,
      canvasH: 600,
      patrolMinX: 0,
      patrolMaxX: 800,
      forcedFlipAfter: 0.01,
    });

    const p2: any = { x: 300, y: 200, w: 64, h: 64, onGround: true, anim: { setState: () => {} } };
    const p1: any = { x: 2000 };
    const merged: Record<string, boolean> = {};

    ai.update(0.016, merged, p2, p1, []);

    // ground exists ahead, default left patrol should be maintained
    expect(merged.left).toBeTruthy();
  });

  test('NPCController flips direction when no ground ahead', () => {
    const ai = new NPCController({
      keys: { left: 'left', right: 'right', attack1: 'attack1' },
      isSolidAt: (x: number, y: number) => x >= 300,
      canvasW: 800,
      canvasH: 600,
      patrolMinX: 0,
      patrolMaxX: 800,
      forcedFlipAfter: 0.01,
    });

    const p2: any = { x: 300, y: 200, w: 64, h: 64, onGround: true, anim: { setState: () => {} } };
    const p1: any = { x: 2000 };
    const merged: Record<string, boolean> = {};

    ai.update(0.016, merged, p2, p1, []);

    // should flip to right due to missing ground on the left lookahead
    expect(merged.right).toBeTruthy();
  });
});


