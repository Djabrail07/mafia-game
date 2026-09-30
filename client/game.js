document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get("code");

    const roomCodeEl = document.getElementById("gameRoomCode");
    const winnerResultEl = document.getElementById("winnerResult");
    const finishModalEl = document.getElementById("finishModal");
    const finishModalTitleEl = document.getElementById("finishModalTitle");
    const finishModalTeamEl = document.getElementById("finishModalTeam");
    const finishModalPlayersEl = document.getElementById("finishModalPlayers");
    const finishModalTotalEl = document.getElementById("finishModalTotal");
    const finishModalCountdownEl = document.getElementById("finishModalCountdown");
    const finishModalReturnButton = document.getElementById("finishModalReturnButton");
    const phaseBadgeEl = document.getElementById("gamePhaseBadge");
    const playerRoleEl = document.getElementById("playerRole");
    const playerRoleInline = document.getElementById("playerRoleInline");
    const roleHintEl = document.getElementById("roleHint");
    const roleHintInline = document.getElementById("roleHintInline");
    const timerEl = document.getElementById("gameTimer");
    const timerTextEl = document.getElementById("gameTimerText");
    const actionListEl = document.getElementById("actionList");
    const gamePlayersListEl = document.getElementById("gamePlayersList");
    const roleRevealEl = document.getElementById("roleReveal");
    const chatMessagesEl = document.getElementById("chatMessages");
    const chatInputEl = document.getElementById("chatInput");
    const chatSendButton = document.getElementById("chatSendButton");
    const backToLobbyButton = document.getElementById("backToLobbyButton");

    const socket = io();

    const phaseConfig = {
        roleReveal: { label: "Роль", text: "Ваша роль раскрывается..." },
        night: { label: "Ночь", text: "Мафия, доктор, комиссар и дон совершают ночные действия." },
        day: { label: "День", text: "Обсуждение и общение между игроками." },
        vote: { label: "Голосование", text: "Каждый выбирает одного игрока для голосования." },
        finished: { label: "Конец", text: "Игра завершена." }
    };

    const roleLabels = {
        mafia: "Мафия",
        don: "Дон",
        commissar: "Комиссар",
        doctor: "Доктор",
        citizen: "Мирный"
    };

    const roleHints = {
        mafia: "Выбирайте цель ночью, чтобы устранить гражданского.",
        don: "Выбирайте игрока для проверки — он мафия или не мафия?",
        commissar: "Ночью выбирайте одного игрока и выясните, мафия он или нет.",
        doctor: "Выбирайте игрока, которого нужно спасти от нападения.",
        citizen: "Ночью вы отдыхаете, днём голосуете и обсуждаете."
    };

    let currentUserId = Number(sessionStorage.getItem("currentUserId") || 0);
    let currentRole = "citizen";
    let selectedTargetId = null;
    let serverSnapshot = null;
    let finishCountdownTimer = null;
    let finishRedirectAt = null;
    let finishFlowLocked = false;
    let gamePollTimer = null;
    let gameFetchInProgress = false;

    const isTerminalGameState = (snapshot) => {
        const phase = snapshot?.gameState?.phase || snapshot?.phase;
        const winner = snapshot?.gameState?.winner || snapshot?.winner;
        const roomStatus = snapshot?.room?.status || snapshot?.status;
        return phase === "finished" || roomStatus === "finished" || (winner && winner !== "ongoing");
    };

    const getPhaseLabel = (phase) => phaseConfig[phase]?.label || "Ночь";
    const getPhaseText = (phase) => phaseConfig[phase]?.text || "Игра";

    const formatTimer = (phaseEndsAt, phaseName) => {
        if (!phaseEndsAt || phaseName === "finished") {
            return "00:00";
        }

        const diffSeconds = Math.max(0, Math.ceil((Number(phaseEndsAt) - Date.now()) / 1000));
        const minutes = String(Math.floor(diffSeconds / 60)).padStart(2, "0");
        const seconds = String(diffSeconds % 60).padStart(2, "0");
        return `${minutes}:${seconds}`;
    };

    const redirectToLobby = () => {
        const targetLobby = roomCode || serverSnapshot?.room?.code || "";
        if (targetLobby) {
            window.location.replace(`/lobby.html?code=${encodeURIComponent(targetLobby)}`);
            return;
        }
        window.location.replace("/main.html");
    };

    const renderFinishModal = () => {
        const winner = serverSnapshot?.gameState?.winner;
        const mmrResults = serverSnapshot?.gameState?.mmrResults || [];
        finishModalTitleEl.textContent = winner === "city" ? "Победа города!" : "Победа мафии!";
        finishModalTeamEl.textContent = winner === "city" ? "Победила мирная сторона" : "Победила мафия";
        finishModalPlayersEl.replaceChildren();

        mmrResults.forEach((player) => {
            const item = document.createElement("li");
            item.className = "finish-modal__player";

            const name = document.createElement("span");
            name.textContent = player.nickname || "Игрок";

            const rating = document.createElement("span");
            rating.className = "finish-modal__player-role";
            const delta = Number(player.delta) || 0;
            const finalRating = Number(player.ratingAfter) || 0;
            rating.textContent = `${delta > 0 ? "+" : ""}${delta} MMR · итого ${finalRating}`;

            item.append(name, rating);
            finishModalPlayersEl.appendChild(item);
        });

        if (!mmrResults.length) {
            const emptyItem = document.createElement("li");
            emptyItem.className = "finish-modal__player";
            emptyItem.textContent = "Результаты рейтинга недоступны.";
            finishModalPlayersEl.appendChild(emptyItem);
        }

        const totalDelta = Number(serverSnapshot?.gameState?.mmrTotalDelta)
            || mmrResults.reduce((total, player) => total + (Number(player.delta) || 0), 0);
        finishModalTotalEl.textContent = `Суммарное изменение MMR: ${totalDelta > 0 ? "+" : ""}${totalDelta}`;
    };

    const renderWinnerBanner = () => {
        const winner = serverSnapshot?.gameState?.winner;
        if (winner && winner !== "ongoing") {
            winnerResultEl.textContent = winner === "city" ? "Победа города!" : "Победа мафии!";
            winnerResultEl.classList.remove("hidden");
        } else {
            winnerResultEl.textContent = "";
            winnerResultEl.classList.add("hidden");
        }
    };

    const renderChat = () => {
        const items = serverSnapshot?.gameState?.log || [];
        chatMessagesEl.innerHTML = "";

        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "chat-message";
            empty.innerHTML = "<strong>Система</strong>: чат открыт. Обсуждайте события и подозрения.";
            chatMessagesEl.appendChild(empty);
            return;
        }

        items.forEach((item) => {
            const node = document.createElement("div");
            node.className = "chat-message";
            node.innerHTML = `<strong>${item.author}</strong>: ${item.text}`;
            chatMessagesEl.appendChild(node);
        });

        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    };

    const appendCommissarResult = () => {
        const result = serverSnapshot?.gameState?.lastNightResult;
        if (!result?.commissarTarget || !result.commissarAction) return;

        const target = serverSnapshot.gameState.players.find((player) => Number(player.id) === Number(result.commissarTarget));
        const targetName = target?.nickname || "Игрок";
        const message = result.commissarAction === "check"
            ? `Проверка игрока ${targetName}: ${result.commissarCheck === "mafia" ? "мафия" : "не мафия"}.`
            : `Игрок ${targetName} посажен и выбыл из игры.`;
        const item = document.createElement("div");
        item.className = "action-item muted";
        item.textContent = message;
        actionListEl.appendChild(item);
    };

    const appendHostPenaltyAction = () => {
        if (Number(serverSnapshot?.room?.ownerId) !== Number(currentUserId)) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "menu-button secondary";
        button.textContent = "Зафиксировать нарушение правил";
        button.disabled = !selectedTargetId || Number(selectedTargetId) === Number(currentUserId);
        button.addEventListener("click", () => submitRuleViolation(selectedTargetId));
        actionListEl.appendChild(button);
    };

    const renderActionList = () => {
        const phase = serverSnapshot?.gameState?.phase || "roleReveal";
        const myRole = currentRole || "citizen";
        const myPlayer = (serverSnapshot?.gameState?.players || []).find((player) => Number(player.id) === Number(currentUserId));
        actionListEl.innerHTML = "";
        appendHostPenaltyAction();

        if (phase === "night") {
            if (!myPlayer || myPlayer.alive === false) {
                const item = document.createElement("div");
                item.className = "action-item muted";
                item.textContent = "Вы выбыли и больше не можете совершать действия.";
                actionListEl.appendChild(item);
                return;
            }

            if (myRole === "mafia") {
                const item = document.createElement("div");
                item.className = "action-item highlight";
                item.textContent = "Выберите цель для ночного убийства.";
                actionListEl.appendChild(item);
            } else if (myRole === "don") {
                const item = document.createElement("div");
                item.className = "action-item highlight";
                item.textContent = "Выберите игрока, чтобы проверить: мафия или не мафия.";
                actionListEl.appendChild(item);
            } else if (myRole === "commissar") {
                const item = document.createElement("div");
                item.className = "action-item highlight";
                item.textContent = "Выберите игрока, затем проверьте или посадите его.";
                actionListEl.appendChild(item);
                appendCommissarResult();
            } else if (myRole === "doctor") {
                const item = document.createElement("div");
                item.className = "action-item highlight";
                item.textContent = "Выберите игрока, которого нужно спасти.";
                actionListEl.appendChild(item);
            } else {
                const item = document.createElement("div");
                item.className = "action-item muted";
                item.textContent = "Ночью вы ничего не делаете.";
                actionListEl.appendChild(item);
            }

            if (myRole === "commissar") {
                [
                    { label: "Проверить", actionType: "check" },
                    { label: "Посадить", actionType: "jail" }
                ].forEach(({ label, actionType }) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "menu-button";
                    button.textContent = label;
                    button.disabled = !selectedTargetId;
                    button.addEventListener("click", () => submitAction(selectedTargetId, actionType));
                    actionListEl.appendChild(button);
                });
                return;
            }

            const button = document.createElement("button");
            button.type = "button";
            button.className = "menu-button";
            button.textContent = "Подтвердить действие";
            button.disabled = myRole === "citizen" || !selectedTargetId;
            button.addEventListener("click", () => submitAction(selectedTargetId));
            actionListEl.appendChild(button);
            return;
        }

        if (phase === "vote") {
            const item = document.createElement("div");
            item.className = myPlayer?.alive === false ? "action-item muted" : "action-item highlight";
            item.textContent = myPlayer?.alive === false
                ? "Вы выбыли и больше не можете голосовать."
                : "Выберите игрока, которого хотите выгнать из игры.";
            actionListEl.appendChild(item);

            if (!myPlayer || myPlayer.alive === false) return;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "menu-button";
            button.textContent = "Подтвердить голос";
            button.disabled = !selectedTargetId;
            button.addEventListener("click", () => submitVote(selectedTargetId));
            actionListEl.appendChild(button);
            return;
        }

        if (phase === "day") {
            const item = document.createElement("div");
            item.className = "action-item muted";
            item.textContent = "День: обсуждение и подготовка к голосованию.";
            actionListEl.appendChild(item);
            if (myRole === "commissar") {
                appendCommissarResult();
            }
            return;
        }

        const endItem = document.createElement("div");
        endItem.className = "action-item muted";
        endItem.textContent = serverSnapshot?.gameState?.winner === "city" ? "Победа города!" : "Победа мафии!";
        actionListEl.appendChild(endItem);
    };

    const renderPlayers = () => {
        const players = Array.isArray(serverSnapshot?.gameState?.players)
            ? serverSnapshot.gameState.players
            : (Array.isArray(serverSnapshot?.players) ? serverSnapshot.players : []);

        if (!Array.isArray(serverSnapshot?.gameState?.players) && Array.isArray(serverSnapshot?.players)) {
            serverSnapshot.gameState = { ...(serverSnapshot.gameState || {}), players: serverSnapshot.players };
        }

        gamePlayersListEl.innerHTML = "";

        if (!players.length) {
            const item = document.createElement("div");
            item.className = "action-item muted";
            item.textContent = "Игроки загружаются...";
            gamePlayersListEl.appendChild(item);
            return;
        }

        players.forEach((player) => {
            const item = document.createElement("div");
            item.className = "player-card" + (Number(player.id) === Number(selectedTargetId) ? " selected" : "");
            item.style.cursor = player.alive !== false && Number(player.id) !== Number(currentUserId) ? "pointer" : "default";

            const left = document.createElement("div");
            left.className = "player-card__left";
            const roomPlayer = serverSnapshot?.players?.find((roomEntry) => Number(roomEntry.id) === Number(player.id));
            const avatar = window.createAvatarElement(roomPlayer?.avatar, player.nickname, "player-card__avatar");
            left.appendChild(avatar);

            const right = document.createElement("div");
            right.className = "player-card__right";

            const name = document.createElement("div");
            name.className = "player-card__name";
            name.textContent = player.nickname || "Игрок";

            const meta = document.createElement("div");
            meta.className = "player-card__meta";
            if (player.alive === false) {
                meta.textContent = "Погиб";
            } else if (Number(player.id) === Number(currentUserId)) {
                meta.textContent = `Ваша роль: ${roleLabels[currentRole] || "Мирный"}`;
            } else {
                meta.textContent = player.role ? "Жив" : "Жив";
            }

            right.appendChild(name);
            right.appendChild(meta);
            item.appendChild(left);
            item.appendChild(right);

            item.addEventListener("click", () => {
                if (player.alive === false || Number(player.id) === Number(currentUserId)) return;
                const isHost = Number(serverSnapshot?.room?.ownerId) === Number(currentUserId);
                if ((serverSnapshot?.gameState?.phase || "") !== "night"
                    && (serverSnapshot?.gameState?.phase || "") !== "vote"
                    && !isHost) return;
                selectedTargetId = Number(player.id);
                renderPlayers();
                renderActionList();
            });

            gamePlayersListEl.appendChild(item);
        });
    };

    const renderState = () => {
        if (!serverSnapshot || !serverSnapshot.gameState) return;

        const gameState = serverSnapshot.gameState;
        const myPlayer = (gameState.players || []).find((player) => Number(player.id) === Number(currentUserId));
        currentRole = String(myPlayer?.role || "citizen").toLowerCase();

        const phaseName = gameState.phase || "night";
        const phase = phaseConfig[phaseName] || phaseConfig.night;

        roomCodeEl.textContent = serverSnapshot.room?.code || roomCode || "---";
        playerRoleEl.textContent = roleLabels[currentRole] || "Мирный";
        playerRoleInline.textContent = roleLabels[currentRole] || "Мирный";
        roleHintEl.textContent = roleHints[currentRole] || roleHints.citizen;
        roleHintInline.textContent = roleHints[currentRole] || roleHints.citizen;
        phaseBadgeEl.textContent = phase.label;
        timerTextEl.textContent = phase.text;
        timerEl.textContent = formatTimer(gameState.phaseEndsAt, phaseName);

        if (isTerminalGameState(serverSnapshot)) {
            const finishTimerSeconds = 30;
            if (!finishFlowLocked) {
                finishFlowLocked = true;
                renderFinishModal();
                finishModalEl.classList.remove("hidden");
                if (finishCountdownTimer) {
                    clearInterval(finishCountdownTimer);
                }
                finishRedirectAt = Date.now() + finishTimerSeconds * 1000;

                const updateFinishCountdown = () => {
                    const secondsRemaining = Math.max(0, Math.ceil((finishRedirectAt - Date.now()) / 1000));
                    timerTextEl.textContent = `Игра завершена. Возврат в лобби через ${secondsRemaining}с...`;
                    timerEl.textContent = formatTimer(finishRedirectAt, "countdown");
                    finishModalCountdownEl.textContent = formatTimer(finishRedirectAt, "countdown");

                    if (secondsRemaining === 0) {
                        clearInterval(finishCountdownTimer);
                        redirectToLobby();
                    }
                };

                updateFinishCountdown();
                finishCountdownTimer = setInterval(updateFinishCountdown, 1000);
            }
            return;
        }

        finishFlowLocked = false;

        roleRevealEl.classList.toggle("hidden", phaseName !== "roleReveal");

        renderWinnerBanner();
        renderChat();
        renderPlayers();
        renderActionList();
    };

    async function fetchGameState() {
        if (!roomCode || finishFlowLocked || gameFetchInProgress) return;

        gameFetchInProgress = true;
        try {
            const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/game`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Не удалось получить состояние игры.");
            }

            currentUserId = Number(data.currentUserId || currentUserId || 0);
            sessionStorage.setItem("currentUserId", String(currentUserId));
            serverSnapshot = data;

            if (!serverSnapshot.gameState && Array.isArray(data.room?.gameState)) {
                serverSnapshot.gameState = data.room.gameState;
            }

            if (!Array.isArray(serverSnapshot.players) && Array.isArray(data.players)) {
                serverSnapshot.players = data.players;
            }

            renderState();
        } catch (error) {
            console.warn("Ошибка синхронизации комнаты:", error.message);
        } finally {
            gameFetchInProgress = false;
        }
    }

    async function submitAction(targetId, actionType = null) {
        if (!roomCode || !targetId) {
            return;
        }

        const phase = serverSnapshot?.gameState?.phase;
        const endpoint = phase === "vote" ? "/vote" : "/action";

        try {
            const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    targetId: Number(targetId),
                    ...(actionType ? { actionType } : {})
                })
            });
            const data = await response.json();

            if (!response.ok || !data.success) {
                if (response.status === 400) {
                    selectedTargetId = null;
                    await fetchGameState();
                }
                window.gameToast && window.gameToast(data.message || "Не удалось выполнить действие.", "error");
                return;
            }

            selectedTargetId = null;
            await fetchGameState();
        } catch (error) {
            console.error("Ошибка отправки действия:", error);
            window.gameToast && window.gameToast("Не удалось выполнить действие.", "error");
        }
    }

    async function submitVote(targetId) {
        await submitAction(targetId);
    }

    async function submitRuleViolation(targetId) {
        if (!roomCode || !targetId) return;
        const confirmed = await window.gameConfirm?.("Зафиксировать нарушение правил для выбранного игрока?");
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/penalty`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: Number(targetId) })
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                window.gameToast && window.gameToast(data.message || "Не удалось зафиксировать нарушение.", "error");
                return;
            }

            selectedTargetId = null;
            window.gameToast && window.gameToast(data.message, "success");
            await fetchGameState();
        } catch (error) {
            window.gameToast && window.gameToast("Не удалось зафиксировать нарушение.", "error");
        }
    }

    chatSendButton.addEventListener("click", () => {
        const value = chatInputEl.value.trim();
        if (!value || !roomCode) return;

        socket.emit("room_chat_message", {
            roomCode,
            text: value,
            userId: currentUserId,
            nickname: sessionStorage.getItem("userNickname") || "Игрок"
        });

        chatInputEl.value = "";
    });

    chatInputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            chatSendButton.click();
        }
    });

    backToLobbyButton.addEventListener("click", async () => {
        const phase = serverSnapshot?.gameState?.phase;
        if (roomCode && phase !== "finished") {
            const confirmed = await window.gameConfirm?.("Выйти из текущего матча? Это будет засчитано как поражение.");
            if (!confirmed) return;

            try {
                const response = await fetch("/api/rooms/leave", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roomCode })
                });
                const data = await response.json();
                if (!response.ok || !data.success) {
                    window.gameToast && window.gameToast(data.message || "Не удалось выйти из матча.", "error");
                    return;
                }
            } catch (error) {
                window.gameToast && window.gameToast("Не удалось связаться с сервером.", "error");
                return;
            }
        }

        window.location.replace("/main.html");
    });

    finishModalReturnButton.addEventListener("click", redirectToLobby);

    socket.emit("join_room", {
        roomCode,
        userId: currentUserId,
        nickname: sessionStorage.getItem("userNickname") || "Игрок"
    });

    socket.on("room_chat_message", ({ author, text }) => {
        if (!serverSnapshot?.gameState) return;
        const log = Array.isArray(serverSnapshot.gameState.log) ? serverSnapshot.gameState.log : [];
        serverSnapshot.gameState.log = [...log, { author, text, time: new Date().toISOString() }].slice(-60);
        renderChat();
    });

    renderState();
    fetchGameState();

    if (gamePollTimer) {
        clearInterval(gamePollTimer);
    }

    gamePollTimer = setInterval(() => {
        if (!finishFlowLocked) {
            fetchGameState();
        }
    }, 1000);

    window.addEventListener("beforeunload", () => {
        if (gamePollTimer) {
            clearInterval(gamePollTimer);
        }
        if (finishCountdownTimer) {
            clearInterval(finishCountdownTimer);
        }
    });
});
