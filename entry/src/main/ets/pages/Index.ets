/**
 * 中国象棋主页面：负责交互（选子、走子、提示、悔棋、重开）与状态展示。
 * 规则在 game/XiangqiRules.ets，对局状态在 game/XiangqiGame.ets，绘制在 view/ChessBoard.ets。
 */

import { ChessBoard } from '../view/ChessBoard';
import { MoveRecord, XiangqiGame } from '../game/XiangqiGame';
import { GRID_COLS, GRID_ROWS, Player, pieceName, playerName } from '../game/XiangqiRules';

/** 阵营对应的强调色 */
function sideColor(side: Player): string {
  return side === 'red' ? '#C62828' : '#37474F';
}

/** 棋盘几何参数 */
interface BoardGeometry {
  cell: number;
  pad: number;
}

/** 交点间距占可用宽度的比例（9 列 + 两侧留白 = 10 个间距） */
const CELL_RATIO: number = 0.098;
/** 页面底色 */
const PAGE_BG: string = '#F4EFE4';
/** 命中反馈的底色 */
const COLOR_TAP_FEEDBACK: string = '#E53935';

@Entry
@Component
struct Index {
  @State game: XiangqiGame = new XiangqiGame();
  @State boardData: number[] = [];
  @State selectedRow: number = -1;
  @State selectedCol: number = -1;
  @State targetList: number[][] = [];
  @State lastMove: MoveRecord | null = null;
  @State geo: BoardGeometry = { cell: 34, pad: 17 };
  @State toast: string = '';
  @State showToast: boolean = false;
  /** 最近一次点击被识别成的交点（-1 表示未命中棋盘），用于在棋盘上直接显示识别结果 */
  @State tapRow: number = -1;
  @State tapCol: number = -1;
  /** 是否显示命中标记（2 秒后自动消失，避免干扰下棋） */
  @State tapVisible: boolean = false;
  /** 最近一次点击的判定说明 */
  @State tapText: string = '';
  private tapTimer: number = -1;

  aboutToAppear(): void {
    this.game.restart();
    this.syncAll();
  }

  /** 把引擎状态同步到界面 */
  private syncAll(): void {
    this.boardData = this.game.board;
    this.lastMove = this.game.lastMove;
    this.clearSelection();
  }

  private clearSelection(): void {
    this.selectedRow = -1;
    this.selectedCol = -1;
    this.targetList = [];
  }

  /** 按可用尺寸重算棋子间距，保证棋盘在竖屏与横屏都不溢出 */
  private updateGeometry(width: number, height: number): void {
    const byWidth: number = width * CELL_RATIO;
    const byHeight: number = (height - 230) / (GRID_ROWS + 1);
    let cell: number = Math.min(byWidth, byHeight);
    if (cell < 18) {
      cell = 18;
    }
    if (cell > 54) {
      cell = 54;
    }
    if (Math.abs(cell - this.geo.cell) > 0.5) {
      this.geo = { cell: cell, pad: cell * 0.5 };
    }
  }

