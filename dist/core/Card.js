"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Card = exports.Rank = exports.Suit = void 0;
var Suit;
(function (Suit) {
    Suit["SPADES"] = "\u2660";
    Suit["HEARTS"] = "\u2665";
    Suit["DIAMONDS"] = "\u2666";
    Suit["CLUBS"] = "\u2663";
})(Suit || (exports.Suit = Suit = {}));
var Rank;
(function (Rank) {
    Rank[Rank["TWO"] = 2] = "TWO";
    Rank[Rank["THREE"] = 3] = "THREE";
    Rank[Rank["FOUR"] = 4] = "FOUR";
    Rank[Rank["FIVE"] = 5] = "FIVE";
    Rank[Rank["SIX"] = 6] = "SIX";
    Rank[Rank["SEVEN"] = 7] = "SEVEN";
    Rank[Rank["EIGHT"] = 8] = "EIGHT";
    Rank[Rank["NINE"] = 9] = "NINE";
    Rank[Rank["TEN"] = 10] = "TEN";
    Rank[Rank["JACK"] = 11] = "JACK";
    Rank[Rank["QUEEN"] = 12] = "QUEEN";
    Rank[Rank["KING"] = 13] = "KING";
    Rank[Rank["ACE"] = 14] = "ACE";
})(Rank || (exports.Rank = Rank = {}));
class Card {
    suit;
    rank;
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
    }
    get display() {
        const rankStr = this.rank > 10
            ? ['J', 'Q', 'K', 'A'][this.rank - 11]
            : String(this.rank);
        return `${rankStr}${this.suit}`;
    }
    get color() {
        return this.suit === Suit.HEARTS || this.suit === Suit.DIAMONDS ? 'red' : 'black';
    }
    get value() {
        return this.rank;
    }
}
exports.Card = Card;
