"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const commander_1 = require("commander");
const Server_1 = require("./network/Server");
const Client_1 = require("./network/Client");
const renderer_1 = require("./ui/cli/renderer");
const renderer_2 = require("./ui/slacker/renderer");
const AiPlayer_1 = require("./ai/AiPlayer");
const soul_1 = require("./ai/soul");
const GameLauncher_1 = require("./runtime/GameLauncher");
const program = new commander_1.Command();
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
    new Server_1.PokerServer(port);
});
program
    .command('client')
    .description('以正常模式连接游戏')
    .option('-r, --room <roomId>', '房间ID', 'default')
    .option('-n, --name <name>', '玩家名称')
    .option('-h, --host <host>', '服务器地址', 'http://localhost:3000')
    .action(async (options) => {
    const name = options.name || `Player_${Math.floor(Math.random() * 1000)}`;
    const client = new Client_1.PokerClient();
    client.connect(options.host);
    try {
        await client.joinRoom(options.room, name, { isGm: false });
    }
    catch {
        await client.createRoom(options.room, name, { isGm: true });
    }
    new renderer_1.CliRenderer(client, options.room);
});
program
    .command('slacker')
    .description('以摸鱼模式连接游戏')
    .option('-r, --room <roomId>', '房间ID', 'default')
    .option('-n, --name <name>', '玩家名称')
    .option('-h, --host <host>', '服务器地址', 'http://localhost:3000')
    .action(async (options) => {
    const name = options.name || `Player_${Math.floor(Math.random() * 1000)}`;
    const client = new Client_1.PokerClient();
    client.connect(options.host);
    try {
        await client.joinRoom(options.room, name, { isGm: false });
    }
    catch {
        await client.createRoom(options.room, name, { isGm: true });
    }
    new renderer_2.SlackerRenderer(client, options.room);
});
program
    .command('play')
    .description('进入大厅：选择本机局或联机局')
    .action(async (options) => {
    await new GameLauncher_1.GameLauncher().launchFromLobby();
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
    const bots = [];
    for (let i = 0; i < count; i++) {
        const name = count > 1 ? `${options.name}_${i + 1}` : options.name;
        const bot = new AiPlayer_1.AiPlayer({
            host: options.host,
            room: options.room,
            name,
            apiKey,
            apiBase,
            model,
            thinkMs: 1500 + Math.random() * 2000,
            soul: (0, soul_1.generateSoulProfile)(Math.floor(Math.random() * 1_000_000)),
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
