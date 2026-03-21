/**
 * CDP Proxy — forwards requests from Docker to Chrome on host.
 * Listens on 0.0.0.0:9223, rewrites Host header to 'localhost:9222',
 * forwards to 127.0.0.1:9222. Handles both HTTP and WebSocket.
 * Run: node cdp-proxy.cjs
 */
const http = require('http');
const net = require('net');

const PROXY_PORT = parseInt(process.env.CDP_PROXY_PORT ?? '9223');
const CHROME_PORT = parseInt(process.env.CDP_PORT ?? '9222');
const CHROME_HOST = '127.0.0.1';
// Must include port so Chrome echoes correct port in webSocketDebuggerUrl
const CHROME_HOST_HEADER = `localhost:${CHROME_PORT}`;

const server = http.createServer((req, res) => {
  const options = {
    hostname: CHROME_HOST,
    port: CHROME_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: CHROME_HOST_HEADER },
  };
  const proxy = http.request(options, (proxyRes) => {
    // Rewrite WebSocket debugger URLs to point to proxy port
    if (proxyRes.headers['content-type']?.includes('application/json')) {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        const rewritten = body
          .replace(/ws:\/\/127\.0\.0\.1:\d+/g, `ws://host.docker.internal:${PROXY_PORT}`)
          .replace(/ws:\/\/localhost:\d+/g, `ws://host.docker.internal:${PROXY_PORT}`);
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'content-length': Buffer.byteLength(rewritten),
        });
        res.end(rewritten);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  });
  proxy.on('error', err => {
    console.error('[CDP Proxy] HTTP error:', err.message);
    res.writeHead(502);
    res.end('Bad Gateway: ' + err.message);
  });
  req.pipe(proxy, { end: true });
});

// WebSocket tunnel — raw TCP pipe with Host header rewrite
server.on('upgrade', (req, clientSocket, head) => {
  const proxySocket = net.connect(CHROME_PORT, CHROME_HOST, () => {
    const headers = { ...req.headers, host: CHROME_HOST_HEADER };
    const reqStr = [
      `${req.method} ${req.url} HTTP/1.1`,
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      '', '',
    ].join('\r\n');
    proxySocket.write(reqStr);
    if (head && head.length) proxySocket.write(head);
    clientSocket.pipe(proxySocket);
    proxySocket.pipe(clientSocket);
  });
  proxySocket.on('error', err => {
    console.error('[CDP Proxy] WS error:', err.message);
    clientSocket.destroy();
  });
  clientSocket.on('error', () => proxySocket.destroy());
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[CDP Proxy] Listening on 0.0.0.0:${PROXY_PORT} → ${CHROME_HOST}:${CHROME_PORT}`);
});
