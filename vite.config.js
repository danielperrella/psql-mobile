import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: mode === 'android' ? [{
    name: 'offline-android-shell',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`)
        .replace(/<link rel="manifest"[^>]*>/, '');
    },
  }] : [],
}));
