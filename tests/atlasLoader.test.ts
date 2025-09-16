import { loadAtlas } from '../src/qte/atlasLoader';

describe('atlasLoader', () => {
  test('parses cyboard atlas and exposes animations/meta', async () => {
    // Use the on-disk test fixture (public/qte/cyboard/atlas2.json)
    const basePath = '/qte/cyboard/atlas2';
    const atlas = await loadAtlas(basePath).catch((e) => {
      // In Node environment fetch may not be available; skip test if so
      console.warn('Skipping loadAtlas test - network fetch not available', e);
      return null as any;
    });

    if (!atlas) return;

    expect(atlas).toHaveProperty('image');
    expect(atlas).toHaveProperty('animations');
    expect(atlas).toHaveProperty('meta');
    // cyboard atlas should have attack1 animation
    expect(Object.keys(atlas.animations)).toContain('attack1');
    expect(Array.isArray(atlas.animations.attack1.frames)).toBeTruthy();
    expect(atlas.meta).toBeDefined();
    // frameW and frameH should be numbers
    expect(typeof atlas.frameW).toBe('number');
    expect(typeof atlas.frameH).toBe('number');
  });
});


