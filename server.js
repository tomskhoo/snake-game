const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const GRID = 20;
const TICK_MS = 172;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, 'public', file);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// single fixed 2-player room
let room = null;

function freshSnake(startX, startY, dir) {
  return { body: [{ x: startX, y: startY }], dir, nextDir: dir, alive: true, score: 0 };
}

function occupied(room, pos) {
  if (room.snakes.some(s => s.body.some(seg => seg.x === pos.x && seg.y === pos.y))) return true;
  if (room.food && room.food.some(f => f.x === pos.x && f.y === pos.y)) return true;
  return false;
}

function spawnFood(room) {
  const count = Math.floor(Math.random() * 3) + 1; // 1-3
  room.food = [];
  for (let i = 0; i < count; i++) {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (occupied(room, pos));
    room.food.push(pos);
  }
}

function resetRoom() {
  room = {
    players: [null, null],
    snakes: [freshSnake(5, 10, { x: 0, y: -1 }), freshSnake(14, 10, { x: 0, y: 1 })],
    food: null,
    interval: null,
    started: false,
  };
  spawnFood(room);
}
resetRoom();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => { if (p && p.readyState === WebSocket.OPEN) p.send(data); });
}

function bothConnected() {
  return room.players[0] && room.players[1];
}

function startGameIfReady() {
  if (bothConnected() && !room.started) {
    room.started = true;
    broadcast({ type: 'start' });
    room.interval = setInterval(tick, TICK_MS);
  }
}

function tick() {
  const snakes = room.snakes;

  snakes.forEach(s => { if (s.alive) s.dir = s.nextDir; });

  const newHeads = snakes.map(s => s.alive ? { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y } : null);

  snakes.forEach((s, i) => {
    if (!s.alive) return;
    const head = newHeads[i];
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) { s.alive = false; return; }
    if (s.body.some(seg => seg.x === head.x && seg.y === head.y)) { s.alive = false; return; }
    const other = snakes[1 - i];
    if (other.body.some(seg => seg.x === head.x && seg.y === head.y)) { s.alive = false; return; }
  });
  // simultaneous head-to-head collision
  if (newHeads[0] && newHeads[1] && newHeads[0].x === newHeads[1].x && newHeads[0].y === newHeads[1].y) {
    snakes[0].alive = false;
    snakes[1].alive = false;
  }

  snakes.forEach((s, i) => {
    if (!s.alive) return;
    const head = newHeads[i];
    s.body.unshift(head);
    const foodIdx = room.food.findIndex(f => f.x === head.x && f.y === head.y);
    if (foodIdx !== -1) {
      s.score += 1;
      room.food.splice(foodIdx, 1);
      if (room.food.length === 0) spawnFood(room);
    } else {
      s.body.pop();
    }
  });

  broadcast({
    type: 'state',
    snakes: snakes.map(s => ({ body: s.body, alive: s.alive, score: s.score })),
    food: room.food,
    grid: GRID,
  });

  if (snakes.every(s => !s.alive)) {
    clearInterval(room.interval);
    broadcast({ type: 'gameover', winner: null });
    setTimeout(resetRoom, 3000);
  } else if (snakes.some(s => !s.alive)) {
    clearInterval(room.interval);
    const winner = snakes.findIndex(s => s.alive);
    broadcast({ type: 'gameover', winner });
    setTimeout(resetRoom, 3000);
  }
}

wss.on('connection', ws => {
  if (!room.players[0]) {
    room.players[0] = ws;
    ws.playerIndex = 0;
  } else if (!room.players[1]) {
    room.players[1] = ws;
    ws.playerIndex = 1;
  } else {
    ws.send(JSON.stringify({ type: 'full' }));
    ws.close();
    return;
  }

  ws.send(JSON.stringify({ type: 'joined', playerIndex: ws.playerIndex, grid: GRID }));
  broadcast({ type: 'waiting', connected: room.players.filter(Boolean).length });
  startGameIfReady();

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'direction' && room.started) {
      const s = room.snakes[ws.playerIndex];
      const d = msg.dir;
      // ignore 180-degree reversal
      if (s.dir.x === -d.x && s.dir.y === -d.y) return;
      s.nextDir = d;
    }
  });

  ws.on('close', () => {
    if (room.players[ws.playerIndex] === ws) room.players[ws.playerIndex] = null;
    if (room.interval) clearInterval(room.interval);
    broadcast({ type: 'waiting', connected: room.players.filter(Boolean).length });
    resetRoom();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Snake server on http://localhost:${PORT}`));
