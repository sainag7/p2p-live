/** Actual vite preview, measured with a small HTTP cache client and fixed 150 ms request delay. */
import { preview } from 'vite';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
const before = process.argv.includes('--before');
const server = await preview({ configFile: before ? false : path.resolve('vite.config.ts'),
  root: process.cwd(), preview: { host: '127.0.0.1', port: before ? 4191 : 4192, strictPort: true } });
const port = server.httpServer.address().port;
const request = (url, etag) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: url, headers: { 'Accept-Encoding': 'gzip', ...(etag ? { 'If-None-Match': etag } : {}) } }, res => {
    const chunks = [];
    res.on('data', data => chunks.push(data));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject);
});
const runs = [];
try {
  for (let run = 0; run < 5; run++) {
    const cache = new Map();
    let requests = 0, bytes = 0;
    const load = async url => {
      const old = cache.get(url);
      if (old && /max-age=31536000/.test(old.headers['cache-control'] || '')) return old;
      requests++;
      await new Promise(resolve => setTimeout(resolve, 150));
      const response = await request(url, old?.headers.etag);
      bytes += response.body.length;
      if (response.status === 304) return old;
      if (response.status !== 200) throw new Error(`${url}: ${response.status}`);
      cache.set(url, response);
      return response;
    };
    const coldStart = performance.now();
    const html = await load('/');
    const source = (html.headers['content-encoding'] === 'gzip' ? gunzipSync(html.body) : html.body).toString();
    const assets = [...source.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
    await Promise.all(assets.map(load));
    const cold = { ms: performance.now() - coldStart, requests, bodyBytes: bytes };
    requests = 0; bytes = 0;
    const warmStart = performance.now();
    await load('/');
    await Promise.all(assets.map(load));
    const warm = { ms: performance.now() - warmStart, requests, bodyBytes: bytes };
    const missing = await request('/assets/missing-AbCdEf12.js');
    if (/immutable/.test(missing.headers['cache-control'] || '')) throw new Error('Missing assets must not be cached as immutable');
    if (/immutable/.test(html.headers['cache-control'] || '')) throw new Error('HTML must revalidate');
    runs.push({ cold, warm, assetHeaders: assets.map(url => ({ url, cacheControl: cache.get(url).headers['cache-control'], encoding: cache.get(url).headers['content-encoding'] })), htmlCacheControl: html.headers['cache-control'] });
  }
  console.log(JSON.stringify({ mode: before ? 'before-preview-caching' : 'after-preview-caching', simulatedRequestDelayMs: 150,
    medians: { coldMs: runs.map(r => r.cold.ms).sort((a,b) => a-b)[2], warmMs: runs.map(r => r.warm.ms).sort((a,b) => a-b)[2] }, runs }, null, 2));
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
