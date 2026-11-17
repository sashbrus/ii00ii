import { defineConfig } from 'astro/config';

// Static output: HTML first, with almost no JavaScript before a game loads.
export default defineConfig({
  site: 'https://ii00ii.com',
  output: 'static',
});
