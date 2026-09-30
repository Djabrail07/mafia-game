const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const { sanitizeAvatar } = require("../avatar");
const {
    assignRoles,
    createGameState,
    evaluateWinCondition,
    getGameSummary,
    getVisibleGameStateForPlayer,
    applyNightAction,
    applyVote,
    advanceGamePhase,
    syncPhaseByRealtime
} = require("../game");
const { normalizeRoomCode, withRoomLock, emitRoomState, emitRoomEvent } = require("../realtime");
const { applyRankedMatchResults } = require("../meta");

const router = express.Router();

const serializeRoomStateRequests = (req, res, next) => {
    const roomCode = normalizeRoomCode(req.params.roomCode || req.body?.roomCode);
    if (!roomCode) {
        next();
        return;
    }

    withRoomLock(roomCode, () => new Promise((resolve) => {
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            resolve();
        };

        res.once("finish", release);
        res.once("close", release);
        next();
    })).catch(next);
};

const sanitizeText = (value, maxLength = 50) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim().slice(0, maxLength);
};

const parseStoredGameState = (value) => {
    if (!value) {
        return null;
    }

    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
        console.warn("Некорректный JSON game_state:", error.message);
        return null;
    }
};

const getRoomStateStatus = (roomStatus, gameState) => {
    if (roomStatus === "finished") {
        return "finished";
    }

    if (gameState && (gameState.phase === "finished" || (gameState.winner && gameState.winner !== "ongoing"))) {
        return "finished";
    }

    return roomStatus === "playing" ? "playing" : "waiting";
};

const syncRoomStatusIfNeeded = async (roomId, roomCode, roomStatus, gameState) => {
    const normalizedStatus = getRoomStateStatus(roomStatus, gameState);
    if (normalizedStatus === roomStatus) {
        return roomStatus;
    }

    await db.execute(
        `UPDATE rooms SET status = ?, game_state = ? WHERE id = ?`,
        [normalizedStatus, JSON.stringify(gameState || {}), roomId]
    );

    return normalizedStatus;
};

const syncRoomPlayerAlive = async (roomId, players) => {
    await Promise.all((players || []).map((player) => db.execute(
        `UPDATE room_players SET is_alive = ? WHERE room_id = ? AND user_id = ?`,
        [player.alive === false ? 0 : 1, roomId, player.id]
    )));
};

router.get("/", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        return res.json({
            success: true,
            message: "Rooms API ready"
        });
    } catch (error) {
        console.error("Ошибка /api/rooms:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

router.post("/", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const name = sanitizeText(req.body?.name, 50);
        const maxPlayers = Number(req.body?.maxPlayers);
        const roomPassword = req.body?.password;

        if (!name || name.length < 3 || name.length > 50) {
            return res.status(400).json({
                success: false,
                message: "Название комнаты должно содержать от 3 до 50 символов."
            });
        }

        if (!Number.isInteger(maxPlayers) || maxPlayers < 4 || maxPlayers > 20) {
            return res.status(400).json({
                success: false,
                message: "Количество игроков должно быть от 4 до 20."
            });
        }

        let roomCode = "";
        let exists = true;
        while (exists) {
            roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const [rooms] = await db.execute(
                "SELECT id FROM rooms WHERE room_code = ? LIMIT 1",
                [roomCode]
            );
            exists = rooms.length > 0;
        }

        let passwordHash = null;
        if (roomPassword && String(roomPassword).trim()) {
            const trimmedPassword = String(roomPassword).trim();
            if (trimmedPassword.length < 3 || trimmedPassword.length > 64) {
                return res.status(400).json({
                    success: false,
                    message: "Пароль комнаты должен содержать от 3 до 64 символов."
                });
            }
            passwordHash = await bcrypt.hash(trimmedPassword, 12);
        }

        const [result] = await db.execute(
            `
            INSERT INTO rooms (room_code, name, max_players, password_hash, status, owner_id)
            VALUES (?, ?, ?, ?, 'waiting', ?)
            `,
            [roomCode, name, maxPlayers, passwordHash, req.session.userId]
        );

        await db.execute(
            `
            INSERT INTO room_players (room_id, user_id, is_ready, is_alive)
            VALUES (?, ?, 0, 1)
            `,
            [result.insertId, req.session.userId]
        );

        return res.status(201).json({
            success: true,
            message: "Комната успешно создана.",
            room: {
                id: result.insertId,
                code: roomCode,
                name,
                maxPlayers,
                status: "waiting"
            }
        });
    } catch (error) {
        console.error("Ошибка создания комнаты:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при создании комнаты."
        });
    }
});

