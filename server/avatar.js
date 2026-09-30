function sanitizeAvatar(value) {
    if (typeof value !== "string") {
        return null;
    }

    const avatar = value.trim();
    if (!avatar) {
        return null;
    }

    const dataImageMatch = avatar.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/);
    if (dataImageMatch) {
        const payload = dataImageMatch[2];
        if (avatar.length > 300000 || payload.length === 0 || payload.length % 4 !== 0) {
            return null;
        }

        try {
            if (Buffer.from(payload, "base64").toString("base64") !== payload) {
                return null;
            }
        } catch (error) {
            return null;
        }

        return avatar;
    }

    if (avatar.length <= 500) {
        try {
            const parsed = new URL(avatar);
            if (["http:", "https:"].includes(parsed.protocol)) {
                return parsed.href;
            }
        } catch (error) {
            return null;
        }
    }

    return null;
}

module.exports = { sanitizeAvatar };