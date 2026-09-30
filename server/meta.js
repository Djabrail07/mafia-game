const db = require("./db");
const { sanitizeAvatar } = require("./avatar");

const LEAGUES = [
    "Бронза",
    "Серебро",
    "Золото",
    "Платина",
    "Алмаз",
    "Мастер",
    "Грандмастер",
    "Легенда"
];

const DIVISIONS = ["1", "2", "3", "4"];
const MMR_DECAY_PER_WEEK = 5;
const MMR_DECAY_WEEKLY_CAP = 10;
const LEAGUE_TIERS = [
    { name: "Бронза", division: "1", min: 0, max: 249 },
    { name: "Бронза", division: "2", min: 250, max: 499 },
    { name: "Бронза", division: "3", min: 500, max: 749 },
    { name: "Бронза", division: "4", min: 750, max: 999 },
    { name: "Серебро", division: "1", min: 1000, max: 1249 },
    { name: "Серебро", division: "2", min: 1250, max: 1499 },
    { name: "Серебро", division: "3", min: 1500, max: 1749 },
    { name: "Серебро", division: "4", min: 1750, max: 1999 },
    { name: "Золото", division: "1", min: 2000, max: 2249 },
    { name: "Золото", division: "2", min: 2250, max: 2499 },
    { name: "Золото", division: "3", min: 2500, max: 2999 },
    { name: "Платина", division: "1", min: 3000, max: 3249 },
    { name: "Платина", division: "2", min: 3250, max: 3499 },
    { name: "Платина", division: "3", min: 3500, max: 3999 },
    { name: "Алмаз", division: "1", min: 4000, max: 4249 },
    { name: "Алмаз", division: "2", min: 4250, max: 4499 },
    { name: "Алмаз", division: "3", min: 4500, max: 4999 },
    { name: "Мастер", division: "1", min: 5000, max: 5249 },
    { name: "Мастер", division: "2", min: 5250, max: 5499 },
    { name: "Мастер", division: "3", min: 5500, max: 5999 },
    { name: "Грандмастер", division: "1", min: 6000, max: 6249 },
    { name: "Грандмастер", division: "2", min: 6250, max: 6499 },
    { name: "Грандмастер", division: "3", min: 6500, max: 6999 },
    { name: "Легенда", division: "1", min: 7000, max: 7249 },
    { name: "Легенда", division: "2", min: 7250, max: 7499 },
    { name: "Легенда", division: "3", min: 7500, max: Number.POSITIVE_INFINITY }
];

const LEAGUE_MMR_CHANGES = {
    "Бронза": [25, -20],
    "Серебро": [25, -20],
    "Золото": [25, -20],
    "Платина": [25, -20],
    "Алмаз": [25, -20],
    "Мастер": [[22, -25], [20, -27], [18, -29]],
    "Грандмастер": [[16, -31], [14, -33], [12, -35]],
    "Легенда": [[10, -37], [8, -39], [6, -42]]
};

function calculateMmrDelta({
    result,
    rating = 0,
    opponentRating = 0,
    rankedGames = 0,
    penalty = null,
    previousInfractions = 0
}) {
    const normalizedResult = String(result || "draw").toLowerCase();
    const ratingDifference = Number(opponentRating) - Number(rating);
    const opponentTier = ratingDifference > 0 ? "stronger" : ratingDifference < 0 ? "weaker" : "equal";
    const calibration = Number(rankedGames) < 10;
    let delta = 0;

    if (normalizedResult === "draw") {
        delta = 0;
    } else if (calibration) {
        const base = normalizedResult === "win" ? 45 : -45;
        const strengthAdjustment = opponentTier === "equal" ? 0 : opponentTier === "stronger" ? 5 : -5;
        delta = base + strengthAdjustment;
    } else {
        const tier = getLeagueSummary(rating);
        const tierChange = LEAGUE_MMR_CHANGES[tier.name];
        const resultChange = Array.isArray(tierChange[0]) ? tierChange[Number(tier.division) - 1] : tierChange;
        delta = normalizedResult === "win" ? resultChange[0] : resultChange[1];
    }

    if (penalty === "abandon") {
        delta = -30;
    } else if (penalty === "afk" || penalty === "rule_violation") {
        delta -= 25;
    }

    const repeatCount = Math.max(0, Number(previousInfractions) || 0);
    if (penalty && repeatCount > 0) {
        delta -= Math.min(repeatCount * 10, 30);
    }

    return delta;
}

