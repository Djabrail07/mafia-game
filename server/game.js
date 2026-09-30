const rolesOrder = ["mafia", "mafia", "don", "commissar", "doctor", "citizen"];
const crypto = require("crypto");

function normalizePlayer(player) {
    if (!player || !player.id) {
        return null;
    }

    return {
        id: Number(player.id),
        nickname: player.nickname || `Player-${player.id}`,
        role: player.role || "citizen",
        alive: player.alive !== false
    };
}

function shuffle(array) {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

function buildRoleSet(playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 4 || playerCount > 20) {
        throw new Error("Количество игроков должно быть от 4 до 20.");
    }

    const roles = [];
    const mafiaCount = playerCount < 8 ? 1 : 2 + Math.floor((playerCount - 8) / 3);
    const doctorCount = playerCount >= 4 ? 1 : 0;
    const commissarCount = playerCount >= 4 ? 1 : 0;
    const donCount = playerCount >= 6 ? 1 : 0;

    for (let index = 0; index < mafiaCount; index += 1) {
        roles.push("mafia");
    }

    if (donCount > 0) {
        roles.push("don");
    }

    for (let index = 0; index < commissarCount; index += 1) {
        roles.push("commissar");
    }

    for (let index = 0; index < doctorCount; index += 1) {
        roles.push("doctor");
    }

    const citizenCount = playerCount - roles.length;
    for (let index = 0; index < citizenCount; index += 1) {
        roles.push("citizen");
    }

    return shuffle(roles).slice(0, playerCount);
}

function assignRoles(players) {
    const safePlayers = players
        .map(normalizePlayer)
        .filter(Boolean);

    if (safePlayers.length === 0) {
        return [];
    }

    const roleSet = buildRoleSet(safePlayers.length);

    return safePlayers.map((player, index) => ({
        ...player,
        role: roleSet[index],
        alive: true,
        isReady: false
    }));
}

function evaluateWinCondition({ mafia, city }) {
    if (mafia === 0) {
        return "city";
    }

    if (city === 0) {
        return "mafia";
    }

    if (mafia >= city) {
        return "mafia";
    }

    return "ongoing";
}

function getGameSummary(players) {
    const alive = players.filter((player) => player.alive !== false);

    const mafiaAlive = alive.filter((player) => ["mafia", "don"].includes(player.role)).length;
    const cityAlive = alive.filter((player) => !["mafia", "don"].includes(player.role)).length;

    const winner = evaluateWinCondition({ mafia: mafiaAlive, city: cityAlive });

    return {
        aliveCount: alive.length,
        mafiaAlive,
        cityAlive,
        winner
    };
}

function stampPhase(gameState, phase, duration) {
    const now = Date.now();
    gameState.phase = phase;
    gameState.phaseDuration = duration;
    gameState.phaseStartedAt = now;
    gameState.phaseEndsAt = now + (duration * 1000);
    return gameState;
}

function syncWinnerFromState(gameState) {
    if (!gameState || !Array.isArray(gameState.players)) {
        return null;
    }

    const summary = getGameSummary(gameState.players);
    gameState.winner = summary.winner;

    if (summary.winner !== "ongoing" && gameState.phase !== "finished") {
        stampPhase(gameState, "finished", 0);
        gameState.phaseEndsAt = null;
    }

    return summary.winner;
}

