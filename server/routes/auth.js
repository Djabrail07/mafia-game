const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const { sanitizeAvatar } = require("../avatar");

const router = express.Router();

const sanitizeText = (value, maxLength = 255) => {
    if (value === null || value === undefined) {
        return "";
    }

    const trimmed = String(value).trim();
    return trimmed.slice(0, maxLength);
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

router.post("/register", async (req, res) => {
    try {
        const emailInput = sanitizeText(req.body?.email, 255).toLowerCase();
        const passwordValue = String(req.body?.password ?? "");
        const nickname = validateNickname(req.body?.nickname);
        const avatar = validateAvatar(req.body?.avatar);

        if (!emailInput || !passwordValue || !nickname) {
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
            [nickname]
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
            INSERT INTO users (email, password_hash, nickname, avatar)
            VALUES (?, ?, ?, ?)
            `,
            [emailInput, passwordHash, nickname, avatar || null]
        );

        return res.status(201).json({
            success: true,
            message: "Аккаунт успешно создан!",
            user: {
                id: result.insertId,
                email: emailInput,
                nickname,
                avatar: avatar || null
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

router.post("/login", async (req, res) => {
    try {
        const emailInput = sanitizeText(req.body?.email, 255).toLowerCase();
        const passwordValue = String(req.body?.password ?? "");

        if (!emailInput || !passwordValue) {
            return res.status(400).json({
                success: false,
                message: "Введите email и пароль."
            });
        }

        const [users] = await db.execute(
            `
            SELECT id, email, password_hash, nickname, avatar
            FROM users
            WHERE email = ?
            LIMIT 1
            `,
            [emailInput]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Неверный email или пароль."
            });
        }

        const user = users[0];
        const passwordCorrect = await bcrypt.compare(passwordValue, user.password_hash);

        if (!passwordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Неверный email или пароль."
            });
        }

        req.session.userId = user.id;

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
        console.error("Ошибка входа:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера при входе."
        });
    }
});

router.get("/me", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Пользователь не авторизован."
            });
        }

        const [users] = await db.execute(
            `
            SELECT id, email, nickname, avatar, created_at
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [req.session.userId]
        );

        if (users.length === 0) {
            req.session.destroy(() => {});
            return res.status(401).json({
                success: false,
                message: "Пользователь не найден."
            });
        }

        return res.json({
            success: true,
            user: {
                ...users[0],
                avatar: sanitizeAvatar(users[0].avatar)
            }
        });
    } catch (error) {
        console.error("Ошибка /api/me:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

router.post("/me/avatar", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({
                success: false,
                message: "Пользователь не авторизован."
            });
        }

        const avatar = validateAvatar(req.body?.avatar);
        if (!avatar) {
            return res.status(400).json({
                success: false,
                message: "Некорректная ссылка на аватар."
            });
        }

        await db.execute(
            `UPDATE users SET avatar = ? WHERE id = ?`,
            [avatar, req.session.userId]
        );

        return res.json({
            success: true,
            message: "Аватар обновлён.",
            avatar
        });
    } catch (error) {
        console.error("Ошибка обновления аватара:", error);
        return res.status(500).json({
            success: false,
            message: "Ошибка сервера."
        });
    }
});

router.post("/logout", async (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Не удалось выйти."
            });
        }

        return res.json({
            success: true,
            message: "Вы вышли из системы."
        });
    });
});

module.exports = router;
