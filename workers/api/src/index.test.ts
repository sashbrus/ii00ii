import { expect, it } from 'vitest';
import worker from './index.ts';

it('answers the health check and nothing else', async () => {
  const ok = worker.fetch(new Request('https://ii00ii.com/api/health'));
  expect(await ok.json()).toEqual({ ok: true });
  expect(worker.fetch(new Request('https://ii00ii.com/api/nope')).status).toBe(404);
});