function resolveVoteRound(gameState, force = false) {
    const alivePlayers = (gameState.players || []).filter((player) => player.alive !== false);
    const voteKeys = Object.keys(gameState.dayVotes || {});
    const allAliveHaveVoted = alivePlayers.length > 0 && alivePlayers.every((player) => voteKeys.includes(String(player.id)));

    if (!allAliveHaveVoted && !force) {
        return { phase: "vote", changed: false, waitingForVotes: true, votesCast: voteKeys.length };
    }

    if (force) {
        gameState.missedVoteRoundsByUser = gameState.missedVoteRoundsByUser || {};
        gameState.penaltiesByUser = gameState.penaltiesByUser || {};
        alivePlayers.forEach((player) => {
            if (!Object.prototype.hasOwnProperty.call(gameState.dayVotes || {}, String(player.id))) {
                const missedRounds = Number(gameState.missedVoteRoundsByUser[player.id] || 0) + 1;
                gameState.missedVoteRoundsByUser[player.id] = missedRounds;
                if (missedRounds >= 2) {
                    gameState.penaltiesByUser[player.id] = gameState.penaltiesByUser[player.id] || "afk";
                }
            }
        });
    }

    const votes = Object.values(gameState.dayVotes || {});
    if (!votes.length) {
        gameState.log = Array.isArray(gameState.log) ? gameState.log : [];
        gameState.log.push({
            author: "Система",
            text: "По итогам голосования никто не будет выгнан: не было ни одного голоса.",
            time: new Date().toISOString()
        });
        gameState.log = gameState.log.slice(-60);
        gameState.dayVotes = {};
        stampPhase(gameState, "night", 45);
        gameState.round += 1;
        return { phase: gameState.phase, changed: true, noVotes: true };
    }

    const counts = {};
    votes.forEach((targetId) => {
        counts[targetId] = (counts[targetId] || 0) + 1;
    });

    const maxVotes = Math.max(...Object.values(counts), 0);
    const candidates = Object.entries(counts)
        .filter(([, count]) => count === maxVotes)
        .map(([targetId]) => Number(targetId));

    const target = candidates.length === 1
        ? gameState.players.find((player) => Number(player.id) === candidates[0] && player.alive !== false)
        : null;
    if (target) {
        target.alive = false;
    }

    gameState.log = Array.isArray(gameState.log) ? gameState.log : [];
    gameState.log.push({
        author: "Система",
        text: target
            ? `По итогам голосования исключён игрок: ${target.nickname}.`
            : "По итогам голосования никто не будет выгнан: несколько игроков набрали одинаковое количество голосов.",
        time: new Date().toISOString()
    });
    gameState.log = gameState.log.slice(-60);

    gameState.dayVotes = {};
    stampPhase(gameState, "night", 45);
    gameState.round += 1;
    syncWinnerFromState(gameState);
    return { phase: gameState.phase, changed: true, candidates };
}

function syncPhaseByRealtime(gameState) {
    if (!gameState || gameState.phase === "finished") {
        return false;
    }

    const now = Date.now();
    if (!gameState.phaseEndsAt || now < Number(gameState.phaseEndsAt)) {
        return false;
    }

    if (gameState.phase === "night") {
        const result = resolveNight(gameState);
        stampPhase(gameState, "day", 90);
        syncWinnerFromState(gameState);
        return { phase: gameState.phase, result };
    }

    if (gameState.phase === "day") {
        stampPhase(gameState, "vote", 30);
        return { phase: gameState.phase, changed: true };
    }

    if (gameState.phase === "vote") {
        return resolveVoteRound(gameState, true);
    }

    return false;
}

function createGameState({ roomId, roomCode, roomName, players }) {
    const mergedPlayers = players.map((player) => ({
        ...normalizePlayer(player),
        alive: player.alive !== false,
        isReady: false,
        role: player.role || "citizen"
    }));

    const initialState = {
        matchId: crypto.randomUUID(),
        roomId,
        roomCode,
        roomName,
        phase: "night",
        round: 1,
        players: mergedPlayers,
        nightActions: {
            mafia: null,
            don: null,
            commissar: null,
            commissarAction: null,
            doctor: null
        },
        dayVotes: {},
        lastNightResult: null,
        winner: null,
        log: [],
        phaseDuration: 45,
        phaseStartedAt: Date.now(),
        phaseEndsAt: Date.now() + (45 * 1000)
    };

    return initialState;
}

function getVisibleGameStateForPlayer(gameState, userId) {
    if (!gameState) {
        return null;
    }

    const safeGameState = JSON.parse(JSON.stringify(gameState));
    const currentUserId = Number(userId);

    safeGameState.players = (safeGameState.players || []).map((player) => {
        const safePlayer = { ...player };
        if (Number(player.id) !== currentUserId) {
            safePlayer.role = null;
        }
        return safePlayer;
    });

    const myPlayer = (safeGameState.players || []).find((player) => Number(player.id) === currentUserId);
    const myRole = String(myPlayer?.role || "").toLowerCase();
    if (safeGameState.phase !== "finished" && !["city", "mafia"].includes(String(safeGameState.winner || "").toLowerCase())) {
        delete safeGameState.mmrResults;
        delete safeGameState.mmrTotalDelta;
    }

    if (safeGameState.lastNightResult) {
        if (myRole !== "commissar") {
            safeGameState.lastNightResult.commissarCheck = null;
            safeGameState.lastNightResult.commissarTarget = null;
            safeGameState.lastNightResult.commissarAction = null;
        }
        if (myRole !== "don") {
            safeGameState.lastNightResult.donCheck = null;
        }
    }

    return {
        ...safeGameState,
        currentUserId,
        myRole: myPlayer?.role || null,
        winner: safeGameState.winner || null,
        phase: safeGameState.phase || "night"
    };
}

