/**
 * 中国象棋规则引擎（纯逻辑，不含 UI，便于单独测试）
 *
 * 坐标约定：row = 纵线（0 为黑方底线，9 为红方底线），col = 横线（0~8，红方视角从左到右）
 * 黑方占 row 0~4，红方占 row 5~9，河界位于 row 4 与 row 5 之间。
 */

/** 棋子种类 */
export type PieceKind =
  | 'none'
  | 'general'
  | 'advisor'
  | 'elephant'
  | 'horse'
  | 'chariot'
  | 'cannon'
  | 'soldier';

/** 阵营 */
export type Player = 'red' | 'black';

export type Board = number[];

/** 对局状态 */
export type GameStatus = 'playing' | 'red-win' | 'black-win' | 'draw';

/** 棋盘尺寸 */
export const GRID_COLS: number = 9;
export const GRID_ROWS: number = 10;
export const BOARD_SIZE: number = GRID_COLS * GRID_ROWS;

/** 棋子编码：1~7 为红方，9~15 为黑方 */
export const K_NONE: number = 0;
export const K_GENERAL: number = 1;
export const K_ADVISOR: number = 2;
export const K_ELEPHANT: number = 3;
export const K_HORSE: number = 4;
export const K_CHARIOT: number = 5;
export const K_CANNON: number = 6;
export const K_SOLDIER: number = 7;
/** 红黑偏移：红方 = 基础值，黑方 = 基础值 + RED_OFFSET */
export const RED_OFFSET: number = 8;

/** 红方初始棋子所在行 */
export const RED_HOME_ROW: number = 9;
/** 河界：红方过河判定为 row <= 4，黑方过河判定为 row >= 5 */
export const RIVER_BLACK_MAX_ROW: number = 4;
export const RIVER_RED_MIN_ROW: number = 5;

/** 棋子名称字符（[红, 黑]） */
const PIECE_CHAR_RED: string[] = ['', '帅', '仕', '相', '马', '车', '炮', '兵'];
const PIECE_CHAR_BLACK: string[] = ['', '将', '士', '象', '马', '车', '炮', '卒'];

/** 初始局面：[row, col, 棋子编码] */
const INITIAL_SETUP: number[][] = [
  [0, 0, K_CHARIOT + RED_OFFSET], [0, 1, K_HORSE + RED_OFFSET], [0, 2, K_ELEPHANT + RED_OFFSET],
  [0, 3, K_ADVISOR + RED_OFFSET], [0, 4, K_GENERAL + RED_OFFSET], [0, 5, K_ADVISOR + RED_OFFSET],
  [0, 6, K_ELEPHANT + RED_OFFSET], [0, 7, K_HORSE + RED_OFFSET], [0, 8, K_CHARIOT + RED_OFFSET],
  [2, 1, K_CANNON + RED_OFFSET], [2, 7, K_CANNON + RED_OFFSET],
  [3, 0, K_SOLDIER + RED_OFFSET], [3, 2, K_SOLDIER + RED_OFFSET], [3, 4, K_SOLDIER + RED_OFFSET],
  [3, 6, K_SOLDIER + RED_OFFSET], [3, 8, K_SOLDIER + RED_OFFSET],
  [9, 0, K_CHARIOT], [9, 1, K_HORSE], [9, 2, K_ELEPHANT],
  [9, 3, K_ADVISOR], [9, 4, K_GENERAL], [9, 5, K_ADVISOR],
  [9, 6, K_ELEPHANT], [9, 7, K_HORSE], [9, 8, K_CHARIOT],
  [7, 1, K_CANNON], [7, 7, K_CANNON],
  [6, 0, K_SOLDIER], [6, 2, K_SOLDIER], [6, 4, K_SOLDIER],
  [6, 6, K_SOLDIER], [6, 8, K_SOLDIER]
];

/** 生成空棋盘 */
export function createEmptyBoard(): Board {
  const board: Board = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    board.push(K_NONE);
  }
  return board;
}

/** 摆出标准初始局面 */
export function createInitialBoard(): Board {
  const board: Board = createEmptyBoard();
  for (let i = 0; i < INITIAL_SETUP.length; i++) {
    const item: number[] = INITIAL_SETUP[i];
    board[item[0] * GRID_COLS + item[1]] = item[2];
  }
  return board;
}

