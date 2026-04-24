"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CliRenderer = void 0;
const blessed_1 = __importDefault(require("blessed"));
class CliRenderer {
    screen;
    tableBox;
    handBox;
    logBox;
    actionBox;
    actionList;
    actionHintBox;
    statusBox;
    promptBox;
    client;
    roomId;
    playerId = null;
    currentState = null;
    previousState = null;
    logs = [];
    currentActions = [];
    selectedActionIndex = 0;
    lastActionMarkerSeen = '';
    lastResolvedHandSeen = 0;
    pendingActionLock = false;
    constructor(client, roomId) {
        this.client = client;
        this.roomId = roomId;
        this.screen = blessed_1.default.screen({
            smartCSR: true,
            title: 'Texas Poker',
            fullUnicode: true,
        });
        this.tableBox = blessed_1.default.box({
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
        this.handBox = blessed_1.default.box({
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
        this.statusBox = blessed_1.default.box({
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
        this.actionBox = blessed_1.default.box({
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
        this.actionList = blessed_1.default.list({
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
        this.actionHintBox = blessed_1.default.box({
            parent: this.actionBox,
            bottom: 0,
            left: 1,
            width: '100%-2',
            height: '35%-1',
            tags: true,
        });
        this.logBox = blessed_1.default.box({
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
        this.promptBox = blessed_1.default.box({
            parent: this.screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            border: { type: 'line' },
            tags: true,
        });
        this.client.onState((state) => {
            this.pendingActionLock = false;
            this.processStateEvents(this.currentState, state);
            this.previousState = this.currentState;
            this.currentState = state;
            this.render();
        });
        this.client.onConnected((id) => {
            this.playerId = id;
            this.log('已连接到牌桌');
        });
        this.client.onError((msg) => {
            this.pendingActionLock = false;
            this.log('错误: ' + msg);
        });
        this.client.onTableTalk((playerName, speech) => {
            this.log(`${playerName} 说：${speech}`);
        });
        this.actionList.on('select', (_, index) => {
            this.selectedActionIndex = Number(index);
            const action = this.currentActions[this.selectedActionIndex];
            this.runAction(action);
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
                this.runAction(action);
            }
        });
        this.screen.key(['p'], () => {
            this.showProfilePrompt();
        });
        this.screen.key(['s'], () => {
            this.triggerNamedAction('开始游戏');
            this.triggerNamedAction('开始下一手');
        });
        this.renderActionPanel();
        this.renderPrompt();
        this.actionList.focus();
        this.screen.render();
    }
    render() {
        const state = this.currentState;
        if (!state)
            return;
        this.renderTable(state);
        this.renderHand(state);
        this.renderStatus(state);
        this.renderActionPanel();
        this.renderPrompt();
        this.screen.render();
    }
    processStateEvents(previous, current) {
        this.logRecentActions(current);
        this.logPhaseTransition(previous, current);
        this.logShowdown(current);
    }
    logRecentActions(state) {
        const actions = state.session?.recentActions ?? [];
        const unseenActions = actions.filter((action) => this.buildActionMarker(action.handNumber, action.sequence) > this.lastActionMarkerSeen);
        for (const action of unseenActions) {
            const actionText = this.describeAction(action.action, action.declaredAmount);
            const thinkText = action.thinkTimeMs > 0 ? `，思考 ${Math.round(action.thinkTimeMs / 100) / 10}s` : '';
            this.log(`${action.playerName} ${actionText}${thinkText}`);
            this.lastActionMarkerSeen = this.buildActionMarker(action.handNumber, action.sequence);
        }
    }
    logPhaseTransition(previous, current) {
        if (!previous) {
            return;
        }
        if (previous.phase !== current.phase) {
            const phaseName = this.getPhaseName(current.phase);
            if (current.phase === 'flop') {
                this.log(`翻牌：${current.communityCards.map((card) => card.display).join(' ')}`);
            }
            else if (current.phase === 'turn') {
                const turnCard = current.communityCards[current.communityCards.length - 1];
                this.log(`转牌：${turnCard?.display ?? '未知'}`);
            }
            else if (current.phase === 'river') {
                const riverCard = current.communityCards[current.communityCards.length - 1];
                this.log(`河牌：${riverCard?.display ?? '未知'}`);
            }
            else if (current.phase === 'preflop') {
                this.log('新一手开始，底牌已发出');
            }
            else {
                this.log(`阶段切换：${phaseName}`);
            }
        }
        if (previous.currentPlayerId !== current.currentPlayerId && current.currentPlayerId) {
            const currentPlayer = current.players.find((player) => player.id === current.currentPlayerId);
            if (currentPlayer?.id === this.playerId) {
                this.log('轮到你行动了');
            }
        }
    }
    logShowdown(state) {
        const handNumber = state.session?.handNumber ?? 0;
        if (state.phase !== 'ended' || !state.winnerIds || handNumber <= this.lastResolvedHandSeen) {
            return;
        }
        const winners = state.winnerIds
            .map((winnerId) => state.players.find((player) => player.id === winnerId)?.name ?? winnerId)
            .join('、');
        this.log(`本手结束：${winners} 赢下底池`);
        if (state.handResults) {
            for (const player of state.players) {
                const result = state.handResults[player.id];
                if (result) {
                    this.log(`${player.name} 的牌型：${result}`);
                }
            }
        }
        this.lastResolvedHandSeen = handNumber;
    }
    renderTable(state) {
        const lines = [];
        const community = state.communityCards.length > 0
            ? state.communityCards.map((card) => this.renderCard(card.display)).join(' ')
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
    renderHand(state) {
        const me = this.getMe(state);
        const lines = [];
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
    renderStatus(state) {
        const me = this.getMe(state);
        const isMyTurn = state.currentPlayerId === this.playerId;
        const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId);
        const toCall = me ? Math.max(0, state.currentBet - me.bet) : 0;
        const phaseNames = {
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
            `  已开公共牌：${state.communityCards.length}/5`,
        ];
        this.statusBox.setContent(lines.join('\n'));
    }
    renderActionPanel() {
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
        }
        else {
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
    renderPrompt() {
        const state = this.currentState;
        const me = state ? this.getMe(state) : null;
        const isMyTurn = state?.currentPlayerId === this.playerId;
        const currentPlayer = state?.players.find((player) => player.id === state.currentPlayerId);
        const toCall = me && state ? Math.max(0, state.currentBet - me.bet) : 0;
        const text = !state
            ? '  正在连接牌桌...'
            : state.phase === 'ended' && me?.isHost
                ? '  这一手已结算。你是房主，可在右下角选择“开始下一手”。'
                : state.phase === 'ended'
                    ? '  这一手已结算。现在可以先看摊牌信息，等待房主开始下一手。'
                    : isMyTurn
                        ? `  轮到你了：请在右下角选择动作。当前需要补 ${toCall}。按 p 可查看玩家简介。`
                        : `  当前轮到 ${currentPlayer?.name ?? '其他玩家'}。看左下角日志可追踪别人刚做了什么。`;
        this.promptBox.setContent(text);
    }
    buildActionOptions() {
        const state = this.currentState;
        const me = state ? this.getMe(state) : null;
        if (!state || !me)
            return [];
        const isMyTurn = state.currentPlayerId === this.playerId;
        const toCall = Math.max(0, state.currentBet - me.bet);
        const options = [];
        if ((state.phase === 'waiting' || state.phase === 'ended') && me.isHost) {
            options.push({
                label: state.phase === 'ended' ? '开始下一手' : '开始游戏',
                hint: state.phase === 'ended'
                    ? '上一手已经结算完毕，由房主决定何时开始下一手。'
                    : '房主可以在这里直接开始这一手牌。',
                run: () => {
                    this.client.startGame(this.roomId);
                    this.log(state.phase === 'ended' ? '房主开始了下一手' : '开始游戏');
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
        }
        else {
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
    triggerNamedAction(label) {
        const action = this.currentActions.find((item) => item.label === label);
        this.runAction(action);
    }
    runAction(action) {
        if (!action || this.pendingActionLock) {
            return;
        }
        this.pendingActionLock = true;
        action.run();
    }
    showRaisePrompt() {
        const state = this.currentState;
        const me = state ? this.getMe(state) : null;
        if (!state || !me)
            return;
        const minimum = Math.max(state.currentBet + 1, me.bet + 1);
        const prompt = blessed_1.default.prompt({
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
            }
            else {
                this.client.action(this.roomId, 'raise', amount);
                this.log(`操作: 加注到 ${amount}`);
            }
            this.renderActionPanel();
            this.renderPrompt();
            this.screen.render();
        });
    }
    getVisibleProfiles() {
        if (!this.currentState?.session)
            return [];
        if (this.currentState.session.viewerRole === 'gm' && this.currentState.session.gmProfiles) {
            return this.currentState.session.gmProfiles;
        }
        return this.currentState.session.publicProfiles;
    }
    showProfilePrompt() {
        const profiles = this.getVisibleProfiles();
        if (profiles.length === 0) {
            this.log('当前还没有可查看的玩家简介');
            return;
        }
        const list = blessed_1.default.list({
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
    showProfileCard(playerName) {
        const profile = this.getVisibleProfiles().find((item) => item.playerName === playerName);
        if (!profile)
            return;
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
        const message = blessed_1.default.message({
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
    getMe(state) {
        return state.players.find((player) => player.id === this.playerId) ?? null;
    }
    mapStatus(status) {
        const map = {
            waiting: '等待',
            active: '进行中',
            folded: '已弃牌',
            'all-in': 'All-in',
        };
        return map[status] || status;
    }
    renderCard(card) {
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        const isRed = suit === '♥' || suit === '♦';
        const color = isRed ? 'red-fg' : 'cyan-fg';
        return `{bold}[ ${rank} {${color}}${suit}{/${color}} ]{/bold}`;
    }
    isGmProfile(profile) {
        return 'privateSummary' in profile;
    }
    log(msg) {
        this.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (this.logs.length > 100)
            this.logs.shift();
        this.logBox.setContent(this.logs.join('\n'));
        this.logBox.setScrollPerc(100);
    }
    describeAction(action, amount) {
        if (action === 'fold')
            return '弃牌';
        if (action === 'check')
            return '过牌';
        if (action === 'call')
            return '跟注';
        if (action === 'raise')
            return `加注到 ${amount ?? '?'}`;
        return action;
    }
    getPhaseName(phase) {
        const map = {
            waiting: '等待中',
            preflop: '翻牌前',
            flop: '翻牌圈',
            turn: '转牌圈',
            river: '河牌圈',
            showdown: '摊牌',
            ended: '结算中',
        };
        return map[phase] || phase;
    }
    buildActionMarker(handNumber, sequence) {
        return `${String(handNumber).padStart(6, '0')}-${String(sequence).padStart(6, '0')}`;
    }
}
exports.CliRenderer = CliRenderer;
