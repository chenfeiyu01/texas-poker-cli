"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Game = exports.GamePhase = void 0;
const Deck_1 = require("./Deck");
const Player_1 = require("./Player");
const HandEvaluator_1 = require("./HandEvaluator");
var GamePhase;
(function (GamePhase) {
    GamePhase["WAITING"] = "waiting";
    GamePhase["PREFLOP"] = "preflop";
    GamePhase["FLOP"] = "flop";
    GamePhase["TURN"] = "turn";
    GamePhase["RIVER"] = "river";
    GamePhase["SHOWDOWN"] = "showdown";
    GamePhase["ENDED"] = "ended";
})(GamePhase || (exports.GamePhase = GamePhase = {}));
class Game {
    deck;
    players = [];
    phase = GamePhase.WAITING;
    communityCards = [];
    pot = 0;
    currentBet = 0;
    currentPlayerIndex = 0;
    dealerIndex = 0;
    smallBlind = 10;
    bigBlind = 20;
    winnerIds;
    winAmounts;
    handResults;
    constructor() {
        this.deck = new Deck_1.Deck();
    }
    addPlayer(id, name, chips = 1000, isHost = false, isAi = false, isGm = false) {
        if (this.players.find(p => p.id === id))
            return;
        this.players.push(new Player_1.Player(id, name, chips, isHost, isAi, isGm));
    }
    removePlayer(id) {
        this.players = this.players.filter(p => p.id !== id);
    }
    getPlayer(id) {
        return this.players.find(p => p.id === id);
    }
    getPlayerCount() {
        return this.players.length;
    }
    start() {
        if (this.players.length < 2) {
            throw new Error('至少需要2名玩家');
        }
        this.deck.reset();
        this.communityCards = [];
        this.pot = 0;
        this.currentBet = 0;
        this.winnerIds = undefined;
        this.winAmounts = undefined;
        this.handResults = undefined;
        for (const player of this.players) {
            player.resetForNewHand();
            player.hand = [this.deck.deal(), this.deck.deal()];
        }
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
        this.phase = GamePhase.PREFLOP;
        const sbIndex = (this.dealerIndex + 1) % this.players.length;
        const bbIndex = (this.dealerIndex + 2) % this.players.length;
        this.players[sbIndex].call(this.smallBlind);
        this.players[bbIndex].call(this.bigBlind);
        this.currentBet = this.bigBlind;
        this.currentPlayerIndex = (bbIndex + 1) % this.players.length;
        while (!this.players[this.currentPlayerIndex].canAct) {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        }
    }
    action(playerId, action, amount) {
        const player = this.getPlayer(playerId);
        if (!player || !player.canAct)
            throw new Error('玩家无法行动');
        if (this.players[this.currentPlayerIndex].id !== playerId) {
            throw new Error('还没轮到你');
        }
        switch (action) {
            case 'fold':
                player.fold();
                break;
            case 'check':
                if (player.bet < this.currentBet) {
                    throw new Error('当前有下注，不能过牌');
                }
                break;
            case 'call':
                player.call(this.currentBet - player.bet);
                break;
            case 'raise':
                if (!amount || amount <= this.currentBet) {
                    throw new Error('加注金额必须大于当前下注');
                }
                const raiseAmount = amount - player.bet;
                player.raise(raiseAmount);
                this.currentBet = amount;
                break;
        }
        this.moveToNextPlayer();
        if (this.getRemainingPlayers().length <= 1) {
            this.finishHand();
            return;
        }
        if (this.isBettingRoundComplete()) {
            this.advancePhase();
        }
    }
    moveToNextPlayer() {
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        } while (!this.players[this.currentPlayerIndex].canAct && !this.isBettingRoundComplete());
    }
    isBettingRoundComplete() {
        const activePlayers = this.players.filter(p => p.status === Player_1.PlayerStatus.ACTIVE || p.status === Player_1.PlayerStatus.ALL_IN);
        if (activePlayers.length <= 1)
            return true;
        const allActed = activePlayers.every(p => p.bet === this.currentBet || p.status === Player_1.PlayerStatus.ALL_IN);
        return allActed;
    }
    collectBetsToPot() {
        this.pot += this.players.reduce((sum, p) => sum + p.bet, 0);
        for (const p of this.players) {
            p.bet = 0;
        }
        this.currentBet = 0;
    }
    advancePhase() {
        this.collectBetsToPot();
        switch (this.phase) {
            case GamePhase.PREFLOP:
                this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
                this.phase = GamePhase.FLOP;
                break;
            case GamePhase.FLOP:
                this.communityCards.push(this.deck.deal());
                this.phase = GamePhase.TURN;
                break;
            case GamePhase.TURN:
                this.communityCards.push(this.deck.deal());
                this.phase = GamePhase.RIVER;
                break;
            case GamePhase.RIVER:
                this.phase = GamePhase.SHOWDOWN;
                this.resolveHand();
                return;
            default:
                return;
        }
        this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
        while (!this.players[this.currentPlayerIndex].canAct) {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        }
    }
    finishHand() {
        this.collectBetsToPot();
        this.phase = GamePhase.SHOWDOWN;
        this.resolveHand();
    }
    getRemainingPlayers() {
        return this.players.filter(p => p.status !== Player_1.PlayerStatus.FOLDED);
    }
    resolveHand() {
        const activePlayers = this.getRemainingPlayers();
        if (activePlayers.length === 1) {
            const winner = activePlayers[0];
            winner.chips += this.pot;
            this.winnerIds = [winner.id];
            this.winAmounts = { [winner.id]: this.pot };
            this.handResults = { [winner.id]: '未摊牌直接收下底池' };
            this.phase = GamePhase.ENDED;
            return;
        }
        const results = activePlayers.map(p => ({
            player: p,
            result: HandEvaluator_1.HandEvaluator.evaluate([...p.hand, ...this.communityCards]),
        }));
        results.sort((a, b) => HandEvaluator_1.HandEvaluator.compare(b.result, a.result));
        const winners = [results[0]];
        for (let i = 1; i < results.length; i++) {
            if (HandEvaluator_1.HandEvaluator.compare(results[i].result, results[0].result) === 0) {
                winners.push(results[i]);
            }
        }
        const winAmount = Math.floor(this.pot / winners.length);
        this.winnerIds = winners.map(w => w.player.id);
        this.winAmounts = {};
        this.handResults = {};
        for (const w of winners) {
            w.player.chips += winAmount;
            this.winAmounts[w.player.id] = winAmount;
        }
        for (const result of results) {
            this.handResults[result.player.id] = result.result.name;
        }
        this.phase = GamePhase.ENDED;
    }
    getState(forPlayerId) {
        return {
            phase: this.phase,
            communityCards: this.communityCards,
            pot: this.pot + this.players.reduce((sum, p) => sum + p.bet, 0),
            currentBet: this.currentBet,
            currentPlayerId: this.players[this.currentPlayerIndex]?.id ?? null,
            dealerIndex: this.dealerIndex,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                bet: p.bet,
                status: p.status,
                isHost: p.isHost,
                isAi: p.isAi,
                isGm: p.isGm,
                hand: p.id === forPlayerId ? p.hand.map(c => c.display) : undefined,
            })),
            winnerIds: this.winnerIds,
            winAmounts: this.winAmounts,
            handResults: this.handResults,
        };
    }
    isEnded() {
        return this.phase === GamePhase.ENDED;
    }
    getPlayerIds() {
        return this.players.map(p => p.id);
    }
}
exports.Game = Game;
