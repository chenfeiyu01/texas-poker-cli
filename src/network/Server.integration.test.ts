import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerServer } from './Server';
import { PokerClient } from './Client';
import { GamePhase, GameState } from '../core/Game';
import { findAvailablePort } from '../runtime/serverBootstrap';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForState(
  client: PokerClient,
  predicate: (state: GameState) => boolean,
  timeoutMs: number = 5000,
): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const current = client.getLastState();
    if (current && predicate(current)) {
      resolve(current);
      return;
    }

    const timer = setTimeout(() => {
      client.offState(listener);
      reject(new Error('等待状态超时'));
    }, timeoutMs);

    const listener = (state: GameState) => {
      if (!predicate(state)) {
        return;
      }

      clearTimeout(timer);
      client.offState(listener);
      resolve(state);
    };

    client.onState(listener);
  });
}

test('server and clients can complete one full hand through all betting streets', async () => {
  const port = await findAvailablePort();
  const roomId = `test-room-${Date.now()}`;
  const hostUrl = `http://localhost:${port}`;
  const server = new PokerServer(port);
  const host = new PokerClient();
  const guest = new PokerClient();

  host.connect(hostUrl);
  guest.connect(hostUrl);

  try {
    await wait(100);

    await host.createRoom(roomId, 'Alice', { isGm: true });
    await guest.joinRoom(roomId, 'Bob', { isGm: false });

    await Promise.all([
      waitForState(host, (state) => state.players.length === 2 && state.phase === GamePhase.WAITING),
      waitForState(guest, (state) => state.players.length === 2 && state.phase === GamePhase.WAITING),
    ]);

    const hostPreflop = waitForState(host, (state) => state.phase === GamePhase.PREFLOP && state.currentPlayerId === state.players[0]?.id);
    host.startGame(roomId);
    let state = await hostPreflop;
    assert.equal(state.communityCards.length, 0);

    host.action(roomId, 'call');
    state = await waitForState(host, (next) => next.phase === GamePhase.PREFLOP && next.currentPlayerId === state.players[1]?.id);
    assert.equal(state.currentBet, 20);

    guest.action(roomId, 'check');
    state = await waitForState(host, (next) => next.phase === GamePhase.FLOP && next.communityCards.length === 3);
    assert.equal(state.currentPlayerId, state.players[0]?.id);

    host.action(roomId, 'check');
    state = await waitForState(host, (next) => next.phase === GamePhase.FLOP && next.currentPlayerId === state.players[1]?.id);

    guest.action(roomId, 'check');
    state = await waitForState(host, (next) => next.phase === GamePhase.TURN && next.communityCards.length === 4);
    assert.equal(state.currentPlayerId, state.players[0]?.id);

    host.action(roomId, 'check');
    state = await waitForState(host, (next) => next.phase === GamePhase.TURN && next.currentPlayerId === state.players[1]?.id);

    guest.action(roomId, 'check');
    state = await waitForState(host, (next) => next.phase === GamePhase.RIVER && next.communityCards.length === 5);
    assert.equal(state.currentPlayerId, state.players[0]?.id);

    host.action(roomId, 'check');
    state = await waitForState(host, (next) => next.phase === GamePhase.RIVER && next.currentPlayerId === state.players[1]?.id);

    guest.action(roomId, 'check');
    state = await waitForState(host, (next) => next.phase === GamePhase.ENDED);
    assert.ok(state.winnerIds && state.winnerIds.length >= 1);
    assert.ok(state.handResults);
  } finally {
    host.disconnect();
    guest.disconnect();
    await server.close();
  }
});

test('next hand only starts when host explicitly starts it', async () => {
  const port = await findAvailablePort();
  const roomId = `test-manual-next-${Date.now()}`;
  const hostUrl = `http://localhost:${port}`;
  const server = new PokerServer(port);
  const host = new PokerClient();
  const guest = new PokerClient();

  host.connect(hostUrl);
  guest.connect(hostUrl);

  try {
    await wait(100);

    await host.createRoom(roomId, 'Alice', { isGm: true });
    await guest.joinRoom(roomId, 'Bob', { isGm: false });

    await Promise.all([
      waitForState(host, (state) => state.players.length === 2 && state.phase === GamePhase.WAITING),
      waitForState(guest, (state) => state.players.length === 2 && state.phase === GamePhase.WAITING),
    ]);

    host.startGame(roomId);
    await waitForState(host, (state) => state.phase === GamePhase.PREFLOP);

    host.action(roomId, 'fold');
    let endedState = await waitForState(host, (state) => state.phase === GamePhase.ENDED);
    assert.ok(endedState.winnerIds?.includes(endedState.players[1]?.id));

    await wait(300);
    endedState = host.getLastState() as GameState;
    assert.equal(endedState.phase, GamePhase.ENDED);

    host.startGame(roomId);
    const nextHandState = await waitForState(host, (state) => state.phase === GamePhase.PREFLOP && state.session?.handNumber === 2);
    assert.equal(nextHandState.communityCards.length, 0);
  } finally {
    host.disconnect();
    guest.disconnect();
    await server.close();
  }
});
