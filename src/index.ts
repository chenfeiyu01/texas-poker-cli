import 'dotenv/config';
import { Command } from 'commander';
import { PokerServer } from './network/Server';
import { PokerClient } from './network/Client';
import { CliRenderer } from './ui/cli/renderer';
import { SlackerRenderer } from './ui/slacker/renderer';
import { AiPlayer } from './ai/AiPlayer';
import { generateSoulProfile } from './ai/soul';
import { GameLauncher } from './runtime/GameLauncher';

const program = new Command();

program
  .name('texas-poker-cli')
  .description('联机德州扑克 CLI 游戏')
  .version('1.0.0');

program
  .command('server')
  .description('启动游戏服务器')
  .option('-p, --port <port>', '服务器端口', '3000')
  .action((options) => {
    const port = parseInt(options.port, 10);
    new PokerServer(port);
  });

program
  .command('client')
  .description('以正常模式连接游戏')
  .option('-r, --room <roomId>', '房间ID', 'default')
  .option('-n, --name <name>', '玩家名称')
  .option('-h, --host <host>', '服务器地址', 'http://localhost:3000')
  .action(async (options) => {
    const name = options.name || `Player_${Math.floor(Math.random() * 1000)}`;
    const client = new PokerClient();
    client.connect(options.host);

    try {
      await client.joinRoom(options.room, name, { isGm: false });
    } catch {
      await client.createRoom(options.room, name, { isGm: true });
    }

    new CliRenderer(client, options.room);
  });

program
  .command('slacker')
  .description('以摸鱼模式连接游戏')
  .option('-r, --room <roomId>', '房间ID', 'default')
  .option('-n, --name <name>', '玩家名称')
  .option('-h, --host <host>', '服务器地址', 'http://localhost:3000')
  .action(async (options) => {
    const name = options.name || `Player_${Math.floor(Math.random() * 1000)}`;
    const client = new PokerClient();
    client.connect(options.host);

    try {
      await client.joinRoom(options.room, name, { isGm: false });
    } catch {
      await client.createRoom(options.room, name, { isGm: true });
    }

    new SlackerRenderer(client, options.room);
  });

program
  .command('play')
  .description('进入大厅：选择本机局或联机局')
  .action(async (options) => {
    await new GameLauncher().launchFromLobby();
  });

program
  .command('ai')
  .description('启动 AI 玩家')
  .option('-r, --room <roomId>', '房间ID', 'default')
  .option('-n, --name <name>', '玩家名称', 'AI_Bot')
  .option('-h, --host <host>', '服务器地址', 'http://localhost:3000')
  .option('--count <count>', 'AI 玩家数量', '1')
  .action(async (options) => {
    const apiKey = process.env.AI_API_KEY;
    const apiBase = process.env.AI_BASE_URL || 'https://api.xbai.top/v1';
    const model = process.env.AI_MODEL || 'gpt-5-nano';

    if (!apiKey) {
      console.error('错误: 未设置 AI_API_KEY 环境变量');
      console.error('请在 .env 文件中配置: AI_API_KEY=sk-xxx');
      process.exit(1);
    }

    const count = parseInt(options.count, 10);
    const bots: AiPlayer[] = [];

    for (let i = 0; i < count; i++) {
      const name = count > 1 ? `${options.name}_${i + 1}` : options.name;
      const bot = new AiPlayer({
        host: options.host,
        room: options.room,
        name,
        apiKey,
        apiBase,
        model,
        thinkMs: 1500 + Math.random() * 2000,
        soul: generateSoulProfile(Math.floor(Math.random() * 1_000_000)),
      });
      bots.push(bot);
      await bot.start();
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[AI] ${count} 个 AI 玩家已启动，按 Ctrl+C 停止`);

    process.on('SIGINT', () => {
      console.log('\n[AI] 正在停止...');
      bots.forEach((b) => b.stop());
      process.exit(0);
    });
  });

program.parse();
