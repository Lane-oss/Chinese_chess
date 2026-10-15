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
    tapSignal: 0,
    handledSignal: 0,
    lastTapRow: -2,
    lastTapCol: -2,
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

    // ---- 以下按 Index.ets 中的 onTapSignalChanged / onBoardTap / handleTap 复刻 ----
    onTapSignalChanged() {
      if (this.tapSignal === this.handledSignal) return;
      this.handledSignal = this.tapSignal;
      this.lastTapRow = this.tapRow;
      this.lastTapCol = this.tapCol;
      this.handleTap(this.tapRow, this.tapCol);
    },
    onBoardTap(row, col) {
      if (row === this.lastTapRow && col === this.lastTapCol) return;
      this.lastTapRow = row;
      this.lastTapCol = col;
      this.handleTap(row, col);
    },
    /** 模拟棋盘组件被点击：写共享状态（触发 @Watch）并调用兼容回调 */
    fireTap(row, col, useWatch = true, useCallback = true) {
      this.tapRow = row;
      this.tapCol = col;
      this.tapSignal = this.tapSignal + 1;
      if (useWatch) this.onTapSignalChanged();
      if (useCallback) this.onBoardTap(row, col);
    },
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

console.log('== 交互判定（真实 handleTap 源码 + 两条事件通道）==');

it('【核心】点棋子选中后，直接点绿点即可走子（不需要再点第二次棋子）', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;

  host.fireTap(7, 1);                          // 第一次点击：选红炮
  eq(host.selectedRow, 7, '应进入选中状态');
  eq(host.selectedCol, 1, '应进入选中状态');
  ok(host.targetList.length > 0, '应显示可移动格');

  host.fireTap(3, 1);                          // 第二次点击：点绿点
  eq(host.game.moveCount, 1, '第二次点击就应完成走子（不能要求点第三次）');
  eq(host.selectedRow, -1, '走子后清空选中');
});

it('只有 @Watch 通道时也能走子', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1, true, false);
  ok(host.selectedRow === 7, '应选中');
  host.fireTap(3, 1, true, false);
  eq(host.game.moveCount, 1, '走子应完成');
});

it('只有回调通道时也能走子', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1, false, true);
  ok(host.selectedRow === 7, '应选中');
  host.fireTap(3, 1, false, true);
  eq(host.game.moveCount, 1, '走子应完成');
});

it('两条通道同时生效时，一次点击只被处理一次（去重）', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1, true, true);              // 两条通道都触发
  eq(host.game.moveCount, 0, '选子不应产生步数');
  ok(host.selectedRow === 7, '应仍处于选中状态（没有被第二次处理成取消）');
  host.fireTap(2, 1, true, true);              // 两条通道都触发，吃黑炮
  eq(host.game.moveCount, 1, '一次点击只能走一步');
  eq(host.game.pieceCount(), 31, '应吃掉黑炮');
});

it('吃子落点同样走子（点的绿环）', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1);
  ok(host.targetList.some(([r, c]) => r === 2 && c === 1), '(2,1) 应是可吃黑炮的落点');
  host.fireTap(2, 1);
  eq(host.game.moveCount, 1, '应完成吃子');
  eq(host.game.pieceCount(), 31, '棋子数应减 1');
});

it('点到空白处保留选中（不再静默取消）', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1);
  ok(host.selectedRow === 7, '先选中');
  host.fireTap(5, 4);                          // 既不是落点也不是自己的子
  eq(host.selectedRow, 7, '选中应保留');
  eq(host.selectedCol, 1, '选中应保留');
  ok(host.targetList.length > 0, '落点提示应保留');
  ok(host.messages.length > 0, '应给出文字提示');
});

it('点到对方棋子（非落点）保留选中', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(9, 4);                          // 红帅，可选但无路可走
  const selRow = host.selectedRow;
  host.fireTap(0, 0);                          // 黑车，不是落点
  eq(host.selectedRow, selRow, '选中应保留');
});

it('点自己另一个子 → 换选', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1);
  host.fireTap(7, 7);                          // 另一个红炮
  eq(host.selectedRow, 7, '换选后仍为第 7 行');
  eq(host.selectedCol, 7, '应换选到 (7,7)');
});

it('再点同一个子 → 取消选中', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1);
  host.fireTap(7, 1);
  eq(host.selectedRow, -1, '应取消选中');
  eq(host.targetList.length, 0, '落点应清空');
});

it('未命中棋盘时给出提示且不动局面', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(-1, -1);
  eq(host.game.moveCount, 0, '不应产生步数');
  ok(host.messages.length > 0, '应提示点偏了');
});