function applyNightAction(gameState, actorId, role, targetId, actionType = "check") {
    if (!gameState || !actorId || !role || !targetId) {
        return null;
    }

    if (gameState.phase !== "night") {
        return { accepted: false, reason: "phase_mismatch" };
    }

    const actor = gameState.players.find((player) => Number(player.id) === Number(actorId) && player.alive !== false);
    if (!actor) {
        return { accepted: false, reason: "actor_not_found" };
    }

    const normalizedRole = String(role).toLowerCase();
    if (String(actor.role || "citizen").toLowerCase() !== normalizedRole) {
        return { accepted: false, reason: "invalid_role" };
    }

    const target = gameState.players.find((player) => Number(player.id) === Number(targetId) && player.alive !== false);
    if (!target) {
        return { accepted: false, reason: "target_not_found" };
    }

    const normalizedActionType = normalizedRole === "commissar" ? String(actionType || "check").toLowerCase() : null;
    if (normalizedRole === "commissar" && !["check", "jail"].includes(normalizedActionType)) {
        return { accepted: false, reason: "invalid_action" };
    }
    if (normalizedRole === "commissar" && Number(targetId) === Number(actorId)) {
        return { accepted: false, reason: "cannot_target_self" };
    }

    if (normalizedRole === "mafia" && ["mafia", "don"].includes(String(target.role || "").toLowerCase())) {
        return { accepted: false, reason: "mafia_cannot_target_mafia" };
    }

    if (gameState.nightActions[normalizedRole] !== null && gameState.nightActions[normalizedRole] !== undefined) {
        return { accepted: false, reason: "already_used" };
    }

    if (normalizedRole === "doctor" && Number(targetId) === Number(actorId) && actor.selfHealedUsed === true) {
        return { accepted: false, reason: "self_heal_used" };
    }

    gameState.nightActions[normalizedRole] = Number(targetId);

    if (normalizedRole === "commissar") {
        gameState.nightActions.commissarAction = normalizedActionType;
    }

    if (normalizedRole === "doctor" && Number(targetId) === Number(actorId)) {
        actor.selfHealed = true;
        actor.selfHealedUsed = true;
    }

    if (normalizedRole === "commissar" && normalizedActionType === "jail") {
        target.alive = false;
        gameState.log = Array.isArray(gameState.log) ? gameState.log : [];
        gameState.log.push({
            author: "Система",
            text: `Комиссар посадил игрока ${target.nickname}.`,
            time: new Date().toISOString()
        });
        gameState.log = gameState.log.slice(-60);
        syncWinnerFromState(gameState);

        if (gameState.phase === "finished") {
            return {
                accepted: true,
                action: normalizedRole,
                actionType: normalizedActionType,
                targetId: Number(targetId),
                nightActions: gameState.nightActions,
                ready: true,
                result: { commissarJailed: Number(targetId), summary: getGameSummary(gameState.players) }
            };
        }
    }

    const aliveSpecials = gameState.players.filter((player) =>
        player.alive !== false && ["mafia", "don", "commissar", "doctor"].includes(String(player.role || "").toLowerCase())
    );

    const requiredRoles = ["mafia", "doctor", "commissar", "don"];
    const hasAllRequired = requiredRoles.every((requiredRole) => {
        if (!aliveSpecials.some((player) => String(player.role).toLowerCase() === requiredRole)) {
            return true;
        }

        return gameState.nightActions[requiredRole] !== null && gameState.nightActions[requiredRole] !== undefined;
    });

    if (!hasAllRequired) {
        return {
            accepted: true,
            action: normalizedRole,
            actionType: normalizedActionType,
            targetId: Number(targetId),
            nightActions: gameState.nightActions,
            ready: false
        };
    }

    const result = resolveNight(gameState);
    return {
        accepted: true,
        action: normalizedRole,
        actionType: normalizedActionType,
        targetId: Number(targetId),
        nightActions: gameState.nightActions,
        ready: true,
        result
    };
}

function advanceGamePhase(gameState, forcedPhase) {
    if (!gameState) {
        return null;
    }

    if (forcedPhase === "vote") {
        if (!gameState.phaseEndsAt || Date.now() < Number(gameState.phaseEndsAt)) {
            return {
                phase: "vote",
                changed: false,
                waitingForTimer: true,
                votes: Object.keys(gameState.dayVotes || {}).length
            };
        }

        return resolveVoteRound(gameState, true);
    }

    if (gameState.phase === "night") {
        const result = resolveNight(gameState);
        if (gameState.winner !== "ongoing") {
            gameState.phase = "finished";
            gameState.phaseDuration = 0;
            gameState.phaseStartedAt = Date.now();
            gameState.phaseEndsAt = null;
        } else {
            stampPhase(gameState, "day", 90);
        }
        return {
            phase: gameState.phase,
            result,
            changed: true,
            winner: gameState.winner
        };
    }

    if (gameState.phase === "day") {
        stampPhase(gameState, "vote", 30);
        return { phase: gameState.phase, changed: true };
    }

    if (gameState.phase === "vote") {
        const summary = getGameSummary(gameState.players);
        gameState.winner = summary.winner;
        if (gameState.winner !== "ongoing") {
            gameState.phase = "finished";
            gameState.phaseDuration = 0;
            gameState.phaseStartedAt = Date.now();
            gameState.phaseEndsAt = null;
        }
        return { phase: gameState.phase, summary, changed: true, winner: gameState.winner };
    }

    return { phase: gameState.phase || "night", changed: false };
}