router.post("/join", async (req, res) => {
    let connection;

    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.body?.roomCode);
        const roomPassword = req.body?.password;

        if (!roomCode) {
            return res.status(400).json({
                success: false,
                message: "Введите корректный код комнаты."
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rooms] = await connection.execute(
            `
            SELECT id, room_code, name, max_players, password_hash, status, owner_id
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
            FOR UPDATE
            `,
            [roomCode]
        );

        if (rooms.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: "Комната с таким кодом не найдена."
            });
        }

        const room = rooms[0];

        const roomGameState = parseStoredGameState(room.game_state);
        const normalizedRoomStatus = getRoomStateStatus(room.status, roomGameState);
        if (normalizedRoomStatus !== "waiting") {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Эта комната закрыта или игра уже завершена."
            });
        }

        if (room.password_hash) {
            if (!roomPassword) {
                await connection.rollback();
                return res.status(401).json({
                    success: false,
                    message: "Введите пароль комнаты."
                });
            }

            const passwordCorrect = await bcrypt.compare(String(roomPassword).trim(), room.password_hash);
            if (!passwordCorrect) {
                await connection.rollback();
                return res.status(401).json({
                    success: false,
                    message: "Неверный пароль комнаты."
                });
            }
        }

        const [existingPlayers] = await connection.execute(
            `SELECT id FROM room_players WHERE room_id = ? AND user_id = ? LIMIT 1`,
            [room.id, req.session.userId]
        );

        if (existingPlayers.length > 0) {
            await connection.commit();
            return res.json({
                success: true,
                message: "Вы уже находитесь в этой комнате.",
                room: {
                    id: room.id,
                    code: room.room_code,
                    name: room.name,
                    maxPlayers: room.max_players,
                    status: room.status
                }
            });
        }

        const [playerCountRows] = await connection.execute(
            `SELECT COUNT(*) AS player_count FROM room_players WHERE room_id = ?`,
            [room.id]
        );

        const playerCount = Number(playerCountRows[0].player_count || 0);
        if (playerCount >= room.max_players) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "В комнате больше нет свободных мест."
            });
        }

        await connection.execute(
            `INSERT INTO room_players (room_id, user_id, is_ready, is_alive) VALUES (?, ?, 0, 1)`,
            [room.id, req.session.userId]
        );

        await connection.commit();

        const io = req.app.get("io");
        emitRoomState(io, room.room_code, {
            type: "player_joined",
            roomId: room.id,
            currentUserId: req.session.userId
        });

        return res.status(201).json({
            success: true,
            message: "Вы присоединились к комнате.",
            room: {
                id: room.id,
                code: room.room_code,
                name: room.name,
                maxPlayers: room.max_players,
                status: room.status,
                currentPlayers: playerCount + 1
            }
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "Вы уже находитесь в этой комнате."
            });
        }

        console.error("Ошибка входа в комнату:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при входе в комнату."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

router.post("/ready", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.body?.roomCode);
        if (!roomCode) {
            return res.status(400).json({
                success: false,
                message: "Код комнаты не указан."
            });
        }

        const [rooms] = await db.execute(
            `SELECT id, status FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        if (rooms[0].status !== "waiting") {
            return res.status(400).json({
                success: false,
                message: "Игра уже началась."
            });
        }

        const [players] = await db.execute(
            `SELECT id, is_ready FROM room_players WHERE room_id = ? AND user_id = ? LIMIT 1`,
            [rooms[0].id, req.session.userId]
        );

        if (players.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Вы не состоите в этой комнате."
            });
        }

        const nextState = players[0].is_ready ? 0 : 1;
        await db.execute(
            `UPDATE room_players SET is_ready = ? WHERE id = ?`,
            [nextState, players[0].id]
        );

        const io = req.app.get("io");
        emitRoomState(io, roomCode, { type: "ready_updated", isReady: Boolean(nextState) });

        return res.json({
            success: true,
            isReady: Boolean(nextState)
        });
    } catch (error) {
        console.error("Ошибка изменения готовности:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

router.post("/start", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.body?.roomCode);
        if (!roomCode) {
            return res.status(400).json({
                success: false,
                message: "Код комнаты не указан."
            });
        }

        const [rooms] = await db.execute(
            `SELECT id, room_code, name, max_players, owner_id, status FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        const roomGameState = parseStoredGameState(room.game_state);
        const runtimeStatus = getRoomStateStatus(room.status, roomGameState);

        if (runtimeStatus !== "waiting") {
            return res.status(400).json({
                success: false,
                message: runtimeStatus === "finished" ? "Игра уже завершена." : "Игра уже началась."
            });
        }

        if (room.owner_id !== req.session.userId) {
            return res.status(403).json({
                success: false,
                message: "Только владелец комнаты может начать игру."
            });
        }

        const [players] = await db.execute(
            `
            SELECT p.id, p.user_id, u.nickname, p.role, p.is_alive, p.is_ready
            FROM room_players p
            JOIN users u ON u.id = p.user_id
            WHERE p.room_id = ?
            ORDER BY p.id ASC
            `,
            [room.id]
        );

        if (players.length < 4) {
            return res.status(400).json({
                success: false,
                message: "Для игры нужно минимум 4 игрока."
            });
        }

        const assignedPlayers = assignRoles(players.map((player) => ({
            id: player.user_id,
            nickname: player.nickname,
            role: player.role || null,
            alive: player.is_alive !== 0
        })));

        await Promise.all(assignedPlayers.map((player) => db.execute(
            `UPDATE room_players SET role = ?, is_alive = ?, is_ready = 0 WHERE room_id = ? AND user_id = ?`,
            [player.role, player.alive ? 1 : 0, room.id, player.id]
        )));

        const gameState = createGameState({
            roomId: room.id,
            roomCode: room.room_code,
            roomName: room.name,
            players: assignedPlayers
        });

        await db.execute(
            `UPDATE rooms SET status = 'playing', game_state = ? WHERE id = ?`,
            [JSON.stringify(gameState), room.id]
        );

        const io = req.app.get("io");
        emitRoomState(io, room.room_code, {
            type: "game_started",
            gameState
        });

        return res.json({
            success: true,
            message: "Игра началась.",
            room: {
                id: room.id,
                code: room.room_code,
                name: room.name,
                status: "playing"
            },
            game: gameState,
            currentUserId: req.session.userId
        });
    } catch (error) {
        console.error("Ошибка запуска игры:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при запуске игры."
        });
    }
});

