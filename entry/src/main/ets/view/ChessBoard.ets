/**
 * 象棋棋盘绘制组件：木纹棋盘 + 九宫斜线 + 楚河汉界 + 兵炮位标记 + 棋子与提示。
 * 棋盘几何与点击换算集中在这里，页面只需传入选中位置与合法着法。
 */

import { Board, GRID_COLS, GRID_ROWS, isRedPiece, pieceName } from '../game/XiangqiRules';

/** 棋盘配色与线宽比例 */
const COLOR_BOARD: string = '#EFD9A6';
const COLOR_LINE: string = '#7A5A32';
const COLOR_RED: string = '#B22222';
const COLOR_BLACK: string = '#1C1C1C';
const COLOR_PIECE_FACE: string = '#FDF3D8';
const COLOR_SELECT: string = '#F5A623';
const COLOR_HINT: string = '#2E7D32';
const COLOR_LAST: string = '#3E7CB1';
const PAD_RATIO: number = 0.5;
/** 交点命中判定半径（相对间距） */
const HIT_RATIO: number = 0.45;

/** 九宫斜线端点：[row, col, row, col] */
const PALACE_LINES: number[][] = [
  [0, 3, 2, 5], [0, 5, 2, 3], [7, 3, 9, 5], [7, 5, 9, 3]
];

