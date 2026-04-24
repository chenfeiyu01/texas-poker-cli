"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Player = exports.PlayerStatus = void 0;
var PlayerStatus;
(function (PlayerStatus) {
    PlayerStatus["WAITING"] = "waiting";
    PlayerStatus["ACTIVE"] = "active";
    PlayerStatus["FOLDED"] = "folded";
    PlayerStatus["ALL_IN"] = "all-in";
})(PlayerStatus || (exports.PlayerStatus = PlayerStatus = {}));
class Player {
    id;
    name;
    chips;
    isHost;
    isAi;
    isGm;
    hand = [];
    status = PlayerStatus.WAITING;
    bet = 0;
    totalBet = 0;
    constructor(id, name, chips = 1000, isHost = false, isAi = false, isGm = false) {
        this.id = id;
        this.name = name;
        this.chips = chips;
        this.isHost = isHost;
        this.isAi = isAi;
        this.isGm = isGm;
    }
    resetForNewHand() {
        this.hand = [];
        this.status = PlayerStatus.ACTIVE;
        this.bet = 0;
        this.totalBet = 0;
    }
    fold() {
        this.status = PlayerStatus.FOLDED;
    }
    call(amount) {
        const toCall = Math.min(amount, this.chips);
        this.chips -= toCall;
        this.bet += toCall;
        this.totalBet += toCall;
        if (this.chips === 0) {
            this.status = PlayerStatus.ALL_IN;
        }
    }
    raise(amount) {
        if (amount > this.chips) {
            throw new Error('筹码不足');
        }
        this.chips -= amount;
        this.bet += amount;
        this.totalBet += amount;
        if (this.chips === 0) {
            this.status = PlayerStatus.ALL_IN;
        }
    }
    get canAct() {
        return this.status === PlayerStatus.ACTIVE;
    }
}
exports.Player = Player;
