/**
 * 象棋规则验证脚本（Node 运行，不依赖 ArkTS 工具链）
 *
 * 思路：直接从 .ets 源文件抽取逻辑（见 verify_xiangqi_strip.js），
 * 用 Node 跑断言。验证的就是真正上机的同一份规则代码。
 *
 * 用法：node tools/verify_xiangqi.js
 *
 * 摆盘注意：不能出现“双将照面”的非法局面，否则按规则所有走法都会被判非法。
 * 下面的 board() 默认把红帅放在 (9,4)、黑将放在 (0,3)，需要时再显式覆盖。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { stripArkTs } = require('./verify_xiangqi_strip.js');

const ROOT = path.resolve(__dirname, '..');
const RULES_FILE = path.join(ROOT, 'entry/src/main/ets/game/XiangqiRules.ets');
const GAME_FILE = path.join(ROOT, 'entry/src/main/ets/game/XiangqiGame.ets');

function prepare(file) {
  let code = stripArkTs(fs.readFileSync(file, 'utf8'));
  code = code.replace(/^export (const|let|function|class) /gm, '$1 ');
  code = code.replace(/^import[\s\S]*?from\s*'[^']*';?[ \t]*$/gm, '');
  code = code.replace(/export \{[^}]*\};?/g, '');
  return code;
}

/**
 * 两个文件共享同一作用域：XiangqiGame.ets 依赖 XiangqiRules.ets 的常量与函数，
 * 必须拼成一份脚本求值，否则作用域隔离会报未定义。
 */
function loadAll(exportNames) {
  const code = `${prepare(RULES_FILE)}\n${prepare(GAME_FILE)}`;
  const collects = exportNames
    .map((n) => `  ${JSON.stringify(n)}: typeof ${n} !== 'undefined' ? ${n} : undefined,`)
    .join('\n');
  const wrapped = `${code}\n(() => ({\n${collects}\n}))()`;
  return vm.runInNewContext(wrapped, { Math, String, Number, Boolean, Array, Object, console, JSON });
}

const M = loadAll([
  'GRID_COLS', 'GRID_ROWS', 'BOARD_SIZE', 'K_NONE', 'K_GENERAL', 'K_ADVISOR', 'K_ELEPHANT',
  'K_HORSE', 'K_CHARIOT', 'K_CANNON', 'K_SOLDIER', 'RED_OFFSET',
  'createInitialBoard', 'createEmptyBoard', 'inBoard', 'indexOf', 'pieceAt', 'setPieceAt',
  'pieceKind', 'pieceOwner', 'isRedPiece', 'isBlackPiece', 'isOwnPiece', 'pieceName',
  'playerName', 'opposite', 'pseudoMoves', 'generalsFacing', 'isInCheck', 'isLegal',
  'legalMovesFor', 'legalTargets', 'hasLegalMove', 'findGeneral', 'attackersOf',
  'XiangqiGame'
]);

const GEN = M.K_GENERAL, ADV = M.K_ADVISOR, ELE = M.K_ELEPHANT, HOR = M.K_HORSE;
const CHA = M.K_CHARIOT, CAN = M.K_CANNON, SOL = M.K_SOLDIER, OFF = M.RED_OFFSET;

/* ---------------- 迷你测试框架 ---------------- */
let passed = 0;
const failures = [];
let group = '';