router.get("/:roomCode", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.params.roomCode);
        if (!roomCode) {
            return res.status(400).json({
                success: false,
                message: "Неверный код комнаты."
            });
        }

        const [rooms] = await db.execute(
            `SELECT id, room_code, name, max_players, owner_id, status, game_state FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        const roomStateSnapshot = parseStoredGameState(room.game_state);
        const normalizedStatus = getRoomStateStatus(room.status, roomStateSnapshot);
        if (normalizedStatus === "finished") {
            await db.execute(
                `UPDATE rooms SET status = 'finished', game_state = ? WHERE id = ?`,
                [JSON.stringify(roomStateSnapshot || {}), room.id]
            );
        }

        const [players] = await db.execute(
            `
            SELECT u.id, u.nickname, u.avatar, rp.role, rp.is_ready, rp.is_alive
            FROM room_players rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.room_id = ?
            ORDER BY rp.id ASC
            `,
            [room.id]
        );

        const currentPlayer = players.find((player) => Number(player.id) === Number(req.session.userId));
        if (!currentPlayer) {
            return res.status(403).json({
                success: false,
                message: "Вы не состоите в этой комнате."
            });
        }

        const roomSnapshot = parseStoredGameState(room.game_state);
        const statusForClient = getRoomStateStatus(room.status, roomSnapshot);

        return res.json({
            success: true,
            room: {
                id: room.id,
                code: room.room_code,
                name: room.name,
                maxPlayers: room.max_players,
                status: statusForClient,
                ownerId: room.owner_id,
                gameState: roomSnapshot
            },
            players: players.map((player) => ({
                ...player,
                avatar: sanitizeAvatar(player.avatar),
                role: Number(player.id) === Number(req.session.userId) ? player.role || "citizen" : null
            })),
            currentUserId: req.session.userId
        });
    } catch (error) {
        console.error("Ошибка получения комнаты:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

router.post("/:roomCode/restart", serializeRoomStateRequests, async (req, res) => {
    let connection;
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: "Необходимо войти в аккаунт." });
        }

        const roomCode = normalizeRoomCode(req.params.roomCode);
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rooms] = await connection.execute(
            `SELECT id, room_code, owner_id, status, game_state FROM rooms WHERE room_code = ? LIMIT 1 FOR UPDATE`,
            [roomCode]
        );
        if (!rooms.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Комната не найдена." });
        }

        const room = rooms[0];
        if (Number(room.owner_id) !== Number(req.session.userId)) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "Только владелец комнаты может начать матч заново." });
        }

        const [members] = await connection.execute(
            `SELECT id FROM room_players WHERE room_id = ? AND user_id = ? LIMIT 1`,
            [room.id, req.session.userId]
        );
        if (!members.length) {
            await connection.rollback();
            return res.status(403).json({ success: false, message: "Вы вышли из комнаты и не можете запустить повторный матч." });
        }

        const gameState = parseStoredGameState(room.game_state);
        if (getRoomStateStatus(room.status, gameState) !== "finished") {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Повторно запустить можно только завершённый матч." });
        }

        await connection.execute(
            `UPDATE room_players SET role = NULL, is_alive = 1, is_ready = 0 WHERE room_id = ?`,
            [room.id]
        );
        await connection.execute(
            `UPDATE rooms SET status = 'waiting', game_state = NULL WHERE id = ?`,
            [room.id]
        );
        await connection.commit();

        emitRoomState(req.app.get("io"), roomCode, { type: "room_restarted" });
        return res.json({ success: true, message: "Лобби подготовлено к новой игре." });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Ошибка повторного запуска комнаты:", error);
        return res.status(500).json({ success: false, message: "Не удалось подготовить комнату к новой игре." });
    } finally {
        if (connection) connection.release();
    }
});

router.get("/:roomCode/game", serializeRoomStateRequests, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.params.roomCode);
        const [rooms] = await db.execute(
            `SELECT id, room_code, name, max_players, owner_id, status, game_state FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        const roomStateSnapshot = parseStoredGameState(room.game_state);
        const normalizedStatus = getRoomStateStatus(room.status, roomStateSnapshot);
        if (normalizedStatus === "finished") {
            await db.execute(
                `UPDATE rooms SET status = 'finished', game_state = ? WHERE id = ?`,
                [JSON.stringify(roomStateSnapshot || {}), room.id]
            );
        }

        const [rows] = await db.execute(
            `SELECT u.id, u.nickname, u.avatar, rp.role, rp.is_ready, rp.is_alive FROM room_players rp JOIN users u ON u.id = rp.user_id WHERE rp.room_id = ? ORDER BY rp.id ASC`,
            [room.id]
        );

        if (!rows.some((player) => Number(player.id) === Number(req.session.userId))) {
            return res.status(403).json({
                success: false,
                message: "Вы не состоите в этой комнате."
            });
        }

        let gameState = parseStoredGameState(room.game_state);
        if (!gameState) {
            return res.status(400).json({
                success: false,
                message: "Состояние игры ещё не создано."
            });
        }

        const roomStatus = getRoomStateStatus(room.status, gameState);
        if (roomStatus === "finished") {
            await db.execute(
                `UPDATE rooms SET status = 'finished' WHERE id = ?`,
                [room.id]
            );
        }

        const advanced = gameState.phase !== "finished" ? syncPhaseByRealtime(gameState) : false;
        if (advanced) {
            await db.execute(
                `UPDATE rooms SET game_state = ?, status = ? WHERE id = ?`,
                [JSON.stringify(gameState), gameState.winner && gameState.winner !== "ongoing" ? "finished" : "playing", room.id]
            );
        }

        const roomPlayersById = new Map(rows.map((player) => [Number(player.id), player]));
        const aliveStateOutOfSync = (gameState.players || []).some((player) => {
            const roomPlayer = roomPlayersById.get(Number(player.id));
            return roomPlayer && (Number(roomPlayer.is_alive) !== 0) !== (player.alive !== false);
        });
        if (advanced || aliveStateOutOfSync) {
            await syncRoomPlayerAlive(room.id, gameState.players);
        }

        if (gameState.phase === "finished"
            && ["city", "mafia"].includes(gameState.winner)
            && (!gameState.mmrAppliedAt || !Array.isArray(gameState.mmrResults))) {
            const matchId = gameState.matchId || `${room.id}:${gameState.phaseStartedAt || room.id}`;
            const mmrResults = await applyRankedMatchResults({
                matchId,
                winner: gameState.winner,
                players: gameState.players,
                penaltiesByUser: gameState.penaltiesByUser || {}
            });
            gameState.mmrResults = mmrResults.map((result) => ({
                userId: result.userId,
                nickname: result.nickname,
                result: result.result,
                delta: result.delta,
                ratingAfter: result.ratingAfter,
                penalty: result.penalty
            }));
            gameState.mmrTotalDelta = gameState.mmrResults.reduce((total, result) => total + result.delta, 0);
            gameState.matchId = matchId;
            gameState.mmrAppliedAt = new Date().toISOString();
            await db.execute(
                `UPDATE rooms SET game_state = ? WHERE id = ?`,
                [JSON.stringify(gameState), room.id]
            );
        }

        const visibleState = getVisibleGameStateForPlayer(gameState, req.session.userId);
        const io = req.app.get("io");
        emitRoomState(io, room.room_code, {
            type: "room_snapshot",
            gameState: visibleState
        });

        return res.json({
            success: true,
            room: {
                id: room.id,
                code: room.room_code,
                name: room.name,
                maxPlayers: room.max_players,
                status: getRoomStateStatus(room.status, gameState),
                ownerId: room.owner_id,
                gameState: visibleState
            },
            players: rows.map((player) => {
                const gamePlayer = gameState.players?.find((item) => Number(item.id) === Number(player.id));
                return {
                    id: Number(player.id),
                    nickname: player.nickname,
                    avatar: sanitizeAvatar(player.avatar),
                    alive: gamePlayer ? gamePlayer.alive !== false : Number(player.is_alive) !== 0,
                    role: Number(player.id) === Number(req.session.userId) ? player.role || "citizen" : null
                };
            }),
            currentUserId: req.session.userId,
            gameState: visibleState
        });
    } catch (error) {
        console.error("Ошибка получения состояния комнаты:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при получении состояния комнаты."
        });
    }
});

