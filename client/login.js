document.addEventListener("DOMContentLoaded", () => {

    console.log("LOGIN.JS ЗАГРУЖЕН");


    const emailInput =
        document.getElementById("loginEmail");

    const passwordInput =
        document.getElementById("loginPassword");

    const loginButton =
        document.getElementById("loginButton");


    loginButton.addEventListener("click", async () => {

        const email =
            emailInput.value.trim();

        const password =
            passwordInput.value;


        // ================================
        // ПРОВЕРКА
        // ================================

        if (!email) {

            window.gameToast && window.gameToast("Введите email.", "error");

            return;
        }


        if (!email.includes("@")) {

            window.gameToast && window.gameToast("Введите корректный email.", "error");

            return;
        }


        if (!password) {

            window.gameToast && window.gameToast("Введите пароль.", "error");

            return;
        }


        // ================================
        // БЛОКИРУЕМ КНОПКУ
        // ================================

        loginButton.disabled = true;

        loginButton.textContent = "Вход...";


        try {

            console.log("Отправляем запрос входа...");


            const response = await fetch(
                "/api/login",
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        email,
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


            // ================================
            // ОШИБКА
            // ================================

            if (!response.ok) {

                window.gameToast && window.gameToast(
                    result.message ||
                    "Ошибка входа.",
                    "error"
                );

                return;
            }


            // ================================
            // УСПЕХ
            // ================================

            sessionStorage.setItem("currentUserId", String(result.user.id));
            sessionStorage.setItem("userNickname", result.user.nickname || "Игрок");

            window.gameToast && window.gameToast(
                result.message ||
                "Вы успешно вошли!",
                "success"
            );


            // Переходим в главное меню
            window.location.href = "/main.html";


        } catch (error) {

            console.error(
                "Ошибка входа:",
                error
            );


            window.gameToast && window.gameToast(
                "Не удалось подключиться к серверу.",
                "error"
            );


        } finally {

            loginButton.disabled = false;

            loginButton.textContent = "Войти";

        }

    });

});