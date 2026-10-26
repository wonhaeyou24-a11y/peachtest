// 시험용 웹 서버: 앱 폴더를 그대로 서빙하되 Supabase 라이브러리만 가짜로 바꾼다.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  if (u === '/mock-supabase.js') { res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(path.join(__dirname, 'mock-supabase.js'))); }
  if (u === '/service-worker.js') { res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' }); return res.end('self.addEventListener("fetch",()=>{});'); }   // 시험에서는 캐시를 쓰지 않는다
  const fp = path.join(ROOT, u);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  let body = fs.readFileSync(fp);
  if (u === '/index.html') body = Buffer.from(body.toString('utf8').replace(/<script src="https:\/\/unpkg\.com\/@supabase\/supabase-js@2\/dist\/umd\/supabase\.js"><\/script>/, '<script src="/mock-supabase.js"></script>'));
  res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
}).listen(8765, '127.0.0.1', () => console.log('listening 8765'));
