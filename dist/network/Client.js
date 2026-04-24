"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerClient = void 0;
const socket_io_client_1 = require("socket.io-client");
class PokerClient {
    socket = null;
    stateListeners = [];
    errorListeners = [];
    connectedListeners = [];
    connect(url = 'http://localhost:3000') {
        this.socket = (0, socket_io_client_1.io)(url);
        this.socket.on('state', (state) => {
            for (const listener of this.stateListeners) {
                listener(state);
            }
        });
        this.socket.on('error', (msg) => {
            for (const listener of this.errorListeners) {
                listener(msg);
            }
        });
    }
    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
    }
    createRoom(roomId, playerName, meta = {}) {
        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error('未连接'));
                return;
            }
            this.socket.emit('create-room', roomId, playerName, meta, (res) => {
                if (res.success) {
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
    onState(listener) {
        this.stateListeners.push(listener);
    }
    onError(listener) {
        this.errorListeners.push(listener);
    }
    onConnected(listener) {
        this.connectedListeners.push(listener);
    }
    offState(listener) {
        this.stateListeners = this.stateListeners.filter(l => l !== listener);
    }
}
exports.PokerClient = PokerClient;