/** 坐标是否在棋盘内 */
export function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS;
}

export function indexOf(row: number, col: number): number {
  return row * GRID_COLS + col;
}

/** 取棋子编码，越界返回 K_NONE */
export function pieceAt(board: Board, row: number, col: number): number {
  if (!inBoard(row, col)) {
    return K_NONE;
  }
  return board[indexOf(row, col)];
}

export function setPieceAt(board: Board, row: number, col: number, piece: number): void {
  if (inBoard(row, col)) {
    board[indexOf(row, col)] = piece;
  }
}

/** 棋子编码对应的种类 */
export function pieceKind(piece: number): PieceKind {
  if (piece === K_NONE) {
    return 'none';
  }
  const base: number = piece > RED_OFFSET ? piece - RED_OFFSET : piece;
  if (base === K_GENERAL) {
    return 'general';
  }
  if (base === K_ADVISOR) {
    return 'advisor';
  }
  if (base === K_ELEPHANT) {
    return 'elephant';
  }
  if (base === K_HORSE) {
    return 'horse';
  }
  if (base === K_CHARIOT) {
    return 'chariot';
  }
  if (base === K_CANNON) {
    return 'cannon';
  }
  if (base === K_SOLDIER) {
    return 'soldier';
  }
  return 'none';
}

/** 棋子归属，空位返回 null */
export function pieceOwner(piece: number): Player | null {
  if (piece > 0 && piece < RED_OFFSET) {
    return 'red';
  }
  if (piece > RED_OFFSET) {
    return 'black';
  }
  return null;
}

export function isRedPiece(piece: number): boolean {
  return piece > 0 && piece < RED_OFFSET;
}

export function isBlackPiece(piece: number): boolean {
  return piece > RED_OFFSET;
}

/** 是否为己方棋子 */
export function isOwnPiece(piece: number, side: Player): boolean {
  return side === 'red' ? isRedPiece(piece) : isBlackPiece(piece);
}

/** 棋子显示字符 */
export function pieceName(piece: number): string {
  if (piece === K_NONE) {
    return '';
  }
  const base: number = piece > RED_OFFSET ? piece - RED_OFFSET : piece;
  return isRedPiece(piece) ? PIECE_CHAR_RED[base] : PIECE_CHAR_BLACK[base];
}

/** 阵营显示名 */
export function playerName(side: Player): string {
  return side === 'red' ? '红方' : '黑方';
}

export function opposite(side: Player): Player {
  return side === 'red' ? 'black' : 'red';
}

/** 是否在九宫内（红方 row 7~9，黑方 row 0~2，col 3~5） */
function inPalace(row: number, col: number, side: Player): boolean {
  if (col < 3 || col > 5) {
    return false;
  }
  if (side === 'red') {
    return row >= 7 && row <= 9;
  }
  return row >= 0 && row <= 2;
}

/** 该行是否属于己方半场（相/象不得过河） */
function inOwnHalf(row: number, side: Player): boolean {
  return side === 'red' ? row >= RIVER_RED_MIN_ROW : row <= RIVER_BLACK_MAX_ROW;
}

/** 兵/卒是否已过河 */
function soldierCrossedRiver(row: number, side: Player): boolean {
  return side === 'red' ? row <= RIVER_BLACK_MAX_ROW : row >= RIVER_RED_MIN_ROW;
}

function makePos(row: number, col: number): number[] {
  return [row, col];
}

/**
 * 直线扫描，供车与炮共用。结果分两类：
 * - slideMoves：第一个阻挡子之前的空位（车与炮都可走）
 * - blockResult：push 第一个阻挡子；若其后还有一个棋子，再 push 第二个（炮打隔子需要）
 * 车只能用 blockResult[0]；炮可用 blockResult[0]（贴身吃）与 blockResult[1]（隔子吃）。
 */
function scanLine(board: Board, row: number, col: number, dr: number, dc: number,
                  slideMoves: number[][], blockResult: number[][]): void {
  let r: number = row + dr;
  let c: number = col + dc;
  // 第一段：空位可走
  while (inBoard(r, c) && pieceAt(board, r, c) === K_NONE) {
    slideMoves.push(makePos(r, c));
    r += dr;
    c += dc;
  }
  if (!inBoard(r, c)) {
    return;
  }
  // 第一个阻挡子
  blockResult.push(makePos(r, c));
  // 第二段：越过阻挡子后的第一个棋子（可能不存在）
  r += dr;
  c += dc;
  while (inBoard(r, c) && pieceAt(board, r, c) === K_NONE) {
    r += dr;
    c += dc;
  }
  if (inBoard(r, c)) {
    blockResult.push(makePos(r, c));
  }
}

