import { SpriteAnimator } from '../src/qte/spriteAnimator';

describe('SpriteAnimator', () => {
  test('advances frames according to fps and loop', () => {
    const dummyImage = { complete: true, naturalWidth: 16 } as any as HTMLImageElement;
    const anim = new SpriteAnimator(dummyImage, 16, 16, {
      idle: { src: '', frames: 4, fps: 4, loop: true },
    });

    anim.setState('idle');
    expect(anim.frame).toBe(0);
    // advance 1s at 4fps => 4 frames => loops back to 0
    anim.update(1);
    expect(anim.frame).toBe(0);
  });
});


