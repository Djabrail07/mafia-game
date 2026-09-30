const assert = require('assert');

const meta = require('./meta');
const { sanitizeAvatar } = require('./avatar');

assert.strictEqual(typeof meta.ensureUserProfile, 'function');
assert.strictEqual(typeof meta.getLeagueSummary, 'function');
assert.strictEqual(typeof meta.applyRankedMatchResults, 'function');

const league = meta.getLeagueSummary(1400);
assert.strictEqual(meta.getLeagueSummary(0).rating, 0);
assert.deepStrictEqual(
	[0, 249, 250, 999, 1000, 1999, 2000, 2499, 2500, 2999, 3000, 3999, 4000, 4999, 5000, 5999, 6000, 6999, 7000, 7499, 7500]
		.map((rating) => `${meta.getLeagueSummary(rating).name} ${meta.getLeagueSummary(rating).division}`),
	['Бронза 1', 'Бронза 1', 'Бронза 2', 'Бронза 4', 'Серебро 1', 'Серебро 4', 'Золото 1', 'Золото 2', 'Золото 3', 'Золото 3', 'Платина 1', 'Платина 3', 'Алмаз 1', 'Алмаз 3', 'Мастер 1', 'Мастер 3', 'Грандмастер 1', 'Грандмастер 3', 'Легенда 1', 'Легенда 2', 'Легенда 3']
);
assert.strictEqual(meta.applyMmrDelta(4, -20), 0);
assert.strictEqual(sanitizeAvatar(`data:image/jpeg;base64,${'A'.repeat(477)}`), null);
assert.strictEqual(sanitizeAvatar('data:image/jpeg;base64,/9j/2Q=='), 'data:image/jpeg;base64,/9j/2Q==');
assert.strictEqual(sanitizeAvatar('javascript:alert(1)'), null);
assert.ok(league.name);
assert.ok(league.division);
assert.ok(league.rating >= 0);

assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 1200, rankedGames: 10 }), 25);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1200, rankedGames: 10 }), -20);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 5000, rankedGames: 10 }), 22);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 5000, rankedGames: 10 }), -25);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 5250, rankedGames: 10 }), 20);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 5250, rankedGames: 10 }), -27);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 5500, rankedGames: 10 }), 18);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 5500, rankedGames: 10 }), -29);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 6000, rankedGames: 10 }), 16);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 6000, rankedGames: 10 }), -31);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 6250, rankedGames: 10 }), 14);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 6250, rankedGames: 10 }), -33);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 6500, rankedGames: 10 }), 12);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 6500, rankedGames: 10 }), -35);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 7000, rankedGames: 10 }), 10);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 7000, rankedGames: 10 }), -37);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 7250, rankedGames: 10 }), 8);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 7250, rankedGames: 10 }), -39);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 7500, rankedGames: 10 }), 6);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 7500, rankedGames: 10 }), -42);
assert.strictEqual(meta.calculateMmrDelta({ result: 'draw', rating: 1200, opponentRating: 1200, rankedGames: 2 }), 0);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 1200, rankedGames: 10, penalty: 'afk' }), 0, 'win reward and AFK penalty should be applied independently');
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1200, rankedGames: 10, penalty: 'afk' }), -45);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 1200, rankedGames: 10, penalty: 'rule_violation' }), 0);
assert.strictEqual(meta.calculateMmrDelta({ result: 'draw', rating: 1200, opponentRating: 1200, rankedGames: 10, penalty: 'afk' }), -25);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 1200, opponentRating: 1200, rankedGames: 0 }), 45);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 1000, opponentRating: 1200, rankedGames: 0 }), 50);
assert.strictEqual(meta.calculateMmrDelta({ result: 'win', rating: 1200, opponentRating: 1000, rankedGames: 0 }), 40);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1400, opponentRating: 1200, rankedGames: 9 }), -50);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1200, opponentRating: 1400, rankedGames: 9 }), -40);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1200, opponentRating: 1200, rankedGames: 10, penalty: 'abandon' }), -30);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1200, opponentRating: 1200, rankedGames: 10, penalty: 'afk' }), -45);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1200, opponentRating: 1200, rankedGames: 10, penalty: 'rule_violation' }), -45);
assert.strictEqual(meta.calculateMmrDelta({ result: 'loss', rating: 1200, opponentRating: 1200, rankedGames: 10, penalty: 'abandon', previousInfractions: 2 }), -50);

const noDecayAtSevenDays = meta.calculateMmrDecay({ rating: 100, lastRankedAt: 0, nextDecayAt: 14 * 86400000, now: 7 * 86400000 });
assert.strictEqual(noDecayAtSevenDays.delta, 0);
const decayAtFourteenDays = meta.calculateMmrDecay({ rating: 100, lastRankedAt: 0, nextDecayAt: 14 * 86400000, now: 14 * 86400000 });
assert.strictEqual(decayAtFourteenDays.delta, -5);
assert.strictEqual(decayAtFourteenDays.ratingAfter, 95);
const weeklyDecay = meta.calculateMmrDecay({ rating: 100, lastRankedAt: 0, nextDecayAt: 14 * 86400000, now: 70 * 86400000 });
assert.strictEqual(weeklyDecay.delta, -45);
assert.strictEqual(weeklyDecay.periodsApplied, 9);
const maxWeeklyDecay = meta.calculateMmrDecay({ rating: 100, lastRankedAt: 0, nextDecayAt: 14 * 86400000, now: 21 * 86400000 });
assert.strictEqual(maxWeeklyDecay.delta, -10);
const floorDecay = meta.calculateMmrDecay({ rating: 3, lastRankedAt: 0, nextDecayAt: 14 * 86400000, now: 70 * 86400000 });
assert.strictEqual(floorDecay.ratingAfter, 0);

console.log('meta engine: ok');
