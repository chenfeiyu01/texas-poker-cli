import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GamePhase } from './Game';

function createTwoPlayerGame(): Game {
  const game = new Game();
  game.addPlayer('p1', 'Alice', 1000, true);
  game.addPlayer('p2', 'Bob', 1000);
  game.start();
  return game;
}

function createThreePlayerGame(): Game {
  const game = new Game();
  game.addPlayer('p1', 'Alice', 1000, true);
  game.addPlayer('p2', 'Bob', 1000);
  game.addPlayer('p3', 'Carol', 1000);
  game.start();
  return game;
}

test('flop/turn/river each require a full betting round', () => {
  const game = createTwoPlayerGame();

  let state = game.getState();
  assert.equal(state.phase, GamePhase.PREFLOP);
  assert.equal(state.currentPlayerId, 'p1');

  game.action('p1', 'call');
  state = game.getState();
  assert.equal(state.phase, GamePhase.PREFLOP);
  assert.equal(state.currentPlayerId, 'p2');

  game.action('p2', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.FLOP);
  assert.equal(state.communityCards.length, 3);
  assert.equal(state.currentPlayerId, 'p1');

  game.action('p1', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.FLOP);
  assert.equal(state.currentPlayerId, 'p2');

  game.action('p2', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.TURN);
  assert.equal(state.communityCards.length, 4);
  assert.equal(state.currentPlayerId, 'p1');

  game.action('p1', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.TURN);
  assert.equal(state.currentPlayerId, 'p2');

  game.action('p2', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.RIVER);
  assert.equal(state.communityCards.length, 5);
  assert.equal(state.currentPlayerId, 'p1');

  game.action('p1', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.RIVER);
  assert.equal(state.currentPlayerId, 'p2');

  game.action('p2', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.ENDED);
  assert.ok(Array.isArray(state.winnerIds));
});

test('a raise keeps the street open until other players respond', () => {
  const game = createThreePlayerGame();

  game.action('p2', 'call');
  game.action('p3', 'call');
  game.action('p1', 'check');

  let state = game.getState();
  assert.equal(state.phase, GamePhase.FLOP);
  assert.equal(state.currentPlayerId, 'p3');

  game.action('p3', 'check');
  state = game.getState();
  assert.equal(state.phase, GamePhase.FLOP);
  assert.equal(state.currentPlayerId, 'p1');

  game.action('p1', 'raise', 40);
  state = game.getState();
  assert.equal(state.phase, GamePhase.FLOP);
  assert.equal(state.currentBet, 40);
  assert.equal(state.currentPlayerId, 'p2');

  game.action('p2', 'call');
  state = game.getState();
  assert.equal(state.phase, GamePhase.FLOP);
  assert.equal(state.currentPlayerId, 'p3');

  game.action('p3', 'call');
  state = game.getState();
  assert.equal(state.phase, GamePhase.TURN);
  assert.equal(state.currentBet, 0);
});

test('a folded table resolves immediately and a new hand resets cleanly', () => {
  const game = createTwoPlayerGame();

  game.action('p1', 'fold');
  let state = game.getState();
  assert.equal(state.phase, GamePhase.ENDED);
  assert.deepEqual(state.winnerIds, ['p2']);

  game.start();
  state = game.getState('p1');
  assert.equal(state.phase, GamePhase.PREFLOP);
  assert.equal(state.communityCards.length, 0);
  assert.equal(state.currentBet, 20);
  assert.equal(state.winnerIds, undefined);
  assert.equal(state.players.find((player) => player.id === 'p1')?.status, 'active');
  assert.equal(state.players.find((player) => player.id === 'p2')?.status, 'active');
  assert.equal(state.players.find((player) => player.id === 'p1')?.hand?.length, 2);
});
