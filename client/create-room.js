document.addEventListener("DOMContentLoaded", async () => {

    console.log("CREATE-ROOM.JS ЗАГРУЖЕН");


    const roomNameInput =
        document.getElementById("roomName");

    const maxPlayersInput =
        document.getElementById("maxPlayers");

    const roomPasswordInput =
        document.getElementById("roomPassword");

    const createRoomButton =
        document.getElementById("createRoomButton");

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

            window.location.href = "/main.html";

        }
    );


    // ========================================
    // СОЗДАНИЕ КОМНАТЫ
    // ========================================

    createRoomButton.addEventListener(
        "click",
        async () => {

            const name =
                roomNameInput.value.trim();

            const maxPlayers =
                Number(maxPlayersInput.value);

            const password =
                roomPasswordInput.value;


            // Проверяем название

            if (!name) {

                window.gameToast && window.gameToast(
                    "Введите название комнаты.",
                    "error"
                );

                return;
            }


            if (name.length < 3) {

                window.gameToast && window.gameToast(
                    "Название комнаты должно содержать минимум 3 символа.",
                    "error"
                );

                return;
            }


            createRoomButton.disabled = true;

            createRoomButton.textContent =
                "Создание...";


            try {

                const response =
                    await fetch(
                        "/api/rooms",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                name,
                                maxPlayers,
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
                        "Не удалось создать комнату.",
                        "error"
                    );

                    return;
                }


                // ========================================
                // КОМНАТА СОЗДАНА
                // ========================================

                window.gameToast && window.gameToast(
                    `Комната создана!\nКод комнаты: ${result.room.code}`,
                    "success"
                );


                console.log(
                    "Созданная комната:",
                    result.room
                );


                window.location.href =
                    `/lobby.html?code=${encodeURIComponent(result.room.code)}`;


            } catch (error) {

                console.error(
                    "Ошибка создания комнаты:",
                    error
                );


                window.gameToast && window.gameToast(
                    "Не удалось подключиться к серверу.",
                    "error"
                );


            } finally {

                createRoomButton.disabled =
                    false;

                createRoomButton.textContent =
                    "Создать игру";

            }

        }
    );

});