function applyMmrDelta(rating, delta) {
    return Math.max(0, Math.round(Number(rating) || 0) + Math.round(Number(delta) || 0));
}

function calculateMmrDecay({ rating = 0, lastRankedAt, nextDecayAt, now = Date.now() }) {
    if (lastRankedAt === null || lastRankedAt === undefined || lastRankedAt === "") {
        return { delta: 0, ratingAfter: Math.max(0, Number(rating) || 0), periodsApplied: 0 };
    }

    const dueAt = nextDecayAt !== null && nextDecayAt !== undefined && nextDecayAt !== ""
        ? new Date(nextDecayAt).getTime()
        : new Date(lastRankedAt).getTime() + 14 * 86400000;
    if (!Number.isFinite(dueAt) || Number(now) < dueAt) {
        return { delta: 0, ratingAfter: Math.max(0, Number(rating) || 0), periodsApplied: 0 };
    }

    const periodsApplied = 1 + Math.floor((Number(now) - dueAt) / (7 * 86400000));
    const delta = -Math.min(MMR_DECAY_WEEKLY_CAP, MMR_DECAY_PER_WEEK) * periodsApplied;
    const ratingAfter = applyMmrDelta(rating, delta);

    return {
        delta: ratingAfter - (Number(rating) || 0),
        ratingAfter,
        periodsApplied,
        nextDecayAt: dueAt + periodsApplied * 7 * 86400000
    };
}

function getLeagueSummary(rating = 1200) {
    const normalizedRating = Math.max(0, Math.round(Number(rating) || 0));
    const tierIndex = LEAGUE_TIERS.findIndex((tier) => normalizedRating >= tier.min && normalizedRating <= tier.max);
    const tier = LEAGUE_TIERS[tierIndex] || LEAGUE_TIERS[LEAGUE_TIERS.length - 1];
    const leagueIndex = LEAGUES.indexOf(tier.name);
    const divisionIndex = Number(tier.division) - 1;

    return {
        name: tier.name,
        division: tier.division,
        rating: normalizedRating,
        leagueIndex,
        divisionIndex
    };
}

async function ensureUserProfile(userId) {
    if (!userId) {
        return null;
    }

    const [userRows] = await db.execute(
        "SELECT id, nickname, avatar FROM users WHERE id = ? LIMIT 1",
        [userId]
    );

    if (userRows.length === 0) {
        return null;
    }

    const user = userRows[0];
    const [profileRows] = await db.execute(
        "SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1",
        [userId]
    );

    const rating = Math.max(0, Number(profileRows[0]?.rating ?? 0));
    const hiddenMmr = Math.max(0, Number(profileRows[0]?.hidden_mmr ?? rating));
    const summary = getLeagueSummary(rating);

    if (profileRows.length > 0) {
        await db.execute(
            `
            UPDATE user_profiles
            SET avatar_url = ?,
                current_league = ?,
                current_division = ?,
                rating = ?,
                hidden_mmr = ?
            WHERE user_id = ?
            `,
            [
                user.avatar || null,
                summary.name,
                summary.division,
                rating,
                hiddenMmr,
                userId
            ]
        );

        const [updatedRows] = await db.execute(
            "SELECT * FROM user_profiles WHERE user_id = ? LIMIT 1",
            [userId]
        );
        return updatedRows[0] || null;
    }

    const [result] = await db.execute(
        `
        INSERT INTO user_profiles
        (user_id, avatar_url, current_league, current_division, rating, hidden_mmr, account_level)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        `,
        [
            userId,
            user.avatar || null,
            summary.name,
            summary.division,
            0,
            0
        ]
    );

    const [profileAfterInsert] = await db.execute(
        "SELECT * FROM user_profiles WHERE id = ? LIMIT 1",
        [result.insertId]
    );

    return profileAfterInsert[0] || null;
}

async function getCurrentSeason() {
    const [seasons] = await db.execute(
        "SELECT * FROM seasons WHERE status = 'active' ORDER BY start_at DESC LIMIT 1"
    );

    if (seasons.length > 0) {
        return seasons[0];
    }

    const [result] = await db.execute(
        "INSERT INTO seasons (name, status, start_at) VALUES (?, 'active', NOW())",
        ["Сезон 1"]
    );

    const [created] = await db.execute(
        "SELECT * FROM seasons WHERE id = ? LIMIT 1",
        [result.insertId]
    );

    return created[0] || null;
}