router.post("/:roomCode/action", serializeRoomStateRequests, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.params.roomCode);
        const targetId = Number(req.body?.targetId);

        if (!roomCode || !Number.isInteger(targetId)) {
            return res.status(400).json({
                success: false,
                message: "Не указана цель действия."
            });
        }

        const [rooms] = await db.execute(
            `SELECT id, status, game_state FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        let gameState = parseStoredGameState(room.game_state);
        if (!gameState) {
            return res.status(400).json({
                success: false,
                message: "Состояние игры не создано."
            });
        }

        const actor = gameState.players.find((player) => Number(player.id) === Number(req.session.userId));
        if (!actor || actor.alive === false) {
            return res.status(400).json({
                success: false,
                message: "Вы не можете участвовать в действии."
            });
        }

        const result = applyNightAction(gameState, req.session.userId, actor.role, targetId, req.body?.actionType);
        if (!result || !result.accepted) {
            return res.status(400).json({
                success: false,
                message: "Действие недоступно для вашей роли."
            });
        }

        const nextStatus = getRoomStateStatus(room.status, gameState);
        await db.execute(
            `UPDATE rooms SET game_state = ?, status = ? WHERE id = ?`,
            [JSON.stringify(gameState), nextStatus === "finished" ? "finished" : room.status, room.id]
        );
        if (result.ready || (result.action === "commissar" && result.actionType === "jail")) {
            await syncRoomPlayerAlive(room.id, gameState.players);
        }

        const io = req.app.get("io");
        emitRoomState(io, roomCode, {
            type: "night_action",
            gameState: getVisibleGameStateForPlayer(gameState, req.session.userId),
            result
        });

        return res.json({
            success: true,
            message: "Ночное действие зафиксировано.",
            action: result,
            gameState: getVisibleGameStateForPlayer(gameState, req.session.userId)
        });
    } catch (error) {
        console.error("Ошибка ночного действия:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при выполнении действия."
        });
    }
});

router.post("/:roomCode/vote", serializeRoomStateRequests, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.params.roomCode);
        const targetId = Number(req.body?.targetId);

        if (!roomCode || !Number.isInteger(targetId)) {
            return res.status(400).json({
                success: false,
                message: "Не указана цель голосования."
            });
        }

        const [rooms] = await db.execute(
            `SELECT id, status, game_state FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        let gameState = parseStoredGameState(room.game_state);
        if (!gameState) {
            return res.status(400).json({
                success: false,
                message: "Состояние игры не создано."
            });
        }

        if (getRoomStateStatus(room.status, gameState) === "finished") {
            return res.status(400).json({
                success: false,
                message: "Голосование недоступно: игра уже завершена."
            });
        }

        const result = applyVote(gameState, req.session.userId, targetId);
        if (!result || result.accepted === false) {
            return res.status(400).json({
                success: false,
                message: result?.reason === "already_voted"
                    ? "Вы уже проголосовали в этом раунде."
                    : result?.reason === "phase_mismatch"
                        ? "Сейчас не идёт голосование. Состояние игры обновлено."
                        : result?.reason === "invalid_vote"
                            ? "Вы выбыли или выбранная цель недоступна для голосования."
                            : "Голосование недоступно в текущей фазе."
            });
        }

        const phaseResult = advanceGamePhase(gameState, "vote");
        const nextStatus = getRoomStateStatus(room.status, gameState);
        await db.execute(
            `UPDATE rooms SET game_state = ?, status = ? WHERE id = ?`,
            [JSON.stringify(gameState), nextStatus === "finished" ? "finished" : room.status, room.id]
        );
        if (phaseResult.changed) {
            await syncRoomPlayerAlive(room.id, gameState.players);
        }

        const io = req.app.get("io");
        emitRoomState(io, roomCode, {
            type: "vote_update",
            gameState: getVisibleGameStateForPlayer(gameState, req.session.userId),
            result,
            phaseResult
        });

        return res.json({
            success: true,
            message: "Голосование учтено.",
            result,
            phaseResult,
            gameState: getVisibleGameStateForPlayer(gameState, req.session.userId)
        });
    } catch (error) {
        console.error("Ошибка голосования:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при голосовании."
        });
    }
});