/** 车：直线上第一个阻挡子处停止（可以吃它，但不能穿过） */
function collectChariotMoves(board: Board, row: number, col: number): number[][] {
  const dirs: number[][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const moves: number[][] = [];
  for (let i = 0; i < dirs.length; i++) {
    const slide: number[][] = [];
    const block: number[][] = [];
    scanLine(board, row, col, dirs[i][0], dirs[i][1], slide, block);
    for (let j = 0; j < slide.length; j++) {
      moves.push(slide[j]);
    }
    // 只取第一个阻挡子：车可以吃它，但不能穿过它
    if (block.length > 0) {
      moves.push(block[0]);
    }
  }
  return moves;
}

/** 炮：空位可走，隔一个棋子后第一个棋子可吃（炮打隔子） */
function collectCannonMoves(board: Board, row: number, col: number,
                            side: Player): number[][] {
  const empty: number[][] = [];
  const screens: number[][][] = [];
  const dirs: number[][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let i = 0; i < dirs.length; i++) {
    const dr: number = dirs[i][0];
    const dc: number = dirs[i][1];
    const slide: number[][] = [];
    const jump: number[][] = [];
    scanLine(board, row, col, dr, dc, slide, jump);
    for (let j = 0; j < slide.length; j++) {
      empty.push(slide[j]);
    }
    if (jump.length > 0) {
      // jump[0] 是炮架（炮可以吃掉贴身的第一个棋子），jump[1] 是隔子后可吃的目标
      screens.push(jump);
    }
  }
  const moves: number[][] = [];
  for (let i = 0; i < empty.length; i++) {
    moves.push(empty[i]);
  }
  for (let i = 0; i < screens.length; i++) {
    // 贴近炮身的第一个棋子可以直接吃（此时它挨着炮，不需要炮架）
    const first: number[] = screens[i][0];
    if (!isOwnPiece(pieceAt(board, first[0], first[1]), side)) {
      moves.push(makePos(first[0], first[1]));
    }
    // 隔一个棋子（炮架）之后的第一个棋子同样可吃（炮打隔子）
    if (screens[i].length > 1) {
      const second: number[] = screens[i][1];
      if (!isOwnPiece(pieceAt(board, second[0], second[1]), side)) {
        moves.push(makePos(second[0], second[1]));
      }
    }
  }
  return moves;
}

/** 马：走“日”，蹩马腿 */
function collectHorseMoves(board: Board, row: number, col: number,
                           side: Player): number[][] {
  const moves: number[][] = [];
  const legs: number[][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const jumps: number[][] = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]];
  for (let i = 0; i < jumps.length; i++) {
    const tr: number = row + jumps[i][0];
    const tc: number = col + jumps[i][1];
    if (!inBoard(tr, tc)) {
      continue;
    }
    const legDr: number = jumps[i][0] === 2 ? 1 : (jumps[i][0] === -2 ? -1 : 0);
    const legDc: number = jumps[i][1] === 2 ? 1 : (jumps[i][1] === -2 ? -1 : 0);
    if (pieceAt(board, row + legDr, col + legDc) !== K_NONE) {
      continue; // 蹩马腿
    }
    if (!isOwnPiece(pieceAt(board, tr, tc), side)) {
      moves.push(makePos(tr, tc));
    }
  }
  void legs;
  return moves;
}

/** 象/相：走“田”，塞象眼，且不得过河 */
function collectElephantMoves(board: Board, row: number, col: number,
                              side: Player): number[][] {
  const moves: number[][] = [];
  const steps: number[][] = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
  for (let i = 0; i < steps.length; i++) {
    const tr: number = row + steps[i][0];
    const tc: number = col + steps[i][1];
    if (!inBoard(tr, tc) || !inOwnHalf(tr, side)) {
      continue;
    }
    if (pieceAt(board, row + steps[i][0] / 2, col + steps[i][1] / 2) !== K_NONE) {
      continue; // 塞象眼
    }
    if (!isOwnPiece(pieceAt(board, tr, tc), side)) {
      moves.push(makePos(tr, tc));
    }
  }
  return moves;
}

