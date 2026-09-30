const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const { Server } = require("socket.io");

const db = require("./db");
const { sanitizeAvatar } = require("./avatar");
const { withRoomLock } = require("./realtime");
const authRoutes = require("./routes/auth");
const gamesRoutes = require("./routes/games");
const {
    assignRoles,
    createGameState,
    resolveNight,
    applyVote,
    getGameSummary,
    getVisibleGameStateForPlayer,
    applyNightAction,
    advanceGamePhase
} = require("./game");
const {
    ensureUserProfile,
    getCurrentSeason,
    getActiveSeasonLeaderboard,
    getPlayerProfile,
    listAchievements,
    getRoleMastery,
    getSeasonHistory,
    getNotifications,
    compareProfiles,
    getLeagueSummary
} = require("./meta");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = Number(process.env.PORT || 3000);
const MAX_REQUEST_SIZE = 1024 * 1024;

async function initializeDatabase() {
    try {
        const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
        const schemaSql = fs.readFileSync(schemaPath, "utf8");
        if (!schemaSql.trim()) {
            return;
        }

        const mysql = require("mysql2/promise");
        const bootstrapConnection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            charset: "UTF8MB4_UNICODE_CI"
        });

        try {
            const databaseName = String(process.env.DB_NAME || "mafia_game").trim();
            await bootstrapConnection.query(
                `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
            );

            await bootstrapConnection.query(`USE \`${databaseName}\``);

            const statements = schemaSql
                .split(";")
                .map((statement) => statement.trim())
                .filter(Boolean)
                .filter((statement) => !/^USE\s+/i.test(statement))
                .filter((statement) => !/^CREATE\s+DATABASE\s+/i.test(statement));

            for (const statement of statements) {
                await bootstrapConnection.query(statement);
            }

            const avatarStorageMigrationKey = "avatar-storage-longtext-2026-09";
            const [avatarMigrationRows] = await bootstrapConnection.execute(
                `SELECT migration_key FROM schema_migrations WHERE migration_key = ? LIMIT 1`,
                [avatarStorageMigrationKey]
            );
            if (avatarMigrationRows.length === 0) {
                await bootstrapConnection.query(`ALTER TABLE users MODIFY avatar LONGTEXT DEFAULT NULL`);
                await bootstrapConnection.query(`ALTER TABLE user_profiles MODIFY avatar_url LONGTEXT DEFAULT NULL`);

                const [userAvatarRows] = await bootstrapConnection.query(
                    `SELECT id, avatar FROM users WHERE avatar IS NOT NULL`
                );
                for (const row of userAvatarRows) {
                    if (!sanitizeAvatar(row.avatar)) {
                        await bootstrapConnection.execute(`UPDATE users SET avatar = NULL WHERE id = ?`, [row.id]);
                    }
                }

                const [profileAvatarRows] = await bootstrapConnection.query(
                    `SELECT user_id, avatar_url FROM user_profiles WHERE avatar_url IS NOT NULL`
                );
                for (const row of profileAvatarRows) {
                    if (!sanitizeAvatar(row.avatar_url)) {
                        await bootstrapConnection.execute(`UPDATE user_profiles SET avatar_url = NULL WHERE user_id = ?`, [row.user_id]);
                    }
                }

                await bootstrapConnection.execute(
                    `INSERT INTO schema_migrations (migration_key) VALUES (?)`,
                    [avatarStorageMigrationKey]
                );
            }

            const migrationKey = "zero-legacy-1200-mmr-2026-09";
            const [migrationRows] = await bootstrapConnection.execute(
                `SELECT migration_key FROM schema_migrations WHERE migration_key = ? LIMIT 1`,
                [migrationKey]
            );
            if (migrationRows.length === 0) {
                await bootstrapConnection.execute(
                    `UPDATE user_profiles SET rating = 0, hidden_mmr = 0, current_league = 'Бронза', current_division = '1' WHERE rating = 1200`
                );
                await bootstrapConnection.execute(
                    `INSERT INTO schema_migrations (migration_key) VALUES (?)`,
                    [migrationKey]
                );
            }

            const leagueTriggerSql = `CASE
                WHEN NEW.rating < 250 THEN '1'
                WHEN NEW.rating < 500 THEN '2'
                WHEN NEW.rating < 750 THEN '3'
                WHEN NEW.rating < 1000 THEN '4'
                WHEN NEW.rating < 1250 THEN '1'
                WHEN NEW.rating < 1500 THEN '2'
                WHEN NEW.rating < 1750 THEN '3'
                WHEN NEW.rating < 2000 THEN '4'
                WHEN NEW.rating < 2250 THEN '1'
                WHEN NEW.rating < 2500 THEN '2'
                WHEN NEW.rating < 3000 THEN '3'
                WHEN NEW.rating < 3250 THEN '1'
                WHEN NEW.rating < 3500 THEN '2'
                WHEN NEW.rating < 4000 THEN '3'
                WHEN NEW.rating < 4250 THEN '1'
                WHEN NEW.rating < 4500 THEN '2'
                WHEN NEW.rating < 5000 THEN '3'
                WHEN NEW.rating < 5250 THEN '1'
                WHEN NEW.rating < 5500 THEN '2'
                WHEN NEW.rating < 6000 THEN '3'
                WHEN NEW.rating < 6250 THEN '1'
                WHEN NEW.rating < 6500 THEN '2'
                WHEN NEW.rating < 7000 THEN '3'
                WHEN NEW.rating < 7250 THEN '1'
                WHEN NEW.rating < 7500 THEN '2'
                ELSE '3'
            END`;
            const leagueNameSql = `CASE
                WHEN NEW.rating < 1000 THEN 'Бронза'
                WHEN NEW.rating < 2000 THEN 'Серебро'
                WHEN NEW.rating < 3000 THEN 'Золото'
                WHEN NEW.rating < 4000 THEN 'Платина'
                WHEN NEW.rating < 5000 THEN 'Алмаз'
                WHEN NEW.rating < 6000 THEN 'Мастер'
                WHEN NEW.rating < 7000 THEN 'Грандмастер'
                ELSE 'Легенда'
            END`;
            const triggerDefinitions = [
                {
                    name: "user_profiles_sync_league_insert_v2",
                    event: "INSERT",
                    assignments: `SET NEW.current_league = ${leagueNameSql}, NEW.current_division = ${leagueTriggerSql}`
                },
                {
                    name: "user_profiles_sync_league_update_v2",
                    event: "UPDATE",
                    assignments: `SET NEW.current_league = ${leagueNameSql}, NEW.current_division = ${leagueTriggerSql}`
                }
            ];
            await bootstrapConnection.query(`DROP TRIGGER IF EXISTS user_profiles_sync_league_insert`);
            await bootstrapConnection.query(`DROP TRIGGER IF EXISTS user_profiles_sync_league_update`);
            for (const trigger of triggerDefinitions) {
                const [triggerRows] = await bootstrapConnection.execute(
                    `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? AND TRIGGER_NAME = ? LIMIT 1`,
                    [databaseName, trigger.name]
                );
                if (triggerRows.length === 0) {
                    await bootstrapConnection.query(
                        `CREATE TRIGGER \`${trigger.name}\` BEFORE ${trigger.event} ON user_profiles FOR EACH ROW ${trigger.assignments}`
                    );
                }
            }

            await bootstrapConnection.query(`
                UPDATE user_profiles SET
                    current_league = CASE
                        WHEN rating < 1000 THEN 'Бронза'
                        WHEN rating < 2000 THEN 'Серебро'
                        WHEN rating < 3000 THEN 'Золото'
                        WHEN rating < 4000 THEN 'Платина'
                        WHEN rating < 5000 THEN 'Алмаз'
                        WHEN rating < 6000 THEN 'Мастер'
                        WHEN rating < 7000 THEN 'Грандмастер'
                        ELSE 'Легенда'
                    END,
                    current_division = CASE
                        WHEN rating < 250 THEN '1'
                        WHEN rating < 500 THEN '2'
                        WHEN rating < 750 THEN '3'
                        WHEN rating < 1000 THEN '4'
                        WHEN rating < 1250 THEN '1'
                        WHEN rating < 1500 THEN '2'
                        WHEN rating < 1750 THEN '3'
                        WHEN rating < 2000 THEN '4'
                        WHEN rating < 2250 THEN '1'
                        WHEN rating < 2500 THEN '2'
                        WHEN rating < 3000 THEN '3'
                        WHEN rating < 3250 THEN '1'
                        WHEN rating < 3500 THEN '2'
                        WHEN rating < 4000 THEN '3'
                        WHEN rating < 4250 THEN '1'
                        WHEN rating < 4500 THEN '2'
                        WHEN rating < 5000 THEN '3'
                        WHEN rating < 5250 THEN '1'
                        WHEN rating < 5500 THEN '2'
                        WHEN rating < 6000 THEN '3'
                        WHEN rating < 6250 THEN '1'
                        WHEN rating < 6500 THEN '2'
                        WHEN rating < 7000 THEN '3'
                        WHEN rating < 7250 THEN '1'
                        WHEN rating < 7500 THEN '2'
                        ELSE '3'
                    END
            `);

            console.log("Database schema verified successfully.");
        } finally {
            await bootstrapConnection.end();
        }
    } catch (error) {
        console.warn("Database schema bootstrap skipped:", error.message);
    }
}

