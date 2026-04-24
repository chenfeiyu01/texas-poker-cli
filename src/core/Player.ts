import { Card } from './Card';

export enum PlayerStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  FOLDED = 'folded',
  ALL_IN = 'all-in',
}

export class Player {
  public hand: Card[] = [];
  public status: PlayerStatus = PlayerStatus.WAITING;
  public bet: number = 0;
  public totalBet: number = 0;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public chips: number = 1000,
    public isHost: boolean = false,
    public isAi: boolean = false,
    public isGm: boolean = false,
  ) {}

  resetForNewHand(): void {
    this.hand = [];
    this.status = PlayerStatus.ACTIVE;
    this.bet = 0;
    this.totalBet = 0;
  }

  fold(): void {
    this.status = PlayerStatus.FOLDED;
  }

  call(amount: number): void {
    const toCall = Math.min(amount, this.chips);
    this.chips -= toCall;
    this.bet += toCall;
    this.totalBet += toCall;
    if (this.chips === 0) {
      this.status = PlayerStatus.ALL_IN;
    }
  }

  raise(amount: number): void {
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

  get canAct(): boolean {
    return this.status === PlayerStatus.ACTIVE;
  }
}