/** 仕/士：九宫内斜走一步 */
function collectAdvisorMoves(board: Board, row: number, col: number,
                             side: Player): number[][] {
  const moves: number[][] = [];
  const steps: number[][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (let i = 0; i < steps.length; i++) {
    const tr: number = row + steps[i][0];
    const tc: number = col + steps[i][1];
    if (!inPalace(tr, tc, side)) {
      continue;
    }
    if (!isOwnPiece(pieceAt(board, tr, tc), side)) {
      moves.push(makePos(tr, tc));
    }
  }
  return moves;
}

/** 帅/将：九宫内直走一步（“飞将”在 isLegal 中处理） */
function collectGeneralMoves(board: Board, row: number, col: number,
                            side: Player): number[][] {
  const moves: number[][] = [];
  const steps: number[][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let i = 0; i < steps.length; i++) {
    const tr: number = row + steps[i][0];
    const tc: number = col + steps[i][1];
    if (!inPalace(tr, tc, side)) {
      continue;
    }
    if (!isOwnPiece(pieceAt(board, tr, tc), side)) {
      moves.push(makePos(tr, tc));
    }
  }
  return moves;
}

/** 兵/卒：未过河只能向前一步，过河后可向前或左右一步，不能后退 */
function collectSoldierMoves(board: Board, row: number, col: number,
                             side: Player): number[][] {
  const moves: number[][] = [];
  const forward: number = side === 'red' ? -1 : 1;
  const candidates: number[][] = [[forward, 0]];
  if (soldierCrossedRiver(row, side)) {
    candidates.push([0, -1]);
    candidates.push([0, 1]);
  }
  for (let i = 0; i < candidates.length; i++) {
    const tr: number = row + candidates[i][0];
    const tc: number = col + candidates[i][1];
    if (!inBoard(tr, tc)) {
      continue;
    }
    if (!isOwnPiece(pieceAt(board, tr, tc), side)) {
      moves.push(makePos(tr, tc));
    }
  }
  return moves;
}

/** 找出某方帅/将的位置，找不到返回 [-1, -1] */
export function findGeneral(board: Board, side: Player): number[] {
  const target: number = side === 'red' ? K_GENERAL : K_GENERAL + RED_OFFSET;
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (board[i] === target) {
      return [Math.floor(i / GRID_COLS), i % GRID_COLS];
    }
  }
  return [-1, -1];
}

/** 不带任何走法限制的伪合法着法（只判断走子形态与吃子目标） */
export function pseudoMoves(board: Board, fromRow: number, fromCol: number): number[][] {
  const piece: number = pieceAt(board, fromRow, fromCol);
  const side: Player | null = pieceOwner(piece);
  if (side === null) {
    return [];
  }
  const kind: PieceKind = pieceKind(piece);
  if (kind === 'chariot') {
    return collectChariotMoves(board, fromRow, fromCol);
  }
  if (kind === 'cannon') {
    return collectCannonMoves(board, fromRow, fromCol, side);
  }
  if (kind === 'horse') {
    return collectHorseMoves(board, fromRow, fromCol, side);
  }
  if (kind === 'elephant') {
    return collectElephantMoves(board, fromRow, fromCol, side);
  }
  if (kind === 'advisor') {
    return collectAdvisorMoves(board, fromRow, fromCol, side);
  }
  if (kind === 'general') {
    return collectGeneralMoves(board, fromRow, fromCol, side);
  }
  if (kind === 'soldier') {
    return collectSoldierMoves(board, fromRow, fromCol, side);
  }
  return [];
}

/** 两将是否照面（同一纵线且中间无子） */
export function generalsFacing(board: Board): boolean {
  const redPos: number[] = findGeneral(board, 'red');
  const blackPos: number[] = findGeneral(board, 'black');
  if (redPos[0] < 0 || blackPos[0] < 0) {
    return false;
  }
  if (redPos[1] !== blackPos[1]) {
    return false;
  }
  const col: number = redPos[1];
  const lo: number = Math.min(redPos[0], blackPos[0]) + 1;
  const hi: number = Math.max(redPos[0], blackPos[0]);
  for (let r = lo; r < hi; r++) {
    if (pieceAt(board, r, col) !== K_NONE) {
      return false;
    }
  }
  return true;
}

