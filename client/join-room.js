document.addEventListener("DOMContentLoaded", async () => {

    console.log("JOIN-ROOM.JS ЗАГРУЖЕН");


    const roomCodeInput =
        document.getElementById("roomCode");

    const roomPasswordInput =
        document.getElementById("roomPassword");

    const joinRoomButton =
        document.getElementById("joinRoomButton");

    const backButton =
        document.getElementById("backButton");


    // ========================================
    // ПРОВЕРЯЕМ АВТОРИЗАЦИЮ
    // ========================================

    try {

        const response =
            await fetch("/api/me");


        if (!response.ok) {

            window.location.href =
                "/login.html";

            return;
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
    // НАЗАД
    // ========================================

    backButton.addEventListener(
        "click",
        () => {

            window.location.href =
                "/main.html";

        }
    );


    // ========================================
    // ВХОД В КОМНАТУ
    // ========================================

    joinRoomButton.addEventListener(
        "click",
        async () => {

            const roomCode =
                roomCodeInput.value
                    .trim()
                    .toUpperCase();


            const password =
                roomPasswordInput.value;


            // ========================================
            // ПРОВЕРКА КОДА
            // ========================================

            if (!roomCode) {

                window.gameToast && window.gameToast(
                    "Введите код комнаты.",
                    "error"
                );

                return;
            }


            if (roomCode.length < 4) {

                window.gameToast && window.gameToast(
                    "Введите корректный код комнаты.",
                    "error"
                );

                return;
            }


            joinRoomButton.disabled =
                true;

            joinRoomButton.textContent =
                "Поиск...";


            try {

                const response =
                    await fetch(
                        "/api/rooms/join",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                roomCode,
                                password
                            })
                        }
                    );


                const result =
                    await response.json();


                console.log(
                    "Ответ сервера:",
                    result
                );


                if (!response.ok) {

                    window.gameToast && window.gameToast(
                        result.message ||
                        "Не удалось войти в комнату.",
                        "error"
                    );

                    return;
                }


                // ========================================
                // УСПЕШНО
                // ========================================

                window.gameToast && window.gameToast(
                    `Вы вошли в комнату "${result.room.name}".`,
                    "success"
                );


                console.log(
                    "Комната:",
                    result.room
                );


                window.location.href =
                    `/lobby.html?code=${encodeURIComponent(result.room.code)}`;


            } catch (error) {

                console.error(
                    "Ошибка входа в комнату:",
                    error
                );


                window.gameToast && window.gameToast(
                    "Не удалось подключиться к серверу.",
                    "error"
                );


            } finally {

                joinRoomButton.disabled =
                    false;

                joinRoomButton.textContent =
                    "Найти игру";

            }

        }
    );

});