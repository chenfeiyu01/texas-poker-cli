"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSoulProfile = generateSoulProfile;
exports.describeSoulTraits = describeSoulTraits;
exports.buildSoulPrompt = buildSoulPrompt;
const SOUL_ARCHETYPES = [
    {
        key: 'mathematician',
        name: '数学派',
        summary: '你信赔率、节奏和长期收益，讨厌无意义的波动。',
        publicBlurb: '出手不多，更像在做概率题。',
        traits: {
            riskTolerance: 42,
            discipline: 84,
            aggression: 45,
            ego: 30,
            vengefulness: 24,
            patience: 79,
            deception: 38,
            emotionalVolatility: 18,
        },
    },
    {
        key: 'gambler',
        name: '赌徒派',
        summary: '你热爱翻盘和大池，愿意为了气势与刺激承担更多风险。',
        publicBlurb: '气势起伏很大，喜欢把底池做大。',
        traits: {
            riskTolerance: 84,
            discipline: 35,
            aggression: 72,
            ego: 58,
            vengefulness: 45,
            patience: 28,
            deception: 41,
            emotionalVolatility: 72,
        },
    },
    {
        key: 'performer',
        name: '表演派',
        summary: '你非常在意桌上形象，喜欢通过节奏、姿态和表演干扰他人判断。',
        publicBlurb: '会刻意制造存在感，让人摸不透。',
        traits: {
            riskTolerance: 61,
            discipline: 52,
            aggression: 68,
            ego: 75,
            vengefulness: 33,
            patience: 57,
            deception: 88,
            emotionalVolatility: 49,
        },
    },
    {
        key: 'avenger',
        name: '复仇派',
        summary: '你会牢牢记住羞辱与压制，愿意为了回敬对手而调整打法。',
        publicBlurb: '看起来很会记仇，针对性很强。',
        traits: {
            riskTolerance: 58,
            discipline: 49,
            aggression: 73,
            ego: 71,
            vengefulness: 90,
            patience: 44,
            deception: 54,
            emotionalVolatility: 63,
        },
    },
    {
        key: 'fox',
        name: '老狐狸',
        summary: '你更愿意先观察、再设局，喜欢引诱别人把牌打成你想要的样子。',
        publicBlurb: '不急着出手，更擅长藏锋。',
        traits: {
            riskTolerance: 55,
            discipline: 76,
            aggression: 47,
            ego: 46,
            vengefulness: 37,
            patience: 86,
            deception: 79,
            emotionalVolatility: 22,
        },
    },
    {
        key: 'timid',
        name: '胆怯派',
        summary: '你害怕犯大错，更看重活下来而不是赢得漂亮。',
        publicBlurb: '较为谨慎，承压时容易收缩。',
        traits: {
            riskTolerance: 24,
            discipline: 63,
            aggression: 26,
            ego: 29,
            vengefulness: 18,
            patience: 66,
            deception: 21,
            emotionalVolatility: 44,
        },
    },
];
function clampTrait(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
function generateSoulProfile(seed = Math.floor(Math.random() * 1_000_000)) {
    const archetype = SOUL_ARCHETYPES[seed % SOUL_ARCHETYPES.length];
    const random = createSeededRandom(seed);
    const traits = {
        riskTolerance: clampTrait(archetype.traits.riskTolerance + randomOffset(random, 12)),
        discipline: clampTrait(archetype.traits.discipline + randomOffset(random, 10)),
        aggression: clampTrait(archetype.traits.aggression + randomOffset(random, 12)),
        ego: clampTrait(archetype.traits.ego + randomOffset(random, 14)),
        vengefulness: clampTrait(archetype.traits.vengefulness + randomOffset(random, 16)),
        patience: clampTrait(archetype.traits.patience + randomOffset(random, 11)),
        deception: clampTrait(archetype.traits.deception + randomOffset(random, 13)),
        emotionalVolatility: clampTrait(archetype.traits.emotionalVolatility + randomOffset(random, 15)),
    };
    return {
        archetypeKey: archetype.key,
        archetypeName: archetype.name,
        seed,
        summary: archetype.summary,
        publicBlurb: archetype.publicBlurb,
        traits,
    };
}
function randomOffset(random, range) {
    return Math.round((random() - 0.5) * range * 2);
}
function createSeededRandom(seed) {
    let value = seed % 2147483647;
    if (value <= 0)
        value += 2147483646;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}
function describeSoulTraits(traits) {
    const descriptions = [];
    if (traits.aggression >= 70)
        descriptions.push('偏激进');
    if (traits.aggression <= 35)
        descriptions.push('偏克制');
    if (traits.riskTolerance >= 70)
        descriptions.push('风险偏好高');
    if (traits.riskTolerance <= 35)
        descriptions.push('风险偏好低');
    if (traits.deception >= 70)
        descriptions.push('擅长表演');
    if (traits.vengefulness >= 70)
        descriptions.push('容易记仇');
    if (traits.patience >= 70)
        descriptions.push('很有耐心');
    if (traits.emotionalVolatility >= 70)
        descriptions.push('情绪起伏大');
    if (traits.discipline >= 75)
        descriptions.push('纪律性强');
    return descriptions.length > 0 ? descriptions : ['风格微妙'];
}
function buildSoulPrompt(profile) {
    const traitSummary = Object.entries(profile.traits)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
    return [
        `你的灵魂原型：${profile.archetypeName}`,
        `人格底色：${profile.summary}`,
        `公开印象：${profile.publicBlurb}`,
        `人格维度：${traitSummary}`,
    ].join('\n');
}
