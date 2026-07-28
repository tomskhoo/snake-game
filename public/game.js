const CELL = 24;
const COLORS = ['#4ade80', '#60a5fa'];

function drawBoard(ctx, grid) {
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, grid * CELL, grid * CELL);
}

function drawFood(ctx, food) {
  ctx.fillStyle = '#f87171';
  const foods = Array.isArray(food) ? food : [food];
  foods.forEach(f => ctx.fillRect(f.x * CELL, f.y * CELL, CELL, CELL));
}

function drawSnake(ctx, snake, colorIndex) {
  ctx.fillStyle = snake.alive === false ? '#4b5563' : COLORS[colorIndex];
  snake.body.forEach(seg => ctx.fillRect(seg.x * CELL, seg.y * CELL, CELL - 1, CELL - 1));
}

const DIR_KEYS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
