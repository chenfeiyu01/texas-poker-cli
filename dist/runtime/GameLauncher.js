"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameLauncher = void 0;
const AiPlayer_1 = require("../ai/AiPlayer");
const soul_1 = require("../ai/soul");
const Client_1 = require("../network/Client");
const renderer_1 = require("../ui/cli/renderer");
const renderer_2 = require("../ui/lobby/renderer");
const renderer_3 = require("../ui/slacker/renderer");
const serverBootstrap_1 = require("./serverBootstrap");
class GameLauncher {
    bots = [];
    shutdownHookInstalled = false;
    async launchFromLobby() {
        const lobby = new renderer_2.LobbyRenderer();
        const config = await lobby.run();
        if (!config) {
            return;
        }
        await this.launch(config);
    }
    async launch(config) {
        if (config.mode === 'local') {
            await this.ensureLocalServer(config.host);
        }
        const client = new Client_1.PokerClient();
        client.connect(config.host);
        if (config.mode === 'online-join') {
            await client.joinRoom(config.roomId, config.playerName, { isGm: false });
        }
        else {
            await client.createRoom(config.roomId, config.playerName, { isGm: config.isGm });
            await this.spawnBots(config);
            if (config.autoStart) {
                setTimeout(() => {
                    client.startGame(config.roomId);
                }, 1000);
            }
        }
        this.installShutdownHook();
        if (config.uiMode === 'slacker') {
            new renderer_3.SlackerRenderer(client, config.roomId);
            return;
        }
        new renderer_1.CliRenderer(client, config.roomId);
    }
    async ensureLocalServer(host) {
        const port = this.extractPort(host);
        const hasServer = await (0, serverBootstrap_1.isPortOpen)(port);
        if (!hasServer) {
            console.log(`本地端口 ${port} 无服务器，正在自动启动...`);
            await (0, serverBootstrap_1.startLocalServer)(port);
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
    }
    extractPort(host) {
        try {
            const url = new URL(host);
            return url.port ? parseInt(url.port, 10) : 3000;
        }
        catch {
            return 3000;
        }
    }
    async spawnBots(config) {
        if (config.aiCount <= 0) {
            return;
        }
        const apiKey = process.env.AI_API_KEY;
        const apiBase = process.env.AI_BASE_URL || 'https://api.xbai.top/v1';
        const model = process.env.AI_MODEL || 'gpt-5-nano';
        if (!apiKey) {
            console.warn('未设置 AI_API_KEY，跳过 AI 自动加入。');
            return;
        }
        for (let index = 0; index < config.aiCount; index++) {
            const soul = (0, soul_1.generateSoulProfile)(Math.floor(Math.random() * 1_000_000));
            const name = this.buildBotName(soul.archetypeName, index + 1);
            const bot = new AiPlayer_1.AiPlayer({
                host: config.host,
                room: config.roomId,
                name,
                apiKey,
                apiBase,
                model,
                thinkMs: 1200 + Math.random() * 2400,
                soul,
            });
            this.bots.push(bot);
            await bot.start();
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
    }
    buildBotName(archetypeName, index) {
        return `${archetypeName}AI_${index}`;
    }
    installShutdownHook() {
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
exports.GameLauncher = GameLauncher;
