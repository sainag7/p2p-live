import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Only content-hashed build assets are safe to reuse across deployments. */
export function previewCaching(): Plugin {
  return {
    name: 'preview-asset-caching',
    configurePreviewServer(server) {
      const dist = path.resolve(server.config.root, server.config.build.outDir);
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if ((req.method === 'GET' || req.method === 'HEAD')
          && /^\/assets\/[\w.-]+-[\w-]{8,}\.(js|css|woff2?|png|svg|webp|jpg)$/.test(pathname)
          && existsSync(path.join(dist, pathname))) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
      });
    },
  };
}
