/**
 * 中国象棋对局引擎：维护棋盘、轮次、走子历史与胜负状态。
 * 纯逻辑，不含 UI，便于单独测试。
 */

import {
  BOARD_SIZE,
  Board,
  GameStatus,
  GRID_COLS,
  K_GENERAL,
  K_NONE,
  RED_OFFSET,
  Player,
  createInitialBoard,
  hasLegalMove,
  isInCheck,
  isLegal,
  isOwnPiece,
  legalTargets,
  opposite,
  pieceAt,
  pieceOwner,
  playerName,
  setPieceAt
} from './XiangqiRules';

/** 一步棋的记录 */
export interface MoveRecord {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  piece: number;
  /** 被吃掉的棋子编码，未吃子为 K_NONE */
  captured: number;
}

/** 游戏结束的原因 */
export type EndReason = 'none' | 'checkmate' | 'stalemate' | 'general-captured';

export class XiangqiGame {
  private boardValue: Board = createInitialBoard();
  private turnSide: Player = 'red';
  private statusValue: GameStatus = 'playing';
  private endReasonValue: EndReason = 'none';
  private history: MoveRecord[] = [];
  private snapshots: Board[] = [];
  private checkValue: boolean = false;
  private moveCountValue: number = 0;

  /** 当前棋盘（副本，外部修改不会影响对局） */
  get board(): Board {
    return this.boardValue.slice();
  }

  get turn(): Player {
    return this.turnSide;
  }

  get status(): GameStatus {
    return this.statusValue;
  }

  get endReason(): EndReason {
    return this.endReasonValue;
  }

  get moveCount(): number {
    return this.moveCountValue;
  }

  /** 当前该走棋的一方是否正被将军 */
  get inCheck(): boolean {
    return this.checkValue;
  }

  /** 是否因将死而结束 */
  get isCheckmate(): boolean {
    return this.endReasonValue === 'checkmate';
  }

  get winner(): Player | null {
    if (this.statusValue === 'red-win') {
      return 'red';
    }
    if (this.statusValue === 'black-win') {
      return 'black';
    }
    return null;
  }

