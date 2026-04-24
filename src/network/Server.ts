import { Server as SocketServer, Socket } from 'socket.io';
import { createServer } from 'http';
import { Game } from '../core/Game';
import { SessionManager } from '../session/SessionManager';
import type { PlayerJoinMeta } from '../session/types';

interface Room {
  game: Game;
  playerSockets: Map<string, Socket>;
  hostId: string;
  session: SessionManager;
  turnStartedAt: number;
}

export class PokerServer {
  private io: SocketServer;
  private rooms: Map<string, Room> = new Map();

  constructor(port: number = 3000) {
    const httpServer = createServer();
    this.io = new SocketServer(httpServer, { cors: { origin: '*' } });

    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    httpServer.listen(port, () => {
      console.log(`🃏 德州扑克服务器运行在端口 ${port}`);
    });
  }

  private handleConnection(socket: Socket): void {
    socket.on('create-room', (roomId: string, playerName: string, metaOrCallback, maybeCallback) => {
      const { meta, callback } = this.parseMeta(metaOrCallback, maybeCallback);
      if (this.rooms.has(roomId)) {
        callback({ success: false, error: '房间已存在' });
        return;
      }

      const game = new Game();
      game.addPlayer(socket.id, playerName, 1000, true, meta.isAi ?? false, meta.isGm ?? true);

      const session = new SessionManager();
      session.registerPlayer(socket.id, playerName, { ...meta, isGm: meta.isGm ?? true });

      const room: Room = {
        game,
        playerSockets: new Map([[socket.id, socket]]),
        hostId: socket.id,
        session,
        turnStartedAt: Date.now(),
      };
      this.rooms.set(roomId, room);
      socket.join(roomId);

      callback({ success: true, playerId: socket.id });
      this.broadcastState(roomId);
    });

    socket.on('join-room', (roomId: string, playerName: string, metaOrCallback, maybeCallback) => {
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
      room.playerSockets.set(socket.id, socket);
      socket.join(roomId);

      callback({ success: true, playerId: socket.id });
      this.broadcastState(roomId);
    });

    socket.on('start-game', (roomId: string) => {
      const room = this.rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return;
      if (room.game.getPlayerCount() < 2) return;

      room.game.start();
      room.session.startHand(room.game.getState());
      room.turnStartedAt = Date.now();
      this.broadcastState(roomId);
    });

    socket.on('action', (roomId: string, action: 'fold' | 'check' | 'call' | 'raise', amount?: number) => {
      const room = this.rooms.get(roomId);
      if (!room) return;

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
        }

        if (room.game.isEnded()) {
          room.session.finishHand(room.game.getState());
        } else {
          room.turnStartedAt = Date.now();
        }

        this.broadcastState(roomId);

        if (room.game.isEnded()) {
          setTimeout(() => {
            if (room.game.isEnded()) {
              room.game.start();
              room.session.startHand(room.game.getState());
              room.turnStartedAt = Date.now();
              this.broadcastState(roomId);
            }
          }, 5000);
        }
      } catch (err: any) {
        socket.emit('error', err.message);
      }
    });

    socket.on('disconnect', () => {
      for (const [roomId, room] of this.rooms.entries()) {
        if (room.playerSockets.has(socket.id)) {
          room.game.removePlayer(socket.id);
          room.playerSockets.delete(socket.id);

          if (room.playerSockets.size === 0) {
            this.rooms.delete(roomId);
          } else {
            if (room.hostId === socket.id) {
              const newHost = room.playerSockets.keys().next().value;
              if (newHost) room.hostId = newHost;
            }
            this.broadcastState(roomId);
          }
          break;
        }
      }
    });
  }

  private parseMeta(metaOrCallback: any, maybeCallback: any): { meta: PlayerJoinMeta; callback: Function } {
    if (typeof metaOrCallback === 'function') {
      return { meta: {}, callback: metaOrCallback };
    }

    return { meta: metaOrCallback ?? {}, callback: maybeCallback };
  }

  private broadcastState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const [playerId, socket] of room.playerSockets.entries()) {
      const state = room.game.getState(playerId);
      state.session = room.session.buildView(playerId);
      socket.emit('state', state);
    }
  }
}
