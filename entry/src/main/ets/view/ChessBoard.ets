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
/** 点击识别标记的颜色 */
const COLOR_TAP: string = '#E53935';
/** 是否绘制点击识别标记。默认关闭：它会与选中环、落点标记抢视觉，排查问题时再打开。 */
const SHOW_TAP_MARKER: boolean = false;
const PAD_RATIO: number = 0.5;
/**
 * 交点命中判定容差（相对格距）。
 *
 * locate() 先用 Math.round 把点击吸附到最近的交点，误差本身已被限制在 ±0.5 格距内，
 * 因此容差达到 0.5 时每个交点正好拥有「离它最近的那一片区域」，整个棋盘被无缝铺满。
 * 若取 0.45，相邻交点的可点范围 [−0.45, +0.45] 之间会留下 0.45~0.55 的空档（每格 10%），
 * 点在两个棋子中间偏一点就会被判为无效点击。
 * 取大于 0.5 的值不会进一步扩大范围（吸附已先行），故 0.5 即可点击范围的上限。
 */
const HIT_TOLERANCE: number = 0.5;

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
  /**
   * 棋盘数据（一维数组，长度 90）。
   *
   * 必须挂 @Watch：Canvas 只是画布，状态变化不会自动触发重绘，
   * 不显式调用 draw() 就会出现「数据已更新但棋子还在原位」。
   */
  @Prop @Watch('onBoardChanged') board: Board = [];
  /** 当前选中位置，-1 表示未选中 */
  @Prop @Watch('onBoardChanged') selectedRow: number = -1;
  @Prop @Watch('onBoardChanged') selectedCol: number = -1;
  /** 当前选中棋子的合法着法 */
  @Prop @Watch('onBoardChanged') targets: number[][] = [];
  /** 最近一步棋，用于高亮，-1 表示无 */
  @Prop @Watch('onBoardChanged') lastFromRow: number = -1;
  @Prop @Watch('onBoardChanged') lastFromCol: number = -1;
  @Prop @Watch('onBoardChanged') lastToRow: number = -1;
  @Prop @Watch('onBoardChanged') lastToCol: number = -1;
  /** 交点间距（vp），由页面按可用宽度计算后传入 */
  @Prop @Watch('onBoardChanged') cell: number = 36;
  /**
   * 点击结果回传：与页面双向绑定。
   * 用 @Link 共享状态而不是「给组件属性赋函数」——后者能否生效依赖实现细节，
   * 一旦不生效，整个棋盘就会点不动（现象是点了完全没反应）。
   * 页面用 @Watch 监听 tapSignal 变化后再处理，保证父组件一定收到通知。
   */
  @Link tapRow: number;
  @Link tapCol: number;
  @Link tapSignal: number;
  /** 是否显示点击识别标记 */
  @Prop tapVisible: boolean = false;

  /**
   * 可选的兼容回调。默认空实现；主线是 @Watch(tapSignal)，二者会去重。
   */
  onBoardTap: (row: number, col: number) => void = (row: number, col: number) => {
    void row;
    void col;
  };
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  /** canvas 是否已就绪：就绪前的状态变化无需重绘 */
  private ready: boolean = false;

  /**
   * 任何影响画面的状态变化都走这里重绘。
   * Canvas 不会因为数据变化自动重绘，这是必须的一步。
   */
  onBoardChanged(): void {
    if (this.ready) {
      this.draw();
    }
  }

  /**
   * 屏幕坐标 -> 棋盘交点。
   *
   * 取最近交点并「钳制」到棋盘范围内：这样即使点在四边的留白上（棋盘外框以内），
   * 也会落到最近的那个边线交点，边路的车、兵同样好点；而真正在棋盘外的点
   * （距棋盘矩形超过半格）仍会被拒绝。
   */
  locate(x: number, y: number): number[] {
    const pad: number = this.cell * PAD_RATIO;
    const maxRow: number = GRID_ROWS - 1;
    const maxCol: number = GRID_COLS - 1;

    let col: number = Math.round((x - pad) / this.cell);
    let row: number = Math.round((y - pad) / this.cell);
    if (col < 0) {
      col = 0;
    } else if (col > maxCol) {
      col = maxCol;
    }
    if (row < 0) {
      row = 0;
    } else if (row > maxRow) {
      row = maxRow;
    }

    // 钳制后到交点的距离必然 <= 0.5 格，因此只需拒绝明显在棋盘外的点
    const dx: number = Math.abs(x - (pad + col * this.cell));
    const dy: number = Math.abs(y - (pad + row * this.cell));
    const outside: number = this.cell * HIT_TOLERANCE;
    if (dx > outside || dy > outside) {
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
          this.ready = true;
          this.draw();
        })
        .onClick((event: ClickEvent) => {
          // 只写共享状态：父组件通过 @Watch(tapSignal) 收到通知，这是唯一的事件通道，
          // 避免「共享状态 + 回调」两条路各触发一次导致一次点击被处理两遍。
          const pos: number[] = this.locate(event.x, event.y);
          this.tapRow = pos[0];
          this.tapCol = pos[1];
          this.tapSignal = this.tapSignal + 1;
          this.onBoardTap(pos[0], pos[1]);
        })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
  }

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

    // 点击识别标记：只在排查问题时显示，且画得极小，避免遮住选中环与落点标记
    if (SHOW_TAP_MARKER && this.tapVisible) {
      if (this.tapRow < 0 || this.tapCol < 0) {
        ctx.strokeStyle = COLOR_TAP;
        ctx.lineWidth = Math.max(2, this.cell * 0.05);
        ctx.strokeRect(this.cell * 0.12, this.cell * 0.12,
          totalW - this.cell * 0.24, totalH - this.cell * 0.24);
      } else {
        ctx.strokeStyle = COLOR_TAP;
        ctx.lineWidth = Math.max(1, this.cell * 0.04);
        ctx.beginPath();
        ctx.arc(this.px(this.tapCol), this.py(this.tapRow), this.cell * 0.49, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = COLOR_TAP;
        ctx.beginPath();
        ctx.arc(this.px(this.tapCol) + this.cell * 0.4, this.py(this.tapRow) - this.cell * 0.4,
          this.cell * 0.06, 0, Math.PI * 2);
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