  /** 最近一步棋，用于高亮 */
  get lastMove(): MoveRecord | null {
    if (this.history.length === 0) {
      return null;
    }
    return this.history[this.history.length - 1];
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** 重开一局 */
  restart(): void {
    this.boardValue = createInitialBoard();
    this.turnSide = 'red';
    this.statusValue = 'playing';
    this.endReasonValue = 'none';
    this.history = [];
    this.snapshots = [];
    this.checkValue = false;
    this.moveCountValue = 0;
  }

  /** 指定位置的合法目标点 [[row, col], ...] */
  getLegalTargets(row: number, col: number): number[][] {
    if (this.statusValue !== 'playing') {
      return [];
    }
    if (!isOwnPiece(pieceAt(this.boardValue, row, col), this.turnSide)) {
      return [];
    }
    return legalTargets(this.boardValue, row, col, this.turnSide);
  }

  /** 该位置是否轮到走棋的一方所有 */
  isSelectable(row: number, col: number): boolean {
    if (this.statusValue !== 'playing') {
      return false;
    }
    return isOwnPiece(pieceAt(this.boardValue, row, col), this.turnSide);
  }

  /**
   * 走一步棋。
   * @returns 成功返回这一步的记录，非法返回 null
   */
  move(fromRow: number, fromCol: number, toRow: number, toCol: number): MoveRecord | null {
    if (this.statusValue !== 'playing') {
      return null;
    }
    if (!isLegal(this.boardValue, fromRow, fromCol, toRow, toCol)) {
      return null;
    }
    const piece: number = pieceAt(this.boardValue, fromRow, fromCol);
    const side: Player = pieceOwner(piece) as Player;
    if (side !== this.turnSide) {
      return null;
    }
    const captured: number = pieceAt(this.boardValue, toRow, toCol);

    this.snapshots.push(this.boardValue.slice());
    const record: MoveRecord = {
      fromRow: fromRow,
      fromCol: fromCol,
      toRow: toRow,
      toCol: toCol,
      piece: piece,
      captured: captured
    };
    this.history.push(record);
    setPieceAt(this.boardValue, toRow, toCol, piece);
    setPieceAt(this.boardValue, fromRow, fromCol, K_NONE);
    this.moveCountValue++;

    const next: Player = opposite(side);
    if (captured === K_GENERAL || captured === K_GENERAL + RED_OFFSET) {
      this.statusValue = side === 'red' ? 'red-win' : 'black-win';
      this.endReasonValue = 'general-captured';
      this.checkValue = false;
      return record;
    }

    this.turnSide = next;
    this.checkValue = isInCheck(this.boardValue, next);
    if (!hasLegalMove(this.boardValue, next)) {
      // 象棋中被将死与被困毙均判负
      this.statusValue = side === 'red' ? 'red-win' : 'black-win';
      this.endReasonValue = this.checkValue ? 'checkmate' : 'stalemate';
    }
    return record;
  }

  /** 悔棋一步 */
  undo(): boolean {
    if (this.history.length === 0) {
      return false;
    }
    const snapshot: Board | undefined = this.snapshots.pop();
    if (snapshot === undefined) {
      return false;
    }
    this.boardValue = snapshot;
    this.history.pop();
    this.moveCountValue = this.history.length;
    this.turnSide = this.moveCountValue % 2 === 0 ? 'red' : 'black';
    this.statusValue = 'playing';
    this.endReasonValue = 'none';
    this.checkValue = isInCheck(this.boardValue, this.turnSide);
    return true;
  }

  /** 交换先手（便于双人对弈时前后手调整） */
  switchTurn(): void {
    this.turnSide = opposite(this.turnSide);
    this.checkValue = isInCheck(this.boardValue, this.turnSide);
  }

  /**
   * 重新计算派生状态（是否被将军、是否已被将死/困毙）。
   * 走子后会自动调用；直接摆盘或悔棋后也可手动调用。
   */
  refresh(): void {
    if (this.statusValue !== 'playing') {
      return;
    }
    this.checkValue = isInCheck(this.boardValue, this.turnSide);
    if (!hasLegalMove(this.boardValue, this.turnSide)) {
      this.statusValue = this.turnSide === 'red' ? 'black-win' : 'red-win';
      this.endReasonValue = this.checkValue ? 'checkmate' : 'stalemate';
    }
  }

  /** 状态提示文案 */
  statusText(): string {
    if (this.statusValue === 'red-win') {
      return this.endReasonValue === 'checkmate' ? '红方胜 · 黑方被将死' : '红方胜';
    }
    if (this.statusValue === 'black-win') {
      return this.endReasonValue === 'checkmate' ? '黑方胜 · 红方被将死' : '黑方胜';
    }
    if (this.statusValue === 'draw') {
      return '和棋';
    }
    return this.checkValue ? `${playerName(this.turnSide)}被将军` : `${playerName(this.turnSide)}走棋`;
  }

  /** 调试用：当前棋盘上的棋子总数 */
  pieceCount(): number {
    let count: number = 0;
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (this.boardValue[i] !== K_NONE) {
        count++;
      }
    }
    return count;
  }

  /** 调试用：输出当前局面文本 */
  toText(): string {
    const lines: string[] = [];
    for (let r = 0; r < 10; r++) {
      const row: string[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const piece: number = this.boardValue[r * GRID_COLS + c];
        row.push(piece === K_NONE ? '．' : String(piece));
      }
      lines.push(row.join(' '));
    }
    return lines.join('\n');
  }

  /** 测试辅助：直接摆盘 */
  loadBoard(entries: number[][]): void {
    this.boardValue = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      this.boardValue.push(K_NONE);
    }
    for (let i = 0; i < entries.length; i++) {
      const item: number[] = entries[i];
      setPieceAt(this.boardValue, item[0], item[1], item[2]);
    }
    this.statusValue = 'playing';
    this.endReasonValue = 'none';
    this.checkValue = false;
  }

  /** 测试辅助：直接指定轮次 */
  forceTurn(side: Player): void {
    this.turnSide = side;
  }

  /** 测试辅助：直接设置棋盘数据 */
  setBoardData(board: Board): void {
    this.boardValue = board.slice();
  }
}
