/**
 * 交互判定逻辑验证（Node 运行）
 *
 * 直接从 pages/Index.ets 抽取 handleTap 的真实实现来执行，验证：
 *   1. 点合法落点 → 走子，且不会「取消选中」
 *   2. 点到空白/对方棋子 → 保留选中（不再静默清空）
 *   3. 点自己另一个子 → 换选
 *   4. 再点同一个子 → 取消选中
 *   5. 未命中棋盘 / 对局结束 → 给出提示且不动局面
 *
 * 用法：node tools/verify_interaction.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripArkTs } = require('./verify_xiangqi_strip.js');

const ROOT = path.resolve(__dirname, '..');
const RULES = path.join(ROOT, 'entry/src/main/ets/game/XiangqiRules.ets');
const GAME = path.join(ROOT, 'entry/src/main/ets/game/XiangqiGame.ets');
const PAGE = path.join(ROOT, 'entry/src/main/ets/pages/Index.ets');

function prepare(file) {
  let code = stripArkTs(fs.readFileSync(file, 'utf8'));
  code = code.replace(/^export (const|let|function|class) /gm, '$1 ');
  code = code.replace(/^import[\s\S]*?from\s*'[^']*';?[ \t]*$/gm, '');
  code = code.replace(/export \{[^}]*\};?/g, '');
  return code;
}

/** 从页面源码里抽出 handleTap 方法体（保持与上机代码一致，不手写副本） */
function extractHandleTap(pageSource) {
  const lines = pageSource.split('\n');
  const start = lines.findIndex((l) => l.indexOf('private handleTap(') >= 0);
  if (start < 0) throw new Error('未找到 handleTap');
  let depth = 0;
  let started = false;
  const body = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; }
    }
    body.push(line);
    if (started && depth === 0) break;
  }
  return body.join('\n');
}

const strippedPage = stripArkTs(fs.readFileSync(PAGE, 'utf8'));
const handleTapSrc = extractHandleTap(strippedPage);

// 抽取出来的是方法简写 `handleTap(row, col) {`，前面补 function 才是合法的函数声明
const handleTapJs = 'function ' + handleTapSrc.replace(/^\s*private\s+/, '').trimStart();
try {
  new vm.Script(handleTapJs);
} catch (e) {
  console.log('--- 抽取出的 handleTap 源码（语法错误，请检查）---');
  console.log(handleTapJs.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
  console.log('--- 错误:', e.message, '---\n');
}

/** 构造一个最小宿主，带上 handleTap 依赖的全部方法 */
function makeHost() {
  const code = `
${prepare(RULES)}
${prepare(GAME)}
${handleTapJs}
(() => ({ handleTap, XiangqiGame }))()
`;
  const sandbox = {
    Math, String, Number, Boolean, Array, Object, console, JSON, setTimeout, clearTimeout
  };
  const M = vm.runInNewContext(code, sandbox);

  // 组装一个与 Index 结构等价的宿主对象
  const host = {
    game: new M.XiangqiGame(),
    boardData: [],
    selectedRow: -1,
    selectedCol: -1,
    targetList: [],
    tapRow: -1,
    tapCol: -1,
    tapVisible: false,
    tapText: '',
    tapTimer: -1,
    messages: [],
    handleTap: M.handleTap,
    // 以下方法按 Index.ets 里的定义复刻
    clearSelection() {
      this.selectedRow = -1;
      this.selectedCol = -1;
      this.targetList = [];
    },
    isTarget(row, col) {
      for (let i = 0; i < this.targetList.length; i++) {
        if (this.targetList[i][0] === row && this.targetList[i][1] === col) return true;
      }
      return false;
    },
    selectAt(row, col) {
      if (!this.game.isSelectable(row, col)) { this.clearSelection(); return; }
      this.selectedRow = row;
      this.selectedCol = col;
      this.targetList = this.game.getLegalTargets(row, col);
      this.tapText = '选中';
    },
    showTapFeedback(row, col, text) {
      this.tapRow = row; this.tapCol = col; this.tapText = text; this.tapVisible = true;
    },
    showMessage(text) { this.messages.push(text); },
    applyMove(fromRow, fromCol, toRow, toCol) {
      const record = this.game.move(fromRow, fromCol, toRow, toCol);
      if (record === null) return;
      this.boardData = this.game.board;
      this.lastMove = this.game.lastMove;
      this.clearSelection();
      this.tapText = '已走';
    }
  };
  return { host, M };
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
function ok(cond, label) { if (!cond) throw new Error(label || '断言失败'); }
function eq(a, b, label) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${label || 'eq'}: 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);
  }
}

