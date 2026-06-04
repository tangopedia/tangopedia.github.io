import { defineConfig } from 'astro/config';

// tangopedia.github.io is a USER/ORG Pages site → served at the domain root.
// If this ever becomes a project page, set base: '/<repo>/' and keep links base-relative.
export default defineConfig({
  site: 'https://tangopedia.github.io',
  base: '/',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