/** 兵/炮位标记：[row, col] */
const STAR_POINTS: number[][] = [
  [2, 1], [2, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
  [6, 0], [6, 2], [6, 4], [6, 6], [6, 8], [7, 1], [7, 7]
];

@Component
export struct ChessBoard {
  /** 棋盘数据（一维数组，长度 90） */
  @Prop board: Board = [];
  /** 当前选中位置，-1 表示未选中 */
  @Prop selectedRow: number = -1;
  @Prop selectedCol: number = -1;
  /** 当前选中棋子的合法着法 */
  @Prop targets: number[][] = [];
  /** 最近一步棋，用于高亮，-1 表示无 */
  @Prop lastFromRow: number = -1;
  @Prop lastFromCol: number = -1;
  @Prop lastToRow: number = -1;
  @Prop lastToCol: number = -1;
  /** 交点间距（vp），由页面按可用宽度计算后传入 */
  @Prop cell: number = 36;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  /** 屏幕坐标 -> 棋盘交点，不在命中范围内返回 [-1, -1] */
  locate(x: number, y: number): number[] {
    const pad: number = this.cell * PAD_RATIO;
    const col: number = Math.round((x - pad) / this.cell);
    const row: number = Math.round((y - pad) / this.cell);
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) {
      return [-1, -1];
    }
    const dx: number = Math.abs(x - (pad + col * this.cell));
    const dy: number = Math.abs(y - (pad + row * this.cell));
    if (dx > this.cell * HIT_RATIO || dy > this.cell * HIT_RATIO) {
      return [-1, -1];
    }
    return [row, col];
  }

  build() {
    Column() {
      Canvas(this.ctx)
        .width(this.cell * (GRID_COLS + 1))
        .height(this.cell * (GRID_ROWS + 1))
        .backgroundColor(COLOR_BOARD)
        .borderRadius(this.cell * 0.2)
        .shadow({ radius: 12, color: '#33000000', offsetX: 0, offsetY: 4 })
        .onReady(() => {
          this.draw();
        })
        .onClick((event: ClickEvent) => {
          this.draw();
          const pos: number[] = this.locate(event.x, event.y);
          this.onTap(pos[0], pos[1]);
        })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
  }

  /** 点击回调，由页面实现 */
  onTap: (row: number, col: number) => void = (row: number, col: number) => {
    void row;
    void col;
  };

  private px(col: number): number {
    return this.cell * PAD_RATIO + col * this.cell;
  }

  private py(row: number): number {
    return this.cell * PAD_RATIO + row * this.cell;
  }

  private draw(): void {
    const pad: number = this.cell * PAD_RATIO;
    const ctx: CanvasRenderingContext2D = this.ctx;
    const totalW: number = this.cell * (GRID_COLS + 1);
    const totalH: number = this.cell * (GRID_ROWS + 1);

    ctx.clearRect(0, 0, totalW, totalH);

    // 棋盘底色与外框
    ctx.fillStyle = COLOR_BOARD;
    ctx.fillRect(0, 0, totalW, totalH);
    ctx.strokeStyle = COLOR_LINE;
    ctx.lineWidth = Math.max(1, this.cell * 0.045);
    ctx.strokeRect(pad - this.cell * 0.22, pad - this.cell * 0.22,
      this.cell * (GRID_COLS - 1) + this.cell * 0.44,
      this.cell * (GRID_ROWS - 1) + this.cell * 0.44);

    // 横线：全部贯通
    ctx.lineWidth = Math.max(1, this.cell * 0.022);
    for (let r = 0; r < GRID_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(this.px(0), this.py(r));
      ctx.lineTo(this.px(GRID_COLS - 1), this.py(r));
      ctx.stroke();
    }
    // 竖线：河界处（第 4~5 行之间）断开
    for (let c = 0; c < GRID_COLS; c++) {
      const x: number = this.px(c);
      if (c === 0 || c === GRID_COLS - 1) {
        ctx.beginPath();
        ctx.moveTo(x, this.py(0));
        ctx.lineTo(x, this.py(GRID_ROWS - 1));
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, this.py(0));
        ctx.lineTo(x, this.py(4));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, this.py(5));
        ctx.lineTo(x, this.py(GRID_ROWS - 1));
        ctx.stroke();
      }
    }

    // 九宫斜线
    ctx.lineWidth = Math.max(1, this.cell * 0.022);
    for (let i = 0; i < PALACE_LINES.length; i++) {
      const item: number[] = PALACE_LINES[i];
      ctx.beginPath();
      ctx.moveTo(this.px(item[1]), this.py(item[0]));
      ctx.lineTo(this.px(item[3]), this.py(item[2]));
      ctx.stroke();
    }

    // 楚河汉界
    ctx.fillStyle = COLOR_LINE;
    ctx.font = `${Math.round(this.cell * 0.5)}vp sans-serif`;
    const midY: number = (this.py(4) + this.py(5)) / 2;
    ctx.fillText('楚 河', this.px(1.1), midY);
    ctx.fillText('汉 界', this.px(5.2), midY);

    // 兵/炮位标记
    ctx.strokeStyle = COLOR_LINE;
    ctx.lineWidth = Math.max(1, this.cell * 0.02);
    for (let i = 0; i < STAR_POINTS.length; i++) {
      this.drawStar(STAR_POINTS[i][0], STAR_POINTS[i][1]);
    }

    // 最近一步高亮
    if (this.lastFromRow >= 0) {
      ctx.strokeStyle = COLOR_LAST;
      ctx.lineWidth = Math.max(1, this.cell * 0.05);
      this.strokeAt(this.lastFromRow, this.lastFromCol, this.cell * 0.44);
      this.strokeAt(this.lastToRow, this.lastToCol, this.cell * 0.44);
    }

    // 棋子
    if (this.board.length > 0) {
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const piece: number = this.board[r * GRID_COLS + c];
          if (piece !== 0) {
            this.drawPiece(r, c, piece);
          }
        }
      }
    }

    // 选中高亮
    if (this.selectedRow >= 0) {
      ctx.strokeStyle = COLOR_SELECT;
      ctx.lineWidth = Math.max(2, this.cell * 0.07);
      this.strokeAt(this.selectedRow, this.selectedCol, this.cell * 0.44);
    }

    // 合法着法提示
    for (let i = 0; i < this.targets.length; i++) {
      const tr: number = this.targets[i][0];
      const tc: number = this.targets[i][1];
      const occupied: boolean = this.board.length > 0 && this.board[tr * GRID_COLS + tc] !== 0;
      if (occupied) {
        ctx.strokeStyle = COLOR_HINT;
        ctx.lineWidth = Math.max(2, this.cell * 0.06);
        this.strokeAt(tr, tc, this.cell * 0.42);
      } else {
        ctx.fillStyle = COLOR_HINT;
        ctx.beginPath();
        ctx.arc(this.px(tc), this.py(tr), this.cell * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private strokeAt(row: number, col: number, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(this.px(col), this.py(row), radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private drawPiece(row: number, col: number, piece: number): void {
    const ctx: CanvasRenderingContext2D = this.ctx;
    const x: number = this.px(col);
    const y: number = this.py(row);
    const radius: number = this.cell * 0.42;
    const red: boolean = isRedPiece(piece);

    ctx.beginPath();
    ctx.arc(x, y + this.cell * 0.03, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#00000022';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_PIECE_FACE;
    ctx.fill();
    ctx.strokeStyle = red ? COLOR_RED : COLOR_BLACK;
    ctx.lineWidth = Math.max(1, this.cell * 0.035);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius * 0.82, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, this.cell * 0.018);
    ctx.stroke();

    const text: string = pieceName(piece);
    ctx.font = `${Math.round(this.cell * 0.52)}vp sans-serif`;
    ctx.fillStyle = red ? COLOR_RED : COLOR_BLACK;
    const textWidth: number = ctx.measureText(text).width;
    ctx.fillText(text, x - textWidth / 2, y + this.cell * 0.19);
  }

  /** 绘制“兵/炮位”小折角标记 */
  private drawStar(row: number, col: number): void {
    const ctx: CanvasRenderingContext2D = this.ctx;
    const x: number = this.px(col);
    const y: number = this.py(row);
    const gap: number = this.cell * 0.09;
    const len: number = this.cell * 0.18;
    const left: boolean = col > 0;
    const right: boolean = col < GRID_COLS - 1;

    if (left) {
      ctx.beginPath();
      ctx.moveTo(x - gap, y - gap - len);
      ctx.lineTo(x - gap, y - gap);
      ctx.lineTo(x - gap - len, y - gap);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - gap, y + gap + len);
      ctx.lineTo(x - gap, y + gap);
      ctx.lineTo(x - gap - len, y + gap);
      ctx.stroke();
    }
    if (right) {
      ctx.beginPath();
      ctx.moveTo(x + gap, y - gap - len);
      ctx.lineTo(x + gap, y - gap);
      ctx.lineTo(x + gap + len, y - gap);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + gap, y + gap + len);
      ctx.lineTo(x + gap, y + gap);
      ctx.lineTo(x + gap + len, y + gap);
      ctx.stroke();
    }
  }
}
