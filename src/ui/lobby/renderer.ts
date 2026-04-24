import blessed from 'blessed';

export interface GameLaunchConfig {
  mode: 'local' | 'online-create' | 'online-join';
  host: string;
  roomId: string;
  playerName: string;
  uiMode: 'cli' | 'slacker';
  totalPlayers: number;
  aiCount: number;
  isGm: boolean;
  autoStart: boolean;
}

export class LobbyRenderer {
  private screen: blessed.Widgets.Screen;
  private titleBox: blessed.Widgets.BoxElement;
  private menu: blessed.Widgets.ListElement;
  private hintBox: blessed.Widgets.BoxElement;

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Texas Poker Lobby',
      fullUnicode: true,
    });

    this.titleBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 5,
      tags: true,
      content: [
        '',
        '  {bold}Texas Poker CLI{/bold}',
        '  请选择玩法：本机局 / 联机建房 / 联机加入',
      ].join('\n'),
    });

    this.menu = blessed.list({
      parent: this.screen,
      top: 5,
      left: 'center',
      width: '70%',
      height: 8,
      border: { type: 'line' },
      label: ' 大厅 ',
      tags: true,
      keys: true,
      mouse: true,
      vi: true,
      style: {
        selected: {
          bg: 'blue',
        },
        border: {
          fg: 'cyan',
        },
      },
      items: [
        '本机局（1 位真人 + 多个 AI）',
        '联机局：创建房间',
        '联机局：加入房间',
        '退出',
      ],
    });

    this.hintBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 5,
      border: { type: 'line' },
      content: [
        '  ↑↓ 选择，Enter 确认',
        '  本机局会自动启动本地服务器，并可直接补 AI',
        '  创建房间默认作为 GM 进入，加入房间默认是普通玩家',
      ].join('\n'),
    });
  }

  async run(): Promise<GameLaunchConfig | null> {
    return new Promise((resolve) => {
      const close = (value: GameLaunchConfig | null) => {
        this.screen.destroy();
        resolve(value);
      };

      this.screen.key(['q', 'C-c', 'escape'], () => close(null));

      this.menu.on('select', async (_, index) => {
        try {
          const selection = Number(index);
          if (selection === 0) {
            close(await this.buildLocalConfig());
            return;
          }
          if (selection === 1) {
            close(await this.buildOnlineCreateConfig());
            return;
          }
          if (selection === 2) {
            close(await this.buildOnlineJoinConfig());
            return;
          }
          close(null);
        } catch (error) {
          await this.showMessage(`启动配置失败：${(error as Error).message}`);
          this.menu.focus();
          this.screen.render();
        }
      });

      this.menu.focus();
      this.screen.render();
    });
  }

  private async buildLocalConfig(): Promise<GameLaunchConfig> {
    const playerName = (await this.ask('你的名字', `Player_${Math.floor(Math.random() * 1000)}`)).trim() || 'Player';
    const requestedTotalPlayers = await this.askNumber('几人对局', 4);
    const requestedAiCount = await this.askNumber('需要多少 AI', Math.max(1, requestedTotalPlayers - 1));
    const uiMode = await this.chooseUiMode();
    const aiCount = Math.max(1, Math.min(requestedAiCount, Math.max(1, requestedTotalPlayers - 1)));
    const totalPlayers = aiCount + 1;

    return {
      mode: 'local',
      host: 'http://localhost:3000',
      roomId: `local-${Date.now().toString(36)}`,
      playerName,
      uiMode,
      totalPlayers,
      aiCount,
      isGm: true,
      autoStart: true,
    };
  }

  private async buildOnlineCreateConfig(): Promise<GameLaunchConfig> {
    const host = (await this.ask('服务器地址', 'http://localhost:3000')).trim() || 'http://localhost:3000';
    const roomId = (await this.ask('房间 ID', `room-${Date.now().toString(36)}`)).trim() || `room-${Date.now().toString(36)}`;
    const playerName = (await this.ask('你的名字', `Host_${Math.floor(Math.random() * 1000)}`)).trim() || 'Host';
    const aiCount = await this.askNumber('房主先补多少 AI', 0);
    const uiMode = await this.chooseUiMode();

    return {
      mode: 'online-create',
      host,
      roomId,
      playerName,
      uiMode,
      totalPlayers: aiCount + 1,
      aiCount,
      isGm: true,
      autoStart: false,
    };
  }

  private async buildOnlineJoinConfig(): Promise<GameLaunchConfig> {
    const host = (await this.ask('服务器地址', 'http://localhost:3000')).trim() || 'http://localhost:3000';
    const roomId = (await this.ask('房间 ID', 'default')).trim() || 'default';
    const playerName = (await this.ask('你的名字', `Player_${Math.floor(Math.random() * 1000)}`)).trim() || 'Player';
    const uiMode = await this.chooseUiMode();

    return {
      mode: 'online-join',
      host,
      roomId,
      playerName,
      uiMode,
      totalPlayers: 0,
      aiCount: 0,
      isGm: false,
      autoStart: false,
    };
  }

  private async chooseUiMode(): Promise<'cli' | 'slacker'> {
    const index = await this.choose('UI 模式', ['普通模式', '摸鱼模式']);
    return index === 1 ? 'slacker' : 'cli';
  }

  private async ask(label: string, initialValue: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const prompt = blessed.prompt({
        parent: this.screen,
        border: { type: 'line' },
        width: '60%',
        height: 7,
        top: 'center',
        left: 'center',
        label: ` ${label} `,
      });

      prompt.readInput(label, initialValue, (error: Error | null, value: string) => {
        prompt.destroy();
        this.screen.render();

        if (error) {
          reject(error);
          return;
        }

        resolve(value ?? initialValue);
      });
    });
  }

  private async askNumber(label: string, fallback: number): Promise<number> {
    const raw = (await this.ask(label, String(fallback))).trim();
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private async choose(label: string, items: string[]): Promise<number> {
    return new Promise((resolve) => {
      const list = blessed.list({
        parent: this.screen,
        border: { type: 'line' },
        width: '50%',
        height: items.length + 4,
        top: 'center',
        left: 'center',
        label: ` ${label} `,
        keys: true,
        mouse: true,
        vi: true,
        items,
        style: {
          selected: { bg: 'blue' },
        },
      });

      list.focus();
      this.screen.render();

      list.on('select', (_, index) => {
        const selection = Number(index);
        list.destroy();
        this.menu.focus();
        this.screen.render();
        resolve(selection);
      });
    });
  }

  private async showMessage(text: string): Promise<void> {
    return new Promise((resolve) => {
      const message = blessed.message({
        parent: this.screen,
        border: { type: 'line' },
        width: '60%',
        height: 7,
        top: 'center',
        left: 'center',
        label: ' 提示 ',
      });

      message.display(text, 0, () => {
        message.destroy();
        this.menu.focus();
        this.screen.render();
        resolve();
      });
    });
  }
}
