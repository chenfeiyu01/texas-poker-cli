import { GameState } from '../core/Game';
import { buildSoulPrompt, SoulProfile } from './soul';

export function buildPokerPrompt(state: GameState, myId: string, soul: SoulProfile): string {
  const me = state.players.find((p) => p.id === myId);
  if (!me) return '';

  const phaseNames: Record<string, string> = {
    waiting: '等待中',
    preflop: '翻牌前',
    flop: '翻牌圈',
    turn: '转牌圈',
    river: '河牌圈',
    showdown: '摊牌',
    ended: '结束',
  };

  const handStr = me.hand ? me.hand.join(' ') : '未知';
  const communityStr =
    state.communityCards.length > 0
      ? state.communityCards.map((c) => c.display).join(' ')
      : '暂无';

  const activePlayers = state.players.filter(
    (p) => p.status === 'active' || p.status === 'all-in'
  );
  const foldedPlayers = state.players.filter((p) => p.status === 'folded');

  const toCall = state.currentBet - me.bet;

  const playerInfo = state.players
    .map((p) => {
      const marker = p.id === myId ? '(你)' : '';
      return `  - ${p.name}${marker}: 筹码${p.chips}, 已下注${p.bet}, 状态[${p.status}]`;
    })
    .join('\n');

  const recentActions = state.session?.recentActions
    .map((action) => {
      const amountText = action.declaredAmount ? `，声明金额 ${action.declaredAmount}` : '';
      return `  - 第${action.handNumber}手/${phaseNames[action.phase] || action.phase}：${action.playerName} ${action.action}${amountText}，累计投入 ${action.totalBet}，思考 ${action.thinkTimeMs}ms`;
    })
    .join('\n') || '  - 暂无';

  const publicProfiles = state.session?.publicProfiles
    .map((profile) => `  - ${profile.playerName}: ${profile.summary} 近期：${profile.recentNote}`)
    .join('\n') || '  - 暂无';

  const privateMemory = state.session?.privateMemory;
  const privateSummary = privateMemory
    ? [
        '## 你的本次会话记忆',
        privateMemory.sessionSummary,
        '',
        '### 最近关键事件',
        ...(privateMemory.recentEvents.map((event) => `- ${event}`)),
        '',
        '### 你对其他玩家的观察',
        ...(privateMemory.playerReads.map((read) => `- ${read.playerName}: ${read.summary}`)),
      ].join('\n')
    : '## 你的本次会话记忆\n暂无。';

  const recentHands = state.session?.recentHands
    .map((hand) => `  - ${hand.headline}`)
    .join('\n') || '  - 暂无';

  return `你是一位德州扑克高手，正在进行一场紧张刺激的牌局。请根据概率、对手行为和筹码深度做出最优决策。

## 你的灵魂设定

${buildSoulPrompt(soul)}

## 当前牌局状态

- **你的手牌**: ${handStr}
- **公共牌**: ${communityStr}
- **当前阶段**: ${phaseNames[state.phase] || state.phase}
- **底池**: ${state.pot}
- **当前总下注**: ${state.currentBet}
- **你需要跟注**: ${toCall}
- **你的筹码**: ${me.chips}
- **你的已下注**: ${me.bet}

## 玩家信息
${playerInfo}

## 最近公开行动
${recentActions}

## 公开玩家画像
${publicProfiles}

## 最近几手结果
${recentHands}

## 存活玩家数
- 活跃: ${activePlayers.length}人
- 已弃牌: ${foldedPlayers.length}人

${privateSummary}

## 决策规则
1. **fold (弃牌)**: 当你认为胜率极低或赔率不合理时选择。会放弃已下注的筹码。
2. **check (过牌)**: 当无人下注且轮到你时选择，不下注直接过。
3. **call (跟注)**: 跟随当前最高下注，继续参与牌局。
4. **raise <金额> (加注)**: 将总下注提升到指定金额。加注必须大于当前下注。

## 策略提示
- 翻牌前强牌(AA/KK/QQ/AK)可以积极加注
- 翻牌后击中牌面(对子/两对/顺子/同花)时价值下注
- 听牌时考虑底池赔率决定是否跟注
- 观察对手下注模式、思考时长、最近输赢走势
- 结合你的灵魂设定和近期经历，自然推理你此刻想如何回应牌桌

## 输出格式
请只输出以下四种格式之一，不要添加任何解释：
- fold
- check
- call
- raise <具体金额>

你的决策是：
`;
}
