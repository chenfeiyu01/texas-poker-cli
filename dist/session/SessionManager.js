"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const soul_1 = require("../ai/soul");
class SessionManager {
    handNumber = 0;
    actionSequence = 0;
    recentActions = [];
    recentHands = [];
    playerStats = new Map();
    handStartChips = new Map();
    registerPlayer(playerId, playerName, meta = {}) {
        const existing = this.playerStats.get(playerId);
        if (existing) {
            existing.playerName = playerName;
            existing.isAi = meta.isAi ?? existing.isAi;
            existing.isGm = meta.isGm ?? existing.isGm;
            existing.soul = meta.soul ?? existing.soul;
            return;
        }
        this.playerStats.set(playerId, {
            playerId,
            playerName,
            isAi: meta.isAi ?? false,
            isGm: meta.isGm ?? false,
            soul: meta.soul,
            handsPlayed: 0,
            handsWon: 0,
            netChips: 0,
            totalActions: 0,
            folds: 0,
            checks: 0,
            calls: 0,
            raises: 0,
            totalThinkMs: 0,
            recentNetChanges: [],
            recentEvents: [],
        });
    }
    getHandNumber() {
        return this.handNumber;
    }
    startHand(state) {
        this.handNumber += 1;
        this.actionSequence = 0;
        this.handStartChips.clear();
        for (const player of state.players) {
            this.registerPlayer(player.id, player.name, {
                isAi: player.isAi,
                isGm: player.isGm,
            });
            const stats = this.playerStats.get(player.id);
            if (!stats)
                continue;
            stats.handsPlayed += 1;
            this.handStartChips.set(player.id, player.chips);
        }
    }
    recordAction(input) {
        const stats = this.playerStats.get(input.playerId);
        if (stats) {
            stats.totalActions += 1;
            stats.totalThinkMs += input.thinkTimeMs;
            if (input.action === 'fold')
                stats.folds += 1;
            if (input.action === 'check')
                stats.checks += 1;
            if (input.action === 'call')
                stats.calls += 1;
            if (input.action === 'raise')
                stats.raises += 1;
        }
        const record = {
            handNumber: this.handNumber,
            sequence: ++this.actionSequence,
            phase: input.phase,
            playerId: input.playerId,
            playerName: input.playerName,
            action: input.action,
            declaredAmount: input.declaredAmount,
            totalBet: input.totalBet,
            potAfter: input.potAfter,
            thinkTimeMs: input.thinkTimeMs,
            timestamp: Date.now(),
        };
        this.recentActions.push(record);
        if (this.recentActions.length > 80) {
            this.recentActions.shift();
        }
    }
    finishHand(state) {
        const netChanges = {};
        for (const player of state.players) {
            const startChips = this.handStartChips.get(player.id) ?? player.chips;
            const delta = player.chips - startChips;
            netChanges[player.id] = delta;
            const stats = this.playerStats.get(player.id);
            if (!stats)
                continue;
            stats.netChips += delta;
            stats.recentNetChanges.push(delta);
            if (stats.recentNetChanges.length > 8) {
                stats.recentNetChanges.shift();
            }
            if (delta > 0) {
                stats.handsWon += 1;
            }
        }
        const winnerNames = (state.winnerIds ?? [])
            .map((winnerId) => state.players.find((player) => player.id === winnerId)?.name ?? winnerId);
        const headline = winnerNames.length > 0
            ? `第 ${this.handNumber} 手由 ${winnerNames.join('、')} 收下底池`
            : `第 ${this.handNumber} 手结束`;
        this.recentHands.push({
            handNumber: this.handNumber,
            winners: winnerNames,
            netChanges,
            headline,
        });
        if (this.recentHands.length > 12) {
            this.recentHands.shift();
        }
        for (const player of state.players) {
            const stats = this.playerStats.get(player.id);
            if (!stats)
                continue;
            const delta = netChanges[player.id] ?? 0;
            const eventLine = delta > 0
                ? `第 ${this.handNumber} 手净赢 ${delta}`
                : delta < 0
                    ? `第 ${this.handNumber} 手净输 ${Math.abs(delta)}`
                    : `第 ${this.handNumber} 手收支持平`;
            stats.recentEvents.push(eventLine);
            if (stats.recentEvents.length > 10) {
                stats.recentEvents.shift();
            }
        }
    }
    buildView(forPlayerId) {
        const viewer = this.playerStats.get(forPlayerId);
        const viewerRole = viewer?.isGm ? 'gm' : viewer?.isAi ? 'ai' : 'player';
        const publicProfiles = [...this.playerStats.values()].map((stats) => this.buildPublicProfile(stats));
        const recentActions = this.recentActions.slice(-16);
        const recentHands = this.recentHands.slice(-6);
        return {
            handNumber: this.handNumber,
            recentActions,
            recentHands,
            publicProfiles,
            gmProfiles: viewerRole === 'gm'
                ? [...this.playerStats.values()].map((stats) => this.buildGmProfile(stats))
                : undefined,
            privateMemory: viewerRole === 'ai' && viewer
                ? this.buildPrivateMemory(viewer)
                : undefined,
            viewerRole,
        };
    }
    buildPublicProfile(stats) {
        const raisedOften = stats.raises >= Math.max(2, Math.ceil(stats.totalActions * 0.28));
        const foldsOften = stats.folds >= Math.max(2, Math.ceil(stats.totalActions * 0.35));
        const avgThinkTime = stats.totalActions > 0 ? Math.round(stats.totalThinkMs / stats.totalActions) : 0;
        const revealedTraits = [];
        if (stats.totalActions < 3) {
            revealedTraits.push('风格尚未明朗');
        }
        else {
            if (raisedOften)
                revealedTraits.push('偏主动');
            if (foldsOften)
                revealedTraits.push('较谨慎');
            if (avgThinkTime >= 2500)
                revealedTraits.push('出手偏慢');
            if (stats.netChips > 80)
                revealedTraits.push('最近手风不错');
            if (stats.netChips < -80)
                revealedTraits.push('最近有些失意');
        }
        const summary = stats.totalActions < 3
            ? '目前公开样本还不多，只能看出他在试探桌面节奏。'
            : [
                raisedOften ? '出手时更愿意主动施压' : '更常顺着局势行动',
                foldsOften ? '承压时容易收缩' : '面对压力不算太退让',
                avgThinkTime >= 2500 ? '动作前会明显多想一会儿' : '节奏相对干脆',
            ].join('，') + '。';
        const recentNote = stats.recentEvents[stats.recentEvents.length - 1] ?? '还没有足够的近期印象。';
        return {
            playerId: stats.playerId,
            playerName: stats.playerName,
            title: stats.isAi ? 'AI 玩家' : '玩家',
            summary,
            recentNote,
            revealedTraits,
            handsPlayed: stats.handsPlayed,
            netChips: stats.netChips,
        };
    }
    buildGmProfile(stats) {
        const publicProfile = this.buildPublicProfile(stats);
        return {
            ...publicProfile,
            soul: stats.soul,
            soulTags: stats.soul ? (0, soul_1.describeSoulTraits)(stats.soul.traits) : [],
            privateSummary: this.buildPrivateSummary(stats),
        };
    }
    buildPrivateMemory(stats) {
        const playerReads = [...this.playerStats.values()]
            .filter((other) => other.playerId !== stats.playerId)
            .map((other) => ({
            playerId: other.playerId,
            playerName: other.playerName,
            summary: this.buildOpponentRead(other),
        }));
        return {
            soul: stats.soul,
            sessionSummary: this.buildPrivateSummary(stats),
            recentEvents: [...stats.recentEvents].slice(-6),
            playerReads,
        };
    }
    buildPrivateSummary(stats) {
        const avgThinkTime = stats.totalActions > 0 ? Math.round(stats.totalThinkMs / stats.totalActions) : 0;
        const recentTrend = stats.recentNetChanges.slice(-3);
        const recentTrendText = recentTrend.length > 0
            ? recentTrend.map((value) => (value >= 0 ? `+${value}` : String(value))).join(', ')
            : '暂无';
        return [
            `你本次会话累计净筹码变化 ${stats.netChips >= 0 ? '+' : ''}${stats.netChips}。`,
            `你已完成 ${stats.handsPlayed} 手牌，赢下 ${stats.handsWon} 手。`,
            `你的最近几手净变化：${recentTrendText}。`,
            `你行动 ${stats.totalActions} 次，其中加注 ${stats.raises} 次，弃牌 ${stats.folds} 次。`,
            `你的平均决策耗时约 ${avgThinkTime}ms。`,
            stats.soul ? `你的灵魂标签：${(0, soul_1.describeSoulTraits)(stats.soul.traits).join('、')}。` : '',
        ].filter(Boolean).join('\n');
    }
    buildOpponentRead(stats) {
        const avgThinkTime = stats.totalActions > 0 ? Math.round(stats.totalThinkMs / stats.totalActions) : 0;
        const parts = [
            stats.raises >= Math.max(2, Math.ceil(stats.totalActions * 0.28)) ? '主动施压较多' : '目前更常跟随局势',
            stats.folds >= Math.max(2, Math.ceil(stats.totalActions * 0.35)) ? '承压时偏保守' : '抗压还算稳定',
            avgThinkTime >= 2500 ? '思考时间较长' : '出手节奏偏快',
            stats.netChips > 80 ? '最近整体在赢' : stats.netChips < -80 ? '最近整体在输' : '最近输赢起伏不大',
        ];
        return parts.join('，') + '。';
    }
}
exports.SessionManager = SessionManager;
