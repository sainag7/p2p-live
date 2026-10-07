import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { previewCaching } from '../../utils/previewCaching';

const folders: string[] = [];
afterEach(() => folders.splice(0).forEach(folder => rmSync(folder, { recursive: true, force: true })));
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'p2p-preview-')); folders.push(root);
  mkdirSync(path.join(root, 'dist/assets'), { recursive: true });
  writeFileSync(path.join(root, 'dist/assets/index-AbCdEf12.js'), 'export default 1');
  let middleware: any;
  (previewCaching().configurePreviewServer as Function)({ config: { root, build: { outDir: 'dist' } }, middlewares: { use: (fn: any) => { middleware = fn; } } });
  return (url: string, method = 'GET') => {
    const headers = new Map(); let continued = false;
    middleware({ url, method }, { setHeader: (key: string, value: string) => headers.set(key, value) }, () => { continued = true; });
    expect(continued).toBe(true);
    return headers;
  };
}
describe('production preview caching', () => {
  it('lets the browser reuse existing content-hashed assets on GET and HEAD', () => {
    const request = setup();
    for (const method of ['GET', 'HEAD']) expect(request('/assets/index-AbCdEf12.js?v=1', method).get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });
  it('preserves freshness for HTML, live data, unversioned files and missing assets', () => {
    const request = setup();
    for (const url of ['/', '/index.html', '/api/live/snapshot', '/assets/index.js', '/assets/missing-AbCdEf12.js']) expect(request(url).size).toBe(0);
  });
  it('does not apply asset caching to traversal paths or write methods', () => {
    const request = setup();
    expect(request('/assets/../index-AbCdEf12.js').size).toBe(0);
    expect(request('/assets/index-AbCdEf12.js', 'POST').size).toBe(0);
  });
});
