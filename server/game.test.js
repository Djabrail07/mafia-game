const assert = require('assert');
const {
  buildRoleSet,
  evaluateWinCondition,
  getGameSummary,
  createGameState,
  getVisibleGameStateForPlayer,
  applyNightAction,
  advanceGamePhase,
  syncPhaseByRealtime,
  resolveNight,
  applyVote
} = require('./game');
const { getRoomStateStatus } = require('./routes/games');
const { withRoomLock } = require('./realtime');

const roles = buildRoleSet(10);

assert.equal(Array.isArray(roles), true, 'roles should be array');
assert.equal(roles.length, 10, 'roles count should match player count');
assert.equal(roles.filter(r => r === 'mafia').length >= 1, true, 'must include mafia');
assert.equal(roles.includes('don'), true, 'must include don');
assert.equal(roles.includes('doctor'), true, 'must include doctor');
assert.equal(roles.includes('commissar'), true, 'must include commissar');

const summary = getGameSummary([
  { id: 1, role: 'mafia', alive: true },
  { id: 2, role: 'mafia', alive: true },
  { id: 3, role: 'citizen', alive: true },
  { id: 4, role: 'doctor', alive: true },
  { id: 5, role: 'commissar', alive: true },
  { id: 6, role: 'citizen', alive: true }
]);

assert.equal(summary.winner, 'ongoing', 'mafia is not yet winning when city is larger');
assert.equal(evaluateWinCondition({ mafia: 2, city: 2 }), 'mafia', 'mafia wins on equal count');
assert.equal(evaluateWinCondition({ mafia: 0, city: 4 }), 'city', 'city wins when mafia eliminated');

const roleSet4 = buildRoleSet(4);
assert.equal(roleSet4.filter((role) => role === 'mafia').length, 1, '4-player game must have one mafia');
assert.equal(roleSet4.filter((role) => role === 'doctor').length, 1, '4-player game must have one doctor');
assert.equal(roleSet4.filter((role) => role === 'commissar').length, 1, '4-player game must have one commissar');
assert.equal(roleSet4.filter((role) => role === 'citizen').length, 1, '4-player game must have one citizen');

const roleSet5 = buildRoleSet(5);
assert.equal(roleSet5.filter((role) => role === 'mafia').length, 1, '5-player game must have one mafia');
assert.equal(roleSet5.filter((role) => role === 'doctor').length, 1, '5-player game must have one doctor');
assert.equal(roleSet5.filter((role) => role === 'commissar').length, 1, '5-player game must have one commissar');
assert.equal(roleSet5.filter((role) => role === 'citizen').length, 2, '5-player game must have two citizens');

const sixPlayerRoles = buildRoleSet(6);
assert.equal(sixPlayerRoles.filter((role) => role === 'mafia').length, 1, '6-player game must have exactly one mafia');
assert.equal(sixPlayerRoles.filter((role) => role === 'don').length, 1, '6-player game must have one don');
assert.equal(sixPlayerRoles.filter((role) => role === 'doctor').length, 1, '6-player game must have exactly one doctor');
assert.equal(sixPlayerRoles.filter((role) => role === 'commissar').length, 1, '6-player game must have exactly one commissar');
assert.equal(sixPlayerRoles.filter((role) => role === 'citizen').length, 2, '6-player game must have two citizens');

const sevenPlayerRoles = buildRoleSet(7);
assert.equal(sevenPlayerRoles.filter((role) => role === 'don').length, 1, '7-player game must keep one don');
assert.equal(sevenPlayerRoles.filter((role) => role === 'citizen').length, 3, '7-player game must add one citizen');

const eightPlayerRoles = buildRoleSet(8);
assert.equal(eightPlayerRoles.filter((role) => role === 'don').length, 1, '8-player game must add one don');
assert.equal(eightPlayerRoles.filter((role) => role === 'mafia').length, 2, '8-player game must have two mafia');

const ninePlayerRoles = buildRoleSet(9);
assert.equal(ninePlayerRoles.filter((role) => role === 'mafia').length, 2, '9-player game must keep two mafia');
assert.equal(ninePlayerRoles.filter((role) => role === 'citizen').length, 4, '9-player game must add one citizen');