function setPlayerRole(gameState, playerId, role) {
    const target = gameState.players.find((player) => player.id === Number(playerId));

    if (!target) {
        return null;
    }

    target.role = role;
    return target;
}

function resolveNight(gameState) {
    const { mafia, don, commissar, doctor } = gameState.nightActions;
    const commissarAction = gameState.nightActions.commissarAction || "check";

    const mafiaTarget = mafia ? Number(mafia) : null;
    const doctorTarget = doctor ? Number(doctor) : null;

    const victim = mafiaTarget && (!doctorTarget || mafiaTarget !== doctorTarget)
        ? mafiaTarget
        : null;

    const targetPlayer = victim !== null
        ? gameState.players.find((player) => player.id === victim && player.alive !== false)
        : null;

    if (targetPlayer) {
        targetPlayer.alive = false;
    }

    const commissarCheck = commissar
        ? gameState.players.find((player) => player.id === Number(commissar) && player.alive !== false)
        : null;

    const donCheck = don
        ? gameState.players.find((player) => player.id === Number(don) && player.alive !== false)
        : null;

    const commissarInfo = commissarCheck && commissarAction === "check"
        ? ["mafia", "don"].includes(commissarCheck.role)
            ? "mafia"
            : "not_mafia"
        : null;

    const donInfo = donCheck
        ? ["commissar"].includes(donCheck.role)
            ? "commissar"
            : "not_commissar"
        : null;

    gameState.lastNightResult = {
        victim: targetPlayer ? targetPlayer.id : null,
        doctorSaved: Boolean(doctorTarget && mafiaTarget === doctorTarget),
        commissarCheck: commissarInfo,
        commissarTarget: commissar ? Number(commissar) : null,
        commissarAction,
        commissarJailed: commissarAction === "jail" ? Number(commissar) : null,
        donCheck: donInfo,
        mafiaTarget,
        doctorTarget,
        round: gameState.round
    };

    stampPhase(gameState, "day", 90);
    gameState.nightActions = {
        mafia: null,
        don: null,
        commissar: null,
        commissarAction: null,
        doctor: null
    };

    const summary = getGameSummary(gameState.players);
    gameState.winner = summary.winner;
    if (gameState.winner !== "ongoing") {
        gameState.phase = "finished";
        gameState.phaseDuration = 0;
        gameState.phaseStartedAt = Date.now();
        gameState.phaseEndsAt = null;
    }

    return {
        ...gameState.lastNightResult,
        summary
    };
}

function applyVote(gameState, voterId, targetId) {
    if (!gameState || !voterId || !targetId) {
        return null;
    }

    if (gameState.phase !== "vote") {
        return { accepted: false, reason: "phase_mismatch" };
    }

    const voter = gameState.players.find((player) => player.id === Number(voterId) && player.alive !== false);
    const target = gameState.players.find((player) => player.id === Number(targetId) && player.alive !== false);

    if (!voter || !target) {
        return { accepted: false, reason: "invalid_vote" };
    }

    if (Object.prototype.hasOwnProperty.call(gameState.dayVotes || {}, String(voter.id))) {
        return { accepted: false, reason: "already_voted" };
    }

    gameState.dayVotes[voter.id] = target.id;
    if (gameState.missedVoteRoundsByUser) {
        delete gameState.missedVoteRoundsByUser[voter.id];
    }

    const voteCounts = Object.values(gameState.dayVotes).reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});

    const alivePlayers = (gameState.players || []).filter((player) => player.alive !== false);
    const allAliveHaveVoted = alivePlayers.length > 0 && alivePlayers.every((player) => Object.prototype.hasOwnProperty.call(gameState.dayVotes || {}, String(player.id)));

    return {
        accepted: true,
        tie: !allAliveHaveVoted ? false : Object.values(voteCounts).every((count) => count === Object.values(voteCounts)[0]),
        votes: voteCounts,
        allAliveHaveVoted,
        voterId: Number(voter.id),
        targetId: Number(target.id)
    };
}

module.exports = {
    rolesOrder,
    buildRoleSet,
    assignRoles,
    evaluateWinCondition,
    getGameSummary,
    createGameState,
    getVisibleGameStateForPlayer,
    applyNightAction,
    advanceGamePhase,
    syncPhaseByRealtime,
    resolveNight,
    applyVote,
    setPlayerRole
};
