"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiPlayer = void 0;
const Client_1 = require("../network/Client");
const prompts_1 = require("./prompts");
class AiPlayer {
    client;
    options;
    isMyTurn = false;
    processing = false;
    constructor(options) {
        this.options = options;
        this.client = new Client_1.PokerClient();
    }
    async start() {
        this.client.connect(this.options.host);
        this.client.onConnected(() => {
            if (!this.options.quiet) {
                console.log(`[AI ${this.options.name}] 已连接`);
            }
        });
        this.client.onState((state) => {
            this.handleState(state);
        });
        this.client.onError((msg) => {
            if (!this.options.quiet) {
                console.error(`[AI ${this.options.name}] 错误:`, msg);
            }
        });
        try {
            await this.client.joinRoom(this.options.room, this.options.name, {
                isAi: true,
                isGm: false,
                soul: this.options.soul,
            });
        }
        catch {
            await this.client.createRoom(this.options.room, this.options.name, {
                isAi: true,
                isGm: false,
                soul: this.options.soul,
            });
        }
        if (!this.options.quiet) {
            console.log(`[AI ${this.options.name}] 已加入房间 ${this.options.room}`);
        }
    }
    async handleState(state) {
        const me = state.players.find((p) => p.name === this.options.name);
        if (!me)
            return;
        const isNowMyTurn = state.currentPlayerId === me.id;
        if (isNowMyTurn && !this.isMyTurn && !this.processing) {
            this.isMyTurn = true;
            this.processing = true;
            // 稍微延迟，模拟思考时间
            const thinkMs = this.options.thinkMs ?? 2000 + Math.random() * 2000;
            await new Promise((r) => setTimeout(r, thinkMs));
            const action = await this.decideAction(state, me.id);
            if (action) {
                if (!this.options.quiet) {
                    console.log(`[AI ${this.options.name}] 决策: ${action}`);
                }
                this.executeAction(action);
            }
            this.processing = false;
        }
        if (!isNowMyTurn) {
            this.isMyTurn = false;
        }
    }
    async decideAction(state, myId) {
        const prompt = (0, prompts_1.buildPokerPrompt)(state, myId, this.options.soul);
        const apiKey = this.options.apiKey?.trim();
        if (!apiKey) {
            return this.fallbackAction(state, myId);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            if (this.shouldUseChatCompletions()) {
                return this.requestViaChatCompletions(prompt, apiKey, state, myId, controller.signal);
            }
            const response = await fetch(`${this.options.apiBase}/responses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model: this.options.model,
                    input: prompt,
                    temperature: 0.3,
                    max_output_tokens: 20,
                }),
            });
            if (response.ok) {
                const data = await response.json();
                const raw = data.output_text?.trim() || data.choices?.[0]?.message?.content?.trim() || '';
                if (raw) {
                    return this.parseAction(raw);
                }
            }
            if (response.status === 404 || response.status === 400) {
                return this.requestViaChatCompletions(prompt, apiKey, state, myId, controller.signal);
            }
            if (!response.ok) {
                const text = await response.text();
                if (!this.options.quiet) {
                    console.error(`[AI ${this.options.name}] API 错误:`, response.status, text);
                }
                return this.fallbackAction(state, myId);
            }
            return this.fallbackAction(state, myId);
        }
        catch (err) {
            if (!this.options.quiet) {
                console.error(`[AI ${this.options.name}] 请求失败:`, err);
            }
            return this.fallbackAction(state, myId);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    shouldUseChatCompletions() {
        return this.options.apiBase.includes('xbai.top');
    }
    async requestViaChatCompletions(prompt, apiKey, state, myId, signal) {
        try {
            const response = await fetch(`${this.options.apiBase}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                signal,
                body: JSON.stringify({
                    model: this.options.model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    temperature: 0.3,
                    max_tokens: 32,
                }),
            });
            if (!response.ok) {
                const text = await response.text();
                if (!this.options.quiet) {
                    console.error(`[AI ${this.options.name}] Chat API 错误:`, response.status, text);
                }
                return this.fallbackAction(state, myId);
            }
            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content?.trim() || '';
            return raw ? this.parseAction(raw) ?? this.fallbackAction(state, myId) : this.fallbackAction(state, myId);
        }
        catch (err) {
            if (!this.options.quiet) {
                console.error(`[AI ${this.options.name}] Chat 请求失败:`, err);
            }
            return this.fallbackAction(state, myId);
        }
    }
    parseAction(raw) {
        const lower = raw.toLowerCase();
        if (lower.includes('fold'))
            return 'fold';
        if (lower.includes('check'))
            return 'check';
        if (lower.includes('call'))
            return 'call';
        const raiseMatch = lower.match(/raise\s+(\d+)/);
        if (raiseMatch) {
            return `raise ${raiseMatch[1]}`;
        }
        // 兜底：如果输出不标准，默认 call
        return 'call';
    }
    fallbackAction(state, myId) {
        const me = state.players.find((p) => p.id === myId);
        if (!me)
            return 'fold';
        const toCall = state.currentBet - me.bet;
        if (toCall === 0)
            return 'check';
        if (toCall > me.chips * 0.3)
            return 'fold';
        return 'call';
    }
    executeAction(actionStr) {
        const parts = actionStr.split(' ');
        const action = parts[0];
        const amount = parts[1] ? parseInt(parts[1], 10) : undefined;
        this.client.action(this.options.room, action, amount);
    }
    stop() {
        this.client.disconnect();
    }
}
exports.AiPlayer = AiPlayer;
