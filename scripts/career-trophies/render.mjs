// Renderiza as folhas de sprite dos troféus (trophies.html) num Chromium headless (WebGL por SwiftShader) e grava os WebP
// em static/career/trophies: 24 quadros de 320x400 lado a lado. Uso: node scripts/career-trophies/render.mjs [saída] [nomes]
// (precisa do chrome-headless-shell do Playwright em ~/.cache/ms-playwright e de internet para o three.js da CDN).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
const ROOT = new URL('.', import.meta.url).pathname;
const OUT = process.argv[2] ?? join(ROOT, '../../static/career/trophies');
const NAMES = (process.argv[3] ?? 'major,s,mvp,evp').split(',');
const FRAMES = Number(process.argv[4] ?? 24);
mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer((req, res) => { try { const file = join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'trophies.html' : decodeURIComponent(req.url.split('?')[0])); res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file)); } catch { res.writeHead(404); res.end(); } }).listen(5299);
const BIN = process.env.CHROME_BIN ?? `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`;
const chrome = spawn(BIN, ['--remote-debugging-port=9334', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pending = new Map();
for (let i = 0; i < 50; i++) { try { const page = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((t) => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
await new Promise((r) => ws.addEventListener('open', r));
const logs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') logs.push(JSON.stringify(m.params).slice(0, 300)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5299/' });
for (let i = 0; i < 150 && !(await evaluate('window.ready === true')); i++) await sleep(200);
console.log('ready', await evaluate('window.ready'), logs.join('\n'));
for (const name of NAMES) {
  const data = await evaluate(`renderSheet(${JSON.stringify(name)}, ${FRAMES})`);
  if (typeof data !== 'string' || !data.startsWith('data:image/webp')) { console.log('fail', name, String(data).slice(0, 300)); continue; }
  const buf = Buffer.from(data.split(',')[1], 'base64');
  writeFileSync(join(OUT, `${name}.webp`), buf);
  console.log(name, `${(buf.length / 1024).toFixed(0)} KB`);
}
chrome.kill(); server.close(); process.exit(0);
