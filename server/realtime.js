const roomLocks = new Map();

function normalizeRoomCode(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

async function withRoomLock(roomCode, operation) {
    const normalizedCode = normalizeRoomCode(roomCode);
    if (!normalizedCode) {
        return operation();
    }

    const previous = roomLocks.get(normalizedCode) || Promise.resolve();
    let unlock;
    const current = new Promise((resolve) => {
        unlock = resolve;
    });
    roomLocks.set(normalizedCode, current);

    await previous;
    try {
        return await operation();
    } finally {
        unlock();
        if (roomLocks.get(normalizedCode) === current) {
            roomLocks.delete(normalizedCode);
        }
    }
}

function emitRoomState(io, roomCode, payload = {}) {
    if (!io || !roomCode) {
        return;
    }

    const normalizedCode = normalizeRoomCode(roomCode);
    io.to(normalizedCode).emit("room_state_updated", {
        roomCode: normalizedCode,
        ...payload
    });
}

function emitRoomEvent(io, roomCode, eventName, payload = {}) {
    if (!io || !roomCode) {
        return;
    }

    const normalizedCode = normalizeRoomCode(roomCode);
    io.to(normalizedCode).emit(eventName, {
        roomCode: normalizedCode,
        ...payload
    });
}

module.exports = {
    normalizeRoomCode,
    withRoomLock,
    emitRoomState,
    emitRoomEvent
};