async function ensureRankedStats(executor, userId) {
    await executor.execute(
        `INSERT IGNORE INTO ranked_player_stats (user_id) VALUES (?)`,
        [userId]
    );
}

async function applyMmrDecayForUser(userId, now = Date.now()) {
    const profile = await ensureUserProfile(userId);
    if (!profile) return null;

    await ensureRankedStats(db, userId);
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [profileRows] = await connection.execute(
            `SELECT rating FROM user_profiles WHERE user_id = ? FOR UPDATE`,
            [userId]
        );
        const [statsRows] = await connection.execute(
            `SELECT * FROM ranked_player_stats WHERE user_id = ? FOR UPDATE`,
            [userId]
        );
        const currentRating = Number(profileRows[0]?.rating ?? 1200);
        const stats = statsRows[0];
        if (!stats?.last_ranked_at || !stats?.next_decay_at) {
            await connection.commit();
            return { delta: 0, rating: currentRating };
        }

        const decay = calculateMmrDecay({
            rating: currentRating,
            lastRankedAt: stats.last_ranked_at,
            nextDecayAt: stats.next_decay_at,
            now
        });
        if (decay.periodsApplied) {
            await connection.execute(
                `UPDATE ranked_player_stats SET next_decay_at = ? WHERE user_id = ?`,
                [new Date(decay.nextDecayAt), userId]
            );
        }
        if (!decay.delta) {
            await connection.commit();
            return { delta: 0, rating: decay.ratingAfter };
        }

        const league = getLeagueSummary(decay.ratingAfter);
        await connection.execute(
            `UPDATE user_profiles SET rating = ?, hidden_mmr = ?, current_league = ?, current_division = ? WHERE user_id = ?`,
            [decay.ratingAfter, decay.ratingAfter, league.name, league.division, userId]
        );
        await connection.execute(
            `INSERT INTO rating_history (user_id, season_id, rating_before, rating_after, delta, reason) VALUES (?, NULL, ?, ?, ?, 'inactivity_decay')`,
            [userId, currentRating, decay.ratingAfter, decay.delta]
        );
        await connection.execute(
            `UPDATE season_players SET rating_end = ?, league = ?, division = ? WHERE user_id = ? AND season_id = (SELECT id FROM seasons WHERE status = 'active' ORDER BY start_at DESC LIMIT 1)`,
            [decay.ratingAfter, league.name, league.division, userId]
        );
        await connection.commit();
        return { delta: decay.delta, rating: decay.ratingAfter };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function applyRankedMatchResults({ matchId, winner, players, penaltiesByUser = {} }) {
    if (!matchId || !Array.isArray(players) || !players.length) return [];

    const participantIds = [...new Set(players.map((player) => Number(player.id)).filter(Boolean))];
    for (const userId of participantIds) {
        await ensureUserProfile(userId);
        await ensureRankedStats(db, userId);
        await applyMmrDecayForUser(userId);
    }

    const activeSeason = await getCurrentSeason();
    const connection = await db.getConnection();
    const applied = [];
    try {
        await connection.beginTransaction();
        const profileById = new Map();
        const statsById = new Map();

        for (const userId of participantIds) {
            const [profileRows] = await connection.execute(
                `SELECT rating FROM user_profiles WHERE user_id = ? FOR UPDATE`,
                [userId]
            );
            const [statsRows] = await connection.execute(
                `SELECT * FROM ranked_player_stats WHERE user_id = ? FOR UPDATE`,
                [userId]
            );
            profileById.set(userId, Number(profileRows[0]?.rating ?? 0));
            statsById.set(userId, statsRows[0] || { ranked_games: 0, infractions_count: 0 });
        }

        for (const player of players) {
            const userId = Number(player.id);
            if (!profileById.has(userId)) continue;

            const [existingRows] = await connection.execute(
                `SELECT result, penalty, mmr_delta, rating_before, rating_after FROM ranked_match_results WHERE match_id = ? AND user_id = ? LIMIT 1`,
                [String(matchId), userId]
            );
            if (existingRows.length) {
                const existing = existingRows[0];
                applied.push({
                    userId,
                    nickname: player.nickname || `Игрок ${userId}`,
                    result: existing.result,
                    delta: Number(existing.mmr_delta),
                    ratingBefore: Number(existing.rating_before),
                    ratingAfter: Number(existing.rating_after),
                    penalty: existing.penalty
                });
                continue;
            }

            const mafiaPlayer = ["mafia", "don"].includes(String(player.role || "").toLowerCase());
            const team = mafiaPlayer ? "mafia" : "city";
            const penalty = penaltiesByUser[userId] || penaltiesByUser[String(userId)] || null;
            const result = penalty === "abandon"
                ? "loss"
                : winner === "draw"
                    ? "draw"
                    : team === winner ? "win" : "loss";
            const opponentRatings = players
                .filter((opponent) => ["mafia", "don"].includes(String(opponent.role || "").toLowerCase()) !== mafiaPlayer)
                .map((opponent) => profileById.get(Number(opponent.id)))
                .filter(Number.isFinite);
            const opponentRating = opponentRatings.length
                ? opponentRatings.reduce((sum, value) => sum + value, 0) / opponentRatings.length
                : profileById.get(userId);
            const stats = statsById.get(userId);
            const delta = calculateMmrDelta({
                result,
                rating: profileById.get(userId),
                opponentRating,
                rankedGames: Number(stats.ranked_games || 0),
                penalty,
                previousInfractions: Number(stats.infractions_count || 0)
            });
            const ratingBefore = profileById.get(userId);
            const ratingAfter = applyMmrDelta(ratingBefore, delta);
            const actualDelta = ratingAfter - ratingBefore;
            const league = getLeagueSummary(ratingAfter);
            const nextDecayAt = new Date(Date.now() + 14 * 86400000);

            await connection.execute(
                `UPDATE user_profiles SET rating = ?, hidden_mmr = ?, current_league = ?, current_division = ?, total_matches = total_matches + 1, total_wins = total_wins + ?, total_losses = total_losses + ? WHERE user_id = ?`,
                [ratingAfter, ratingAfter, league.name, league.division, result === "win" ? 1 : 0, result === "loss" ? 1 : 0, userId]
            );
            await connection.execute(
                `UPDATE ranked_player_stats SET ranked_games = ranked_games + 1, infractions_count = infractions_count + ?, last_ranked_at = NOW(), next_decay_at = ? WHERE user_id = ?`,
                [penalty ? 1 : 0, nextDecayAt, userId]
            );
            await connection.execute(
                `INSERT INTO ranked_match_results (match_id, user_id, result, penalty, mmr_delta, rating_before, rating_after) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [String(matchId), userId, result, penalty, actualDelta, ratingBefore, ratingAfter]
            );
            await connection.execute(
                `INSERT INTO rating_history (user_id, season_id, rating_before, rating_after, delta, reason) VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, activeSeason?.id || null, ratingBefore, ratingAfter, actualDelta, penalty || `match_${result}`]
            );
            if (activeSeason) {
                await connection.execute(
                    `INSERT INTO season_players (season_id, user_id, rating_start, rating_end, league, division, total_points, prestige_earned) VALUES (?, ?, ?, ?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE rating_end = VALUES(rating_end), league = VALUES(league), division = VALUES(division)`,
                    [activeSeason.id, userId, ratingBefore, ratingAfter, league.name, league.division]
                );
            }

            applied.push({ userId, nickname: player.nickname || `Игрок ${userId}`, result, delta: actualDelta, ratingBefore, ratingAfter, penalty });
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return applied;
}

async function getActiveSeasonLeaderboard(limit = 10) {
    const season = await getCurrentSeason();
    const [decayDuePlayers] = await db.execute(
        `SELECT user_id FROM ranked_player_stats WHERE next_decay_at IS NOT NULL AND next_decay_at <= NOW()`
    );
    for (const player of decayDuePlayers) {
        await applyMmrDecayForUser(player.user_id);
    }

    const [rows] = await db.execute(
        `
        SELECT
            u.id AS user_id,
            ? AS season_id,
            COALESCE(sp.total_points, 0) AS total_points,
            COALESCE(up.rating, 0) AS rating_end,
            COALESCE(up.current_league, 'Бронза') AS league,
            COALESCE(up.current_division, '1') AS division,
            NULL AS final_rank,
            u.nickname,
            COALESCE(up.avatar_url, u.avatar) AS avatar,
            COALESCE(up.current_league, 'Бронза') AS current_league,
            COALESCE(up.current_division, '1') AS current_division,
            COALESCE(up.rating, 0) AS rating
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN season_players sp ON sp.user_id = u.id AND sp.season_id = ?
        ORDER BY COALESCE(up.rating, 0) DESC, u.nickname ASC
        LIMIT ?
        `,
        [season?.id || null, season?.id || null, Number(limit)]
    );

    return rows.map((row, index) => {
        const league = getLeagueSummary(row.rating);
        return {
            ...row,
            avatar: sanitizeAvatar(row.avatar),
            league: league.name,
            division: league.division,
            current_league: league.name,
            current_division: league.division,
            final_rank: index + 1
        };
    });
}

async function getPlayerProfile(userId) {
    if (!userId) {
        return null;
    }

    await applyMmrDecayForUser(userId);
    const profile = await ensureUserProfile(userId);
    if (!profile) {
        return null;
    }

    const [userRows] = await db.execute(
        `
        SELECT id, email, nickname, avatar, created_at
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [userId]
    );

    if (userRows.length === 0) {
        return null;
    }

    const user = userRows[0];
    const season = await getCurrentSeason();
    const [seasonRows] = await db.execute(
        "SELECT * FROM season_players WHERE season_id = ? AND user_id = ? LIMIT 1",
        [season?.id, userId]
    );

    const [achievementRows] = await db.execute(
        `
        SELECT COUNT(*) AS total
        FROM user_achievements
        WHERE user_id = ?
        `,
        [userId]
    );

    return {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar: sanitizeAvatar(user.avatar || profile.avatar_url),
        currentLeague: profile.current_league,
        currentDivision: profile.current_division,
        rating: profile.rating,
        hiddenMmr: profile.hidden_mmr,
        accountLevel: profile.account_level,
        totalMatches: profile.total_matches,
        totalWins: profile.total_wins,
        totalLosses: profile.total_losses,
        seasonProgress: seasonRows[0] || null,
        achievementCount: Number(achievementRows[0]?.total || 0),
        profile: profile
    };
}

async function listAchievements(userId) {
    const [rows] = await db.execute(
        `
        SELECT
            a.id,
            a.code,
            a.name,
            a.description,
            a.rarity,
            a.category,
            a.secret,
            ua.user_id,
            ua.unlocked_at,
            ua.visible
        FROM achievements a
        LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
        ORDER BY a.id ASC
        `,
        [userId]
    );

    return rows.map((row) => ({
        ...row,
        unlocked: Boolean(row.user_id),
        unlockedAt: row.unlocked_at || null
    }));
}

async function getRoleMastery(userId) {
    const [rows] = await db.execute(
        "SELECT * FROM role_mastery WHERE user_id = ? ORDER BY xp DESC, wins DESC",
        [userId]
    );

    if (rows.length > 0) {
        return rows;
    }

    const defaultRoles = ["citizen", "mafia", "doctor", "commissar", "don"];
    const prepared = defaultRoles.map((role) => [userId, role, 1, 0, 0, 0, 0, 0]);

    for (const entry of prepared) {
        await db.execute(
            `
            INSERT INTO role_mastery
            (user_id, role_name, level, xp, games_played, wins, losses, best_streak)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            entry
        );
    }

    const [freshRows] = await db.execute(
        "SELECT * FROM role_mastery WHERE user_id = ? ORDER BY xp DESC, wins DESC",
        [userId]
    );

    return freshRows;
}

async function getSeasonHistory(userId) {
    const [rows] = await db.execute(
        `
        SELECT sp.*, s.name AS season_name
        FROM season_players sp
        LEFT JOIN seasons s ON s.id = sp.season_id
        WHERE sp.user_id = ?
        ORDER BY sp.created_at DESC
        `,
        [userId]
    );

    return rows;
}

async function getNotifications(userId) {
    const [rows] = await db.execute(
        `
        SELECT *
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20
        `,
        [userId]
    );

    return rows;
}

async function compareProfiles(userId, targetUserId) {
    const current = await getPlayerProfile(userId);
    const target = await getPlayerProfile(targetUserId);

    if (!current || !target) {
        return null;
    }

    return {
        currentUser: current,
        targetUser: target,
        difference: {
            rating: target.rating - current.rating,
            wins: target.totalWins - current.totalWins,
            matches: target.totalMatches - current.totalMatches
        }
    };
}

module.exports = {
    LEAGUES,
    DIVISIONS,
    getLeagueSummary,
    ensureUserProfile,
    getCurrentSeason,
    getActiveSeasonLeaderboard,
    getPlayerProfile,
    listAchievements,
    getRoleMastery,
    getSeasonHistory,
    getNotifications,
    compareProfiles,
    getLeagueSummary,
    calculateMmrDelta,
    applyMmrDelta,
    calculateMmrDecay,
    applyMmrDecayForUser,
    applyRankedMatchResults
};
