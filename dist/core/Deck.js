"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deck = void 0;
const Card_1 = require("./Card");
class Deck {
    cards = [];
    constructor() {
        this.reset();
    }
    reset() {
        this.cards = [];
        for (const suit of Object.values(Card_1.Suit).filter(v => typeof v === 'string')) {
            for (let rank = 2; rank <= 14; rank++) {
                this.cards.push(new Card_1.Card(suit, rank));
            }
        }
        this.shuffle();
    }
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
    deal() {
        const card = this.cards.pop();
        if (!card)
            throw new Error('牌堆已空');
        return card;
    }
    get remaining() {
        return this.cards.length;
    }
}
exports.Deck = Deck;