console.log('== 交互判定（使用页面真实 handleTap 源码）==');

it('点合法落点会走子，且不会残留选中', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(7, 1);                       // 选红炮
  ok(host.selectedRow === 7 && host.selectedCol === 1, '应选中 (7,1)');
  ok(host.targetList.length > 0, '应给出合法落点');
  const before = host.game.pieceCount();
  host.handleTap(3, 1);                       // 点合法落点
  eq(host.game.moveCount, 1, '应完成一步');
  eq(host.selectedRow, -1, '走子后应清空选中');
  eq(host.game.pieceCount(), before, '炮八进七不吃子，棋子数不变');
});

it('吃子落点同样走子（点的绿环）', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(7, 1);
  ok(host.targetList.some(([r, c]) => r === 2 && c === 1), '(2,1) 应是可吃黑炮的落点');
  host.handleTap(2, 1);
  eq(host.game.moveCount, 1, '应完成吃子');
  eq(host.game.pieceCount(), 31, '棋子数应减 1');
});

it('点到空白处保留选中（不再静默取消）', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(7, 1);
  ok(host.selectedRow === 7, '先选中');
  host.handleTap(5, 4);                       // 既不是落点也不是自己的子
  eq(host.selectedRow, 7, '选中应保留');
  eq(host.selectedCol, 1, '选中应保留');
  ok(host.targetList.length > 0, '落点提示应保留');
  ok(host.messages.length > 0, '应给出文字提示');
});

it('点到对方棋子（非落点）保留选中', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(9, 4);                       // 红帅，可选但无路可走
  const selRow = host.selectedRow;
  host.handleTap(0, 0);                       // 黑车，不是落点
  eq(host.selectedRow, selRow, '选中应保留');
});

it('点自己另一个子 → 换选', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(7, 1);
  host.handleTap(7, 7);                       // 另一个红炮
  eq(host.selectedRow, 7, '换选后仍为第 7 行');
  eq(host.selectedCol, 7, '应换选到 (7,7)');
});

it('再点同一个子 → 取消选中', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(7, 1);
  host.handleTap(7, 1);
  eq(host.selectedRow, -1, '应取消选中');
  eq(host.targetList.length, 0, '落点应清空');
});

it('未命中棋盘时给出提示且不动局面', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(-1, -1);
  eq(host.game.moveCount, 0, '不应产生步数');
  ok(host.messages.length > 0, '应提示点偏了');
});

it('开局先点对方棋子 → 提示先选自己的子，且不产生选中', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(0, 0);                       // 黑车，红方回合
  eq(host.selectedRow, -1, '不应选中对方棋子');
  ok(host.messages.length > 0, '应提示');
  eq(host.game.moveCount, 0, '不应走子');
});

it('轮次切换后可以正常选另一方', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.handleTap(7, 1);
  host.handleTap(3, 1);                       // 红方走一步
  host.boardData = host.game.board;
  host.handleTap(0, 1);                       // 现在轮黑方，选黑马
  ok(host.selectedRow === 0, '黑方棋子应可选');
  ok(host.targetList.length > 0, '应给出黑方落点');
});

console.log(`\n${'='.repeat(52)}`);
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('交互判定验证通过');
}
