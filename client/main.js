const socket = io();

function joinGame(username) {
    socket.emit("join_lobby", { username });
}

document.addEventListener("DOMContentLoaded", async () => {

    console.log("MAIN.JS ЗАГРУЖЕН");

    socket.on("connect", () => {
        console.log("Socket connected:", socket.id);
    });

    const userNickname =
        document.getElementById("userNickname");

    const userAvatar =
        document.getElementById("userAvatar");
    const userAvatarFallback =
        document.getElementById("userAvatarFallback");

    const createGameButton =
        document.getElementById("createGameButton");

    const findGameButton =
        document.getElementById("findGameButton");

    const profileButton =
        document.getElementById("profileButton");

    const leaderboardButton =
        document.getElementById("leaderboardButton");

    const seasonButton =
        document.getElementById("seasonButton");

    const logoutButton =
        document.getElementById("logoutButton");


    // ========================================
    // ПРОВЕРЯЕМ АВТОРИЗАЦИЮ
    // ========================================

    try {

        const response = await fetch("/api/me");

        const result = await response.json();


        if (!response.ok) {

            console.log(
                "Пользователь не авторизован."
            );

            window.location.href = "/login.html";

            return;
        }


        console.log(
            "Текущий пользователь:",
            result.user
        );

        sessionStorage.setItem("currentUserId", String(result.user.id));
        sessionStorage.setItem("userNickname", result.user.nickname || "Игрок");

        // ========================================
        // ПОКАЗЫВАЕМ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
        // ========================================

        userNickname.textContent =
            result.user.nickname;


        userAvatarFallback.textContent = (result.user.nickname || "?").charAt(0).toUpperCase();
        userAvatar.hidden = !result.user.avatar;
        if (result.user.avatar) {
            userAvatar.addEventListener("load", () => {
                userAvatarFallback.hidden = true;
            }, { once: true });
            userAvatar.addEventListener("error", () => {
                userAvatar.hidden = true;
            }, { once: true });
            userAvatar.src = result.user.avatar;
        }


    } catch (error) {

        console.error(
            "Ошибка проверки авторизации:",
            error
        );

        window.location.href =
            "/login.html";

        return;
    }


    // ========================================
    // СОЗДАТЬ ИГРУ
    // ========================================

    createGameButton.addEventListener(
    "click",
    () => {

        window.location.href =
            "/create-room.html";

    }
);


    // ========================================
    // НАЙТИ ИГРУ
    // ========================================

    findGameButton.addEventListener(
    "click",
    () => {

        window.location.href =
            "/join-room.html";

    }
);


    // ========================================
    // ПРОФИЛЬ
    // ========================================

    profileButton.addEventListener(
        "click",
        () => {
            window.location.href = "/profile.html";
        }
    );

    leaderboardButton.addEventListener(
        "click",
        () => {
            window.location.href = "/leaderboard.html";
        }
    );

    seasonButton.addEventListener(
        "click",
        () => {
            window.location.href = "/seasons.html";
        }
    );


    // ========================================
    // ВЫХОД
    // ========================================

    logoutButton.addEventListener(
        "click",
        async () => {

            logoutButton.disabled = true;

            logoutButton.textContent =
                "Выход...";


            try {

                const response = await fetch(
                    "/api/logout",
                    {
                        method: "POST"
                    }
                );


                const result =
                    await response.json();


                if (!response.ok) {

                    window.gameToast && window.gameToast(
                        result.message ||
                        "Не удалось выйти.",
                        "error"
                    );

                    return;
                }


                console.log(
                    "Пользователь вышел."
                );


                window.location.href =
                    "/login.html";


            } catch (error) {

                console.error(
                    "Ошибка выхода:",
                    error
                );

                window.gameToast && window.gameToast(
                    "Не удалось подключиться к серверу.",
                    "error"
                );


            } finally {

                logoutButton.disabled = false;

                logoutButton.textContent =
                    "Выйти";

            }

        }
    );

});