const sanitizeText = (value, maxLength = 50) => {
    if (value === null || value === undefined) {
        return "";
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return "";
    }

    return trimmed.slice(0, maxLength);
};

const normalizeRoomCode = (value) => String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

const normalizeGameRuntimeStatus = (roomStatus, gameState) => {
    if (roomStatus === "finished") {
        return "finished";
    }

    if (gameState && typeof gameState === "object") {
        if (gameState.phase === "finished") {
            return "finished";
        }

        if (gameState.winner && gameState.winner !== "ongoing") {
            return "finished";
        }
    }

    return roomStatus === "playing" ? "playing" : "waiting";
};

const validateNickname = (value) => {
    const nickname = sanitizeText(value, 20);
    if (nickname.length < 3 || nickname.length > 20) {
        return null;
    }

    if (!/^[a-zA-Z0-9_\-\u0400-\u04FF]+$/.test(nickname)) {
        return null;
    }

    return nickname;
};

const validateAvatar = (value) => {
    if (!value || value === "null") {
        return null;
    }
    return sanitizeAvatar(value);
};

const parseStoredGameState = (value) => {
    if (!value) {
        return null;
    }

    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        return parsed;
    } catch (error) {
        console.warn("Некорректный JSON game_state:", error.message);
        return null;
    }
};

