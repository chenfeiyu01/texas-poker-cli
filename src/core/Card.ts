export enum Suit {
  SPADES = '♠',
  HEARTS = '♥',
  DIAMONDS = '♦',
  CLUBS = '♣',
}

export enum Rank {
  TWO = 2,
  THREE = 3,
  FOUR = 4,
  FIVE = 5,
  SIX = 6,
  SEVEN = 7,
  EIGHT = 8,
  NINE = 9,
  TEN = 10,
  JACK = 11,
  QUEEN = 12,
  KING = 13,
  ACE = 14,
}

export class Card {
  constructor(public readonly suit: Suit, public readonly rank: Rank) {}

  get display(): string {
    const rankStr = this.rank > 10
      ? ['J', 'Q', 'K', 'A'][this.rank - 11]
      : String(this.rank);
    return `${rankStr}${this.suit}`;
  }

  get color(): 'red' | 'black' {
    return this.suit === Suit.HEARTS || this.suit === Suit.DIAMONDS ? 'red' : 'black';
  }

  get value(): number {
    return this.rank;
  }
}
