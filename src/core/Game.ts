import { Deck } from './Deck';
import { Player, PlayerStatus } from './Player';
import { Card } from './Card';
import { HandEvaluator } from './HandEvaluator';
import type { SessionView } from '../session/types';

export enum GamePhase {
  WAITING = 'waiting',
  PREFLOP = 'preflop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river',
  SHOWDOWN = 'showdown',
  ENDED = 'ended',
}

export interface VisibleCard {
  display: string;
  color: 'red' | 'black';
}

export interface GameState {
  phase: GamePhase;
  communityCards: VisibleCard[];
  pot: number;
  currentBet: number;
  currentPlayerId: string | null;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  players: {
    id: string;
    name: string;
    chips: number;
    bet: number;
    status: PlayerStatus;
    isHost: boolean;
    isAi: boolean;
    isGm: boolean;
    hand?: string[];
  }[];
  winnerIds?: string[];
  winAmounts?: Record<string, number>;
  handResults?: Record<string, string>;
  session?: SessionView;
}

export class Game {
  private deck: Deck;
  private players: Player[] = [];
  private phase: GamePhase = GamePhase.WAITING;
  private communityCards: Card[] = [];
  private pot: number = 0;
  private currentBet: number = 0;
  private currentPlayerIndex: number = 0;
  private dealerIndex: number = 0;
  private smallBlind: number = 10;
  private bigBlind: number = 20;
  private winnerIds?: string[];
  private winAmounts?: Record<string, number>;
  private handResults?: Record<string, string>;

  constructor() {
    this.deck = new Deck();
  }

  addPlayer(
    id: string,
    name: string,
    chips: number = 1000,
    isHost: boolean = false,
    isAi: boolean = false,
    isGm: boolean = false,
  ): void {
    if (this.players.find(p => p.id === id)) return;
    this.players.push(new Player(id, name, chips, isHost, isAi, isGm));
  }

  removePlayer(id: string): void {
    this.players = this.players.filter(p => p.id !== id);
  }

  getPlayer(id: string): Player | undefined {
    return this.players.find(p => p.id === id);
  }

  getPlayerCount(): number {
    return this.players.length;
  }

  start(): void {
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

  action(playerId: string, action: 'fold' | 'check' | 'call' | 'raise', amount?: number): void {
    const player = this.getPlayer(playerId);
    if (!player || !player.canAct) throw new Error('玩家无法行动');
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

  private moveToNextPlayer(): void {
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (!this.players[this.currentPlayerIndex].canAct && !this.isBettingRoundComplete());
  }

  private isBettingRoundComplete(): boolean {
    const activePlayers = this.players.filter(p => p.status === PlayerStatus.ACTIVE || p.status === PlayerStatus.ALL_IN);
    if (activePlayers.length <= 1) return true;

    const allActed = activePlayers.every(p => p.bet === this.currentBet || p.status === PlayerStatus.ALL_IN);
    return allActed;
  }

  private collectBetsToPot(): void {
    this.pot += this.players.reduce((sum, p) => sum + p.bet, 0);
    for (const p of this.players) {
      p.bet = 0;
    }
    this.currentBet = 0;
  }

  private advancePhase(): void {
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

  private finishHand(): void {
    this.collectBetsToPot();
    this.phase = GamePhase.SHOWDOWN;
    this.resolveHand();
  }

  private getRemainingPlayers(): Player[] {
    return this.players.filter(p => p.status !== PlayerStatus.FOLDED);
  }

  private resolveHand(): void {
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
      result: HandEvaluator.evaluate([...p.hand, ...this.communityCards]),
    }));

    results.sort((a, b) => HandEvaluator.compare(b.result, a.result));

    const winners = [results[0]];
    for (let i = 1; i < results.length; i++) {
      if (HandEvaluator.compare(results[i].result, results[0].result) === 0) {
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

  getState(forPlayerId?: string): GameState {
    return {
      phase: this.phase,
      communityCards: this.communityCards.map((card) => ({
        display: card.display,
        color: card.color,
      })),
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

  isEnded(): boolean {
    return this.phase === GamePhase.ENDED;
  }

  getPlayerIds(): string[] {
    return this.players.map(p => p.id);
  }
}