let sessionStore;

try {
    sessionStore = new MySQLStore({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log("MySQL session store initialized.");
} catch (error) {
    console.warn("MySQL session store failed to initialize:", error.message);
    console.warn("Falling back to in-memory session store. MySQL must be running for login/rooms to work.");
    sessionStore = new session.MemoryStore();
}

app.use(
    session({
        secret: "mafia-game-secret-change-later",
        resave: false,
        saveUninitialized: false,
        store: sessionStore,

        cookie: {
            httpOnly: true,
            secure: false,
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((req, res, next) => {
    if (req.body && typeof req.body === "object" && Buffer.isBuffer(req.body)) {
        return res.status(400).json({
            success: false,
            message: "Некорректный формат данных запроса."
        });
    }
    next();
});

app.use(express.static(path.join(__dirname, "..", "client")));
app.get("/favicon.ico", (req, res) => {
    const faviconPath = path.join(__dirname, "..", "client", "favicon.ico");
    res.sendFile(faviconPath, (error) => {
        if (error) {
            res.status(404).send("favicon not found");
        }
    });
});
app.use("/api", authRoutes);
app.use("/api/rooms", gamesRoutes);

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();
});

io.on("connection", (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    socket.on("join_lobby", () => {
        socket.emit("lobby_joined", {
            success: true,
            socketId: socket.id
        });
    });

    socket.on("join_room", ({ roomCode, userId, nickname }) => {
        const code = String(roomCode || "").trim().toUpperCase();
        if (!code) return;

        socket.join(code);
        socket.data.roomCode = code;
        socket.data.userId = userId || null;
        socket.data.nickname = nickname || "player";

        socket.emit("room_joined", {
            success: true,
            roomCode: code,
            socketId: socket.id
        });
    });

    socket.on("room_chat_message", async ({ roomCode, text, userId, nickname }) => {
        const code = String(roomCode || "").trim().toUpperCase();
        const messageText = String(text || "").trim();
        if (!code || !messageText) return;

        await withRoomLock(code, async () => {
          try {
            const [rooms] = await db.execute(
                `SELECT id, game_state FROM rooms WHERE room_code = ? LIMIT 1`,
                [code]
            );

            if (rooms.length === 0) return;

            const room = rooms[0];
            let gameState = room.game_state ? JSON.parse(room.game_state) : { players: [], log: [] };
            if (!Array.isArray(gameState.log)) {
                gameState.log = [];
            }

            let author = "Игрок";
            const resolvedUserId = Number(userId);
            if (resolvedUserId) {
                const [users] = await db.execute(
                    `SELECT nickname FROM users WHERE id = ? LIMIT 1`,
                    [resolvedUserId]
                );
                if (users.length > 0) {
                    author = users[0].nickname || author;
                }
            }

            if (!author || author === "Игрок") {
                author = String(socket.data?.nickname || nickname || "Игрок").trim() || `Player_${resolvedUserId || socket.id}`;
            }

            const entry = {
                author,
                text: messageText,
                time: new Date().toISOString()
            };

            gameState.log.push(entry);
            if (gameState.log.length > 60) {
                gameState.log = gameState.log.slice(-60);
            }

            await db.execute(
                `UPDATE rooms SET game_state = ? WHERE id = ?`,
                [JSON.stringify(gameState), room.id]
            );

            io.to(code).emit("room_chat_message", {
                author,
                text: messageText,
                time: entry.time
            });
        } catch (error) {
            console.error("Ошибка синхронизации чата:", error);
          }
        });
    });

    socket.on("leave_room", (roomCode) => {
        const code = String(roomCode || "").trim().toUpperCase();
        if (code) {
            socket.leave(code);
        }
    });

    socket.on("disconnect", () => {
        console.log(`Игрок отключился: ${socket.id}`);
    });
});

// Проверка сервера
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Mafia server is running"
    });
});

