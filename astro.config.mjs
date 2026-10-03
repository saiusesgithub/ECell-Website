import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';

export default defineConfig({
  integrations: [tailwind()],
  security: {
    // Vercel can proxy form submissions with forwarded host/protocol metadata
    // that fails Astro's same-origin POST guard for server-rendered routes.
    checkOrigin: false,
  },
  // Pages stay static by default; routes opt in to on-demand rendering with
  // `export const prerender = false` when they need live data or server actions.
  adapter: vercel(),
  server: {
    host: true,
  },
});
