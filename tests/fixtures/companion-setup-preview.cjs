// UI-only fixture: no extension permissions, downloads, provider requests, or login.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../extension');
const mock = `
(() => {
  const state = {};
  const scenario = new URLSearchParams(location.search).get('scenario');
  let permission = false;
  window.chrome = {
    permissions: { request: async () => { permission = scenario !== 'denied'; return permission; } },
    runtime: { sendMessage: async message => {
      const { action, service } = message;
      if (action === 'open') state[service] = { ...state[service], tabId: 1, status: 'opened' };
      if (action === 'store') state.trackerbot = { ...state.trackerbot, storeOpened: true };
      if (action === 'continue') state[service] = { ...state[service], status: state[service]?.signedIn ? (service === 'ecomsniper' ? 'complete' : 'website-open') : 'login-required', ...(state[service]?.signedIn && service === 'ecomsniper' ? { filename: 'GLDN-Companions/eComSniper-45.7/Ebay-Lister-45.7.zip' } : {}) };
      if (action === 'login') {
        state[service] = { ...state[service], signedIn: true };
        return { ok: true, state, submitted: true };
      }
      return { ok: true, state };
    } }
  };
  const label = document.createElement('p');
  label.textContent = 'UI TEST PREVIEW - simulated provider responses, no real downloads or sign-in';
  label.style.cssText = 'color:#e9c667;text-align:center;padding:10px;margin:0;border-bottom:1px solid #555';
  document.body.prepend(label);
})();`;
const allowed = new Set(['companion-setup.html', 'companion-setup.css', 'companion-setup.js', 'icons/icon48.png']);
const server = http.createServer((req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.slice(1) || 'companion-setup.html';
  if (file === 'preview-api.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(mock); return; }
  if (!allowed.has(file)) { res.writeHead(404); res.end('Preview route not available'); return; }
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
  res.setHeader('Content-Type', types[path.extname(file)]);
  let content = fs.readFileSync(path.join(root, file));
  if (file.endsWith('.html')) content = content.toString().replace('<script src="companion-setup.js">', '<script src="preview-api.js"></script><script src="companion-setup.js">');
  res.end(content);
});
server.listen(Number(process.env.PORT || 4387), '127.0.0.1', () => console.log('UI-only preview: http://127.0.0.1:' + server.address().port));