// ================================
// РЕГИСТРАЦИЯ
// ================================
app.post("/api/register", async (req, res) => {
    try {
        const { email, password, nickname, avatar } = req.body;
        const emailInput = sanitizeText(email, 255).toLowerCase();
        const passwordValue = String(password ?? "");
        const nicknameValue = validateNickname(nickname);
        const normalizedAvatar = validateAvatar(avatar);

        if (!emailInput || !passwordValue || !nicknameValue) {
            return res.status(400).json({
                success: false,
                message: "Заполните все поля корректно."
            });
        }

        if (!emailInput.includes("@")) {
            return res.status(400).json({
                success: false,
                message: "Введите корректный email."
            });
        }

        if (passwordValue.length < 6 || passwordValue.length > 128) {
            return res.status(400).json({
                success: false,
                message: "Пароль должен содержать от 6 до 128 символов."
            });
        }

        const [emailRows] = await db.execute(
            "SELECT id FROM users WHERE email = ? LIMIT 1",
            [emailInput]
        );

        if (emailRows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Этот email уже зарегистрирован."
            });
        }

        const [nicknameRows] = await db.execute(
            "SELECT id FROM users WHERE nickname = ? LIMIT 1",
            [nicknameValue]
        );

        if (nicknameRows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Этот ник уже занят."
            });
        }

        const passwordHash = await bcrypt.hash(passwordValue, 12);

        const [result] = await db.execute(
            `
            INSERT INTO users
            (email, password_hash, nickname, avatar)
            VALUES (?, ?, ?, ?)
            `,
            [
                emailInput,
                passwordHash,
                nicknameValue,
                normalizedAvatar || null
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Аккаунт успешно создан!",
            user: {
                id: result.insertId,
                email: emailInput,
                nickname: nicknameValue,
                avatar: normalizedAvatar || null
            }
        });

    } catch (error) {
        console.error("Ошибка регистрации:", error);

        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при регистрации."
        });
    }
});

// ========================================
// ВХОД
// ========================================

app.post("/api/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        // Проверяем поля
        if (!email || !password) {

            return res.status(400).json({
                success: false,
                message: "Введите email и пароль."
            });

        }


        // Ищем пользователя
        const [users] = await db.execute(
            `
            SELECT
                id,
                email,
                password_hash,
                nickname,
                avatar
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [email]
        );


        // Пользователь не найден
        if (users.length === 0) {

            return res.status(401).json({
                success: false,
                message: "Неверный email или пароль."
            });

        }


        const user = users[0];


        // Проверяем пароль
        const passwordCorrect =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!passwordCorrect) {

            return res.status(401).json({
                success: false,
                message: "Неверный email или пароль."
            });

        }


        // Создаём сессию
        req.session.userId = user.id;


        console.log(
            "Пользователь вошёл:",
            user.nickname,
            "ID:",
            user.id
        );


        return res.json({

            success: true,

            message: "Вы успешно вошли!",

            user: {
                id: user.id,
                email: user.email,
                nickname: user.nickname,
                avatar: user.avatar
            }

        });

    } catch (error) {

        console.error(
            "Ошибка входа:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Ошибка сервера при входе."

        });

    }

});

// ========================================
// ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
// ========================================

// ========================================
// ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
// ========================================

app.get("/api/me", async (req, res) => {

    try {

        // Проверяем session
        if (!req.session.userId) {

            return res.status(401).json({
                success: false,
                message: "Пользователь не авторизован."
            });

        }


        // Получаем пользователя из БД
        const [users] = await db.execute(
            `
            SELECT
                id,
                email,
                nickname,
                avatar,
                created_at
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [req.session.userId]
        );


        // Пользователь не найден
        if (users.length === 0) {

            req.session.destroy(() => {});

            return res.status(401).json({
                success: false,
                message: "Пользователь не найден."
            });

        }


        // Отправляем данные пользователя
        return res.json({

            success: true,

            user: {
                ...users[0],
                avatar: sanitizeAvatar(users[0].avatar)
            }

        });


    } catch (error) {

        console.error(
            "Ошибка /api/me:",
            error
        );


        return res.status(500).json({

            success: false,

            message: "Ошибка сервера."

        });

    }

});
app.get("/api/profile", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const profile = await getPlayerProfile(req.session.userId);
        const achievements = await listAchievements(req.session.userId);
        const notifications = await getNotifications(req.session.userId);
        const season = await getCurrentSeason();

        return res.json({
            success: true,
            profile: profile || {},
            achievements,
            notifications,
            season
        });
    } catch (error) {
        console.error("Ошибка /api/profile:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при загрузке профиля."
        });
    }
});

app.get("/api/leaderboard", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const [userCountRows] = await db.execute(`SELECT COUNT(*) AS total FROM users`);
        const leaderboard = await getActiveSeasonLeaderboard(Math.max(1, Number(userCountRows[0]?.total) || 0));
        return res.json({
            success: true,
            leaderboard
        });
    } catch (error) {
        console.error("Ошибка /api/leaderboard:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при загрузке рейтинга."
        });
    }
});

app.get("/api/seasons", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const season = await getCurrentSeason();
        const leaderboard = season ? await getActiveSeasonLeaderboard(15) : [];

        return res.json({
            success: true,
            season,
            leaderboard
        });
    } catch (error) {
        console.error("Ошибка /api/seasons:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при загрузке сезонов."
        });
    }
});

app.get("/api/achievements", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const achievements = await listAchievements(req.session.userId);
        return res.json({
            success: true,
            achievements
        });
    } catch (error) {
        console.error("Ошибка /api/achievements:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при загрузке достижений."
        });
    }
});

app.get("/api/notifications", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const notifications = await getNotifications(req.session.userId);
        return res.json({
            success: true,
            notifications
        });
    } catch (error) {
        console.error("Ошибка /api/notifications:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при загрузке уведомлений."
        });
    }
});