it('开局先点对方棋子 → 提示先选自己的子，且不产生选中', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(0, 0);                         // 黑车，红方回合
  eq(host.selectedRow, -1, '不应选中对方棋子');
  ok(host.messages.length > 0, '应提示');
  eq(host.game.moveCount, 0, '不应走子');
});

it('轮次切换后可以正常选另一方', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  host.fireTap(7, 1);
  host.fireTap(3, 1);                         // 红方走一步
  host.boardData = host.game.board;
  host.fireTap(0, 1);                         // 现在轮黑方，选黑马
  ok(host.selectedRow === 0, '黑方棋子应可选');
  ok(host.targetList.length > 0, '应给出黑方落点');
});

it('连续走多步都不需要重复点击', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  const moves = [
    [7, 1, 3, 1],   // 红炮八进七
    [0, 1, 2, 2],   // 黑马二进三
    [3, 1, 3, 4],   // 红炮吃中卒
    [2, 2, 3, 4]    // 黑马吃掉停在 (3,4) 的红炮
  ];
  for (let i = 0; i < moves.length; i++) {
    const [fr, fc, tr, tc] = moves[i];
    host.fireTap(fr, fc);
    ok(host.selectedRow === fr && host.selectedCol === fc,
      `第 ${i + 1} 步应先选中 (${fr},${fc})`);
    host.fireTap(tr, tc);
    eq(host.game.moveCount, i + 1, `第 ${i + 1} 步应当即走子`);
  }
  eq(host.game.moveCount, 4, '四步都应成功');
});

/* ---------------- 源码结构检查：防住「Canvas 不重绘」这类回归 ---------------- */
console.log('\n== 源码结构检查（防止再次改出「棋子位置不更新」）==');

const boardSrc = fs.readFileSync(path.join(ROOT, 'entry/src/main/ets/view/ChessBoard.ets'), 'utf8');

it('ChessBoard 的 board 属性挂了 @Watch（Canvas 不会自动重绘）', () => {
  const m = boardSrc.match(/@Prop\s+@Watch\('(\w+)'\)\s+board\s*:/);
  ok(m !== null, 'board 属性缺少 @Watch：状态变化不会触发重绘，棋子会停在原位');
  console.log(`       监听方法：${m[1]}`);
});

it('@Watch 的处理函数里确实调用了 draw()', () => {
  const m = boardSrc.match(/@Prop\s+@Watch\('(\w+)'\)\s+board\s*:/);
  ok(m !== null, '未找到 board 的 @Watch');
  const handler = m[1];
  const fnRe = new RegExp(handler + '\\s*\\(\\s*\\)\\s*:\\s*void\\s*\\{([\\s\\S]*?)\\n  \\}');
  const fn = boardSrc.match(fnRe);
  ok(fn !== null, `未找到 ${handler} 的实现`);
  ok(fn[1].indexOf('this.draw()') >= 0, `${handler} 中没有调用 this.draw()`);
});

it('选中位置、合法着法、最近一步也都挂了 @Watch', () => {
  for (const prop of ['selectedRow', 'targets', 'lastToRow']) {
    const re = new RegExp('@Prop\\s+@Watch\\(\\\'' + '\\w+' + '\\\'\\)\\s+' + prop + '\\s*:');
    ok(re.test(boardSrc), `${prop} 缺少 @Watch，选中环/落点/最近一步不会更新`);
  }
});

it('点击处理里会递增 tapSignal（@Watch 通道的前提）', () => {
  ok(/this\.tapSignal\s*=\s*this\.tapSignal\s*\+\s*1/.test(boardSrc),
    'onClick 中没有递增 tapSignal，页面收不到点击');
});

it('页面把 tapRow/tapCol/tapSignal 以双向绑定传入', () => {
  const pageSrc = fs.readFileSync(PAGE, 'utf8');
  ok(/tapRow:\s*\$tapRow/.test(pageSrc), 'tapRow 未用 $ 双向绑定');
  ok(/tapCol:\s*\$tapCol/.test(pageSrc), 'tapCol 未用 $ 双向绑定');
  ok(/tapSignal:\s*\$tapSignal/.test(pageSrc), 'tapSignal 未用 $ 双向绑定');
});

it('走子后会把新棋盘写入 boardData（重绘的数据来源）', () => {
  const { host } = makeHost();
  host.game.restart();
  host.boardData = host.game.board;
  const before = host.boardData.slice();
  host.fireTap(7, 1);
  host.fireTap(3, 1);
  const after = host.boardData;
  ok(JSON.stringify(after) !== JSON.stringify(before), '走子后 boardData 应发生变化');
  eq(after[3 * 9 + 1], 6, '(3,1) 应是红炮(6)');
  eq(after[7 * 9 + 1], 0, '(7,1) 应变空');
});

console.log(`\n${'='.repeat(52)}`);
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('交互判定验证通过');
}
