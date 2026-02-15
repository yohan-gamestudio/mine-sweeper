import http from 'node:http';
import { WebSocketServer } from 'ws';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  const { url, method } = req;

  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'minesweeper-ws',
        wsPath: '/ws',
        now: Date.now()
      })
    );
    return;
  }

  if (method === 'GET' && url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'server:hello', payload: { ok: true } }));

  ws.on('message', (raw) => {
    ws.send(JSON.stringify({ type: 'server:echo', payload: String(raw) }));
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ws server listening on http://${HOST}:${PORT}`);
});