app.get("/api/season-history", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const history = await getSeasonHistory(req.session.userId);
        return res.json({
            success: true,
            history
        });
    } catch (error) {
        console.error("Ошибка /api/season-history:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при загрузке истории сезонов."
        });
    }
});

app.get("/api/rooms/:roomCode", async (req, res) => {
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

        const [rooms] = await db.execute(`
            SELECT
                r.id,
                r.room_code,
                r.name,
                r.max_players,
                r.status,
                r.owner_id,
                r.game_state
            FROM rooms r
            WHERE r.room_code = ?
            LIMIT 1
        `, [roomCode]);

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];

        const [players] = await db.execute(`
            SELECT
                u.id,
                u.nickname,
                u.avatar,
                rp.role,
                rp.is_ready,
                rp.is_alive,
                rp.joined_at
            FROM room_players rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.room_id = ?
            ORDER BY rp.joined_at ASC
        `, [room.id]);

        const currentPlayer = players.find(
            player => player.id === req.session.userId
        );

        if (!currentPlayer) {
            return res.status(403).json({
                success: false,
                message: "Вы не состоите в этой комнате."
            });
        }

        const roomGameState = parseStoredGameState(room.game_state);

        return res.json({
            success: true,
            room: {
                id: room.id,
                code: room.room_code,
                name: room.name,
                maxPlayers: room.max_players,
                status: room.status,
                ownerId: room.owner_id,
                gameState: roomGameState
            },
            players: players.map((player) => ({
                ...player,
                role: Number(player.id) === Number(req.session.userId) ? player.role || "citizen" : null
            })),
            currentUserId: req.session.userId
        });

    } catch (error) {
        console.error("Ошибка получения комнаты:", error);

        if (
            error.code === "ER_NO_SUCH_TABLE" ||
            String(error.message).includes("doesn't exist") ||
            String(error.message).includes("Table 'mafia_game.rooms'") ||
            String(error.message).includes("Table 'mafia_game.room_players'")
        ) {
            return res.status(500).json({
                success: false,
                message: "Схема БД ещё не создана. Выполните SQL из database/schema.sql и затем перезапустите сервер."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

// ========================================
// СОЗДАНИЕ ИГРОВОЙ КОМНАТЫ
// ========================================

app.post("/api/rooms", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const { name, maxPlayers, password } = req.body;
        const roomName = sanitizeText(name, 50);
        const players = Number(maxPlayers);

        if (!roomName || roomName.length < 3 || roomName.length > 50) {
            return res.status(400).json({
                success: false,
                message: "Название комнаты должно содержать от 3 до 50 символов."
            });
        }

        if (!Number.isInteger(players) || players < 4 || players > 20) {
            return res.status(400).json({
                success: false,
                message: "Количество игроков должно быть от 4 до 20."
            });
        }

        let roomCode;
        let codeExists = true;

        while (codeExists) {
            roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const [existingRooms] = await db.execute(
                "SELECT id FROM rooms WHERE room_code = ? LIMIT 1",
                [roomCode]
            );
            codeExists = existingRooms.length > 0;
        }

        let passwordHash = null;
        if (password && String(password).trim()) {
            const roomPassword = String(password).trim();
            if (roomPassword.length < 3 || roomPassword.length > 64) {
                return res.status(400).json({
                    success: false,
                    message: "Пароль комнаты должен содержать от 3 до 64 символов."
                });
            }
            passwordHash = await bcrypt.hash(roomPassword, 12);
        }

        const [result] = await db.execute(
            `
            INSERT INTO rooms
            (room_code, name, max_players, password_hash, status, owner_id)
            VALUES (?, ?, ?, ?, 'waiting', ?)
            `,
            [roomCode, roomName, players, passwordHash, req.session.userId]
        );

        await db.execute(
            `
            INSERT INTO room_players
            (room_id, user_id)
            VALUES (?, ?)
            `,
            [result.insertId, req.session.userId]
        );

        return res.status(201).json({
            success: true,
            message: "Комната успешно создана.",
            room: {
                id: result.insertId,
                code: roomCode,
                name: roomName,
                maxPlayers: players,
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

// ========================================
// ВХОД В ИГРОВУЮ КОМНАТУ
// ========================================

app.post("/api/rooms/join", async (req, res) => {

    let connection;

    try {

        // ========================================
        // ПРОВЕРКА АВТОРИЗАЦИИ
        // ========================================

        if (!req.session.userId) {

            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });

        }


        const {
            roomCode,
            password
        } = req.body;


        // ========================================
        // ПРОВЕРКА КОДА
        // ========================================

        if (!roomCode || !roomCode.trim()) {

            return res.status(400).json({
                success: false,
                message: "Введите код комнаты."
            });

        }


        const normalizedCode =
            roomCode.trim().toUpperCase();


        // ========================================
        // ПОДКЛЮЧАЕМСЯ К БД
        // ========================================

        connection = await db.getConnection();

        await connection.beginTransaction();


        // ========================================
        // НАХОДИМ КОМНАТУ
        // ========================================

        const [rooms] = await connection.execute(
            `
            SELECT
                id,
                room_code,
                name,
                max_players,
                password_hash,
                status
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
            FOR UPDATE
            `,
            [normalizedCode]
        );


        // Комната не найдена

        if (rooms.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Комната с таким кодом не найдена."
            });

        }


        const room = rooms[0];
        const roomGameState = room.game_state ? JSON.parse(room.game_state) : null;
        const runtimeStatus = normalizeGameRuntimeStatus(room.status, roomGameState);

        if (runtimeStatus !== "waiting") {

            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: runtimeStatus === "finished" ? "Игра уже завершена." : "В эту комнату сейчас нельзя войти."
            });

        }


        // ========================================
        // ПРОВЕРЯЕМ ПАРОЛЬ
        // ========================================

        if (room.password_hash) {

            if (!password) {

                await connection.rollback();

                return res.status(401).json({
                    success: false,
                    message: "Введите пароль комнаты."
                });

            }


            const passwordCorrect =
                await bcrypt.compare(
                    password,
                    room.password_hash
                );


            if (!passwordCorrect) {

                await connection.rollback();

                return res.status(401).json({
                    success: false,
                    message: "Неверный пароль комнаты."
                });

            }

        }


        // ========================================
        // ПРОВЕРЯЕМ, НЕ В КОМНАТЕ ЛИ УЖЕ ИГРОК
        // ========================================

        const [existingPlayers] =
            await connection.execute(
                `
                SELECT id
                FROM room_players
                WHERE room_id = ?
                  AND user_id = ?
                LIMIT 1
                `,
                [
                    room.id,
                    req.session.userId
                ]
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


        // ========================================
        // СЧИТАЕМ ИГРОКОВ
        // ========================================

        const [playerCountRows] =
            await connection.execute(
                `
                SELECT COUNT(*) AS player_count
                FROM room_players
                WHERE room_id = ?
                `,
                [room.id]
            );


        const playerCount =
            Number(playerCountRows[0].player_count);


        // ========================================
        // КОМНАТА ЗАПОЛНЕНА
        // ========================================

        if (playerCount >= room.max_players) {

            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "В комнате больше нет свободных мест."
            });

        }


        // ========================================
        // ДОБАВЛЯЕМ ИГРОКА
        // ========================================

        await connection.execute(
            `
            INSERT INTO room_players
            (
                room_id,
                user_id
            )
            VALUES (?, ?)
            `,
            [
                room.id,
                req.session.userId
            ]
        );


        await connection.commit();


        console.log(
            "Игрок присоединился:",
            "userId =", req.session.userId,
            "room =", room.room_code
        );


        return res.status(201).json({

            success: true,

            message: "Вы присоединились к комнате.",

            room: {
                id: room.id,
                code: room.room_code,
                name: room.name,
                maxPlayers: room.max_players,
                status: room.status,

                currentPlayers:
                    playerCount + 1
            }

        });


    } catch (error) {

        if (connection) {
            await connection.rollback();
        }


        // Дубликат участника

        if (error.code === "ER_DUP_ENTRY") {

            return res.status(409).json({
                success: false,
                message: "Вы уже находитесь в этой комнате."
            });

        }


        console.error(
            "Ошибка входа в комнату:",
            error
        );


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
app.post("/api/rooms/ready", async (req, res) => {

    try {

        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }


        const { roomCode } = req.body;


        if (!roomCode) {
            return res.status(400).json({
                success: false,
                message: "Код комнаты не указан."
            });
        }


        const normalizedCode =
            roomCode.trim().toUpperCase();


        const [rooms] = await db.execute(`
            SELECT id, status
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
        `, [normalizedCode]);


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


        const [players] = await db.execute(`
            SELECT id, is_ready
            FROM room_players
            WHERE room_id = ?
              AND user_id = ?
            LIMIT 1
        `, [
            rooms[0].id,
            req.session.userId
        ]);


        if (players.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Вы не состоите в этой комнате."
            });
        }


        const newReadyState =
            players[0].is_ready ? 0 : 1;


        await db.execute(`
            UPDATE room_players
            SET is_ready = ?
            WHERE id = ?
        `, [
            newReadyState,
            players[0].id
        ]);


        return res.json({
            success: true,
            isReady: Boolean(newReadyState)
        });

    } catch (error) {

        console.error("Ошибка изменения готовности:", error);

        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });

    }

});

