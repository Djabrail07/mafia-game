document.addEventListener("DOMContentLoaded", () => {

    console.log("APP.JS ЗАГРУЖЕН");

    // ========================================
    // ЭЛЕМЕНТЫ
    // ========================================

    const accountStep = document.getElementById("accountStep");
    const profileStep = document.getElementById("profileStep");

    const step1 = document.getElementById("step1");
    const step2 = document.getElementById("step2");

    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");

    const nicknameInput = document.getElementById("nickname");

    const avatarInput = document.getElementById("avatarInput");
    const avatarPreview = document.getElementById("avatarPreview");

    const nextButton = document.getElementById("nextButton");
    const backButton = document.getElementById("backButton");
    const createButton = document.getElementById("createButton");


    // ========================================
    // ПРОВЕРКА ЭЛЕМЕНТОВ
    // ========================================

    console.log("accountStep:", accountStep);
    console.log("profileStep:", profileStep);
    console.log("nextButton:", nextButton);
    console.log("backButton:", backButton);
    console.log("createButton:", createButton);


    // Если какого-то элемента нет — останавливаем JS
    if (
        !accountStep ||
        !profileStep ||
        !step1 ||
        !step2 ||
        !emailInput ||
        !passwordInput ||
        !confirmPasswordInput ||
        !nicknameInput ||
        !avatarInput ||
        !avatarPreview ||
        !nextButton ||
        !backButton ||
        !createButton
    ) {
        console.error("ОШИБКА: один или несколько элементов HTML не найдены.");
        return;
    }


    // ========================================
    // ДАННЫЕ РЕГИСТРАЦИИ
    // ========================================

    const registrationData = {
        email: "",
        password: "",
        nickname: "",
        avatar: null
    };


    // ========================================
    // ШАГ 1 → ШАГ 2
    // ========================================

    nextButton.addEventListener("click", () => {

        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;


        // Email
        if (!email) {
            window.gameToast && window.gameToast("Введите email.", "error");
            return;
        }

        if (!email.includes("@")) {
            window.gameToast && window.gameToast("Введите корректный email.", "error");
            return;
        }


        // Пароль
        if (!password) {
            window.gameToast && window.gameToast("Введите пароль.", "error");
            return;
        }

        if (password.length < 6) {
            window.gameToast && window.gameToast("Пароль должен содержать минимум 6 символов.", "error");
            return;
        }


        // Повтор пароля
        if (!confirmPassword) {
            window.gameToast && window.gameToast("Повторите пароль.", "error");
            return;
        }

        if (password !== confirmPassword) {
            window.gameToast && window.gameToast("Пароли не совпадают.", "error");
            return;
        }


        // Сохраняем данные
        registrationData.email = email;
        registrationData.password = password;


        // Переходим на второй шаг
        accountStep.classList.add("hidden");
        profileStep.classList.remove("hidden");

        step1.classList.remove("active");
        step2.classList.add("active");

    });


    // ========================================
    // ШАГ 2 → ШАГ 1
    // ========================================

    backButton.addEventListener("click", () => {

        profileStep.classList.add("hidden");
        accountStep.classList.remove("hidden");

        step2.classList.remove("active");
        step1.classList.add("active");

    });


    // ========================================
    // ВЫБОР АВАТАРА
    // ========================================

    avatarInput.addEventListener("change", async () => {

        const file = avatarInput.files[0];

        if (!file) {
            return;
        }


        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];


        if (!allowedTypes.includes(file.type)) {

            window.gameToast && window.gameToast("Можно использовать только PNG, JPG или WEBP.", "error");

            avatarInput.value = "";

            return;
        }


        // Максимум 5 МБ
        if (file.size > 5 * 1024 * 1024) {

            window.gameToast && window.gameToast("Размер аватара не должен превышать 5 МБ.", "error");

            avatarInput.value = "";

            return;
        }


        try {
            registrationData.avatar = await window.encodeAvatarFile(file);
            avatarPreview.src = registrationData.avatar;
        } catch (error) {
            window.gameToast && window.gameToast(error.message || "Не удалось обработать аватар.", "error");
            avatarInput.value = "";
        }

    });


    // ========================================
    // СОЗДАНИЕ АККАУНТА
    // ========================================

    createButton.addEventListener("click", async () => {

        const nickname = nicknameInput.value.trim();


        // Проверяем ник
        if (!nickname) {

            window.gameToast && window.gameToast("Введите ник.", "error");

            return;
        }


        if (nickname.length < 3) {

            window.gameToast && window.gameToast("Ник должен содержать минимум 3 символа.", "error");

            return;
        }


        if (nickname.length > 20) {

            window.gameToast && window.gameToast("Ник должен содержать максимум 20 символов.", "error");

            return;
        }


        registrationData.nickname = nickname;


        // Блокируем кнопку
        createButton.disabled = true;
        createButton.textContent = "Создание...";


        try {

                const response = await fetch("/api/register", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    email: registrationData.email,

                    password: registrationData.password,

                    nickname: registrationData.nickname,
                    avatar: registrationData.avatar || null

                })

            });

            const result = await response.json();


            // Ошибка сервера
            if (!response.ok) {

                window.gameToast && window.gameToast(
                    result.message ||
                    "Не удалось создать аккаунт.",
                    "error"
                );

                return;
            }


            // УСПЕХ
            window.gameToast && window.gameToast(
                result.message ||
                "Аккаунт создан!",
                "success"
            );


            console.log(
                "Создан пользователь:",
                result.user
            );


            // Перезагрузка
            window.location.reload();


        } catch (error) {

            console.error(
                "Ошибка запроса:",
                error
            );


            window.gameToast && window.gameToast(
                "Не удалось подключиться к серверу.\nПроверь, запущен ли server.js.",
                "error"
            );


        } finally {

            createButton.disabled = false;

            createButton.textContent =
                "Создать аккаунт";

        }

    });


    console.log("Все обработчики успешно подключены.");

});