const tenPlayerRoles = buildRoleSet(10);
assert.equal(tenPlayerRoles.filter((role) => role === 'mafia').length, 2, '10-player game must have two mafia');
assert.equal(tenPlayerRoles.filter((role) => role === 'don').length, 1, '10-player game must have one don');
assert.equal(tenPlayerRoles.filter((role) => role === 'citizen').length, 5, '10-player game must add one citizen');

const elevenPlayerRoles = buildRoleSet(11);
assert.equal(elevenPlayerRoles.filter((role) => role === 'mafia').length, 3, '11-player game must add a third mafia');

const twelvePlayerRoles = buildRoleSet(12);
assert.equal(twelvePlayerRoles.filter((role) => role === 'mafia').length, 3, '12-player game must keep three mafia');
assert.equal(twelvePlayerRoles.filter((role) => role === 'citizen').length, 6, '12-player game must add one citizen');

const roomGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Test Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'doctor', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});

const visible = getVisibleGameStateForPlayer(roomGame, 2);
assert.equal(visible.myRole, 'doctor', 'viewer should see own role');
assert.equal(visible.players.find((player) => player.id === 1).role, null, 'other players should hide their roles');

const nightGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Night Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'doctor', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});

nightGame.phase = 'night';
nightGame.nightActions = { mafia: 3, don: null, commissar: null, doctor: 3 };
applyNightAction(nightGame, 1, 'mafia', 3);
assert.equal(nightGame.players.find((player) => player.id === 3).alive, true, 'doctor should save target');

const finishedGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Finish Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
finishedGame.phase = 'vote';
finishedGame.dayVotes = { 2: 1, 3: 2 };
const pendingVote = advanceGamePhase(finishedGame, 'vote');
assert.equal(pendingVote.phase, 'vote', 'vote phase should wait for all players to vote');
assert.equal(finishedGame.winner, null, 'winner should stay pending until all votes are cast');

const singleActionGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Single Action Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
singleActionGame.phase = 'night';
singleActionGame.nightActions = { mafia: null, don: null, commissar: null, doctor: null };
const firstAction = applyNightAction(singleActionGame, 1, 'mafia', 2);
const secondAction = applyNightAction(singleActionGame, 1, 'mafia', 3);
assert.equal(firstAction.accepted, true, 'mafia should be able to act once');
assert.equal(secondAction.accepted, false, 'same mafia player should not act twice in one night');

const commissarCheckGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Commissar Check Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'doctor', alive: true },
    { id: 3, nickname: 'Carl', role: 'commissar', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
commissarCheckGame.phase = 'night';
const checkAction = applyNightAction(commissarCheckGame, 3, 'commissar', 1, 'check');
const secondCommissarAction = applyNightAction(commissarCheckGame, 3, 'commissar', 4, 'jail');
assert.equal(checkAction.accepted, true, 'commissar should be able to check a target');
assert.equal(commissarCheckGame.players.find((player) => player.id === 1).alive, true, 'checking a target must not eliminate them');
assert.equal(secondCommissarAction.reason, 'already_used', 'commissar must choose only one action per night');

commissarCheckGame.nightActions = { mafia: 4, don: null, commissar: 1, commissarAction: 'check', doctor: 4 };
resolveNight(commissarCheckGame);
assert.equal(getVisibleGameStateForPlayer(commissarCheckGame, 3).lastNightResult.commissarCheck, 'mafia', 'commissar should receive the check result');
assert.equal(getVisibleGameStateForPlayer(commissarCheckGame, 4).lastNightResult.commissarCheck, null, 'check result must be hidden from other players');

const commissarJailGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Commissar Jail Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'doctor', alive: true },
    { id: 3, nickname: 'Carl', role: 'commissar', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
commissarJailGame.phase = 'night';
const jailAction = applyNightAction(commissarJailGame, 3, 'commissar', 1, 'jail');
assert.equal(jailAction.accepted, true, 'commissar should be able to jail a target');
assert.equal(commissarJailGame.players.find((player) => player.id === 1).alive, false, 'jailing should eliminate the target immediately');
assert.equal(commissarJailGame.winner, 'city', 'jailing the last mafia should trigger the city victory');

const doctorGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Doctor Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'doctor', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
doctorGame.phase = 'night';
doctorGame.nightActions = { mafia: null, don: null, commissar: null, doctor: null };
const firstHeal = applyNightAction(doctorGame, 2, 'doctor', 2);
const secondHeal = applyNightAction(doctorGame, 2, 'doctor', 2);
assert.equal(firstHeal.accepted, true, 'doctor should be able to heal himself once');
assert.equal(secondHeal.accepted, false, 'doctor should not heal himself again in the same match');

const voteGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Vote Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
voteGame.phase = 'vote';
voteGame.dayVotes = { 1: 2 };
const noResolution = advanceGamePhase(voteGame, 'vote');
assert.equal(noResolution.phase, 'vote', 'vote phase should wait for all alive players to vote');
assert.equal(voteGame.dayVotes[1], 2, 'a single vote should not finalize the vote phase early');

const completedVoteGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Completed Vote Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
completedVoteGame.phase = 'vote';
completedVoteGame.dayVotes = { 1: 2, 2: 2, 3: 2, 4: 2 };
const completedVoteResult = advanceGamePhase(completedVoteGame, 'vote');
assert.equal(completedVoteResult.changed, false, 'all submitted votes must wait until the vote timer expires');
assert.equal(completedVoteResult.waitingForTimer, true, 'vote should report that it is waiting for the deadline');
assert.equal(completedVoteGame.players.find((player) => player.id === 2).alive, true, 'vote winner must remain in game until the deadline');
assert.equal(completedVoteGame.phase, 'vote', 'vote phase must remain active until timer expiry');
completedVoteGame.phaseEndsAt = Date.now() - 1;
const expiredCompleteVoteResult = syncPhaseByRealtime(completedVoteGame);
assert.equal(expiredCompleteVoteResult.changed, true, 'vote should resolve after timer expiry');
assert.equal(completedVoteGame.players.find((player) => player.id === 2).alive, false, 'vote winner should be eliminated after the deadline');
assert.equal(completedVoteGame.phase, 'night', 'resolved vote should advance to night');
assert.match(completedVoteGame.log.at(-1).text, /Bob.*исключён|исключён.*Bob/i, 'successful vote should announce the eliminated player');
assert.match(getVisibleGameStateForPlayer(completedVoteGame, 3).log.at(-1).text, /Bob.*исключён|исключён.*Bob/i, 'vote announcement should be visible to every player');

const finishedMafiaGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Finished Mafia Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Ben', role: 'don', alive: false },
    { id: 3, nickname: 'Carl', role: 'doctor', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
finishedMafiaGame.phase = 'finished';
finishedMafiaGame.winner = 'mafia';
finishedMafiaGame.mmrResults = [
  { userId: 1, nickname: 'Alice', delta: 25, ratingAfter: 1225 },
  { userId: 2, nickname: 'Ben', delta: -20, ratingAfter: 1180 }
];
const finishedMafiaVisible = getVisibleGameStateForPlayer(finishedMafiaGame, 3);
assert.deepEqual(finishedMafiaVisible.mmrResults.map((player) => player.nickname), ['Alice', 'Ben'], 'finished game should show MMR results for participants');
assert.equal(finishedMafiaVisible.winningTeamPlayers, undefined, 'finished game should not expose a winners-only list');
const activeMmrGame = { ...finishedMafiaGame, phase: 'night', winner: 'ongoing' };
assert.equal(getVisibleGameStateForPlayer(activeMmrGame, 3).mmrResults, undefined, 'MMR result list must remain hidden before match end');

const timedOutVoteGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Timed Out Vote Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
timedOutVoteGame.phase = 'vote';
timedOutVoteGame.dayVotes = { 1: 2, 3: 2 };
timedOutVoteGame.phaseEndsAt = Date.now() - 1;
const timedOutVoteResult = syncPhaseByRealtime(timedOutVoteGame);
assert.equal(timedOutVoteResult.changed, true, 'vote timer expiry should resolve votes that were cast');
assert.equal(timedOutVoteGame.players.find((player) => player.id === 2).alive, false, 'most-voted player should be eliminated at timeout');
assert.equal(timedOutVoteGame.phase, 'night', 'vote timeout should advance to night');
assert.ok(timedOutVoteGame.phaseEndsAt > Date.now(), 'vote timeout should start a new phase timer');
assert.equal(timedOutVoteGame.penaltiesByUser?.[2], undefined, 'one missed vote must not be treated as AFK');

const repeatedMissGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Repeated Missed Votes',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
repeatedMissGame.phase = 'vote';
repeatedMissGame.dayVotes = { 2: 2, 3: 2, 4: 2 };
repeatedMissGame.phaseEndsAt = Date.now() - 1;
syncPhaseByRealtime(repeatedMissGame);
assert.equal(repeatedMissGame.penaltiesByUser?.[1], undefined, 'first missed vote deadline must only increment the counter');
repeatedMissGame.phase = 'vote';
repeatedMissGame.dayVotes = { 3: 4, 4: 3 };
repeatedMissGame.phaseEndsAt = Date.now() - 1;
syncPhaseByRealtime(repeatedMissGame);
assert.equal(repeatedMissGame.penaltiesByUser[1], 'afk', 'two consecutive missed vote deadlines should result in an AFK penalty');

const tiedVoteGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Tied Vote Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
tiedVoteGame.phase = 'vote';
tiedVoteGame.dayVotes = { 1: 2, 2: 3, 3: 2, 4: 3 };
tiedVoteGame.phaseEndsAt = Date.now() - 1;
syncPhaseByRealtime(tiedVoteGame);
assert.equal(tiedVoteGame.players.filter((player) => !player.alive).length, 0, 'tied vote should not eliminate anyone');
assert.match(tiedVoteGame.log.at(-1).text, /никто не будет выгнан/i, 'tied vote should announce that nobody is eliminated');

const emptyVoteGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Empty Vote Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
emptyVoteGame.phase = 'vote';
emptyVoteGame.dayVotes = {};
emptyVoteGame.phaseEndsAt = Date.now() - 1;
syncPhaseByRealtime(emptyVoteGame);
assert.match(emptyVoteGame.log.at(-1).text, /никто не будет выгнан/i, 'empty vote should announce that nobody is eliminated');

const finishedStatus = getRoomStateStatus('playing', { phase: 'finished', winner: 'city' });
assert.equal(finishedStatus, 'finished', 'finished game state must override room status');
assert.equal(getRoomStateStatus('waiting', { phase: 'night', winner: null }), 'waiting', 'active rooms should remain open');

const doctorProtectedNight = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Doctor Protect',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'doctor', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
doctorProtectedNight.phase = 'night';
doctorProtectedNight.nightActions = { mafia: 3, don: null, commissar: null, doctor: 3 };
const protectedNightResult = resolveNight(doctorProtectedNight);
assert.equal(protectedNightResult.doctorSaved, true, 'doctor save should trigger when mafia and doctor target match');
assert.equal(doctorProtectedNight.players.find((player) => player.id === 3).alive, true, 'doctor-protected target should survive the night');

const voteDoubleCheck = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Vote Double',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: true },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
voteDoubleCheck.phase = 'vote';
const firstVote = applyVote(voteDoubleCheck, 1, 2);
const secondVote = applyVote(voteDoubleCheck, 1, 3);
assert.equal(firstVote.accepted, true, 'player should be able to vote once');
assert.equal(secondVote.accepted, false, 'player should not be able to vote twice in the same round');

const eliminatedVoterGame = createGameState({
  roomId: 1,
  roomCode: 'ABC123',
  roomName: 'Eliminated Voter Room',
  players: [
    { id: 1, nickname: 'Alice', role: 'mafia', alive: false },
    { id: 2, nickname: 'Bob', role: 'citizen', alive: true },
    { id: 3, nickname: 'Carl', role: 'citizen', alive: true },
    { id: 4, nickname: 'Dina', role: 'citizen', alive: true }
  ]
});
eliminatedVoterGame.phase = 'vote';
const eliminatedVoterResult = applyVote(eliminatedVoterGame, 1, 2);
assert.equal(eliminatedVoterResult.accepted, false, 'eliminated players must not be able to vote');
assert.equal(eliminatedVoterResult.reason, 'invalid_vote', 'eliminated voter should be rejected as invalid');

async function testRoomStateLock() {
  let activeOperations = 0;
  let maxActiveOperations = 0;

  await Promise.all(Array.from({ length: 5 }, () => withRoomLock('ABC123', async () => {
    activeOperations += 1;
    maxActiveOperations = Math.max(maxActiveOperations, activeOperations);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeOperations -= 1;
  })));

  assert.equal(maxActiveOperations, 1, 'operations for one room must be serialized');
  console.log('game logic tests passed');
}

testRoomStateLock().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
