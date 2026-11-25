/**
 * Where the test object sits: outside the hero's text-safe area (look bible, BRIEF.md §4 – the
 * left 40 % of wide frames, the top 40 % of portrait frames stay calm). Pure, unit-tested.
 *
 * In world units at the camera's target plane (React Three Fiber's `viewport`): the object's
 * centre and the radius of its bounding sphere. Wide screens: centred at 75 % of the width, at most
 * 20 % of the width across either side, so it spans 55–95 %. On narrow-landscape windows (4:3) the
 * hero copy column reaches about 52 % (`hero-copy` in globals.css), still clear of it. Portrait
 * screens: centred at 70 % of the height, spanning at most 55–85 %.
 */
export function placeTestObject(viewport: { width: number; height: number }): { x: number; y: number; radius: number } {
  const { width, height } = viewport;
  if (width >= height) {
    const radius = Math.min(width * 0.2, height * 0.3);
    return { x: width * 0.25, y: 0, radius };
  }
  const radius = Math.min(width * 0.3, height * 0.15);
  return { x: 0, y: -height * 0.2, radius };
}
