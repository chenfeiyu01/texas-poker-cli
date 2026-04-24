import fs from 'fs';
import path from 'path';
import { GamePhase, GameState } from '../core/Game';
import type { AiDecisionLog, PlayerJoinMeta } from './types';

interface ActionLogInput {
  handNumber: number;
  playerName: string;
  action: 'fold' | 'check' | 'call' | 'raise';
  phase: GamePhase;
  declaredAmount?: number;
  totalBet: number;
  potAfter: number;
  thinkTimeMs: number;
}

export class MarkdownSessionLogger {
  private readonly filePath: string;
  private readonly roomId: string;
  private currentHandNumber = 0;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.filePath = this.createLogFilePath(roomId);
    this.ensureDir();
    this.append([
      `# Texas Poker Session Log`,
      ``,
      `- 房间：\`${roomId}\``,
      `- 开始时间：${this.formatTimestamp(Date.now())}`,
      `- 日志文件：\`${this.filePath}\``,
      ``,
    ]);
  }

  logRoomCreated(hostName: string, meta: PlayerJoinMeta): void {
    this.append([
      `## 房间创建`,
      ``,
      `- 房主：${hostName}`,
      `- 身份：${this.describeMeta(meta)}`,
      ``,
    ]);
  }

  logPlayerJoined(playerName: string, meta: PlayerJoinMeta): void {
    this.append([
      `- 玩家加入：${playerName}（${this.describeMeta(meta)}）`,
    ]);
  }

  logPlayerLeft(playerName: string): void {
    this.append([
      `- 玩家离开：${playerName}`,
    ]);
  }

  logHandStart(handNumber: number, state: GameState): void {
    this.currentHandNumber = handNumber;
    this.append([
      ``,
      `## Hand ${handNumber}`,
      ``,
      `### 开局快照`,
      ``,
      `- 阶段：${this.renderPhase(state.phase)}`,
      `- 盲注：SB ${state.smallBlind} / BB ${state.bigBlind}`,
      `- 发牌后桌面：${this.renderCommunityCards(state)}`,
      ...state.players.map((player) => {
        const hand = player.hand?.join(' ') ?? '未知';
        return `- ${player.name}：筹码 ${player.chips}，状态 ${player.status}，手牌 ${hand}`;
      }),
      ``,
    ]);
  }

  logAction(input: ActionLogInput): void {
    const declaredAmount = input.declaredAmount ? ` ${input.declaredAmount}` : '';
    this.append([
      `- [${this.renderPhase(input.phase)}] ${input.playerName} 执行 \`${input.action}${declaredAmount}\`，累计投入 ${input.totalBet}，底池 ${input.potAfter}，思考 ${input.thinkTimeMs}ms`,
    ]);
  }

  logPhaseTransition(from: GamePhase, to: GamePhase, state: GameState): void {
    this.append([
      ``,
      `### 阶段推进：${this.renderPhase(from)} → ${this.renderPhase(to)}`,
      ``,
      `- 公共牌：${this.renderCommunityCards(state)}`,
      `- 当前底池：${state.pot}`,
      `- 当前下注：${state.currentBet}`,
      ``,
    ]);
  }

  logAiDecision(playerName: string, decision: AiDecisionLog): void {
    this.append([
      ``,
      `### AI 决策：${playerName}`,
      ``,
      `- 模型：\`${decision.model}\``,
      `- 请求链路：\`${decision.requestMode}\``,
      `- 请求耗时：${decision.durationMs}ms`,
      `- Prompt 摘要：${decision.promptSummary}`,
      `- 显式思考：${decision.reasoningSummary?.trim() || '模型未返回显式思考内容'}`,
      `- 牌桌发言：${decision.speech?.trim() || '（沉默）'}`,
      `- 原始输出：${decision.rawOutput || '（空）'}`,
      `- 最终动作：\`${decision.finalAction}\``,
      `- 是否兜底：${decision.usedFallback ? '是' : '否'}`,
      ...(decision.errorMessage ? [`- 错误：${decision.errorMessage}`] : []),
      ``,
    ]);
  }

  logHandEnd(handNumber: number, state: GameState): void {
    const winners = (state.winnerIds ?? [])
      .map((winnerId) => state.players.find((player) => player.id === winnerId)?.name ?? winnerId);

    this.append([
      ``,
      `### Hand ${handNumber} 结算`,
      ``,
      `- 阶段：${this.renderPhase(state.phase)}`,
      `- 公共牌：${this.renderCommunityCards(state)}`,
      `- 获胜者：${winners.length > 0 ? winners.join('、') : '未知'}`,
      ...state.players.map((player) => {
        const hand = player.hand?.join(' ') ?? '未知';
        const result = state.handResults?.[player.id] ?? '未记录';
        const winAmount = state.winAmounts?.[player.id];
        const winText = typeof winAmount === 'number' ? `，赢得 ${winAmount}` : '';
        return `- ${player.name}：手牌 ${hand}，筹码 ${player.chips}${winText}，结果 ${result}`;
      }),
      ``,
    ]);
  }

  private ensureDir(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  private append(lines: string[]): void {
    fs.appendFileSync(this.filePath, `${lines.join('\n')}\n`, 'utf8');
  }

  private createLogFilePath(roomId: string): string {
    const now = new Date();
    const date = `${now.getFullYear()}-${this.pad(now.getMonth() + 1)}-${this.pad(now.getDate())}`;
    const timestamp = `${this.pad(now.getHours())}${this.pad(now.getMinutes())}${this.pad(now.getSeconds())}`;
    const safeRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, '-');
    return path.resolve(process.cwd(), 'logs', 'sessions', date, `${timestamp}-${safeRoomId}.md`);
  }

  private renderCommunityCards(state: GameState): string {
    if (state.communityCards.length === 0) {
      return '暂无';
    }

    return state.communityCards.map((card) => card.display).join(' ');
  }

  private renderPhase(phase: GamePhase): string {
    const phaseNames: Record<GamePhase, string> = {
      [GamePhase.WAITING]: '等待中',
      [GamePhase.PREFLOP]: '翻牌前',
      [GamePhase.FLOP]: '翻牌圈',
      [GamePhase.TURN]: '转牌圈',
      [GamePhase.RIVER]: '河牌圈',
      [GamePhase.SHOWDOWN]: '摊牌',
      [GamePhase.ENDED]: '结束',
    };

    return phaseNames[phase] ?? phase;
  }

  private describeMeta(meta: PlayerJoinMeta): string {
    const flags = [
      meta.isAi ? 'AI' : '人类',
      meta.isGm ? 'GM' : '普通玩家',
    ];
    return flags.join(' / ');
  }

  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return [
      date.getFullYear(),
      this.pad(date.getMonth() + 1),
      this.pad(date.getDate()),
    ].join('-') + ` ${this.pad(date.getHours())}:${this.pad(date.getMinutes())}:${this.pad(date.getSeconds())}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
