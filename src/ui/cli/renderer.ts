import blessed from 'blessed';
import { GameState } from '../../core/Game';
import { PokerClient } from '../../network/Client';
import type { GmPlayerProfile, PublicPlayerProfile } from '../../session/types';

interface ActionOption {
  label: string;
  hint: string;
  run: () => void;
}

export class CliRenderer {
  private screen: blessed.Widgets.Screen;
  private tableBox: blessed.Widgets.BoxElement;
  private handBox: blessed.Widgets.BoxElement;
  private logBox: blessed.Widgets.BoxElement;
  private actionBox: blessed.Widgets.BoxElement;
  private actionList: blessed.Widgets.ListElement;
  private actionHintBox: blessed.Widgets.BoxElement;
  private statusBox: blessed.Widgets.BoxElement;
  private promptBox: blessed.Widgets.BoxElement;

  private client: PokerClient;
  private roomId: string;
  private playerId: string | null = null;
  private currentState: GameState | null = null;
  private logs: string[] = [];
  private currentActions: ActionOption[] = [];
  private selectedActionIndex = 0;

  constructor(client: PokerClient, roomId: string) {
    this.client = client;
    this.roomId = roomId;

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Texas Poker',
      fullUnicode: true,
    });

    this.tableBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '70%',
      height: '62%',
      border: { type: 'line' },
      tags: true,
      label: ' 牌桌 ',
      style: { border: { fg: 'cyan' } },
    });

    this.handBox = blessed.box({
      parent: this.screen,
      top: 0,
      right: 0,
      width: '30%',
      height: '28%',
      border: { type: 'line' },
      tags: true,
      label: ' 你的手牌 ',
      style: { border: { fg: 'green' } },
    });

    this.statusBox = blessed.box({
      parent: this.screen,
      top: '28%',
      right: 0,
      width: '30%',
      height: '24%',
      border: { type: 'line' },
      tags: true,
      label: ' 当前状态 ',
      style: { border: { fg: 'yellow' } },
    });

    this.actionBox = blessed.box({
      parent: this.screen,
      top: '52%',
      right: 0,
      width: '30%',
      height: '38%',
      border: { type: 'line' },
      tags: true,
      label: ' 可执行动作 ',
      style: { border: { fg: 'red' } },
    });

    this.actionList = blessed.list({
      parent: this.actionBox,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '65%-1',
      keys: true,
      mouse: true,
      vi: true,
      tags: true,
      style: {
        selected: {
          bg: 'blue',
          fg: 'white',
        },
      },
    });

    this.actionHintBox = blessed.box({
      parent: this.actionBox,
      bottom: 0,
      left: 1,
      width: '100%-2',
      height: '35%-1',
      tags: true,
    });

    this.logBox = blessed.box({
      parent: this.screen,
      top: '62%',
      left: 0,
      width: '70%',
      height: '28%',
      border: { type: 'line' },
      tags: true,
      label: ' 牌桌日志 ',
      scrollable: true,
      alwaysScroll: true,
      style: { border: { fg: 'magenta' } },
    });

    this.promptBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      tags: true,
    });

    this.client.onState((state) => {
      this.currentState = state;
      this.render();
    });

    this.client.onConnected((id) => {
      this.playerId = id;
      this.log('已连接到牌桌');
    });

    this.client.onError((msg) => {
      this.log('错误: ' + msg);
    });

    this.actionList.on('select', (_, index) => {
      this.selectedActionIndex = Number(index);
      const action = this.currentActions[this.selectedActionIndex];
      action?.run();
    });

    this.actionList.on('keypress', (_, key) => {
      if (key.name === 'down' || key.name === 'up') {
        if (key.name === 'down') {
          this.selectedActionIndex = Math.min(this.currentActions.length - 1, this.selectedActionIndex + 1);
        }
        if (key.name === 'up') {
          this.selectedActionIndex = Math.max(0, this.selectedActionIndex - 1);
        }
        this.renderActionPanel();
      }
    });

    this.screen.key(['q', 'C-c'], () => {
      this.client.disconnect();
      process.exit(0);
    });

    this.screen.key(['f'], () => this.triggerNamedAction('弃牌'));
    this.screen.key(['c'], () => this.triggerNamedAction('跟注'));
    this.screen.key(['r'], () => this.triggerNamedAction('加注'));
    this.screen.key(['enter'], () => {
      if (this.currentActions.length > 0) {
        const action = this.currentActions[Math.max(0, this.selectedActionIndex)];
        action?.run();
      }
    });
    this.screen.key(['p'], () => {
      this.showProfilePrompt();
    });
    this.screen.key(['s'], () => {
      this.triggerNamedAction('开始游戏');
    });

    this.renderActionPanel();
    this.renderPrompt();
    this.actionList.focus();
    this.screen.render();
  }

  private render(): void {
    const state = this.currentState;
    if (!state) return;

    this.renderTable(state);
    this.renderHand(state);
    this.renderStatus(state);
    this.renderActionPanel();
    this.renderPrompt();
    this.screen.render();
  }

  private renderTable(state: GameState): void {
    const lines: string[] = [];
    const community = state.communityCards.length > 0
      ? state.communityCards.map((card) => this.renderCard(this.normalizeCardDisplay(card))).join(' ')
      : '（等待发牌）';

    lines.push(`  {bold}公共牌{/bold}`);
    lines.push('');
    lines.push(`  ${community}`);
    lines.push('');
    lines.push(`  {bold}底池：{/bold}${state.pot}    {bold}当前下注：{/bold}${state.currentBet}`);
    lines.push('');
    lines.push('  {bold}玩家{/bold}');

    for (const player of state.players) {
      const isDealer = state.players[state.dealerIndex]?.id === player.id;
      const isCurrent = state.currentPlayerId === player.id;
      const isMe = player.id === this.playerId;
      const marker = isDealer ? '[D]' : '   ';
      const turn = isCurrent ? '▶' : ' ';
      const name = isMe ? `${player.name} (你)` : player.name;
      const statusText = this.mapStatus(player.status);
      lines.push(`  ${turn} ${marker} ${name.padEnd(16, ' ')} 筹码 ${String(player.chips).padStart(4, ' ')}  本轮 ${String(player.bet).padStart(3, ' ')}  ${statusText}`);
    }

    this.tableBox.setContent(lines.join('\n'));
  }

  private renderHand(state: GameState): void {
    const me = this.getMe(state);
    const lines: string[] = [];

    if (!me?.hand) {
      lines.push('');
      lines.push('  还没发到你的手牌');
      lines.push('');
      lines.push('  开局后会显示在这里');
      this.handBox.setContent(lines.join('\n'));
      return;
    }

    lines.push('');
    lines.push(`  ${me.hand.map((card) => this.renderCard(card)).join('   ')}`);
    lines.push('');
    lines.push(`  {bold}筹码：{/bold}${me.chips}`);
    lines.push(`  {bold}状态：{/bold}${this.mapStatus(me.status)}`);

    this.handBox.setContent(lines.join('\n'));
  }

  private renderStatus(state: GameState): void {
    const me = this.getMe(state);
    const isMyTurn = state.currentPlayerId === this.playerId;
    const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId);
    const toCall = me ? Math.max(0, state.currentBet - me.bet) : 0;

    const phaseNames: Record<string, string> = {
      waiting: '等待中',
      preflop: '翻牌前',
      flop: '翻牌圈',
      turn: '转牌圈',
      river: '河牌圈',
      showdown: '摊牌',
      ended: '结算中',
    };

    const lines = [
      '',
      `  阶段：${phaseNames[state.phase] || state.phase}`,
      `  轮到：${currentPlayer ? currentPlayer.name : '暂无'}`,
      `  你需补：${toCall}`,
      `  你的本轮下注：${me?.bet ?? 0}`,
      '',
      isMyTurn
        ? '  {green-fg}{bold}现在轮到你行动{/bold}{/green-fg}'
        : '  等待其他玩家行动',
      '',
      `  小盲 / 大盲：${state.smallBlind} / ${state.bigBlind}`,
    ];

    this.statusBox.setContent(lines.join('\n'));
  }

  private renderActionPanel(): void {
    const state = this.currentState;
    const me = state ? this.getMe(state) : null;
    const actions = this.buildActionOptions();
    this.currentActions = actions;

    const items = actions.length > 0
      ? actions.map((action) => action.label)
      : ['当前没有可执行动作'];

    this.actionList.setItems(items);
    if (actions.length > 0) {
      this.selectedActionIndex = Math.min(this.selectedActionIndex, actions.length - 1);
      this.actionList.select(Math.max(0, this.selectedActionIndex));
      this.actionList.focus();
    } else {
      this.selectedActionIndex = 0;
    }

    const selectedAction = actions[Math.max(0, this.selectedActionIndex)] ?? null;
    const toCall = me && state ? Math.max(0, state.currentBet - me.bet) : 0;

    const lines = [
      selectedAction
        ? `  {bold}说明：{/bold}${selectedAction.hint}`
        : '  现在不是你的操作阶段',
      '',
      `  快捷键：{bold}↑↓{/bold} 选项  {bold}Enter{/bold} 确认`,
      '  也可以直接按 {bold}f{/bold}/{bold}c{/bold}/{bold}r{/bold}/{bold}s{/bold}/{bold}p{/bold}',
      '',
      `  当前需要补：${toCall}`,
    ];

    this.actionHintBox.setContent(lines.join('\n'));
  }

  private renderPrompt(): void {
    const state = this.currentState;
    const me = state ? this.getMe(state) : null;
    const isMyTurn = state?.currentPlayerId === this.playerId;
    const currentPlayer = state?.players.find((player) => player.id === state.currentPlayerId);
    const toCall = me && state ? Math.max(0, state.currentBet - me.bet) : 0;

    const text = !state
      ? '  正在连接牌桌...'
      : isMyTurn
        ? `  轮到你了：请在右下角选择动作。当前需要补 ${toCall}。按 p 可查看玩家简介。`
        : `  当前轮到 ${currentPlayer?.name ?? '其他玩家'}。你的手牌在右上角，按 p 可查看玩家简介。`;

    this.promptBox.setContent(text);
  }

  private buildActionOptions(): ActionOption[] {
    const state = this.currentState;
    const me = state ? this.getMe(state) : null;
    if (!state || !me) return [];

    const isMyTurn = state.currentPlayerId === this.playerId;
    const toCall = Math.max(0, state.currentBet - me.bet);
    const options: ActionOption[] = [];

    if (state.phase === 'waiting' && me.isHost) {
      options.push({
        label: '开始游戏',
        hint: '房主可以在这里直接开始这一手牌。',
        run: () => {
          this.client.startGame(this.roomId);
          this.log('开始游戏');
        },
      });
    }

    if (!isMyTurn || me.status !== 'active') {
      return options;
    }

    options.push({
      label: '弃牌',
      hint: '放弃本手牌，立刻退出这一手。',
      run: () => {
        this.client.action(this.roomId, 'fold');
        this.log('操作: 弃牌');
      },
    });

    if (toCall === 0) {
      options.push({
        label: '过牌',
        hint: '当前无需补筹码，可以选择过牌继续等待后续行动。',
        run: () => {
          this.client.action(this.roomId, 'check');
          this.log('操作: 过牌');
        },
      });
    } else {
      options.push({
        label: '跟注',
        hint: `补上 ${toCall} 筹码，继续留在这一手牌里。`,
        run: () => {
          this.client.action(this.roomId, 'call');
          this.log('操作: 跟注');
        },
      });
    }

    if (me.chips > toCall) {
      options.push({
        label: '加注',
        hint: '输入你想加注到的总金额，主动给桌面施压。',
        run: () => {
          this.showRaisePrompt();
        },
      });
    }

    return options;
  }

  private triggerNamedAction(label: string): void {
    const action = this.currentActions.find((item) => item.label === label);
    action?.run();
  }

  private showRaisePrompt(): void {
    const state = this.currentState;
    const me = state ? this.getMe(state) : null;
    if (!state || !me) return;

    const minimum = Math.max(state.currentBet + 1, me.bet + 1);
    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 36,
      height: 8,
      border: { type: 'line' },
      label: ' 加注 ',
    });

    prompt.readInput(`输入加注到的总金额（至少 ${minimum}）`, String(Math.max(minimum, state.currentBet + state.bigBlind)), (_err, value) => {
      prompt.destroy();
      const amount = parseInt(value ?? '', 10);
      if (!Number.isFinite(amount)) {
        this.log('取消加注');
      } else {
        this.client.action(this.roomId, 'raise', amount);
        this.log(`操作: 加注到 ${amount}`);
      }

      this.renderActionPanel();
      this.renderPrompt();
      this.screen.render();
    });
  }

  private getVisibleProfiles(): Array<PublicPlayerProfile | GmPlayerProfile> {
    if (!this.currentState?.session) return [];

    if (this.currentState.session.viewerRole === 'gm' && this.currentState.session.gmProfiles) {
      return this.currentState.session.gmProfiles;
    }

    return this.currentState.session.publicProfiles;
  }

  private showProfilePrompt(): void {
    const profiles = this.getVisibleProfiles();
    if (profiles.length === 0) {
      this.log('当前还没有可查看的玩家简介');
      return;
    }

    const list = blessed.list({
      parent: this.screen,
      border: { type: 'line' },
      width: '50%',
      height: Math.min(12, profiles.length + 4),
      top: 'center',
      left: 'center',
      label: ' 玩家简介 ',
      keys: true,
      mouse: true,
      vi: true,
      items: profiles.map((profile) => profile.playerName),
      style: {
        selected: { bg: 'blue' },
      },
    });

    list.focus();
    this.screen.render();

    list.on('select', (_, index) => {
      const profile = profiles[Number(index)];
      list.destroy();
      this.showProfileCard(profile.playerName);
    });
  }

  private showProfileCard(playerName: string): void {
    const profile = this.getVisibleProfiles().find((item) => item.playerName === playerName);
    if (!profile) return;

    const lines = [
      `${profile.playerName} · ${profile.title}`,
      '',
      profile.summary,
      '',
      `近期: ${profile.recentNote}`,
      `标签: ${profile.revealedTraits.join(' / ') || '暂无'}`,
      `手数: ${profile.handsPlayed}  净变化: ${profile.netChips >= 0 ? '+' : ''}${profile.netChips}`,
    ];

    if (this.isGmProfile(profile) && profile.soul) {
      lines.push('', `GM 视角原型: ${profile.soul.archetypeName}`);
      lines.push(`GM 标签: ${profile.soulTags.join(' / ') || '暂无'}`);
      lines.push('', profile.privateSummary);
    }

    const message = blessed.message({
      parent: this.screen,
      border: { type: 'line' },
      width: '70%',
      height: 18,
      top: 'center',
      left: 'center',
      label: ` ${playerName} `,
      tags: true,
      scrollable: true,
      keys: true,
      vi: true,
    });

    message.display(lines.join('\n'), 0, () => {
      message.destroy();
      this.actionList.focus();
      this.screen.render();
    });
  }

  private getMe(state: GameState) {
    return state.players.find((player) => player.id === this.playerId) ?? null;
  }

  private mapStatus(status: string): string {
    const map: Record<string, string> = {
      waiting: '等待',
      active: '进行中',
      folded: '已弃牌',
      'all-in': 'All-in',
    };

    return map[status] || status;
  }

  private renderCard(card: string): string {
    const isRed = card.includes('♥') || card.includes('♦');
    const color = isRed ? 'red-fg' : 'white-fg';
    return `{${color}}[ ${card} ]{/${color}}`;
  }

  private normalizeCardDisplay(card: unknown): string {
    if (typeof card === 'string') {
      return card;
    }

    if (card && typeof card === 'object') {
      const maybeVisible = card as { display?: string; suit?: string; rank?: number | string };
      if (typeof maybeVisible.display === 'string') {
        return maybeVisible.display;
      }

      if (maybeVisible.suit && maybeVisible.rank) {
        const rankMap: Record<string, string> = {
          '11': 'J',
          '12': 'Q',
          '13': 'K',
          '14': 'A',
        };
        const rank = String(maybeVisible.rank);
        return `${rankMap[rank] || rank}${maybeVisible.suit}`;
      }
    }

    return '??';
  }

  private isGmProfile(profile: PublicPlayerProfile | GmPlayerProfile): profile is GmPlayerProfile {
    return 'privateSummary' in profile;
  }

  private log(msg: string): void {
    this.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (this.logs.length > 100) this.logs.shift();
    this.logBox.setContent(this.logs.join('\n'));
    this.logBox.setScrollPerc(100);
  }
}