/** 某方是否正被将军（含“飞将”判负） */
export function isInCheck(board: Board, side: Player): boolean {
  if (generalsFacing(board)) {
    return true;
  }
  const generalPos: number[] = findGeneral(board, side);
  if (generalPos[0] < 0) {
    return true; // 帅/将已不在棋盘上
  }
  const enemy: Player = opposite(side);
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const piece: number = board[indexOf(r, c)];
      if (pieceOwner(piece) !== enemy) {
        continue;
      }
      if (pieceKind(piece) === 'general') {
        continue; // 将帅之间不能互吃，照面已由 generalsFacing 处理
      }
      const moves: number[][] = pseudoMoves(board, r, c);
      for (let i = 0; i < moves.length; i++) {
        if (moves[i][0] === generalPos[0] && moves[i][1] === generalPos[1]) {
          return true;
        }
      }
    }
  }
  return false;
}

/** 完整合法性：走子形态合法，且走完后己方不被将军（含不得送将、不得照面） */
export function isLegal(board: Board, fromRow: number, fromCol: number,
                        toRow: number, toCol: number): boolean {
  if (!inBoard(fromRow, fromCol) || !inBoard(toRow, toCol)) {
    return false;
  }
  if (fromRow === toRow && fromCol === toCol) {
    return false;
  }
  const piece: number = pieceAt(board, fromRow, fromCol);
  const side: Player | null = pieceOwner(piece);
  if (side === null) {
    return false;
  }
  if (isOwnPiece(pieceAt(board, toRow, toCol), side)) {
    return false;
  }
  const moves: number[][] = pseudoMoves(board, fromRow, fromCol);
  let shapeOk: boolean = false;
  for (let i = 0; i < moves.length; i++) {
    if (moves[i][0] === toRow && moves[i][1] === toCol) {
      shapeOk = true;
      break;
    }
  }
  if (!shapeOk) {
    return false;
  }
  // 试走一步，检查己方是否被将军或两将照面
  const captured: number = pieceAt(board, toRow, toCol);
  setPieceAt(board, toRow, toCol, piece);
  setPieceAt(board, fromRow, fromCol, K_NONE);
  const bad: boolean = isInCheck(board, side);
  setPieceAt(board, fromRow, fromCol, piece);
  setPieceAt(board, toRow, toCol, captured);
  return !bad;
}

/** 列出某方全部合法着法，返回 [[fromRow, fromCol, toRow, toCol], ...] */
export function legalMovesFor(board: Board, side: Player): number[][] {
  const result: number[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const piece: number = board[indexOf(r, c)];
      if (!isOwnPiece(piece, side)) {
        continue;
      }
      const moves: number[][] = pseudoMoves(board, r, c);
      for (let i = 0; i < moves.length; i++) {
        const tr: number = moves[i][0];
        const tc: number = moves[i][1];
        if (isLegal(board, r, c, tr, tc)) {
          result.push([r, c, tr, tc]);
        }
      }
    }
  }
  return result;
}

/** 对外接口：指定位置的合法目标点 */
export function legalTargets(board: Board, row: number, col: number, side: Player): number[][] {
  const piece: number = pieceAt(board, row, col);
  if (!isOwnPiece(piece, side)) {
    return [];
  }
  const result: number[][] = [];
  const moves: number[][] = pseudoMoves(board, row, col);
  for (let i = 0; i < moves.length; i++) {
    if (isLegal(board, row, col, moves[i][0], moves[i][1])) {
      result.push(moves[i]);
    }
  }
  return result;
}

export function hasLegalMove(board: Board, side: Player): boolean {
  return legalMovesFor(board, side).length > 0;
}

/** 找出某方所有能吃掉指定棋子的伪合法着法（用于“被将军”判定辅助） */
export function attackersOf(board: Board, side: Player, row: number, col: number): number[][] {
  const result: number[][] = [];
  const piece: number = pieceAt(board, row, col);
  if (piece === K_NONE) {
    return result;
  }
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!isOwnPiece(board[indexOf(r, c)], side)) {
        continue;
      }
      const moves: number[][] = pseudoMoves(board, r, c);
      for (let i = 0; i < moves.length; i++) {
        if (moves[i][0] === row && moves[i][1] === col) {
          result.push([r, c]);
          break;
        }
      }
    }
  }
  return result;
}
