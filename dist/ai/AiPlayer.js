"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiPlayer = void 0;
const Client_1 = require("../network/Client");
const prompts_1 = require("./prompts");
class AiPlayer {
    client;
    options;
    processing = false;
    latestState = null;
    lastHandledTurnKey = null;
    constructor(options) {
        this.options = options;
        this.client = new Client_1.PokerClient();
    }
    async start() {
        this.client.connect(this.options.host);
        this.client.onConnected(() => {
            this.logInfo('已连接');
        });
        this.client.onState((state) => {
            this.latestState = state;
            this.handleState(state);
        });
        this.client.onError((msg) => {
            this.handleActionError(msg);
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
        this.logInfo(`已加入房间 ${this.options.room}`);
    }
    async handleState(state) {
        const me = state.players.find((p) => p.name === this.options.name);
        if (!me)
            return;
        const isNowMyTurn = state.currentPlayerId === me.id;
        const turnKey = this.buildTurnKey(state, me.id);
        if (isNowMyTurn && this.lastHandledTurnKey !== turnKey && !this.processing) {
            this.processing = true;
            this.lastHandledTurnKey = turnKey;
            // 稍微延迟，模拟思考时间
            const thinkMs = this.options.thinkMs ?? 2000 + Math.random() * 2000;
            await new Promise((r) => setTimeout(r, thinkMs));
            const decision = await this.decideAction(state, me.id);
            if (decision) {
                this.logInfo(`决策: ${decision.action}`);
                this.client.reportAiDecision(this.options.room, decision.log);
                this.executeAction(decision.action);
            }
            this.processing = false;
        }
    }
    async decideAction(state, myId) {
        const prompt = (0, prompts_1.buildPokerPrompt)(state, myId, this.options.soul);
        const apiKey = this.options.apiKey?.trim();
        const promptSummary = this.buildPromptSummary(prompt);
        if (!apiKey) {
            return this.buildFallbackDecision(state, myId, {
                promptSummary,
                requestMode: this.shouldUseResponses() ? 'responses' : 'chat-completions',
                durationMs: 0,
                rawOutput: '',
                errorMessage: '未配置 AI_API_KEY，已使用本地兜底策略',
            });
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.getRequestTimeoutMs());
        try {
            if (!this.shouldUseResponses()) {
                return this.requestViaChatCompletions(prompt, apiKey, state, myId, controller.signal, promptSummary);
            }
            const startedAt = Date.now();
            const response = await fetch(`${this.options.apiBase}/responses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: controller.signal,
                body: JSON.stringify(this.buildResponsesPayload(prompt)),
            });
            const durationMs = Date.now() - startedAt;
            if (response.ok) {
                const rawPayload = await response.text();
                const data = this.tryParseJson(rawPayload);
                const raw = this.extractResponsesText(data);
                if (raw) {
                    const parsed = this.parseDecisionEnvelope(raw);
                    const finalAction = this.normalizeAction(parsed.action, state, myId);
                    return {
                        action: finalAction,
                        log: {
                            model: this.options.model,
                            requestMode: 'responses',
                            durationMs,
                            promptSummary,
                            reasoningSummary: parsed.reasoning,
                            speech: parsed.speech,
                            rawOutput: raw,
                            finalAction,
                            usedFallback: !parsed.action || parsed.action !== finalAction,
                        },
                    };
                }
                this.logError('Responses API 返回空文本，改用兜底动作');
                return this.buildFallbackDecision(state, myId, {
                    promptSummary,
                    requestMode: 'responses',
                    durationMs,
                    rawOutput: rawPayload,
                    errorMessage: 'Responses API 返回空文本',
                });
            }
            if (response.status === 404 || response.status === 400) {
                return this.requestViaChatCompletions(prompt, apiKey, state, myId, controller.signal, promptSummary);
            }
            if (!response.ok) {
                const text = await response.text();
                this.logError(`API 错误: ${response.status}`, text);
                return this.buildFallbackDecision(state, myId, {
                    promptSummary,
                    requestMode: 'responses',
                    durationMs,
                    rawOutput: text,
                    errorMessage: `Responses API 错误 ${response.status}`,
                });
            }
            return this.buildFallbackDecision(state, myId, {
                promptSummary,
                requestMode: 'responses',
                durationMs,
                rawOutput: '',
                errorMessage: 'Responses API 未返回可用结果',
            });
        }
        catch (err) {
            this.logError('请求失败:', err);
            return this.buildFallbackDecision(state, myId, {
                promptSummary,
                requestMode: this.shouldUseResponses() ? 'responses' : 'chat-completions',
                durationMs: 0,
                rawOutput: '',
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        }
        finally {
            clearTimeout(timeout);
        }
    }
    shouldUseResponses() {
        return this.isXbaiProvider() && /^gpt-5/i.test(this.options.model);
    }
    isXbaiProvider() {
        return this.options.apiBase.includes('xbai.top');
    }
    isKimiProvider() {
        return this.options.apiBase.includes('api.moonshot.cn') || this.options.apiBase.includes('api.kimi.com/coding/v1');
    }
    getRequestTimeoutMs() {
        const configured = Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '', 10);
        if (Number.isFinite(configured) && configured > 0) {
            return configured;
        }
        if (this.shouldUseResponses()) {
            return 30000;
        }
        if (this.isKimiProvider()) {
            return 12000;
        }
        return 12000;
    }
    getChatMaxTokens() {
        const configured = Number.parseInt(process.env.AI_CHAT_MAX_TOKENS || '', 10);
        if (Number.isFinite(configured) && configured > 0) {
            return configured;
        }
        return this.isKimiProvider() ? 64 : 64;
    }
    buildResponsesPayload(prompt) {
        const basePayload = {
            model: this.options.model,
            instructions: '你是一个德州扑克 AI。请返回包含 reasoning、action、speech 的 JSON。',
            input: prompt,
            max_output_tokens: this.getVisibleOutputMaxTokens(),
            reasoning: { effort: 'minimal' },
        };
        if (!this.isXbaiProvider()) {
            basePayload.temperature = 0.3;
        }
        return basePayload;
    }
    buildChatCompletionsPayload(prompt) {
        const payload = {
            model: this.options.model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个德州扑克 AI。你必须只返回 JSON：{"reasoning":"","action":"","speech":""}。',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            max_tokens: this.getVisibleOutputMaxTokens(),
        };
        if (!this.isKimiProvider()) {
            payload.temperature = 0.2;
        }
        if (this.isKimiProvider() && /^kimi-/i.test(this.options.model)) {
            payload.thinking = { type: 'disabled' };
        }
        return payload;
    }
    extractResponsesText(data) {
        if (typeof data?.output_text === 'string' && data.output_text.trim()) {
            return data.output_text.trim();
        }
        const output = Array.isArray(data?.output) ? data.output : [];
        for (const item of output) {
            if (item?.type !== 'message' || !Array.isArray(item.content)) {
                continue;
            }
            for (const content of item.content) {
                if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
                    return content.text.trim();
                }
            }
        }
        return '';
    }
    async requestViaChatCompletions(prompt, apiKey, state, myId, signal, promptSummary) {
        const startedAt = Date.now();
        try {
            const response = await fetch(`${this.options.apiBase}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                signal,
                body: JSON.stringify(this.buildChatCompletionsPayload(prompt)),
            });
            const durationMs = Date.now() - startedAt;
            if (!response.ok) {
                const text = await response.text();
                this.logError(`Chat API 错误: ${response.status}`, text);
                return this.buildFallbackDecision(state, myId, {
                    promptSummary,
                    requestMode: 'chat-completions',
                    durationMs,
                    rawOutput: text,
                    errorMessage: `Chat API 错误 ${response.status}`,
                });
            }
            const text = await response.text();
            const raw = this.extractChatCompletionTextFromPayload(text);
            const parsed = raw ? this.parseDecisionEnvelope(raw) : { action: null, reasoning: '', speech: '' };
            const finalAction = this.normalizeAction(parsed.action, state, myId);
            if (raw) {
                return {
                    action: finalAction,
                    log: {
                        model: this.options.model,
                        requestMode: 'chat-completions',
                        durationMs,
                        promptSummary,
                        reasoningSummary: parsed.reasoning,
                        speech: parsed.speech,
                        rawOutput: raw,
                        finalAction,
                        usedFallback: !parsed.action || parsed.action !== finalAction,
                    },
                };
            }
            this.logError('Chat API 未返回可解析动作:', text);
            return this.buildFallbackDecision(state, myId, {
                promptSummary,
                requestMode: 'chat-completions',
                durationMs,
                rawOutput: text,
                errorMessage: 'Chat API 未返回可解析动作',
            });
        }
        catch (err) {
            this.logError('Chat 请求失败:', err);
            return this.buildFallbackDecision(state, myId, {
                promptSummary,
                requestMode: 'chat-completions',
                durationMs: Date.now() - startedAt,
                rawOutput: '',
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }
    buildFallbackDecision(state, myId, input) {
        const action = this.fallbackAction(state, myId);
        return {
            action,
            log: {
                model: this.options.model,
                requestMode: input.requestMode,
                durationMs: input.durationMs,
                promptSummary: input.promptSummary,
                reasoningSummary: '模型没有返回可解析的思考内容，已切换到本地兜底策略。',
                speech: '...',
                rawOutput: input.rawOutput,
                finalAction: action,
                usedFallback: true,
                errorMessage: input.errorMessage,
            },
        };
    }
    buildPromptSummary(prompt) {
        return prompt
            .split('\n')
            .filter((line) => line.trim())
            .slice(0, 10)
            .join(' | ')
            .slice(0, 320);
    }
    getVisibleOutputMaxTokens() {
        const configured = Number.parseInt(process.env.AI_VISIBLE_OUTPUT_MAX_TOKENS || '', 10);
        if (Number.isFinite(configured) && configured > 0) {
            return configured;
        }
        return 220;
    }
    extractChatCompletionTextFromPayload(payload) {
        const direct = this.extractChatCompletionText(this.tryParseJson(payload));
        if (direct) {
            return direct;
        }
        return this.extractSseChatCompletionText(payload);
    }
    tryParseJson(payload) {
        try {
            return JSON.parse(payload);
        }
        catch {
            return null;
        }
    }
    extractChatCompletionText(data) {
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
            return content.trim();
        }
        if (Array.isArray(content)) {
            return content
                .map((item) => {
                if (typeof item === 'string') {
                    return item;
                }
                if (item?.type === 'text' && typeof item.text === 'string') {
                    return item.text;
                }
                return '';
            })
                .join(' ')
                .trim();
        }
        return '';
    }
    extractSseChatCompletionText(payload) {
        if (!payload.includes('data:')) {
            return '';
        }
        let content = '';
        const lines = payload.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') {
                continue;
            }
            const data = this.tryParseJson(trimmed.slice(6));
            const delta = data?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
                content += delta;
            }
        }
        return content.trim();
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
    parseDecisionEnvelope(raw) {
        const jsonCandidate = this.extractJsonObject(raw);
        const parsed = jsonCandidate ? this.tryParseJson(jsonCandidate) : this.tryParseJson(raw);
        if (parsed && typeof parsed === 'object') {
            const actionText = typeof parsed.action === 'string' ? parsed.action.trim() : '';
            const reasoningText = typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '';
            const speechText = typeof parsed.speech === 'string' ? parsed.speech.trim() : '';
            return {
                action: this.parseAction(actionText),
                reasoning: reasoningText,
                speech: speechText,
            };
        }
        return {
            action: this.parseAction(raw),
            reasoning: raw.trim(),
            speech: '...',
        };
    }
    extractJsonObject(raw) {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            return trimmed;
        }
        const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeFenceMatch?.[1]) {
            return codeFenceMatch[1].trim();
        }
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return trimmed.slice(firstBrace, lastBrace + 1);
        }
        return '';
    }
    normalizeAction(rawAction, state, myId) {
        const me = state.players.find((player) => player.id === myId);
        if (!me) {
            return 'fold';
        }
        const fallback = this.fallbackAction(state, myId);
        if (!rawAction) {
            return fallback;
        }
        const [kind, amountText] = rawAction.trim().toLowerCase().split(/\s+/, 2);
        const toCall = Math.max(0, state.currentBet - me.bet);
        const maxTotalBet = me.bet + me.chips;
        const minRaiseTo = state.currentBet + 1;
        switch (kind) {
            case 'fold':
                return 'fold';
            case 'check':
                return toCall === 0 ? 'check' : fallback;
            case 'call':
                return toCall > 0 ? 'call' : 'check';
            case 'raise': {
                if (maxTotalBet <= state.currentBet) {
                    return fallback;
                }
                const parsedAmount = Number.parseInt(amountText || '', 10);
                if (!Number.isFinite(parsedAmount)) {
                    return fallback;
                }
                const legalAmount = Math.max(minRaiseTo, Math.min(parsedAmount, maxTotalBet));
                if (legalAmount <= state.currentBet) {
                    return fallback;
                }
                return `raise ${legalAmount}`;
            }
            default:
                return fallback;
        }
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
    handleActionError(message) {
        this.logError('错误:', message);
        const state = this.latestState;
        if (!state) {
            this.processing = false;
            this.lastHandledTurnKey = null;
            return;
        }
        const me = state.players.find((player) => player.name === this.options.name);
        if (!me) {
            this.processing = false;
            this.lastHandledTurnKey = null;
            return;
        }
        const stillMyTurn = state.currentPlayerId === me.id;
        if (!stillMyTurn) {
            this.processing = false;
            this.lastHandledTurnKey = null;
            return;
        }
        const recoverableErrors = [
            '当前有下注，不能过牌',
            '加注金额必须大于当前下注',
            '筹码不足',
        ];
        if (recoverableErrors.some((errorText) => message.includes(errorText))) {
            const safeAction = this.fallbackAction(state, me.id);
            this.logInfo(`非法动作已拦截，改用兜底动作: ${safeAction}`);
            this.processing = false;
            this.executeAction(safeAction);
            return;
        }
        this.processing = false;
        this.lastHandledTurnKey = null;
    }
    buildTurnKey(state, myId) {
        const me = state.players.find((player) => player.id === myId);
        const board = state.communityCards.map((card) => card.display).join(',');
        const playerBets = state.players
            .map((player) => `${player.id}:${player.bet}:${player.status}:${player.chips}`)
            .join('|');
        return [
            state.phase,
            state.currentPlayerId ?? 'none',
            board,
            state.pot,
            state.currentBet,
            me?.bet ?? 0,
            me?.chips ?? 0,
            playerBets,
        ].join('::');
    }
    executeAction(actionStr) {
        const parts = actionStr.split(' ');
        const action = parts[0];
        const amount = parts[1] ? parseInt(parts[1], 10) : undefined;
        this.client.action(this.options.room, action, amount);
    }
    logInfo(message) {
        if (this.options.quiet)
            return;
        console.log(`[AI ${this.options.name}] ${message}`);
    }
    logError(message, detail) {
        if (this.options.quiet) {
            return;
        }
        if (detail === undefined) {
            console.error(`[AI ${this.options.name}] ${message}`);
            return;
        }
        console.error(`[AI ${this.options.name}] ${message}`, detail);
    }
    stop() {
        this.client.disconnect();
    }
}
exports.AiPlayer = AiPlayer;
