import { AiPlayer } from '../ai/AiPlayer';
import { generateSoulProfile } from '../ai/soul';
import { PokerClient } from '../network/Client';
import { CliRenderer } from '../ui/cli/renderer';
import { LobbyRenderer, GameLaunchConfig } from '../ui/lobby/renderer';
import { SlackerRenderer } from '../ui/slacker/renderer';
import { findAvailablePort, isPortOpen, startLocalServer } from './serverBootstrap';

export class GameLauncher {
  private bots: AiPlayer[] = [];
  private shutdownHookInstalled = false;

  async launchFromLobby(): Promise<void> {
    const lobby = new LobbyRenderer();
    const config = await lobby.run();
    if (!config) {
      return;
    }

    await this.launch(config);
  }

  async launch(config: GameLaunchConfig): Promise<void> {
    if (config.mode === 'local') {
      config.host = await this.allocateLocalHost();
      await this.ensureLocalServer(config.host);
    }

    const client = new PokerClient();
    client.connect(config.host);

    if (config.mode === 'online-join') {
      await client.joinRoom(config.roomId, config.playerName, { isGm: false });
    } else {
      await client.createRoom(config.roomId, config.playerName, { isGm: config.isGm });
    }

    this.installShutdownHook();

    if (config.uiMode === 'slacker') {
      new SlackerRenderer(client, config.roomId);
    } else {
      new CliRenderer(client, config.roomId);
    }

    if (config.mode !== 'online-join') {
      void this.prepareRoom(config, client);
    }
  }

  private async allocateLocalHost(): Promise<string> {
    const port = await findAvailablePort();
    return `http://localhost:${port}`;
  }

  private async ensureLocalServer(host: string): Promise<void> {
    const port = this.extractPort(host);
    const hasServer = await isPortOpen(port);
    if (!hasServer) {
      console.log(`本地端口 ${port} 无服务器，正在自动启动...`);
      await startLocalServer(port);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  private extractPort(host: string): number {
    try {
      const url = new URL(host);
      return url.port ? parseInt(url.port, 10) : 3000;
    } catch {
      return 3000;
    }
  }

  private async spawnBots(config: GameLaunchConfig): Promise<void> {
    if (config.aiCount <= 0) {
      return;
    }

    const apiKey = process.env.AI_API_KEY;
    const apiBase = process.env.AI_BASE_URL || 'https://api.xbai.top/v1';
    const model = process.env.AI_MODEL || 'gpt-5-nano';

    for (let index = 0; index < config.aiCount; index++) {
      const soul = generateSoulProfile(Math.floor(Math.random() * 1_000_000));
      const name = this.buildBotName(soul.archetypeName, index + 1);
      const bot = new AiPlayer({
        host: config.host,
        room: config.roomId,
        name,
        apiKey,
        apiBase,
        model,
        thinkMs: 1200 + Math.random() * 2400,
        soul,
        quiet: true,
      });
      this.bots.push(bot);
      await bot.start();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  private async prepareRoom(config: GameLaunchConfig, client: PokerClient): Promise<void> {
    try {
      await this.spawnBots(config);
      if (config.autoStart) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        client.startGame(config.roomId);
      }
    } catch (error) {
      console.error('自动准备房间失败:', error);
    }
  }

  private buildBotName(archetypeName: string, index: number): string {
    return `${archetypeName}AI_${index}`;
  }

  private installShutdownHook(): void {
    if (this.shutdownHookInstalled) {
      return;
    }

    this.shutdownHookInstalled = true;
    const shutdown = () => {
      for (const bot of this.bots) {
        bot.stop();
      }
    };

    process.on('SIGINT', shutdown);
    process.on('exit', shutdown);
  }
}
