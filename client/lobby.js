document.addEventListener("DOMContentLoaded", async () => {

    let roomPollTimer = null;

    const roomCodeElement = document.getElementById("roomCode");
    const roomNameElement = document.getElementById("roomName");
    const playersCountElement = document.getElementById("playersCount");
    const playersListElement = document.getElementById("playersList");
    const gameStartedNotice = document.getElementById("gameStartedNotice");

    const readyButton = document.getElementById("readyButton");
    const startGameButton = document.getElementById("startGameButton");
    const restartRoomButton = document.getElementById("restartRoomButton");
    const leaveRoomButton = document.getElementById("leaveRoomButton");


    const params = new URLSearchParams(window.location.search);

    let roomCode = params.get("code");
    if (!roomCode) {
        roomCode = sessionStorage.getItem("currentRoomCode");
    }

    if (roomCode) {
        sessionStorage.setItem("currentRoomCode", roomCode);
    }


    if (!roomCode) {
        window.gameToast && window.gameToast("Код комнаты не указан.", "error");
        return;
    }


    const isFinishedRoom = (roomData) => {
        const normalizedStatus = roomData?.status;
        const gameState = roomData?.gameState;
        return normalizedStatus === "finished" || (gameState && (gameState.phase === "finished" || (gameState.winner && gameState.winner !== "ongoing")));
    };

    async function loadRoom() {

        try {

            if (!roomCode) {
                window.gameToast && window.gameToast("Код комнаты не найден.", "error");
                window.location.href = "/main.html";
                return;
            }

            const response = await fetch(
                `/api/rooms/${encodeURIComponent(roomCode)}`
            );

            const data = await response.json();


            if (!response.ok) {

                window.gameToast && window.gameToast(data.message || "Не удалось загрузить комнату.", "error");

                window.location.href = "/main.html";

                return;
            }

            const roomStatus = data.room.status;
            const isGameStarted = roomStatus === "playing";
            const isGameFinished = isFinishedRoom(data.room);

            roomCodeElement.textContent = data.room.code;
            roomNameElement.textContent = data.room.name;
            playersCountElement.textContent =
                `${data.players.length} / ${data.room.maxPlayers}`;

            if (isGameFinished) {
                gameStartedNotice.classList.remove("hidden");
                sessionStorage.removeItem("mafiaGameState");
                gameStartedNotice.innerHTML = `
                    <div class="game-started-title">Игра завершена</div>
                    <div class="game-started-text">${data.room.ownerId === data.currentUserId ? "Можно начать новый матч в этой комнате." : "Ожидайте, пока владелец запустит следующий матч."}</div>
                `;
                playersListElement.innerHTML = "";
                readyButton.style.display = "none";
                startGameButton.style.display = "none";
                restartRoomButton.style.display = data.room.ownerId === data.currentUserId ? "block" : "none";
                leaveRoomButton.disabled = false;
                return;
            }

            if (isGameStarted) {
                const currentPlayer = data.players.find(
                    player => player.id === data.currentUserId
                );

                if (currentPlayer) {
                    sessionStorage.setItem("mafiaGameState", JSON.stringify({
                        roomCode: data.room.code,
                        role: currentPlayer.role || "citizen",
                        currentUserId: data.currentUserId,
                        game: data.room.gameState || null,
                        phase: data.room.gameState?.phase || "roleReveal",
                        timeLeft: data.room.gameState?.timeLeft || 5,
                        selectedTargetId: null,
                        startedAt: Date.now()
                    }));
                }

                if (roomPollTimer) {
                    clearInterval(roomPollTimer);
                    roomPollTimer = null;
                }

                gameStartedNotice.classList.remove("hidden");
                playersListElement.innerHTML = "";
                playersListElement.textContent = "Игра уже началась. Переход в игру...";
                readyButton.style.display = "none";
                startGameButton.style.display = "none";
                restartRoomButton.style.display = "none";
                leaveRoomButton.disabled = true;

                setTimeout(() => {
                    window.location.href = `/game.html?code=${encodeURIComponent(roomCode)}`;
                }, 800);

                return;
            }

            gameStartedNotice.classList.add("hidden");
            restartRoomButton.style.display = "none";
            leaveRoomButton.disabled = false;
            playersListElement.innerHTML = "";


            data.players.forEach(player => {

                const playerElement = document.createElement("div");

                playerElement.className = "player-row";


                const avatar = window.createAvatarElement(player.avatar, player.nickname, "player-avatar");


                const info = document.createElement("div");

                info.className = "player-info";


                const nickname = document.createElement("div");

                nickname.className = "player-nickname";

                nickname.textContent = player.nickname;


                const status = document.createElement("div");

                status.className = "player-status";


                if (player.id === data.room.ownerId) {

                    status.textContent = "👑 Владелец";

                } else if (player.is_ready) {

                    status.textContent = "● Готов";

                } else {

                    status.textContent = "○ Ожидание...";

                }


                info.appendChild(nickname);
                info.appendChild(status);


                playerElement.appendChild(avatar);
                playerElement.appendChild(info);


                playersListElement.appendChild(playerElement);

            });


            const currentPlayer =
                data.players.find(
                    player => player.id === data.currentUserId
                );


            if (currentPlayer) {

                readyButton.textContent =
                    currentPlayer.is_ready
                        ? "Не готов"
                        : "Готов";

            }


            if (data.room.ownerId === data.currentUserId) {
                readyButton.style.display = "none";
                readyButton.disabled = true;
                startGameButton.style.display = "block";
            } else {
                readyButton.style.display = "inline-block";
                readyButton.disabled = false;
                startGameButton.style.display = "none";
            }

        } catch (error) {

            console.error("Ошибка загрузки лобби:", error);

        }

    }


    readyButton.addEventListener("click", async () => {

        try {

            if (!roomCode) {
                window.gameToast && window.gameToast("Код комнаты не найден.", "error");
                return;
            }

            const response = await fetch("/api/rooms/ready", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    roomCode
                })
            });


            const data = await response.json();


            if (!response.ok) {

                window.gameToast && window.gameToast(data.message || "Не удалось изменить готовность.", "error");

                return;
            }


            await loadRoom();

        } catch (error) {

            console.error(error);

            window.gameToast && window.gameToast("Ошибка соединения с сервером.", "error");

        }

    });


    leaveRoomButton.addEventListener("click", async () => {

        const confirmed = await window.gameConfirm?.(
            "Вы действительно хотите выйти из комнаты?"
        );

        if (!confirmed) {
            return;
        }


        try {

            const response = await fetch("/api/rooms/leave", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    roomCode
                })
            });


            const data = await response.json();


            if (!response.ok) {

                window.gameToast && window.gameToast(data.message || "Не удалось выйти из комнаты.", "error");

                return;
            }


            window.location.href = "/main.html";

        } catch (error) {

            console.error(error);

            window.gameToast && window.gameToast("Ошибка соединения с сервером.", "error");

        }

    });


    startGameButton.addEventListener("click", async () => {

        try {

            if (!roomCode) {
                window.gameToast && window.gameToast("Код комнаты не найден.", "error");
                return;
            }

            startGameButton.disabled = true;
            startGameButton.textContent = "Запуск...";

            const response = await fetch("/api/rooms/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ roomCode })
            });

            const data = await response.json();

            if (!response.ok) {
                window.gameToast && window.gameToast(data.message || "Не удалось запустить игру.", "error");
                return;
            }

            const gameRole = data.role || "citizen";
            const gamePayload = {
                roomCode,
                role: gameRole,
                currentUserId: data.currentUserId || null,
                game: data.game || null,
                startedAt: Date.now()
            };

            sessionStorage.setItem("mafiaGameState", JSON.stringify(gamePayload));

            window.gameToast && window.gameToast(`Игра началась!\nРоль: ${gameRole}`, "success");
            window.location.href = `/game.html?code=${encodeURIComponent(roomCode)}`;

        } catch (error) {
            console.error("Ошибка запуска игры:", error);
            window.gameToast && window.gameToast("Не удалось подключиться к серверу.", "error");
        } finally {
            startGameButton.disabled = false;
            startGameButton.textContent = "Начать игру";
        }

    });

    restartRoomButton.addEventListener("click", async () => {
        restartRoomButton.disabled = true;
        try {
            const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/restart`, {
                method: "POST"
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                window.gameToast && window.gameToast(data.message || "Не удалось подготовить новый матч.", "error");
                return;
            }

            window.gameToast && window.gameToast("Лобби готово к новой игре.", "success");
            await loadRoom();
        } catch (error) {
            window.gameToast && window.gameToast("Не удалось связаться с сервером.", "error");
        } finally {
            restartRoomButton.disabled = false;
        }
    });


    await loadRoom();


    roomPollTimer = setInterval(loadRoom, 1000);

});