app.post("/api/rooms/start", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const { roomCode } = req.body;

        if (!roomCode || !roomCode.trim()) {
            return res.status(400).json({
                success: false,
                message: "Код комнаты не указан."
            });
        }

        const normalizedCode = roomCode.trim().toUpperCase();

        const [rooms] = await db.execute(`
            SELECT id, room_code, name, max_players, owner_id, status, game_state
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
        `, [normalizedCode]);

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        const roomGameState = room.game_state ? JSON.parse(room.game_state) : null;
        const runtimeStatus = normalizeGameRuntimeStatus(room.status, roomGameState);

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

        if (room.status !== "waiting") {
            return res.status(400).json({
                success: false,
                message: "Игра уже началась."
            });
        }

        const [players] = await db.execute(`
            SELECT p.id, p.user_id, p.role, p.is_ready, p.is_alive, u.nickname
            FROM room_players p
            JOIN users u ON u.id = p.user_id
            WHERE p.room_id = ?
            ORDER BY p.joined_at ASC
        `, [room.id]);

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

        const updates = assignedPlayers.map((player) => db.execute(
            `
            UPDATE room_players
            SET role = ?, is_alive = ?, is_ready = 0
            WHERE room_id = ? AND user_id = ?
            `,
            [player.role, player.alive ? 1 : 0, room.id, player.id]
        ));

        await Promise.all(updates);

        const gameState = createGameState({
            roomId: room.id,
            roomCode: room.room_code,
            roomName: room.name,
            players: assignedPlayers
        });

        await db.execute(`
            UPDATE rooms
            SET status = 'playing', game_state = ?
            WHERE id = ?
        `, [JSON.stringify(gameState), room.id]);

        const currentPlayer = assignedPlayers.find(player => player.id === req.session.userId);

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
            role: currentPlayer ? currentPlayer.role : null,
            currentUserId: req.session.userId
        });

    } catch (error) {
        console.error("Ошибка запуска игры:", error);

        if (
            error.code === "ER_NO_SUCH_TABLE" ||
            String(error.message).includes("doesn't exist") ||
            String(error.message).includes("Table 'mafia_game.rooms'") ||
            String(error.message).includes("Table 'mafia_game.room_players'")
        ) {
            return res.status(500).json({
                success: false,
                message: "Сначала создайте таблицы комнат в БД: database/schema.sql"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при запуске игры."
        });
    }
});

