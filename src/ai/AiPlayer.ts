import { PokerClient } from '../network/Client';
import { GameState } from '../core/Game';
import { buildPokerPrompt } from './prompts';
import type { SoulProfile } from './soul';

export interface AiPlayerOptions {
  host: string;
  room: string;
  name: string;
  apiKey: string;
  apiBase: string;
  model: string;
  thinkMs?: number;
  soul: SoulProfile;
  quiet?: boolean;
}

export class AiPlayer {
  private client: PokerClient;
  private options: AiPlayerOptions;
  private isMyTurn = false;
  private processing = false;

  constructor(options: AiPlayerOptions) {
    this.options = options;
    this.client = new PokerClient();
  }

  async start(): Promise<void> {
    this.client.connect(this.options.host);

    this.client.onConnected(() => {
      if (!this.options.quiet) {
        console.log(`[AI ${this.options.name}] 已连接`);
      }
    });

    this.client.onState((state) => {
      this.handleState(state);
    });

    this.client.onError((msg) => {
      if (!this.options.quiet) {
        console.error(`[AI ${this.options.name}] 错误:`, msg);
      }
    });

    try {
      await this.client.joinRoom(this.options.room, this.options.name, {
        isAi: true,
        isGm: false,
        soul: this.options.soul,
      });
    } catch {
      await this.client.createRoom(this.options.room, this.options.name, {
        isAi: true,
        isGm: false,
        soul: this.options.soul,
      });
    }

    if (!this.options.quiet) {
      console.log(`[AI ${this.options.name}] 已加入房间 ${this.options.room}`);
    }
  }

  private async handleState(state: GameState): Promise<void> {
    const me = state.players.find((p) => p.name === this.options.name);
    if (!me) return;

    const isNowMyTurn = state.currentPlayerId === me.id;

    if (isNowMyTurn && !this.isMyTurn && !this.processing) {
      this.isMyTurn = true;
      this.processing = true;

      // 稍微延迟，模拟思考时间
      const thinkMs = this.options.thinkMs ?? 2000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, thinkMs));

      const action = await this.decideAction(state, me.id);
      if (action) {
        if (!this.options.quiet) {
          console.log(`[AI ${this.options.name}] 决策: ${action}`);
        }
        this.executeAction(action);
      }

      this.processing = false;
    }

    if (!isNowMyTurn) {
      this.isMyTurn = false;
    }
  }

  private async decideAction(state: GameState, myId: string): Promise<string | null> {
    const prompt = buildPokerPrompt(state, myId, this.options.soul);

    try {
      const response = await fetch(`${this.options.apiBase}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          input: prompt,
          temperature: 0.3,
          max_output_tokens: 20,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        if (!this.options.quiet) {
          console.error(`[AI ${this.options.name}] API 错误:`, response.status, text);
        }
        return this.fallbackAction(state, myId);
      }

      const data = await response.json();
      const raw = data.output_text?.trim() || data.choices?.[0]?.message?.content?.trim() || '';
      return this.parseAction(raw);
    } catch (err) {
      if (!this.options.quiet) {
        console.error(`[AI ${this.options.name}] 请求失败:`, err);
      }
      return this.fallbackAction(state, myId);
    }
  }

  private parseAction(raw: string): string | null {
    const lower = raw.toLowerCase();

    if (lower.includes('fold')) return 'fold';
    if (lower.includes('check')) return 'check';
    if (lower.includes('call')) return 'call';

    const raiseMatch = lower.match(/raise\s+(\d+)/);
    if (raiseMatch) {
      return `raise ${raiseMatch[1]}`;
    }

    // 兜底：如果输出不标准，默认 call
    return 'call';
  }

  private fallbackAction(state: GameState, myId: string): string {
    const me = state.players.find((p) => p.id === myId);
    if (!me) return 'fold';

    const toCall = state.currentBet - me.bet;
    if (toCall === 0) return 'check';
    if (toCall > me.chips * 0.3) return 'fold';
    return 'call';
  }

  private executeAction(actionStr: string): void {
    const parts = actionStr.split(' ');
    const action = parts[0] as 'fold' | 'check' | 'call' | 'raise';
    const amount = parts[1] ? parseInt(parts[1], 10) : undefined;

    this.client.action(this.options.room, action, amount);
  }

  stop(): void {
    this.client.disconnect();
  }
}
