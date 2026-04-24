"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerServer = void 0;
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const Game_1 = require("../core/Game");
const SessionManager_1 = require("../session/SessionManager");
const MarkdownSessionLogger_1 = require("../session/MarkdownSessionLogger");
class PokerServer {
    io;
    httpServer;
    rooms = new Map();
    constructor(port = 3000) {
        this.httpServer = (0, http_1.createServer)();
        this.io = new socket_io_1.Server(this.httpServer, { cors: { origin: '*' } });
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
        this.httpServer.listen(port, () => {
            console.log(`🃏 德州扑克服务器运行在端口 ${port}`);
        });
    }
    close() {
        return new Promise((resolve, reject) => {
            this.io.close((ioError) => {
                if (ioError) {
                    reject(ioError);
                    return;
                }
                resolve();
            });
        });
    }
    handleConnection(socket) {
        socket.on('create-room', (roomId, playerName, metaOrCallback, maybeCallback) => {
            const { meta, callback } = this.parseMeta(metaOrCallback, maybeCallback);
            if (this.rooms.has(roomId)) {
                callback({ success: false, error: '房间已存在' });
                return;
            }
            const game = new Game_1.Game();
            game.addPlayer(socket.id, playerName, 1000, true, meta.isAi ?? false, meta.isGm ?? true);
            const session = new SessionManager_1.SessionManager();
            session.registerPlayer(socket.id, playerName, { ...meta, isGm: meta.isGm ?? true });
            const logger = new MarkdownSessionLogger_1.MarkdownSessionLogger(roomId);
            logger.logRoomCreated(playerName, { ...meta, isGm: meta.isGm ?? true });
            const room = {
                game,
                playerSockets: new Map([[socket.id, socket]]),
                hostId: socket.id,
                session,
                logger,
                turnStartedAt: Date.now(),
            };
            this.rooms.set(roomId, room);
            socket.join(roomId);
            callback({ success: true, playerId: socket.id });
            this.broadcastState(roomId);
        });
        socket.on('join-room', (roomId, playerName, metaOrCallback, maybeCallback) => {
            const { meta, callback } = this.parseMeta(metaOrCallback, maybeCallback);
            const room = this.rooms.get(roomId);
            if (!room) {
                callback({ success: false, error: '房间不存在' });
                return;
            }
            if (room.game.getPlayerCount() >= 9) {
                callback({ success: false, error: '房间已满' });
                return;
            }
            room.game.addPlayer(socket.id, playerName, 1000, false, meta.isAi ?? false, meta.isGm ?? false);
            room.session.registerPlayer(socket.id, playerName, meta);
            room.logger.logPlayerJoined(playerName, meta);
            room.playerSockets.set(socket.id, socket);
            socket.join(roomId);
            callback({ success: true, playerId: socket.id });
            this.broadcastState(roomId);
        });
        socket.on('start-game', (roomId) => {
            const room = this.rooms.get(roomId);
            if (!room || room.hostId !== socket.id)
                return;
            if (room.game.getPlayerCount() < 2)
                return;
            room.game.start();
            room.session.startHand(room.game.getState());
            room.logger.logHandStart(room.session.getHandNumber(), room.game.getState());
            room.turnStartedAt = Date.now();
            this.broadcastState(roomId);
        });
        socket.on('action', (roomId, action, amount) => {
            const room = this.rooms.get(roomId);
            if (!room)
                return;
            try {
                const beforeState = room.game.getState();
                const phaseBefore = beforeState.phase;
                room.game.action(socket.id, action, amount);
                const player = room.game.getPlayer(socket.id);
                if (player) {
                    room.session.recordAction({
                        playerId: socket.id,
                        playerName: player.name,
                        action,
                        phase: phaseBefore,
                        declaredAmount: amount,
                        totalBet: player.totalBet,
                        potAfter: room.game.getState(socket.id).pot,
                        thinkTimeMs: Math.max(0, Date.now() - room.turnStartedAt),
                    });
                    room.logger.logAction({
                        handNumber: room.session.getHandNumber(),
                        playerName: player.name,
                        action,
                        phase: phaseBefore,
                        declaredAmount: amount,
                        totalBet: player.totalBet,
                        potAfter: room.game.getState(socket.id).pot,
                        thinkTimeMs: Math.max(0, Date.now() - room.turnStartedAt),
                    });
                }
                const afterState = room.game.getState();
                if (phaseBefore !== afterState.phase) {
                    room.logger.logPhaseTransition(phaseBefore, afterState.phase, afterState);
                }
                if (room.game.isEnded()) {
                    room.session.finishHand(room.game.getState());
                    room.logger.logHandEnd(room.session.getHandNumber(), room.game.getState());
                }
                else {
                    room.turnStartedAt = Date.now();
                }
                this.broadcastState(roomId);
            }
            catch (err) {
                socket.emit('error', err.message);
            }
        });
        socket.on('ai-decision-log', (roomId, decision) => {
            const room = this.rooms.get(roomId);
            if (!room)
                return;
            const player = room.game.getPlayer(socket.id);
            if (!player || !player.isAi)
                return;
            room.logger.logAiDecision(player.name, decision);
            if (decision.speech?.trim()) {
                this.io.to(roomId).emit('table-talk', player.name, decision.speech.trim());
            }
        });
        socket.on('disconnect', () => {
            for (const [roomId, room] of this.rooms.entries()) {
                if (room.playerSockets.has(socket.id)) {
                    const player = room.game.getPlayer(socket.id);
                    if (player) {
                        room.logger.logPlayerLeft(player.name);
                    }
                    room.game.removePlayer(socket.id);
                    room.playerSockets.delete(socket.id);
                    if (room.playerSockets.size === 0) {
                        this.rooms.delete(roomId);
                    }
                    else {
                        if (room.hostId === socket.id) {
                            const newHost = room.playerSockets.keys().next().value;
                            if (newHost)
                                room.hostId = newHost;
                        }
                        this.broadcastState(roomId);
                    }
                    break;
                }
            }
        });
    }
    parseMeta(metaOrCallback, maybeCallback) {
        if (typeof metaOrCallback === 'function') {
            return { meta: {}, callback: metaOrCallback };
        }
        return { meta: metaOrCallback ?? {}, callback: maybeCallback };
    }
    broadcastState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room)
            return;
        for (const [playerId, socket] of room.playerSockets.entries()) {
            const state = room.game.getState(playerId);
            state.session = room.session.buildView(playerId);
            socket.emit('state', state);
        }
    }
}
exports.PokerServer = PokerServer;
