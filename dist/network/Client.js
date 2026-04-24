"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerClient = void 0;
const socket_io_client_1 = require("socket.io-client");
class PokerClient {
    socket = null;
    stateListeners = [];
    errorListeners = [];
    connectedListeners = [];
    tableTalkListeners = [];
    playerId = null;
    lastState = null;
    connect(url = 'http://localhost:3000') {
        this.socket = (0, socket_io_client_1.io)(url);
        this.socket.on('state', (state) => {
            if (!this.isStatePayloadCompatible(state)) {
                const errorMessage = '服务端版本不匹配：请升级到支持新牌面协议的服务端。';
                for (const listener of this.errorListeners) {
                    listener(errorMessage);
                }
                return;
            }
            this.lastState = state;
            for (const listener of this.stateListeners) {
                listener(state);
            }
        });
        this.socket.on('error', (msg) => {
            for (const listener of this.errorListeners) {
                listener(msg);
            }
        });
        this.socket.on('table-talk', (playerName, speech) => {
            for (const listener of this.tableTalkListeners) {
                listener(playerName, speech);
            }
        });
    }
    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
        this.playerId = null;
        this.lastState = null;
    }
    createRoom(roomId, playerName, meta = {}) {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error('未连接'));
                return;
            }
            this.socket.emit('create-room', roomId, playerName, meta, (res) => {
                if (res.success) {
                    this.playerId = res.playerId;
                    this.connectedListeners.forEach(l => l(res.playerId));
                    resolve(res.playerId);
                }
                else {
                    reject(new Error(res.error));
                }
            });
        });
    }
    joinRoom(roomId, playerName, meta = {}) {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error('未连接'));
                return;
            }
            this.socket.emit('join-room', roomId, playerName, meta, (res) => {
                if (res.success) {
                    this.playerId = res.playerId;
                    this.connectedListeners.forEach(l => l(res.playerId));
                    resolve(res.playerId);
                }
                else {
                    reject(new Error(res.error));
                }
            });
        });
    }
    startGame(roomId) {
        this.socket?.emit('start-game', roomId);
    }
    action(roomId, action, amount) {
        this.socket?.emit('action', roomId, action, amount);
    }
    reportAiDecision(roomId, decision) {
        this.socket?.emit('ai-decision-log', roomId, decision);
    }
    onState(listener) {
        this.stateListeners.push(listener);
    }
    onError(listener) {
        this.errorListeners.push(listener);
    }
    onConnected(listener) {
        this.connectedListeners.push(listener);
        if (this.playerId) {
            listener(this.playerId);
        }
    }
    onTableTalk(listener) {
        this.tableTalkListeners.push(listener);
    }
    offState(listener) {
        this.stateListeners = this.stateListeners.filter(l => l !== listener);
    }
    getLastState() {
        return this.lastState;
    }
    isStatePayloadCompatible(state) {
        return Array.isArray(state.communityCards) && state.communityCards.every((card) => {
            return Boolean(card && typeof card === 'object' && typeof card.display === 'string');
        });
    }
}
exports.PokerClient = PokerClient;
