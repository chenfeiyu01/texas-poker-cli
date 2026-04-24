import { Card, Suit, Rank } from './Card';

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.cards = [];
    for (const suit of Object.values(Suit).filter(v => typeof v === 'string')) {
      for (let rank = 2; rank <= 14; rank++) {
        this.cards.push(new Card(suit as Suit, rank as Rank));
      }
    }
    this.shuffle();
  }

  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(): Card {
    const card = this.cards.pop();
    if (!card) throw new Error('牌堆已空');
    return card;
  }

  get remaining(): number {
    return this.cards.length;
  }
}
