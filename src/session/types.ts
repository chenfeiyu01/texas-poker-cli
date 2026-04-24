import { GamePhase } from '../core/Game';
import { SoulProfile } from '../ai/soul';

export type PokerAction = 'fold' | 'check' | 'call' | 'raise';

export interface PlayerJoinMeta {
  isAi?: boolean;
  isGm?: boolean;
  soul?: SoulProfile;
}

export interface ActionRecord {
  handNumber: number;
  sequence: number;
  phase: GamePhase;
  playerId: string;
  playerName: string;
  action: PokerAction;
  declaredAmount?: number;
  totalBet: number;
  potAfter: number;
  thinkTimeMs: number;
  timestamp: number;
}

export interface PublicPlayerProfile {
  playerId: string;
  playerName: string;
  title: string;
  summary: string;
  recentNote: string;
  revealedTraits: string[];
  handsPlayed: number;
  netChips: number;
}

export interface GmPlayerProfile extends PublicPlayerProfile {
  soul?: SoulProfile;
  soulTags: string[];
  privateSummary: string;
}

export interface RecentHandSummary {
  handNumber: number;
  winners: string[];
  netChanges: Record<string, number>;
  headline: string;
}

export interface PlayerReadSummary {
  playerId: string;
  playerName: string;
  summary: string;
}

export interface PrivateMemoryView {
  soul?: SoulProfile;
  sessionSummary: string;
  recentEvents: string[];
  playerReads: PlayerReadSummary[];
}

export interface SessionView {
  handNumber: number;
  recentActions: ActionRecord[];
  recentHands: RecentHandSummary[];
  publicProfiles: PublicPlayerProfile[];
  gmProfiles?: GmPlayerProfile[];
  privateMemory?: PrivateMemoryView;
  viewerRole: 'gm' | 'ai' | 'player';
}

export interface AiDecisionLog {
  model: string;
  requestMode: 'chat-completions' | 'responses';
  durationMs: number;
  promptSummary: string;
  reasoningSummary?: string;
  speech?: string;
  rawOutput: string;
  finalAction: string;
  usedFallback: boolean;
  errorMessage?: string;
}
