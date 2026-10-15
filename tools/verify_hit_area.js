/**
 * 落点命中范围验证（Node 运行）
 *
 * 复制 ChessBoard.ets 中 locate() 的数学逻辑，检查：
 *   1. 容差是否真的不再产生死区（棋盘上任意点都能吸附到某个交点）
 *   2. 每个交点分到的可点范围是否恰好是「离它最近的那一片」
 *   3. 棋盘外的点是否仍被正确拒绝
 *
 * 用法：node tools/verify_hit_area.js
 */

const GRID_COLS = 9;
const GRID_ROWS = 10;
const PAD_RATIO = 0.5;
const HIT_TOLERANCE = 0.5;

/** 与 ChessBoard.locate() 等价的实现（吸附 + 钳制到棋盘范围） */
function locate(x, y, cell) {
  const pad = cell * PAD_RATIO;
  const maxRow = GRID_ROWS - 1;
  const maxCol = GRID_COLS - 1;
  let col = Math.round((x - pad) / cell);
  let row = Math.round((y - pad) / cell);
  if (col < 0) col = 0; else if (col > maxCol) col = maxCol;
  if (row < 0) row = 0; else if (row > maxRow) row = maxRow;
  const dx = Math.abs(x - (pad + col * cell));
  const dy = Math.abs(y - (pad + row * cell));
  const outside = cell * HIT_TOLERANCE;
  if (dx > outside || dy > outside) return [-1, -1];
  return [row, col];
}

/** 与旧实现（容差 0.45）对照，量化死区 */
function locateOld(x, y, cell) {
  const pad = cell * PAD_RATIO;
  const col = Math.round((x - pad) / cell);
  const row = Math.round((y - pad) / cell);
  if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) {
    return [-1, -1];
  }
  const dx = Math.abs(x - (pad + col * cell));
  const dy = Math.abs(y - (pad + row * cell));
  if (dx > cell * 0.45 || dy > cell * 0.45) {
    return [-1, -1];
  }
  return [row, col];
}

let passed = 0;
const failures = [];
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
function ok(cond, label) {
  if (!cond) throw new Error(label || '断言失败');
}

const CELL = 72;          // 典型格距（vp）
const pad = CELL * PAD_RATIO;
const boardW = CELL * (GRID_COLS + 1);
const boardH = CELL * (GRID_ROWS + 1);

console.log(`格距 = ${CELL}，棋盘 = ${boardW} x ${boardH}，容差 = ${HIT_TOLERANCE} 格距\n`);

console.log('== 新实现（吸附 + 钳制）：应无死区 ==');
it('可点区域（棋盘矩形 ± 半格）内任意点都能命中', () => {
  // 可点区域：从最外圈交点向外扩半格。棋盘画面最外圈的留白是装饰边框，不参与落点。
  const eps = 1e-6;
  const xMin = pad - CELL * HIT_TOLERANCE + eps;
  const xMax = pad + CELL * (GRID_COLS - 1) + CELL * HIT_TOLERANCE - eps;
  const yMin = pad - CELL * HIT_TOLERANCE + eps;
  const yMax = pad + CELL * (GRID_ROWS - 1) + CELL * HIT_TOLERANCE - eps;
  let miss = 0;
  let total = 0;
  for (let x = xMin; x <= xMax; x += 1) {
    for (let y = yMin; y <= yMax; y += 1) {
      total++;
      if (locate(x, y, CELL)[0] < 0) miss++;
    }
  }
  ok(miss === 0, `可点区域内仍有 ${miss} 个点无法命中（共 ${total} 个采样点）`);
});

it('四边留白上的点击落到最近的边线交点', () => {
  // 左侧留白（棋盘外框以内、第一条竖线以外）
  const left = locate(pad * 0.2, pad + 5 * CELL, CELL);
  ok(left[1] === 0, `左侧留白应落到第 0 列，实际 col=${left[1]}`);
  // 上方留白
  const top = locate(pad + 4 * CELL, pad * 0.2, CELL);
  ok(top[0] === 0, `上方留白应落到第 0 行，实际 row=${top[0]}`);
  // 右侧留白
  const right = locate(pad + CELL * (GRID_COLS - 1) + CELL * 0.4, pad + 5 * CELL, CELL);
  ok(right[1] === GRID_COLS - 1, `右侧留白应落到最后一列，实际 col=${right[1]}`);
});

