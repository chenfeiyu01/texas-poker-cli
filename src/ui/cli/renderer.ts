import blessed from 'blessed';
import { GameState } from '../../core/Game';
import { PokerClient } from '../../network/Client';
import type { GmPlayerProfile, PublicPlayerProfile } from '../../session/types';

export class CliRenderer {
  private screen: blessed.Widgets.Screen;
  private tableBox: blessed.Widgets.BoxElement;
  private handBox: blessed.Widgets.BoxElement;
  private logBox: blessed.Widgets.BoxElement;
  private actionBox: blessed.Widgets.BoxElement;
  private statusBox: blessed.Widgets.BoxElement;
  private promptBox: blessed.Widgets.BoxElement;
  private input: blessed.Widgets.TextboxElement;

  private client: PokerClient;
  private roomId: string;
  private playerId: string | null = null;
  private currentState: GameState | null = null;
  private logs: string[] = [];

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
      height: '60%',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: 'cyan' } },
    });

    this.handBox = blessed.box({
      parent: this.screen,
      top: 0,
      right: 0,
      width: '30%',
      height: '30%',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: 'green' } },
    });

    this.statusBox = blessed.box({
      parent: this.screen,
      top: '30%',
      right: 0,
      width: '30%',
      height: '30%',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: 'yellow' } },
    });

    this.logBox = blessed.box({
      parent: this.screen,
      top: '60%',
      left: 0,
      width: '70%',
      height: '30%',
      border: { type: 'line' },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      style: { border: { fg: 'magenta' } },
    });

    this.actionBox = blessed.box({
      parent: this.screen,
      top: '60%',
      right: 0,
      width: '30%',
      height: '30%',
      border: { type: 'line' },
      tags: true,
      style: { border: { fg: 'red' } },
    });

    this.promptBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
    });

    this.input = blessed.textbox({
      parent: this.promptBox,
      top: 0,
      left: 1,
      width: '100%-2',
      height: 1,
      inputOnFocus: true,
    });

    this.client.onState((state) => {
      this.currentState = state;
      this.render();
    });

    this.client.onConnected((id) => {
      this.playerId = id;
      this.log('已连接，玩家ID: ' + id.slice(0, 8));
    });

    this.client.onError((msg) => {
      this.log('错误: ' + msg);
    });

    this.input.on('submit', (value: string) => {
      this.handleInput(value.trim().toLowerCase());
      this.input.setValue('');
      this.input.focus();
      this.screen.render();
    });

    this.screen.key(['q', 'C-c'], () => {
      this.client.disconnect();
      process.exit(0);
    });

    this.screen.key(['f'], () => {
      this.client.action(this.roomId, 'fold');
      this.log('操作: 弃牌');
    });

    this.screen.key(['c'], () => {
      this.client.action(this.roomId, 'call');
      this.log('操作: 跟注');
    });

    this.screen.key(['r'], () => {
      this.input.setValue('raise ');
      this.input.focus();
      this.screen.render();
    });

    this.screen.key(['p'], () => {
      this.showProfilePrompt();
    });

    this.input.focus();
    this.renderActionHelp();
    this.screen.render();
  }

  private handleInput(value: string): void {
    if (!value) return;

    const [cmd, ...args] = value.split(' ');

    switch (cmd) {
      case 'fold':
      case 'f':
        this.client.action(this.roomId, 'fold');
        this.log('操作: 弃牌');
        break;
      case 'check':
      case 'ch':
        this.client.action(this.roomId, 'check');
        this.log('操作: 过牌');
        break;
      case 'call':
      case 'c':
        this.client.action(this.roomId, 'call');
        this.log('操作: 跟注');
        break;
      case 'raise':
      case 'r': {
        const amount = parseInt(args[0], 10);
        if (isNaN(amount)) {
          this.log('用法: raise <金额>');
          return;
        }
        this.client.action(this.roomId, 'raise', amount);
        this.log(`操作: 加注到 ${amount}`);
        break;
      }
      case 'start':
        this.client.startGame(this.roomId);
        this.log('开始游戏');
        break;
      case 'profile':
      case 'p':
        if (args.length === 0) {
          this.showProfilePrompt();
          return;
        }
        this.showProfileByName(args.join(' '));
        break;
      case 'profiles':
        this.log('玩家简介: ' + this.getVisibleProfiles().map((profile) => profile.playerName).join(', '));
        break;
      case 'q':
      case 'quit':
        this.client.disconnect();
        process.exit(0);
        break;
      default:
        this.log('未知命令: ' + cmd);
    }
  }

  private log(msg: string): void {
    this.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (this.logs.length > 100) this.logs.shift();
    this.logBox.setContent(this.logs.join('\n'));
    this.logBox.setScrollPerc(100);
    this.screen.render();
  }

  private renderActionHelp(): void {
    const help = [
      ' {bold}快捷操作:{/bold}',
      '',
      ' f / fold    弃牌',
      ' c / call    跟注',
      ' ch / check  过牌',
      ' r <金额>    加注',
      ' p / profile  玩家简介',
      '',
      ' start       开始游戏',
      ' q / quit    退出',
    ].join('\n');
    this.actionBox.setContent(help);
  }

  private render(): void {
    const state = this.currentState;
    if (!state) return;

    this.renderTable(state);
    this.renderHand(state);
    this.renderStatus(state);
  }

  private renderTable(state: GameState): void {
    const lines: string[] = [];

    lines.push('  {center}{bold}牌桌{/bold}{/center}');
    lines.push('');
    lines.push('  {center}{bold}公共牌{/bold}{/center}');
    lines.push('');
    const community = state.communityCards.length > 0
      ? state.communityCards.map(c => ` {${c.color === 'red' ? 'red-fg' : 'white-fg'}}${c.display}{/${c.color === 'red' ? 'red-fg' : 'white-fg'}} `).join(' ')
      : ' (等待发牌) ';
    lines.push(`  ${community}`);
    lines.push('');

    lines.push(`  {bold}底池:{/bold} ${state.pot}`);
    lines.push(`  {bold}当前下注:{/bold} ${state.currentBet}`);
    lines.push('');

    lines.push('  {bold}玩家:{/bold}');
    for (const p of state.players) {
      const isDealer = state.players[state.dealerIndex]?.id === p.id;
      const isCurrent = state.currentPlayerId === p.id;
      const isMe = p.id === this.playerId;
      const prefix = isDealer ? '[D]' : '   ';
      const indicator = isCurrent ? ' ▶ ' : '   ';
      const nameTag = isMe ? `{bold}${p.name} (你){/bold}` : p.name;
      const statusColor = p.status === 'folded' ? 'gray' : p.status === 'all-in' ? 'yellow' : 'white';
      lines.push(`  ${prefix}${indicator}{${statusColor}-fg}${nameTag}{/${statusColor}-fg} 筹码:${p.chips} 下注:${p.bet} [${p.status}]{/}`);
    }

    this.tableBox.setContent(lines.join('\n'));
    this.screen.render();
  }

  private renderHand(state: GameState): void {
    const lines: string[] = [];
    lines.push('  {center}{bold}我的手牌{/bold}{/center}');
    lines.push('');

    const me = state.players.find(p => p.id === this.playerId);
    if (!me || !me.hand) {
      lines.push('  等待发牌...');
      this.handBox.setContent(lines.join('\n'));
      return;
    }

    const cards = me.hand.map(c => {
      const isRed = c.includes('♥') || c.includes('♦');
      return ` {${isRed ? 'red-fg' : 'white-fg'}}${c}{/${isRed ? 'red-fg' : 'white-fg'}} `;
    }).join('  ');

    lines.push('  ' + cards);
    lines.push('');
    lines.push(`  筹码: ${me.chips}`);
    lines.push(`  状态: ${me.status}`);

    this.handBox.setContent(lines.join('\n'));
  }

  private renderStatus(state: GameState): void {
    const phaseNames: Record<string, string> = {
      waiting: '等待中',
      preflop: '翻牌前',
      flop: '翻牌圈',
      turn: '转牌圈',
      river: '河牌圈',
      showdown: '摊牌',
      ended: '结束',
    };

    const me = state.players.find(p => p.id === this.playerId);
    const isMyTurn = state.currentPlayerId === this.playerId;

    const lines: string[] = [];
    lines.push('  {center}{bold}游戏状态{/bold}{/center}');
    lines.push('');
    lines.push(`  阶段: ${phaseNames[state.phase] || state.phase}`);
    lines.push(`  小盲: ${state.smallBlind}`);
    lines.push(`  大盲: ${state.bigBlind}`);
    lines.push('');
    lines.push(isMyTurn ? '  {green-fg}{bold}▶ 轮到你了!{/bold}{/green-fg}' : '  等待其他玩家...');
    lines.push('');
    if (me) lines.push(`  你的筹码: ${me.chips}`);

    this.statusBox.setContent(lines.join('\n'));
    this.screen.render();
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

  private showProfileByName(name: string): void {
    const profile = this.getVisibleProfiles().find((item) => item.playerName.toLowerCase().includes(name.toLowerCase()));
    if (!profile) {
      this.log(`未找到玩家简介: ${name}`);
      return;
    }

    this.showProfileCard(profile.playerName);
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
      height: 16,
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
      this.input.focus();
      this.screen.render();
      });
  }

  private isGmProfile(profile: PublicPlayerProfile | GmPlayerProfile): profile is GmPlayerProfile {
    return 'privateSummary' in profile;
  }
}