app.get("/api/rooms/:roomCode/game", async (req, res) => {
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

        const [rooms] = await db.execute(`
            SELECT id, room_code, name, max_players, owner_id, status, game_state
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
        `, [roomCode]);

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        let gameState = room.game_state ? JSON.parse(room.game_state) : null;
        if (!gameState) {
            return res.status(400).json({
                success: false,
                message: "Состояние игры ещё не создано."
            });
        }

        const normalizedStatus = normalizeGameRuntimeStatus(room.status, gameState);
        if (normalizedStatus === "finished") {
            room.status = "finished";
            if (gameState.phase !== "finished") {
                gameState.phase = "finished";
                gameState.winner = gameState.winner || "ongoing";
                gameState.phaseEndsAt = null;
            }
            await db.execute(`
                UPDATE rooms
                SET status = 'finished', game_state = ?
                WHERE id = ?
            `, [JSON.stringify(gameState), room.id]);
        }

        const [rows] = await db.execute(`
            SELECT
                u.id,
                u.nickname,
                u.avatar,
                rp.role,
                rp.is_ready,
                rp.is_alive,
                rp.joined_at
            FROM room_players rp
            JOIN users u ON u.id = rp.user_id
            WHERE rp.room_id = ?
            ORDER BY rp.joined_at ASC
        `, [room.id]);

        const inRoom = rows.some((player) => Number(player.id) === Number(req.session.userId));
        if (!inRoom) {
            return res.status(403).json({
                success: false,
                message: "Вы не состоите в этой комнате."
            });
        }

        if (!Array.isArray(gameState.log)) {
            gameState.log = [];
        }

        const runtimeStatus = normalizeGameRuntimeStatus(room.status, gameState);
        if (runtimeStatus === "finished") {
            gameState.phase = "finished";
            gameState.winner = gameState.winner || "ongoing";
            gameState.phaseEndsAt = null;
        } else if (gameState.phase !== "finished") {
            const advanced = syncPhaseByRealtime(gameState);
            if (advanced) {
                gameState.winner = gameState.winner || "ongoing";
            }
        }

        const nextRoomStatus = normalizeGameRuntimeStatus(room.status, gameState);

        await db.execute(`
            UPDATE rooms
            SET game_state = ?, status = ?
            WHERE id = ?
        `, [JSON.stringify(gameState), nextRoomStatus, room.id]);

        const visibleState = getVisibleGameStateForPlayer(gameState, req.session.userId);

        const visiblePlayers = rows.map((player) => ({
            id: Number(player.id),
            nickname: player.nickname,
            avatar: player.avatar,
            alive: player.is_alive !== 0,
            role: Number(player.id) === Number(req.session.userId) ? (player.role || "citizen") : null,
            isReady: player.is_ready === 1,
            isOwner: Number(room.owner_id) === Number(player.id)
        }));

        return res.json({
            success: true,
            room: {
                id: room.id,
                code: room.room_code,
                name: room.name,
                maxPlayers: room.max_players,
                status: normalizeGameRuntimeStatus(room.status, gameState),
                ownerId: room.owner_id,
                gameState: visibleState
            },
            players: visiblePlayers,
            currentUserId: req.session.userId,
            gameState: visibleState
        });
    } catch (error) {
        console.error("Ошибка получения состояния игры:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при получении состояния игры."
        });
    }
});

