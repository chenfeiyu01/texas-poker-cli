"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandEvaluator = exports.HandRank = void 0;
const Card_1 = require("./Card");
var HandRank;
(function (HandRank) {
    HandRank[HandRank["HIGH_CARD"] = 1] = "HIGH_CARD";
    HandRank[HandRank["ONE_PAIR"] = 2] = "ONE_PAIR";
    HandRank[HandRank["TWO_PAIR"] = 3] = "TWO_PAIR";
    HandRank[HandRank["THREE_OF_A_KIND"] = 4] = "THREE_OF_A_KIND";
    HandRank[HandRank["STRAIGHT"] = 5] = "STRAIGHT";
    HandRank[HandRank["FLUSH"] = 6] = "FLUSH";
    HandRank[HandRank["FULL_HOUSE"] = 7] = "FULL_HOUSE";
    HandRank[HandRank["FOUR_OF_A_KIND"] = 8] = "FOUR_OF_A_KIND";
    HandRank[HandRank["STRAIGHT_FLUSH"] = 9] = "STRAIGHT_FLUSH";
    HandRank[HandRank["ROYAL_FLUSH"] = 10] = "ROYAL_FLUSH";
})(HandRank || (exports.HandRank = HandRank = {}));
class HandEvaluator {
    static evaluate(cards) {
        if (cards.length < 5) {
            throw new Error('需要至少5张牌才能判断牌型');
        }
        const best = this.findBestHand(cards);
        return best;
    }
    static findBestHand(cards) {
        let best = { rank: HandRank.HIGH_CARD, name: '高牌', values: [] };
        const combinations = this.getCombinations(cards, 5);
        for (const combo of combinations) {
            const result = this.evaluateFiveCards(combo);
            if (this.compareHands(result, best) > 0) {
                best = result;
            }
        }
        return best;
    }
    static evaluateFiveCards(cards) {
        const sorted = [...cards].sort((a, b) => b.value - a.value);
        const values = sorted.map(c => c.value);
        const suits = sorted.map(c => c.suit);
        const isFlush = suits.every(s => s === suits[0]);
        const isStraight = this.isStraight(values);
        const counts = this.getCounts(values);
        if (isFlush && isStraight) {
            if (values[0] === Card_1.Rank.ACE) {
                return { rank: HandRank.ROYAL_FLUSH, name: '皇家同花顺', values };
            }
            return { rank: HandRank.STRAIGHT_FLUSH, name: '同花顺', values };
        }
        if (counts[0] === 4) {
            return { rank: HandRank.FOUR_OF_A_KIND, name: '四条', values: this.byCountThenValue(values) };
        }
        if (counts[0] === 3 && counts[1] === 2) {
            return { rank: HandRank.FULL_HOUSE, name: '葫芦', values: this.byCountThenValue(values) };
        }
        if (isFlush) {
            return { rank: HandRank.FLUSH, name: '同花', values };
        }
        if (isStraight) {
            return { rank: HandRank.STRAIGHT, name: '顺子', values };
        }
        if (counts[0] === 3) {
            return { rank: HandRank.THREE_OF_A_KIND, name: '三条', values: this.byCountThenValue(values) };
        }
        if (counts[0] === 2 && counts[1] === 2) {
            return { rank: HandRank.TWO_PAIR, name: '两对', values: this.byCountThenValue(values) };
        }
        if (counts[0] === 2) {
            return { rank: HandRank.ONE_PAIR, name: '一对', values: this.byCountThenValue(values) };
        }
        return { rank: HandRank.HIGH_CARD, name: '高牌', values };
    }
    static isStraight(values) {
        const unique = [...new Set(values)].sort((a, b) => b - a);
        if (unique.length < 5)
            return false;
        for (let i = 0; i <= unique.length - 5; i++) {
            if (unique[i] - unique[i + 4] === 4)
                return true;
        }
        // A-2-3-4-5 特殊顺子
        if (unique.includes(Card_1.Rank.ACE) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) {
            return true;
        }
        return false;
    }
    static getCounts(values) {
        const freq = {};
        for (const v of values) {
            freq[v] = (freq[v] || 0) + 1;
        }
        return Object.values(freq).sort((a, b) => b - a);
    }
    static byCountThenValue(values) {
        const freq = {};
        for (const v of values) {
            freq[v] = (freq[v] || 0) + 1;
        }
        const entries = Object.entries(freq).map(([v, c]) => ({ value: Number(v), count: c }));
        entries.sort((a, b) => b.count - a.count || b.value - a.value);
        return entries.flatMap(e => Array(e.count).fill(e.value));
    }
    static compareHands(a, b) {
        if (a.rank !== b.rank)
            return a.rank - b.rank;
        for (let i = 0; i < a.values.length; i++) {
            if (a.values[i] !== b.values[i])
                return a.values[i] - b.values[i];
        }
        return 0;
    }
    static getCombinations(arr, k) {
        if (k === 0)
            return [[]];
        if (arr.length < k)
            return [];
        if (arr.length === k)
            return [[...arr]];
        const [first, ...rest] = arr;
        const withFirst = this.getCombinations(rest, k - 1).map(c => [first, ...c]);
        const withoutFirst = this.getCombinations(rest, k);
        return [...withFirst, ...withoutFirst];
    }
    static compare(a, b) {
        return this.compareHands(a, b);
    }
}
exports.HandEvaluator = HandEvaluator;