router.post("/leave", serializeRoomStateRequests, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = normalizeRoomCode(req.body?.roomCode);
        if (!roomCode) {
            return res.status(400).json({
                success: false,
                message: "Код комнаты не указан."
            });
        }

        const [rooms] = await db.execute(
            `SELECT id, room_code, status, game_state FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        const gameState = parseStoredGameState(room.game_state);
        const participant = gameState?.players?.find((player) => Number(player.id) === Number(req.session.userId));

        if (room.status === "playing" && gameState?.phase !== "finished" && participant && participant.alive !== false) {
            participant.alive = false;
            gameState.penaltiesByUser = gameState.penaltiesByUser || {};
            gameState.penaltiesByUser[req.session.userId] = "abandon";
            gameState.log = Array.isArray(gameState.log) ? gameState.log : [];
            gameState.log.push({
                author: "Система",
                text: `${participant.nickname || "Игрок"} покинул матч и получил поражение.`,
                time: new Date().toISOString()
            });
            gameState.log = gameState.log.slice(-60);

            const summary = getGameSummary(gameState.players);
            gameState.winner = evaluateWinCondition({ mafia: summary.mafiaAlive, city: summary.cityAlive });
            if (gameState.winner !== "ongoing") {
                gameState.phase = "finished";
                gameState.phaseDuration = 0;
                gameState.phaseStartedAt = Date.now();
                gameState.phaseEndsAt = null;
            }

            await db.execute(
                `UPDATE rooms SET game_state = ?, status = ? WHERE id = ?`,
                [JSON.stringify(gameState), gameState.phase === "finished" ? "finished" : "playing", room.id]
            );
            await db.execute(
                `DELETE FROM room_players WHERE room_id = ? AND user_id = ?`,
                [room.id, req.session.userId]
            );
        } else {
            await db.execute(
                `DELETE FROM room_players WHERE room_id = ? AND user_id = ?`,
                [room.id, req.session.userId]
            );
        }

        const io = req.app.get("io");
        emitRoomState(io, roomCode, {
            type: "player_left",
            userId: req.session.userId
        });

        return res.json({
            success: true,
            message: "Вы вышли из комнаты."
        });
    } catch (error) {
        console.error("Ошибка выхода из комнаты:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при выходе из комнаты."
        });
    }
});

router.post("/:roomCode/penalty", serializeRoomStateRequests, async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ success: false, message: "Необходимо войти в аккаунт." });
        }

        const roomCode = normalizeRoomCode(req.params.roomCode);
        const targetUserId = Number(req.body?.userId);
        if (!roomCode || !Number.isInteger(targetUserId) || targetUserId === Number(req.session.userId)) {
            return res.status(400).json({ success: false, message: "Укажите другого участника матча." });
        }

        const [rooms] = await db.execute(
            `SELECT id, owner_id, status, game_state FROM rooms WHERE room_code = ? LIMIT 1`,
            [roomCode]
        );
        if (!rooms.length) {
            return res.status(404).json({ success: false, message: "Комната не найдена." });
        }

        const room = rooms[0];
        if (Number(room.owner_id) !== Number(req.session.userId)) {
            return res.status(403).json({ success: false, message: "Зафиксировать нарушение может только владелец комнаты." });
        }

        const gameState = parseStoredGameState(room.game_state);
        if (room.status !== "playing" || !gameState || gameState.phase === "finished") {
            return res.status(400).json({ success: false, message: "Матч уже не активен." });
        }

        const target = (gameState.players || []).find((player) => Number(player.id) === targetUserId);
        if (!target || target.alive === false) {
            return res.status(404).json({ success: false, message: "Активный участник не найден." });
        }

        gameState.penaltiesByUser = gameState.penaltiesByUser || {};
        if (gameState.penaltiesByUser[targetUserId]) {
            return res.status(409).json({ success: false, message: "Для участника уже зарегистрировано нарушение в этом матче." });
        }

        gameState.penaltiesByUser[targetUserId] = "rule_violation";
        gameState.log = Array.isArray(gameState.log) ? gameState.log : [];
        gameState.log.push({
            author: "Система",
            text: `Владелец комнаты зафиксировал нарушение правил игроком ${target.nickname}.`,
            time: new Date().toISOString()
        });
        gameState.log = gameState.log.slice(-60);
        await db.execute(`UPDATE rooms SET game_state = ? WHERE id = ?`, [JSON.stringify(gameState), room.id]);

        return res.json({ success: true, message: "Нарушение зафиксировано. Штраф применится при завершении матча." });
    } catch (error) {
        console.error("Ошибка фиксации нарушения:", error);
        return res.status(500).json({ success: false, message: "Ошибка сервера при фиксации нарушения." });
    }
});

module.exports = router;
module.exports.getRoomStateStatus = getRoomStateStatus;