  private showMessage(text: string): void {
    this.toast = text;
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 1600);
  }

  /**
   * 落点处理：选子 / 走子 / 换选。
   *
   * 注意：只有「再点同一个子」和「成功走子」才会清空选中；
   * 点到空白处或对方棋子时保留当前选中，避免用户点偏一点就丢失已标出的合法落点。
   */
  private handleTap(row: number, col: number): void {
    if (row < 0 || col < 0) {
      this.showTapFeedback(row, col, '未命中棋盘，请点棋子或落点');
      this.showMessage('点偏了，请对准棋子或绿点');
      return;
    }
    if (this.game.status !== 'playing') {
      this.showMessage('本局已结束，请点“重开一局”');
      return;
    }

    if (this.selectedRow < 0) {
      if (this.game.isSelectable(row, col)) {
        this.selectAt(row, col);
      } else {
        this.showTapFeedback(row, col, `(${row},${col}) 不能选`);
        this.showMessage('请先选自己的棋子');
      }
      return;
    }

    if (this.selectedRow === row && this.selectedCol === col) {
      this.clearSelection();
      this.showTapFeedback(row, col, '取消选择');
      return;
    }

    if (this.isTarget(row, col)) {
      this.applyMove(this.selectedRow, this.selectedCol, row, col);
      return;
    }

    // 点到非落点：能选就换选，否则保留当前选中并提示
    if (this.game.isSelectable(row, col)) {
      this.selectAt(row, col);
    } else {
      this.showTapFeedback(row, col, `(${row},${col}) 不是落点`);
      this.showMessage('这里不是合法落点，选中状态已保留');
    }
  }

  /** 在棋盘上标出本次点击被识别成的交点，并显示判定说明 */
  private showTapFeedback(row: number, col: number, text: string): void {
    this.tapRow = row;
    this.tapCol = col;
    this.tapText = text;
    this.tapVisible = true;
    if (this.tapTimer >= 0) {
      clearTimeout(this.tapTimer);
    }
    this.tapTimer = setTimeout(() => {
      this.tapVisible = false;
      this.tapTimer = -1;
    }, 2000);
  }

  private selectAt(row: number, col: number): void {
    if (!this.game.isSelectable(row, col)) {
      this.clearSelection();
      return;
    }
    this.selectedRow = row;
    this.selectedCol = col;
    this.targetList = this.game.getLegalTargets(row, col);
    const piece: number = this.boardData[row * GRID_COLS + col];
    this.showTapFeedback(row, col, `选中 ${pieceName(piece)} 可选 ${this.targetList.length} 处`);
  }

  private isTarget(row: number, col: number): boolean {
    for (let i = 0; i < this.targetList.length; i++) {
      if (this.targetList[i][0] === row && this.targetList[i][1] === col) {
        return true;
      }
    }
    return false;
  }

  private applyMove(fromRow: number, fromCol: number, toRow: number, toCol: number): void {
    const record: MoveRecord | null = this.game.move(fromRow, fromCol, toRow, toCol);
    if (record === null) {
      return;
    }
    this.boardData = this.game.board;
    this.lastMove = this.game.lastMove;
    this.clearSelection();
    this.showTapFeedback(toRow, toCol, `已走 ${fromRow},${fromCol} → ${toRow},${toCol}`);

    if (this.game.status !== 'playing') {
      const winner: Player | null = this.game.winner;
      const winnerName: string = winner === null ? '对局' : playerName(winner);
      const reason: string = this.game.isCheckmate ? '将死' : '困毙';
      this.showMessage(`${winnerName}胜（${reason}）`);
    } else if (this.game.inCheck) {
      this.showMessage(`${playerName(this.game.turn)}被将军`);
    }
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column({ space: 4 }) {
        this.HeaderBar()
        this.BoardArea()
        this.ControlBar()
      }
      .width('100%')
      .height('100%')
      .padding({ left: 8, right: 8, top: 6, bottom: 8 })
      .backgroundColor(PAGE_BG)
      .onAreaChange((oldArea: Area, newArea: Area) => {
        this.updateGeometry(Number(newArea.width), Number(newArea.height));
      })

      if (this.showToast) {
        Text(this.toast)
          .fontSize(15)
          .fontColor(Color.White)
          .backgroundColor('#D9000000')
          .padding({ left: 16, right: 16, top: 9, bottom: 9 })
          .borderRadius(18)
          .offset({ y: 150 })
      }
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  HeaderBar() {
    Column({ space: 2 }) {
      Text('中国象棋')
        .fontSize(22)
        .fontWeight(FontWeight.Bold)
        .fontColor('#4E342E')
      Row({ space: 8 }) {
        Circle({ width: 10, height: 10 })
          .fill(sideColor(this.game.turn))
        Text(this.game.statusText())
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.game.inCheck ? '#C62828' : '#4E342E')
        if (this.game.inCheck && this.game.status === 'playing') {
          Text('将军!')
            .fontSize(13)
            .fontColor(Color.White)
            .backgroundColor('#C62828')
            .padding({ left: 6, right: 6, top: 1, bottom: 1 })
            .borderRadius(4)
        }
      }
      .justifyContent(FlexAlign.Center)
      .width('100%')

      Text(`已走 ${this.game.moveCount} 步`)
        .fontSize(12)
        .fontColor('#8D6E63')

      // 点击判定反馈：显示系统把这次点击识别成了哪一格，便于发现点偏
      if (this.tapText.length > 0) {
        Text(this.tapText)
          .fontSize(12)
          .fontColor(COLOR_TAP_FEEDBACK)
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  BoardArea() {
    Column() {
      ChessBoard({
        board: this.boardData,
        selectedRow: this.selectedRow,
        selectedCol: this.selectedCol,
        targets: this.targetList,
        lastFromRow: this.lastMove === null ? -1 : this.lastMove.fromRow,
        lastFromCol: this.lastMove === null ? -1 : this.lastMove.fromCol,
        lastToRow: this.lastMove === null ? -1 : this.lastMove.toRow,
        lastToCol: this.lastMove === null ? -1 : this.lastMove.toCol,
        cell: this.geo.cell,
        tapRow: this.tapRow,
        tapCol: this.tapCol,
        tapVisible: this.tapVisible,
        onTap: (row: number, col: number) => {
          this.handleTap(row, col);
        }
      })
    }
    .layoutWeight(1)
    .width('100%')
    .justifyContent(FlexAlign.Center)
  }

  @Builder
  ControlBar() {
    Row({ space: 10 }) {
      Button('重开一局')
        .fontSize(15)
        .backgroundColor('#6D4C41')
        .layoutWeight(1)
        .onClick(() => {
          this.game.restart();
          this.syncAll();
          this.showMessage('新的一局，红先');
        })
      Button('悔棋')
        .fontSize(15)
        .backgroundColor('#8D6E63')
        .layoutWeight(1)
        .enabled(this.game.canUndo)
        .onClick(() => {
          if (this.game.undo()) {
            this.syncAll();
            this.showMessage('已悔棋');
          }
        })
      Button('交换先手')
        .fontSize(15)
        .backgroundColor('#5D4037')
        .layoutWeight(1)
        .onClick(() => {
          this.game.switchTurn();
          this.syncAll();
          this.showMessage(`${playerName(this.game.turn)}先走`);
        })
    }
    .width('100%')
  }
}
