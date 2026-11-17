import { expect, type Page, test } from '@playwright/test';

// The renderer bake-off pages. Headless browsers draw with a software GPU, so the
// frame rates here mean nothing; these tests only prove each engine loads the scene,
// draws it, and reports a result.

interface Lab {
  result: { error?: string; fps?: number; loadMs?: number; backend: string } | null;
  snapshot: () => Promise<string>;
}

async function runTest(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => (window as unknown as { __lab?: Lab }).__lab?.result, null, {
    timeout: 100_000,
  });
  return page.evaluate(async () => {
    const lab = (window as unknown as { __lab: Lab }).__lab;
    return { result: lab.result, picture: await lab.snapshot() };
  });
}

/** Share of the picture that is not background. */
function coverage(picture: string): number {
  const cells = picture.replaceAll('\n', '');
  return cells.replaceAll(' ', '').length / cells.length;
}

test.describe('renderer bake-off', () => {
  test.setTimeout(120_000);

  for (const engine of ['spark', 'playcanvas']) {
    test(`${engine} loads the scene, draws it and reports numbers`, async ({ page }) => {
      const { result, picture } = await runTest(page, `/lab/${engine}/?scene=t&secs=2`);
      console.log(`${engine}:\n${picture}`);
      expect(result?.error).toBeUndefined();
      expect(result?.fps).toBeGreaterThan(0);
      expect(result?.loadMs).toBeGreaterThan(0);
      // The table and the objects on it fill a good part of the view.
      expect(coverage(picture)).toBeGreaterThan(0.08);
    });
  }

  test('the start page lists the tests', async ({ page }) => {
    await page.goto('/lab/');
    await expect(page.getByRole('button', { name: 'Запустить все тесты' })).toBeVisible();
    await expect(page.locator('#links a')).not.toHaveCount(0);
  });

  test('the automatic run chains tests and shows the results on the start page', async ({
    page,
  }) => {
    await page.goto('/lab/');
    await page.evaluate(() => {
      const queue = ['/lab/playcanvas/?scene=t&secs=1&auto=1&gpu=webgl2'];
      localStorage.setItem('ii00ii.lab', JSON.stringify({ queue, results: [], current: null }));
    });
    await page.goto('/lab/spark/?scene=t&secs=1&auto=1');
    await page.waitForURL('**/lab/', { timeout: 100_000 });
    const results = page.locator('#results');
    await expect(results).toContainText('spark webgl2 20K | load');
    await expect(results).toContainText('playcanvas webgl2 20K | load');
    await expect(page.getByRole('button', { name: 'Копировать результаты' })).toBeVisible();
  });
});
