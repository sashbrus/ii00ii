import { expect, type Page, test } from '@playwright/test';
import puzzle from '../../../content/dailies/logo.json' with { type: 'json' };

/** Must match DEGREES_PER_PIXEL in src/scripts/logo.ts. */
const DEGREES_PER_PIXEL = 0.3;

/** How far each glyph sits, in pixels, from where plain text layout would put it. */
function glyphDrift(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const rig = document.getElementById('rig') as HTMLElement;
    const glyphs = [...rig.querySelectorAll<HTMLElement>('.g')];
    const seen = glyphs.map((glyph) => glyph.getBoundingClientRect());
    // Measure the plain layout with every transform switched off, then put them back.
    const saved = [rig, ...glyphs].map((el) => el.style.transform);
    for (const el of [rig, ...glyphs]) el.style.transform = 'none';
    const plain = glyphs.map((glyph) => glyph.getBoundingClientRect());
    [rig, ...glyphs].forEach((el, i) => {
      el.style.transform = saved[i] ?? '';
    });
    return seen.map((rect, i) => {
      const home = plain[i] as DOMRect;
      return Math.max(
        Math.abs(rect.left - home.left),
        Math.abs(rect.top - home.top),
        Math.abs(rect.width - home.width),
        Math.abs(rect.height - home.height),
      );
    });
  });
}

async function dragToAnswer(page: Page): Promise<void> {
  const dx = (puzzle.secret.yaw - puzzle.start.yaw) / DEGREES_PER_PIXEL;
  const dy = -(puzzle.secret.pitch - puzzle.start.pitch) / DEGREES_PER_PIXEL;
  await page.mouse.move(120, 300);
  await page.mouse.down();
  await page.mouse.move(120 + dx, 300 + dy, { steps: 12 });
  // Rest on the answer for a moment, as a thumb would, then let go.
  await page.waitForTimeout(400);
  await page.mouse.up();
}

test('the logo starts scrambled and hides the answer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass('play ready');
  await expect(page.locator('.tag')).toHaveCSS('opacity', '0');
  const drift = await glyphDrift(page);
  expect(drift).toHaveLength(6);
  expect(Math.max(...drift)).toBeGreaterThan(20);
});

test('dragging to the secret viewpoint lines the glyphs up and opens the site', async ({
  page,
}) => {
  await page.goto('/');
  await dragToAnswer(page);
  await expect(page.locator('html')).toHaveClass(/open/);
  await expect(page.locator('.tag')).toHaveCSS('opacity', '1');
  // Once settled, every glyph sits exactly where plain text would put it.
  await expect.poll(async () => Math.max(...(await glyphDrift(page)))).toBeLessThan(1);
});

test('a wrong viewpoint does not open the site', async ({ page }) => {
  await page.goto('/');
  await page.mouse.move(120, 300);
  await page.mouse.down();
  await page.mouse.move(160, 300, { steps: 6 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(800);
  await expect(page.locator('html')).toHaveClass('play ready');
});

test('arrow keys can solve it', async ({ page }) => {
  await page.goto('/');
  await page.locator('#stage').focus();
  // From yaw -38, pitch 22 in 3-degree steps: 13 right and 7 down lands within tolerance.
  for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('html')).toHaveClass(/open/);
});

test('skip opens the site, and a return visit stays open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip the puzzle' }).click();
  await expect(page.locator('html')).toHaveClass(/open/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass('open');
  await expect(page.locator('.tag')).toHaveCSS('opacity', '1');
  expect(Math.max(...(await glyphDrift(page)))).toBeLessThan(1);
});
