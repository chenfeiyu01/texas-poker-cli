import { io, Socket } from 'socket.io-client';
import { GameState } from '../core/Game';
import type { PlayerJoinMeta } from '../session/types';

export class PokerClient {
  private socket: Socket | null = null;
  private stateListeners: ((state: GameState) => void)[] = [];
  private errorListeners: ((msg: string) => void)[] = [];
  private connectedListeners: ((playerId: string) => void)[] = [];

  connect(url: string = 'http://localhost:3000'): void {
    this.socket = io(url);

    this.socket.on('state', (state: GameState) => {
      if (!this.isStatePayloadCompatible(state)) {
        const errorMessage = '服务端版本不匹配：请升级到支持新牌面协议的服务端。';
        for (const listener of this.errorListeners) {
          listener(errorMessage);
        }
        return;
      }

      for (const listener of this.stateListeners) {
        listener(state);
      }
    });

    this.socket.on('error', (msg: string) => {
      for (const listener of this.errorListeners) {
        listener(msg);
      }
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  createRoom(roomId: string, playerName: string, meta: PlayerJoinMeta = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('未连接'));
        return;
      }
      this.socket.emit('create-room', roomId, playerName, meta, (res: any) => {
        if (res.success) {
          this.connectedListeners.forEach(l => l(res.playerId));
          resolve(res.playerId);
        } else {
          reject(new Error(res.error));
        }
      });
    });
  }

  joinRoom(roomId: string, playerName: string, meta: PlayerJoinMeta = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('未连接'));
        return;
      }
      this.socket.emit('join-room', roomId, playerName, meta, (res: any) => {
        if (res.success) {
          this.connectedListeners.forEach(l => l(res.playerId));
          resolve(res.playerId);
        } else {
          reject(new Error(res.error));
        }
      });
    });
  }

  startGame(roomId: string): void {
    this.socket?.emit('start-game', roomId);
  }

  action(roomId: string, action: 'fold' | 'check' | 'call' | 'raise', amount?: number): void {
    this.socket?.emit('action', roomId, action, amount);
  }

  onState(listener: (state: GameState) => void): void {
    this.stateListeners.push(listener);
  }

  onError(listener: (msg: string) => void): void {
    this.errorListeners.push(listener);
  }

  onConnected(listener: (playerId: string) => void): void {
    this.connectedListeners.push(listener);
  }

  offState(listener: (state: GameState) => void): void {
    this.stateListeners = this.stateListeners.filter(l => l !== listener);
  }

  private isStatePayloadCompatible(state: GameState): boolean {
    return Array.isArray(state.communityCards) && state.communityCards.every((card) => {
      return Boolean(card && typeof card === 'object' && typeof (card as { display?: unknown }).display === 'string');
    });
  }
}
