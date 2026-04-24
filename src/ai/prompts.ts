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
    .slice(-12)
    .map((action) => {
      const amountText = action.declaredAmount ? ` ${action.declaredAmount}` : '';
      return `- H${action.handNumber}/${phaseNames[action.phase] || action.phase} ${action.playerName} ${action.action}${amountText} total=${action.totalBet} think=${action.thinkTimeMs}ms`;
    })
    .join('\n') || '- 暂无';

  const publicProfiles = state.session?.publicProfiles
    .slice(0, 8)
    .map((profile) => `- ${profile.playerName}: ${profile.summary}; 近期=${profile.recentNote}; 净输赢=${profile.netChips}`)
    .join('\n') || '- 暂无';

  const privateMemory = state.session?.privateMemory;
  const privateSummary = privateMemory
    ? [
        `- 总结: ${privateMemory.sessionSummary}`,
        ...privateMemory.recentEvents.slice(-6).map((event) => `- 事件: ${event}`),
        ...privateMemory.playerReads.slice(0, 8).map((read) => `- 读牌 ${read.playerName}: ${read.summary}`),
      ].join('\n')
    : '- 暂无';

  const recentHands = state.session?.recentHands
    .slice(-4)
    .map((hand) => `- H${hand.handNumber}: ${hand.headline}`)
    .join('\n') || '- 暂无';

  return [
    '你是一个德州扑克 AI。基于 soul、桌面信息、下注节奏、思考时长、近期输赢与情绪，先做简短思考，再决定动作，并可说一句牌桌发言来影响别人。',
    '',
    '[SOUL]',
    buildSoulPrompt(soul),
    '',
    '[TABLE]',
    `手牌=${handStr}`,
    `公共牌=${communityStr}`,
    `阶段=${phaseNames[state.phase] || state.phase}`,
    `底池=${state.pot} 当前下注=${state.currentBet} 跟注成本=${toCall}`,
    `我的筹码=${me.chips} 我的已下注=${me.bet}`,
    `活跃人数=${activePlayers.length} 弃牌人数=${foldedPlayers.length}`,
    '',
    '[PLAYERS]',
    playerInfo,
    '',
    '[RECENT_ACTIONS]',
    recentActions,
    '',
    '[PUBLIC_PROFILES]',
    publicProfiles,
    '',
    '[RECENT_HANDS]',
    recentHands,
    '',
    '[PRIVATE_MEMORY]',
    privateSummary,
    '',
    '[LEGAL_ACTIONS]',
    'fold',
    'check',
    'call',
    'raise <金额>',
    '',
    '[OUTPUT]',
    '只输出一个 JSON 对象，不要输出 markdown，不要输出代码块。',
    '格式如下：',
    '{"reasoning":"一句到三句，简短说明你为什么这么做","action":"fold/check/call/raise <金额>","speech":"一句牌桌发言；如果不想说话可输出..."}',
    '要求：reasoning 要简短，speech 要像真人牌桌发言，可以虚张声势、骗人、挑衅、装弱，也可以输出 ...。',
  ].join('\n');
}