app.post("/api/rooms/:roomCode/action", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
        const { targetId } = req.body || {};

        if (!roomCode || !targetId) {
            return res.status(400).json({
                success: false,
                message: "Не указана цель действия."
            });
        }

        const [rooms] = await db.execute(`
            SELECT id, room_code, name, status, game_state
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
        `, [roomCode]);

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        if (room.status !== "playing") {
            return res.status(400).json({
                success: false,
                message: "Игра ещё не началась."
            });
        }

        let gameState = room.game_state ? JSON.parse(room.game_state) : null;
        if (!gameState) {
            return res.status(400).json({
                success: false,
                message: "Состояние игры не создано."
            });
        }

        const visible = getVisibleGameStateForPlayer(gameState, req.session.userId);
        const myPlayer = (gameState.players || []).find((player) => Number(player.id) === Number(req.session.userId));

        if (!myPlayer || myPlayer.alive === false) {
            return res.status(400).json({
                success: false,
                message: "Вы не можете участвовать в действии."
            });
        }

        const reply = applyNightAction(gameState, req.session.userId, myPlayer.role, targetId);

        if (!reply || !reply.accepted) {
            return res.status(400).json({
                success: false,
                message: reply?.reason === "already_used" ? "Это действие уже выполнено в эту фазу." : "Действие недоступно для вашей роли."
            });
        }

        const nextRoomStatus = gameState.phase === "finished" || gameState.winner && gameState.winner !== "ongoing" ? "finished" : room.status;

        await db.execute(`
            UPDATE rooms
            SET game_state = ?, status = ?
            WHERE id = ?
        `, [JSON.stringify(gameState), nextRoomStatus, room.id]);

        return res.json({
            success: true,
            message: "Ночное действие зафиксировано.",
            action: reply,
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

app.post("/api/rooms/:roomCode/vote", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }

        const roomCode = String(req.params.roomCode || "").trim().toUpperCase();
        const { targetId } = req.body || {};

        if (!roomCode || !targetId) {
            return res.status(400).json({
                success: false,
                message: "Не указана цель голосования."
            });
        }

        const [rooms] = await db.execute(`
            SELECT id, status, game_state
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
        `, [roomCode]);

        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }

        const room = rooms[0];
        let gameState = room.game_state ? JSON.parse(room.game_state) : null;
        if (!gameState) {
            return res.status(400).json({
                success: false,
                message: "Состояние игры не найдено."
            });
        }

        const voter = (gameState.players || []).find((player) => Number(player.id) === Number(req.session.userId));
        if (!voter || voter.alive === false) {
            return res.status(400).json({
                success: false,
                message: "Вы не можете голосовать."
            });
        }

        const result = applyVote(gameState, req.session.userId, targetId);
        const phase = advanceGamePhase(gameState, "vote");

        const nextRoomStatus = gameState.phase === "finished" || gameState.winner && gameState.winner !== "ongoing" ? "finished" : "playing";

        await db.execute(`
            UPDATE rooms
            SET game_state = ?, status = ?
            WHERE id = ?
        `, [JSON.stringify(gameState), nextRoomStatus, room.id]);

        return res.json({
            success: true,
            message: "Голосование учтено.",
            result,
            phase,
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

app.post("/api/rooms/leave", async (req, res) => {

    try {

        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Необходимо войти в аккаунт."
            });
        }


        const { roomCode } = req.body;


        if (!roomCode) {
            return res.status(400).json({
                success: false,
                message: "Код комнаты не указан."
            });
        }


        const normalizedCode =
            roomCode.trim().toUpperCase();


        const [rooms] = await db.execute(`
            SELECT id, owner_id, status
            FROM rooms
            WHERE room_code = ?
            LIMIT 1
        `, [normalizedCode]);


        if (rooms.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Комната не найдена."
            });
        }


        if (rooms[0].status !== "waiting") {
            return res.status(400).json({
                success: false,
                message: "Из игры сейчас нельзя выйти."
            });
        }


        const [players] = await db.execute(`
            SELECT id
            FROM room_players
            WHERE room_id = ?
              AND user_id = ?
            LIMIT 1
        `, [
            rooms[0].id,
            req.session.userId
        ]);


        if (players.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Вы не состоите в этой комнате."
            });
        }


        await db.execute(`
            DELETE FROM room_players
            WHERE id = ?
        `, [players[0].id]);


        return res.json({
            success: true,
            message: "Вы вышли из комнаты."
        });

    } catch (error) {

        console.error("Ошибка выхода из комнаты:", error);

        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });

    }

});
// ========================================
// ВЫХОД
// ========================================

app.post("/api/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {

            console.error(
                "Ошибка выхода:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Не удалось выйти из аккаунта."
            });

        }


        res.clearCookie("connect.sid");


        return res.json({
            success: true,
            message: "Вы вышли из аккаунта."
        });

    });

});

// Если страница не найдена
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Страница не найдена."
    });
});

// Запуск сервера
initializeDatabase()
    .catch((error) => {
        console.warn("Database bootstrap failed:", error.message);
    })
    .finally(() => {
        server.listen(PORT, "0.0.0.0", () => {
            console.log("");
            console.log("================================");
            console.log(" Mafia server запущен!");
            console.log(` http://localhost:${PORT}`);
            console.log(` http://0.0.0.0:${PORT}`);
            console.log("================================");
            console.log("");
        });
    });