function describe(name, fn) {
  group = name;
  console.log(`\n== ${name} ==`);
  fn();
}
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(`${group} > ${name}: ${err.message}`);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label || 'eq'}: 期望 ${e}，实际 ${a}`);
}
function ok(cond, label) {
  if (!cond) throw new Error(label || '断言失败');
}
function sorted(pairs) {
  return pairs.map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

/** 摆盘：默认红帅 (9,4)、黑将 (0,3)；传入 null 表示不放该将 */
function board(entries, redGeneral, blackGeneral) {
  const b = M.createEmptyBoard();
  const rg = redGeneral === undefined ? [9, 4] : redGeneral;
  const bg = blackGeneral === undefined ? [0, 3] : blackGeneral;
  if (rg) M.setPieceAt(b, rg[0], rg[1], GEN);
  if (bg) M.setPieceAt(b, bg[0], bg[1], GEN + OFF);
  for (const [r, c, p] of entries) M.setPieceAt(b, r, c, p);
  return b;
}
function targets(b, r, c, side) {
  return sorted(M.legalTargets(b, r, c, side));
}
function has(list, r, c) {
  return list.some(([a, d]) => a === r && d === c);
}
/** 摆盘并让指定方走棋，随后刷新将军/终局状态 */
function setup(g, entries, side) {
  g.loadBoard(entries);
  g.forceTurn(side);
  g.refresh();
  return g;
}

/* ---------------- 初始局面 ---------------- */
describe('初始局面', () => {
  it('32 个棋子，红黑各 16', () => {
    const b = M.createInitialBoard();
    let reds = 0, blacks = 0;
    for (const p of b) {
      if (M.isRedPiece(p)) reds++;
      else if (M.isBlackPiece(p)) blacks++;
    }
    eq(reds, 16, '红方棋子数');
    eq(blacks, 16, '黑方棋子数');
  });

  it('将帅位置正确（黑 0,4 / 红 9,4）', () => {
    const b = M.createInitialBoard();
    eq(M.findGeneral(b, 'red'), [9, 4], '红帅');
    eq(M.findGeneral(b, 'black'), [0, 4], '黑将');
  });

  it('开局双方都不被将军，也不照面', () => {
    const b = M.createInitialBoard();
    ok(!M.isInCheck(b, 'red'), '红方不应被将军');
    ok(!M.isInCheck(b, 'black'), '黑方不应被将军');
    ok(!M.generalsFacing(b), '开局不应照面');
  });

  it('开局着法数逐子核对（合计 44）', () => {
    // 逐子推导：
    //   兵 5×1 = 5；炮 2×12 = 24；车 2×2 = 4；马 2×2 = 4；相 2×2 = 4；仕 2×1 = 2；帅 1
    //   车的 2 步  = 车九进一、车九进二（(9,1) 是己方马、正前方 (6,0) 是己方兵）
    //   炮的 12 步 = 平移/进退 11 步 + 炮八进六（以黑炮 (3,1) 为架打黑马 (2,1)）
    //   注意：炮不能吃紧邻的 (3,1) 黑炮，因此不是 13 步。合计 44，与公认的首着数一致。
    const b = M.createInitialBoard();
    const perPiece = [
      [6, 0, 1], [6, 2, 1], [6, 4, 1], [6, 6, 1], [6, 8, 1],
      [7, 1, 12], [7, 7, 12],
      [9, 0, 2], [9, 8, 2],
      [9, 1, 2], [9, 7, 2],
      [9, 2, 2], [9, 6, 2],
      [9, 3, 1], [9, 5, 1],
      [9, 4, 1]
    ];
    let sum = 0;
    for (const [r, c, expect] of perPiece) {
      const actual = M.legalTargets(b, r, c, 'red').length;
      eq(actual, expect, `${M.pieceName(M.pieceAt(b, r, c))}(${r},${c}) 着法数`);
      sum += actual;
    }
    eq(sum, 44, '逐子合计');
    eq(M.legalMovesFor(b, 'red').length, 44, 'legalMovesFor 合计');
    eq(M.legalMovesFor(b, 'black').length, 44, '黑方合计（对称）');
  });

  it('开局炮：只能隔子吃，不能吃炮架本身', () => {
    const b = M.createInitialBoard();
    // 第 1 列：红炮(7,1) — 空(6,1)(5,1)(4,1)(3,1) — 黑炮(2,1) 空(1,1) 黑马(0,1)
    eq(M.pieceName(M.pieceAt(b, 2, 1)), '炮', '(2,1) 应是黑炮（炮架）');
    eq(M.pieceAt(b, 3, 1), M.K_NONE, '(3,1) 是空位');
    const list = M.legalTargets(b, 7, 1, 'red');
    ok(!has(list, 2, 1), '炮不能吃炮架 (2,1) 本身');
    ok(has(list, 0, 1), '炮八进六：以黑炮为架打黑马 (0,1)');
    ok(has(list, 3, 1), '(3,1) 是空位，可走');
  });

  it('车不能穿过任何棋子（含己方兵与对方卒）', () => {
    const b = M.createInitialBoard();
    // 车九进三想吃 (3,0) 的黑卒，但正前方 (6,0) 有自己的兵
    ok(!M.isLegal(b, 9, 0, 3, 0), '车不能穿过己方兵去吃卒');
    ok(!M.isLegal(b, 9, 0, 2, 0), '车不能穿过己方兵');
    ok(M.isLegal(b, 9, 0, 8, 0), '车九进一可行');
    ok(M.isLegal(b, 9, 0, 7, 0), '车九进二可行');
    // (9,1) 是己方马，不能横走吃自己的子
    ok(!M.isLegal(b, 9, 0, 9, 1), '不能吃己方马');
  });

  it('棋子显示字符正确', () => {
    const b = M.createInitialBoard();
    eq(M.pieceName(M.pieceAt(b, 9, 4)), '帅', '红帅');
    eq(M.pieceName(M.pieceAt(b, 0, 4)), '将', '黑将');
    eq(M.pieceName(M.pieceAt(b, 9, 2)), '相', '红相');
    eq(M.pieceName(M.pieceAt(b, 0, 2)), '象', '黑象');
    eq(M.pieceName(M.pieceAt(b, 6, 0)), '兵', '红兵');
    eq(M.pieceName(M.pieceAt(b, 3, 0)), '卒', '黑卒');
  });
});

/* ---------------- 车 ---------------- */
describe('车', () => {
  it('空盘中心 17 步（横 8 + 纵 9）', () => {
    const b = board([[5, 4, CHA]], null, null);
    eq(M.pseudoMoves(b, 5, 4).length, 17, '空盘车走法数');
  });

  it('不能穿过阻挡棋子', () => {
    const b = board([[5, 4, CHA], [5, 2, SOL]], null, null);
    const moves = M.pseudoMoves(b, 5, 4);
    ok(!moves.some(([r, c]) => r === 5 && c < 2), '不应穿过己方兵');
    ok(has(moves, 5, 3), '应能走到己方兵前一格');
  });

  it('可以吃对方棋子，不能吃己方棋子（完整合法性过滤）', () => {
    const b = board([[5, 4, CHA], [5, 6, SOL + OFF], [5, 1, SOL]]);
    const list = targets(b, 5, 4, 'red');
    ok(has(list, 5, 6), '应能吃黑卒');
    ok(!has(list, 5, 1), '不能吃己方兵');
  });
});

/* ---------------- 马 ---------------- */
describe('马（蹩马腿）', () => {
  it('空盘中心 8 个落点', () => {
    const b = board([[5, 4, HOR]], null, null);
    eq(M.pseudoMoves(b, 5, 4).length, 8, '空盘马走法数');
  });

  it('马腿被挡时对应两个方向不可走', () => {
    const b = board([[5, 4, HOR], [4, 4, SOL]], null, null);
    const moves = M.pseudoMoves(b, 5, 4);
    eq(moves.filter(([r]) => r === 3).length, 0, '向上应被蹩马腿');
    eq(moves.length, 6, '剩余走法数');
  });

  it('横向马腿同理', () => {
    const b = board([[5, 4, HOR], [5, 5, SOL]], null, null);
    ok(!M.pseudoMoves(b, 5, 4).some(([r, c]) => c === 6), '向右应被蹩马腿');
  });

  it('完整合法性下不能吃己方棋子', () => {
    const b = board([[5, 4, HOR], [3, 3, SOL]]);
    const list = targets(b, 5, 4, 'red');
    ok(!has(list, 3, 3), '不能吃己方兵');
    eq(list.length, 7, '剩余合法走法数');
  });
});

/* ---------------- 炮 ---------------- */
describe('炮（炮打隔子）', () => {
  it('不能吃己方棋子，也不能连吃两个以上的棋子', () => {
    // 炮 (5,8)：紧邻第一个子是己方车 (5,6)（炮可以拿它当炮架），
    // 但隔着车、兵 (5,4)、黑卒 (5,2) 之后还有棋子 → 超出炮的吃子范围
    const b = board([[5, 8, CAN], [5, 6, CHA], [5, 4, SOL], [5, 2, SOL + OFF]], [9, 0], [0, 3]);
    const moves = M.pseudoMoves(b, 5, 8);
    ok(!has(moves, 5, 6), '不能吃己方车');
    ok(!has(moves, 5, 2), '隔了多个棋子不能吃 (5,2)');
    ok(has(moves, 5, 7), '可以空走到 (5,7)');
  });

  it('炮不能吃紧邻的棋子，只能打炮架后面的第一个子（完整合法性）', () => {
    // 红帅 (9,0) 避开第 4 列；红炮 (6,4)、黑卒 (5,4)、黑车 (4,4)
    const b = board([[6, 4, CAN], [5, 4, SOL + OFF], [4, 4, CHA + OFF], [9, 8, CHA]], [9, 0]);
    const list = targets(b, 6, 4, 'red');
    ok(!has(list, 5, 4), '炮不能吃紧邻的炮架 (5,4)');
    ok(has(list, 4, 4), '炮可隔子（以 (5,4) 为架）吃黑车 (4,4)');
  });

  it('炮架后是己方棋子则不可吃', () => {
    const b = board([[6, 4, CAN], [5, 4, SOL + OFF], [4, 4, CHA]]);
    const list = targets(b, 6, 4, 'red');
    ok(!has(list, 4, 4), '不能吃己方车');
  });
});

/* ---------------- 象/相 ---------------- */
describe('象/相（塞象眼、不过河）', () => {
  it('(9,2) 的相有 2 个落点', () => {
    const b = board([[9, 2, ELE]]);
    eq(targets(b, 9, 2, 'red').length, 2, '红相走法数');
  });

  it('象眼被塞时不能走该方向', () => {
    const b = board([[9, 2, ELE], [8, 3, SOL]], null, null);
    ok(!M.pseudoMoves(b, 9, 2).some(([r, c]) => r === 7 && c === 4), '塞象眼后不可走该方向');
  });

  it('不能过河：河沿上的相只能回撤', () => {
    const b = board([[5, 4, ELE]], null, null);
    eq(sorted(M.pseudoMoves(b, 5, 4)), [[7, 2], [7, 6]], '红相在河沿只能走回己方半场');
  });

  it('黑象同样不能过河', () => {
    const b = board([[4, 4, ELE + OFF]], null, null);
    eq(sorted(M.pseudoMoves(b, 4, 4)), [[2, 2], [2, 6]], '黑象在河沿只能走回己方半场');
  });
});

/* ---------------- 仕/士 ---------------- */
describe('仕/士（九宫）', () => {
  it('九宫中心的仕：被己方帅占位时减少 1 个落点', () => {
    // 仕 (8,4) 的四个斜向落点为 (7,3)(7,5)(9,3)(9,5)，帅占住其中一个即减 1
    const free = board([[8, 4, ADV]], [9, 4], [0, 3]);
    eq(M.pseudoMoves(free, 8, 4).length, 4, '帅在 (9,4) 时 4 个落点');
    const left = board([[8, 4, ADV]], [9, 3], [0, 4]);
    eq(M.pseudoMoves(left, 8, 4).length, 3, '帅占 (9,3) 时剩 3 个落点');
    const right = board([[8, 4, ADV]], [9, 5], [0, 4]);
    eq(M.pseudoMoves(right, 8, 4).length, 3, '帅占 (9,5) 时剩 3 个落点');
  });

  it('不能走出九宫', () => {
    const b = board([[9, 3, ADV]]);
    const moves = M.pseudoMoves(b, 9, 3);
    eq(moves.length, 1, '角上仕只有 1 个落点');
    eq(moves[0], [8, 4], '唯一落点为九宫中心');
  });

  it('黑士方向同样受限', () => {
    const b = board([[0, 5, ADV + OFF]], undefined, [0, 4]);
    const moves = M.pseudoMoves(b, 0, 5);
    eq(moves, [[1, 4]], '黑士唯一落点为九宫中心');
  });
});

/* ---------------- 将/帅 ---------------- */
describe('将/帅（九宫）', () => {
  it('将只能在九宫内直走一步', () => {
    // 黑将 (1,4)，红帅 (9,4)? 会同列照面 → 红帅放 (9,0)
    const b = board([[1, 4, GEN + OFF]], [9, 0], null);
    M.setPieceAt(b, 1, 4, GEN + OFF);
    const moves = M.pseudoMoves(b, 1, 4);
    ok(!moves.some(([r]) => r === 3), '不能走出九宫（向下越过第 2 行）');
    ok(!moves.some(([, c]) => c === 2 || c === 6), '不能走出九宫（横向越界）');
    eq(M.pseudoMoves(b, 1, 4), [[0, 4], [2, 4], [1, 3], [1, 5]], '将的四个方向');
  });

  it('将不能走出九宫格边界（贴边时只有 3 个方向）', () => {
    const b = board([[0, 4, GEN + OFF]], [9, 0], null);
    M.setPieceAt(b, 0, 4, GEN + OFF);
    const moves = sorted(M.pseudoMoves(b, 0, 4));
    eq(M.pseudoMoves(b, 0, 4), [[1, 4], [0, 3], [0, 5]], '贴底线时不能后退');
  });

  it('帅被己方棋子挡住时不能走该方向', () => {
    // 红帅 (9,4)：上 (8,4) 与左 (9,3) 用己方兵堵住，右侧空
    const b = board([[8, 4, SOL], [9, 3, SOL]]);
    const moves = M.pseudoMoves(b, 9, 4);
    ok(!has(moves, 8, 4), '上方被己方兵占住');
    ok(!has(moves, 9, 3), '左侧被己方兵占住');
    ok(has(moves, 9, 5), '右侧可走');
  });
});

/* ---------------- 兵/卒 ---------------- */
describe('兵/卒（过河前后）', () => {
  it('未过河只能向前一步', () => {
    const b = board([[6, 4, SOL]], null, null);
    eq(M.pseudoMoves(b, 6, 4), [[5, 4]], '红兵未过河只能前进');
  });

  it('过河后可前进与左右移动，且不能后退', () => {
    const b = board([[4, 4, SOL]], null, null);
    const moves = sorted(M.pseudoMoves(b, 4, 4));
    eq(moves, [[3, 4], [4, 3], [4, 5]], '过河兵走法');
    ok(!moves.some(([r]) => r === 5), '不能后退');
  });

  it('黑卒方向相反', () => {
    const b = board([[3, 4, SOL + OFF]], null, null);
    eq(M.pseudoMoves(b, 3, 4), [[4, 4]], '黑卒未过河向红方前进');
  });

  it('黑卒过河后同样可左右移动', () => {
    const b = board([[5, 4, SOL + OFF]], null, null);
    eq(sorted(M.pseudoMoves(b, 5, 4)), [[5, 3], [5, 5], [6, 4]], '过河黑卒走法');
  });
});

/* ---------------- 飞将 ---------------- */
describe('飞将（将帅照面）', () => {
  it('同列且中间无子判定为照面', () => {
    const b = board([], [9, 4], [0, 4]);
    ok(M.generalsFacing(b), '应判定为照面');
    ok(M.isInCheck(b, 'red'), '照面时红方视为被将军');
    ok(M.isInCheck(b, 'black'), '照面时黑方视为被将军');
  });

  it('中间有子则不算照面', () => {
    const b = board([[5, 4, SOL]], [9, 4], [0, 4]);
    ok(!M.generalsFacing(b), '有遮挡不应判为照面');
  });

  it('挡住照面的子不能移开（否则非法）', () => {
    const b = board([[5, 4, CHA]], [9, 4], [0, 4]);
    ok(!M.isLegal(b, 5, 4, 5, 5), '移开遮挡造成照面应非法');
    ok(M.isLegal(b, 5, 4, 4, 4), '沿同列前进仍挡住，合法');
  });

  it('无关棋子可以正常走动', () => {
    // 红帅 (9,3)、黑将 (0,4)：与照面无关的车 (5,0) 可横走
    const b = board([[5, 0, CHA]], [9, 3], [0, 4]);
    ok(M.isLegal(b, 5, 0, 5, 1), '与照面无关的车横走应合法');
  });
});

/* ---------------- 送将与应将 ---------------- */
describe('送将与应将', () => {
  it('被将军时不能走无关的棋，可以吃掉将军的棋子', () => {
    // 黑车 (8,4) 与红帅 (9,4) 同列将军；黑将在 (0,3)
    const b = board([[8, 4, CHA + OFF], [5, 0, CHA]]);
    ok(M.isInCheck(b, 'red'), '红方应处于被将军状态');
    ok(!M.isLegal(b, 5, 0, 4, 0), '被将军时不能走无关的车');
    ok(M.isLegal(b, 5, 0, 8, 0) === false, '红车不能吃到黑车（(8,0) 与 (8,4) 不同点）');
    const rook = board([[8, 4, CHA + OFF], [8, 0, CHA]]);
    ok(M.isLegal(rook, 8, 0, 8, 4), '红车可以吃掉将军的黑车解将');
  });

  it('送将的走法非法', () => {
    const b = board([[8, 4, CHA + OFF], [5, 0, CHA]]);
    ok(!M.isLegal(b, 5, 0, 4, 0), '红车走开后红帅被将军 → 非法');
    ok(!M.isLegal(b, 5, 0, 3, 0), '同上，另一方向同样非法');
  });

  it('可以走到将军线路上封挡（垫子解将）', () => {
    // 黑车 (5,4) 沿第 4 列纵向将军红帅 (9,4)；红兵 (7,0) 可平移到 (7,4) 垫在中间解将。
    // 兵过河后（row<=4）才可横走，这里兵在 (7,0) 属未过河——改用红车在 (7,0)？会与帅同列的路径无关，
    // 因此改用「红车 (7,0) 竖向无关，红兵不可横走」→ 直接用红车在 (7,5) 横走到 (7,4)。
    const b = board([[5, 4, CHA + OFF], [7, 0, CHA]], [9, 4], [0, 2]);
    ok(M.isInCheck(b, 'red'), '黑车沿第 4 列将军');
    ok(M.isLegal(b, 7, 0, 7, 4), '红车可平移到 (7,4) 垫子解将');
    ok(!M.isLegal(b, 7, 0, 6, 0), '被将军时不能走无关的着法');
  });

  it('帅可以躲开将军', () => {
    const b = board([[4, 4, CHA + OFF]]);
    ok(M.isInCheck(b, 'red'), '红方被将军');
    // 黑将在 (0,3)：帅逃向 (9,3) 会与黑将同列照面 → 只有 (9,5) 可走
    eq(targets(b, 9, 4, 'red'), [[9, 5]], '帅只能逃向不照面的一侧');
  });
});

/* ---------------- 对局流程 ---------------- */
describe('对局流程', () => {
  it('开局红先，走子后轮到黑方', () => {
    const g = new M.XiangqiGame();
    g.restart();
    eq(g.turn, 'red', '开局轮次');
    ok(g.isSelectable(9, 0), '红车可选');
    const rec = g.move(9, 0, 8, 0);
    ok(rec !== null, '走子应成功');
    eq(g.turn, 'black', '走子后轮次');
    eq(g.moveCount, 1, '步数');
    eq(rec.fromRow, 9, '记录起点');
    eq(rec.toRow, 8, '记录终点');
  });

  it('不能走对方的棋子，也不能走违反走子形态的着法', () => {
    const g = new M.XiangqiGame();
    g.restart();
    eq(g.move(0, 0, 1, 0), null, '不能替黑方走棋');
    eq(g.move(9, 0, 9, 4), null, '车不能穿过己方马相仕帅');
    eq(g.move(6, 0, 5, 1), null, '兵不能斜走');
    eq(g.move(9, 4, 8, 3), null, '帅不能斜走');
    eq(g.move(9, 4, 7, 4), null, '帅不能一次走两格');
    eq(g.getLegalTargets(0, 0).length, 0, '对方棋子没有可选着法');
  });

  it('吃子后棋子数减少', () => {
    const g = new M.XiangqiGame();
    g.restart();
    eq(g.pieceCount(), 32, '开局棋子数');
    // 炮必须隔子吃：不能吃炮架 (2,1)，但可以隔它吃掉 (0,1) 的黑马
    eq(g.move(7, 1, 2, 1), null, '炮不能吃炮架 (2,1) 本身');
    const rec = g.move(7, 1, 0, 1);
    ok(rec !== null, '炮八进六以黑炮为架吃掉黑马');
    eq(rec.captured, HOR + OFF, '记录被吃棋子为黑马');
    eq(g.pieceCount(), 31, '吃子后棋子数');
  });

  it('悔棋能完整恢复上一局面', () => {
    const g = new M.XiangqiGame();
    g.restart();
    const before = g.board;
    g.move(9, 0, 8, 0);
    ok(g.canUndo, '应可悔棋');
    ok(g.undo(), '悔棋应成功');
    eq(g.board, before, '棋盘应完全还原');
    eq(g.turn, 'red', '轮次应还原');
    eq(g.moveCount, 0, '步数应归零');
    ok(!g.canUndo, '不应还有历史');
  });

  it('连续悔棋两步', () => {
    const g = new M.XiangqiGame();
    g.restart();
    const before = g.board;
    g.move(9, 0, 8, 0);
    g.move(0, 0, 1, 0);
    eq(g.turn, 'red', '两步后应轮到红方');
    ok(g.undo(), '第一次悔棋');
    eq(g.turn, 'black', '悔一步后轮到黑方');
    ok(g.undo(), '第二次悔棋');
    eq(g.board, before, '棋盘应回到开局');
    eq(g.turn, 'red', '轮次回到红方');
  });

  it('重开一局恢复初始状态', () => {
    const g = new M.XiangqiGame();
    g.move(7, 1, 3, 1);
    g.restart();
    eq(g.pieceCount(), 32, '棋子数');
    eq(g.turn, 'red', '轮次');
    eq(g.moveCount, 0, '步数');
    ok(!g.canUndo, '不应还有历史');
    eq(g.status, 'playing', '状态');
  });

  it('状态文案随轮次变化', () => {
    const g = new M.XiangqiGame();
    g.restart();
    eq(g.statusText(), '红方走棋', '开局文案');
    g.move(9, 0, 8, 0);
    eq(g.statusText(), '黑方走棋', '换手文案');
    eq(g.status, 'playing', '状态应仍为进行中');
  });
});

/* ---------------- 将死 / 困毙 ---------------- */
describe('将死与困毙', () => {
  // 双车杀（双车错）：黑将 (2,3)，红车 (1,3)、(1,5)，红帅 (9,4)（与黑将不同列，不照面）。
  // 红方走 (1,3)->(0,3) 后成杀：
  //   黑将 (2,3) 在第 3 列被 (0,3) 的红车纵向将军 →
  //   可逃点 (1,3) 已空但仍在第 3 列、(2,4) 被 (0,5) 的红车横向控制、(2,2) 出九宫 → 将死
  const doubleRook = [
    [2, 3, GEN + OFF],
    [1, 3, CHA],
    [1, 5, CHA],
    [9, 4, GEN]
  ];

  it('双车杀：黑将被将死', () => {
    const g = new M.XiangqiGame();
    g.loadBoard(doubleRook);
    g.forceTurn('red');
    const rec = g.move(1, 3, 0, 3);
    ok(rec !== null, '应能走出杀着');
    eq(g.status, 'red-win', '应判定红胜');
    eq(g.isCheckmate, true, '应为将死');
    eq(g.winner, 'red', '胜方为红');
    ok(g.inCheck, '终局时被将死一方仍标记为“被将军”');
  });

  it('被将军且无路可走 → 将死', () => {
    const g = new M.XiangqiGame();
    setup(g, [
      [0, 4, GEN + OFF],
      [0, 0, CHA],       // 红车沿第 0 行将军
      [9, 4, GEN]        // 红帅封住第 4 列，黑将不能前进躲避
    ], 'black');
    eq(g.inCheck, true, '黑方应被将军');
    eq(g.status, 'red-win', '应判红胜');
    eq(g.isCheckmate, true, '应为将死');
  });

  it('未被将军但无棋可走 → 困毙判负', () => {
    const g = new M.XiangqiGame();
    // 黑将 (0,4) 被己方两士堵住 (0,3)(0,5) 与 (1,4)，
    // 红车 (5,3) 控制第 3 列（不将军），黑方无其他棋子 → 困毙
    setup(g, [
      [0, 4, GEN + OFF],
      [0, 3, ADV + OFF],
      [0, 5, ADV + OFF],
      [1, 4, ADV + OFF],
      [5, 3, CHA],
      [9, 4, GEN]
    ], 'black');
    eq(g.inCheck, false, '黑方不应被将军');
    eq(M.legalMovesFor(g.board, 'black').length, 0, '黑方确实无棋可走');
    eq(g.status, 'red-win', '困毙应判红胜');
    eq(g.isCheckmate, false, '不是将死而是困毙');
  });

  it('有棋可走时不判负', () => {
    const g = new M.XiangqiGame();
    setup(g, [[0, 4, GEN + OFF], [9, 4, GEN]], 'black');
    eq(g.status, 'playing', '应仍在进行中');
    eq(g.turn, 'black', '轮次应为黑方');
  });

  it('已有胜负时不再接受走子', () => {
    const g = new M.XiangqiGame();
    g.loadBoard(doubleRook);
    g.forceTurn('red');
    g.move(1, 3, 0, 3);
    eq(g.status, 'red-win', '红胜');
    eq(g.move(2, 3, 1, 3), null, '终局后不应再能走子');
    eq(g.getLegalTargets(2, 3).length, 0, '终局后不应再有合法着法');
    eq(g.getLegalTargets(0, 3).length, 0, '终局后己方也没有着法');
  });

  it('悔棋到对局结束后可继续下', () => {
    const g = new M.XiangqiGame();
    g.loadBoard(doubleRook);
    g.forceTurn('red');
    ok(g.move(1, 3, 0, 3) !== null, '杀棋应能走出');
    eq(g.status, 'red-win', '红方应获胜');
    ok(g.undo(), '结束后应能悔棋');
    eq(g.status, 'playing', '悔棋后应恢复进行中');
    ok(g.getLegalTargets(1, 3).length > 0, '悔棋后红车应重新有棋可走');
    eq(g.turn, 'red', '轮次回到红方');
  });
});

/* ---------------- 炮与将军的判定（回归用） ---------------- */
describe('炮与将军判定（炮贴将不算将军）', () => {
  it('炮走到对方将帅正前方、且中间无子 → 不是将军', () => {
    // 红炮 (6,4)、黑将 (0,4)、红帅 (9,3)（与黑将不同列，不照面）
    const b = board([[6, 4, CAN]], [9, 3], [0, 4]);
    ok(!M.generalsFacing(b), '不应照面');
    ok(!M.isInCheck(b, 'black'), '炮无炮架，贴到黑将前面也不该是将军');
  });

  it('炮紧邻黑将（无炮架）同样不是将军', () => {
    const b = board([[1, 4, CAN]], [9, 3], [0, 4]);
    ok(!M.isInCheck(b, 'black'), '炮贴着黑将但没有炮架，不是将军');
  });

  it('炮隔一个子打黑将 → 是将军', () => {
    // 炮架：黑卒在 (3,4)，红炮在 (6,4)
    const b = board([[6, 4, CAN], [3, 4, SOL + OFF]], [9, 3], [0, 4]);
    ok(M.isInCheck(b, 'black'), '隔子打将应为将军');
  });

  it('炮与黑将之间隔两个子 → 不是将军', () => {
    const b = board([[6, 4, CAN], [4, 4, SOL + OFF], [3, 4, SOL + OFF]], [9, 3], [0, 4]);
    ok(!M.isInCheck(b, 'black'), '炮只能打炮架后的第一个子，隔两个子不成立');
  });

  it('炮走到对方将帅前是合法的（不会被当成送将/自将）', () => {
    // 红炮 (6,4) 平移到 (1,4)，正好落在黑将 (0,4) 前面
    const b = board([[6, 4, CAN]], [9, 3], [0, 4]);
    ok(M.isLegal(b, 6, 4, 1, 4), '炮落到黑将前面应当合法');
    const b2 = board([[6, 4, CAN]], [9, 3], [0, 4]);
    const list = M.legalTargets(b2, 6, 4, 'red');
    ok(list.some(([r, c]) => r === 1 && c === 4), '合法落点里应包含 (1,4)');
  });

  it('对方将帅也不能吃贴身无炮架的炮（会被炮吃掉的错觉不成立，但将可吃）', () => {
    // 黑将 (0,4)、红炮 (1,4)：将可以把炮吃掉（炮没有炮架不能吃将，将却能吃炮）
    const b = board([[1, 4, CAN]], [9, 3], [0, 4]);
    ok(M.isLegal(b, 0, 4, 1, 4), '黑将应能吃掉贴身的红炮');
  });

  it('炮的完整走法表仍包含全部空位与隔子吃（capturesOnly 只在判将时生效）', () => {
    const b = board([[6, 4, CAN]], [9, 3], [0, 4]);
    const all = M.pseudoMoves(b, 6, 4);
    ok(all.some(([r, c]) => r === 1 && c === 4), '完整着法应包含空位 (1,4)');
    const capsOnly = M.pseudoMoves(b, 6, 4, true);
    ok(!capsOnly.some(([r, c]) => r === 1 && c === 4), '只算吃子时不应包含空位 (1,4)');
    eq(capsOnly.length, 0, '该局面下红炮没有可吃的子');
  });
});

/* ---------------- 汇总 ---------------- */
console.log(`\n${'='.repeat(52)}`);
console.log(`通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('全部规则验证通过');
}
