import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import dns from 'node:dns';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dns.setDefaultResultOrder('ipv4first');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 5178);

const FIIO_RSA_PUB_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0mPGrgZPDCPDd9m129qy
+TV5HeLWDTJbNK5wlUAemqH3NyrOh3HUo+LbTbMf6J45AFDjNRCDiZZc3Y+uCici
9fHn0dixbtuHOdJer0U/4xHloOgYmsTwhAh56njWQAyaqoi0R3nG0bpCgsi5omlS
RqP5KyaybuKjPyZvGVn0IKnVVQx3AI1+p/5lWARv23nPNS9ehfKts5oeFdOAKgT2
mvV80TzJHbc2mKU8XoBr0VgX4Ohgq/A+Ddv0Wz0bNAQJgzrFAN1lIg2NqktcGdzD
/HHPIeGCYG2gB7ZADsGX6vGpSoeUj3anr25nojQVbZgEBeE/6nJZ793Qhq8vudep
XQIDAQAB
-----END PUBLIC KEY-----`;

function encryptFiioPayload(plainJsonStr) {
  const keyHex = crypto.randomBytes(16).toString('hex');
  const cipher = crypto.createCipheriv('aes-256-ecb', Buffer.from(keyHex, 'utf8'), null);
  const cipherText = Buffer.concat([cipher.update(plainJsonStr, 'utf8'), cipher.final()]).toString('base64');
  const cipherSign = crypto
    .publicEncrypt(
      { key: FIIO_RSA_PUB_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(keyHex, 'utf8'),
    )
    .toString('base64');
  return {
    keyHex,
    requestId: crypto.randomUUID(),
    envelope: JSON.stringify({ cipherSign, cipherText }),
  };
}

function decryptFiioData(keyHex, base64Data) {
  const decipher = crypto.createDecipheriv('aes-256-ecb', Buffer.from(keyHex, 'utf8'), null);
  const plain = Buffer.concat([decipher.update(Buffer.from(base64Data, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

/**
 * Uses Windows built-in `curl.exe` (WinSSL / System Proxy / Happy Eyeballs) which reliably reaches
 * fiiocontrol.fiio.com in ~1.5s from Vietnam without Node undici IPv6 timeouts, with https fallback.
 */
function postViaCurlOrHttps(fullUrl, wireBodyStr, extraHeaders) {
  return new Promise((resolve, reject) => {
    const args = [
      '-sL',
      '--max-time', '15',
      '--retry', '2',
      '-X', 'POST',
      fullUrl,
      '-H', 'Content-Type: application/json',
      '-H', 'Accept: application/vnd.fiio.v1+json, application/json',
      '-H', 'Origin: https://fiiocontrol.fiio.com',
      '-H', 'Referer: https://fiiocontrol.fiio.com/equalizer/hand-picked',
    ];
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (v) args.push('-H', `${k}: ${v}`);
    }
    args.push('--data-binary', '@-');

    const cmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const child = execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (!err && stdout && stdout.trim().startsWith('{')) {
        resolve(stdout);
        return;
      }

      // Fallback to Node https IPv4
      const u = new URL(fullUrl);
      const buf = Buffer.from(wireBodyStr, 'utf8');
      const r = https.request(
        {
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method: 'POST',
          family: 4,
          timeout: 16000,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/vnd.fiio.v1+json, application/json',
            Origin: 'https://fiiocontrol.fiio.com',
            Referer: 'https://fiiocontrol.fiio.com/equalizer/hand-picked',
            ...extraHeaders,
            'Content-Length': buf.length,
          },
        },
        (resp) => {
          const chunks = [];
          resp.on('data', (c) => chunks.push(c));
          resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        },
      );
      r.on('timeout', () => r.destroy(new Error('Timeout kết nối FiiO')));
      r.on('error', reject);
      r.write(buf);
      r.end();
    });
    child.stdin.write(wireBodyStr);
    child.stdin.end();
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/fiio/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }

    const upstreamPath = url.pathname.replace(/^\/api\/fiio/, '') + url.search;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const rawBodyStr = Buffer.concat(chunks).toString('utf8') || '{}';
        const isUcenter = upstreamPath.startsWith('/ucenter-api/');
        const encrypted = isUcenter ? encryptFiioPayload(rawBodyStr) : null;
        const wireBody = encrypted ? encrypted.envelope : rawBodyStr;

        const relayTarget = req.headers['x-fiio-relay'] ? String(req.headers['x-fiio-relay']).trim() : '';
        const baseHost = relayTarget ? relayTarget.replace(/\/+$/, '') : 'https://fiiocontrol.fiio.com';
        const fullUrl = `${baseHost}${upstreamPath}`;

        const respText = await postViaCurlOrHttps(fullUrl, wireBody, {
          ...(encrypted ? { 'X-Request-ID': encrypted.requestId } : {}),
          ...(req.headers['authorization'] ? { Authorization: String(req.headers['authorization']) } : {}),
        });

        const parsed = JSON.parse(respText);
        if (encrypted && parsed?.code === 200 && typeof parsed.data === 'string') {
          parsed.data = decryptFiioData(encrypted.keyHex, parsed.data);
        }

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(parsed));
      } catch (err) {
        res.writeHead(502, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ code: 502, msg: err instanceof Error ? err.message : String(err) }));
      }
    });
    return;
  }

  // Serve built PWA static files with no-cache on index.html & sw.js so updates apply immediately
  let relPath = decodeURIComponent(url.pathname);
  if (relPath === '/') relPath = '/index.html';
  const safePath = path.normalize(path.join(DIST_DIR, relPath));
  if (!safePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let targetFile = safePath;
  if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
    targetFile = path.join(DIST_DIR, 'index.html');
  }
  if (!fs.existsSync(targetFile)) {
    res.writeHead(404);
    res.end('Run npm run build first.');
    return;
  }

  const ext = path.extname(targetFile).toLowerCase();
  const isHtmlOrSw = ext === '.html' || targetFile.endsWith('sw.js') || targetFile.endsWith('registerSW.js');
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    ...(isHtmlOrSw ? { 'Cache-Control': 'no-store, no-cache, must-revalidate' } : {}),
  });
  fs.createReadStream(targetFile).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`JA11 Studio running at http://localhost:${PORT}`);
});
