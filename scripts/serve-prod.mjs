import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { heartbeat, onlineCount, recordVisit, getStats, leave } from './stats-store.mjs';
const root = resolve(process.cwd(), '_site');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.csv': 'text/csv; charset=utf-8' };
const port = process.env.PORT || 3000;
function json(res, status, body){
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
// Railway's edge proxy sets X-Forwarded-For; the socket address is only the
// real client IP for a direct (non-proxied) connection, e.g. local testing.
function clientIp(req){
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Online presence is keyed by the client's own tab id, not its IP: the
    // same device can present a different IP across requests (IPv4/IPv6,
    // mobile networks), which made the live count climb on every refresh.
    if (url.pathname === '/api/ping' && req.method === 'POST') { json(res, 200, { online: await heartbeat(url.searchParams.get('id') || clientIp(req)) }); return; }
    if (url.pathname === '/api/leave' && req.method === 'POST') { await leave(url.searchParams.get('id') || clientIp(req)); res.writeHead(204); res.end(); return; }
    if (url.pathname === '/api/online') { json(res, 200, { online: onlineCount() }); return; }
    if (url.pathname === '/api/visit' && req.method === 'POST') { await recordVisit(clientIp(req)); res.writeHead(204); res.end(); return; }
    if (url.pathname === '/api/stats') { json(res, 200, await getStats()); return; }
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, '0.0.0.0', () => console.log('BADK Live listening on port ' + port));