it('边路棋子（车、兵）的点击范围覆盖到棋盘边缘', () => {
  const y = pad + 9 * CELL;
  // 最左列的帅/车：从棋盘左边缘一直到 x=pad 都应命中第 0 列
  for (let x = 1; x <= pad; x += 1) {
    const pos = locate(x, y, CELL);
    ok(pos[1] === 0, `x=${x} 应命中第 0 列，实际 ${JSON.stringify(pos)}`);
  }
});

it('相邻交点之间不再有点不中的空隙', () => {
  const misses = [];
  // 沿第 5 行横向扫描两个相邻交点之间
  const y = pad + 5 * CELL;
  const x0 = pad + 3 * CELL;
  const x1 = pad + 4 * CELL;
  for (let x = x0; x <= x1; x += 0.5) {
    if (locate(x, y, CELL)[0] < 0) misses.push(x);
  }
  ok(misses.length === 0, `(3,5) 与 (4,5) 之间有 ${misses.length} 个采样点无法命中`);
});

it('每个交点恰好拥有「离它最近」的那片区域', () => {
  // 取交点 (3,5) 与其右邻 (4,5) 的正中间，应判给更近的一侧
  const y = pad + 5 * CELL;
  const mid = pad + 3.5 * CELL;
  const left = locate(mid - 0.5, y, CELL);
  const right = locate(mid + 0.5, y, CELL);
  ok(left[1] === 3, `中点偏左应判给 (3,5)，实际 col=${left[1]}`);
  ok(right[1] === 4, `中点偏右应判给 (4,5)，实际 col=${right[1]}`);
});

it('棋子边缘也能点中（棋子半径 0.42 格距）', () => {
  const cx = pad + 4 * CELL;
  const cy = pad + 6 * CELL;
  const r = CELL * 0.42;
  const pos = locate(cx + r, cy + r, CELL);   // 棋子右下边缘
  ok(pos[0] === 6 && pos[1] === 4, `棋子边缘点击应命中 (6,4)，实际 ${JSON.stringify(pos)}`);
});

it('明显在棋盘外的点被拒绝', () => {
  ok(locate(-CELL, pad + 5 * CELL, CELL)[0] === -1, '左侧远处应拒绝');
  ok(locate(boardW + CELL, pad + 5 * CELL, CELL)[0] === -1, '右侧远处应拒绝');
  ok(locate(pad + 4 * CELL, -CELL, CELL)[0] === -1, '上方远处应拒绝');
});

console.log('\n== 旧实现（容差 0.45）对照 ==');
it('旧实现存在死区（说明这次修改确有必要）', () => {
  const y = pad + 5 * CELL;
  let dead = 0;
  let span = 0;
  for (let x = pad + 3 * CELL; x <= pad + 4 * CELL; x += 0.5) {
    span++;
    if (locateOld(x, y, CELL)[0] < 0) dead++;
  }
  ok(dead > 0, '旧实现竟然没有死区？');
  const deadPx = dead * 0.5;
  console.log(`       相邻交点之间有 ${deadPx.toFixed(1)} vp 宽的死区（约占格距的 ${(deadPx / CELL * 100).toFixed(0)}%）`);
});

it('新实现在同一段区间内死区为 0', () => {
  const y = pad + 5 * CELL;
  let dead = 0;
  for (let x = pad + 3 * CELL; x <= pad + 4 * CELL; x += 0.5) {
    if (locate(x, y, CELL)[0] < 0) dead++;
  }
  ok(dead === 0, `新实现仍有 ${dead} 个死点`);
});

console.log(`\n${'='.repeat(52)}`);
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('落点范围验证通过');
}
