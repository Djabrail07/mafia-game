window.encodeAvatarFile = async (file) => {
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = new Image();
        const imageLoaded = new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error("Не удалось прочитать изображение."));
        });
        image.src = objectUrl;
        await imageLoaded;

        let scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));

        for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

            const context = canvas.getContext("2d");
            if (!context) throw new Error("Браузер не смог обработать изображение.");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            for (let quality = 0.82; quality >= 0.5; quality -= 0.08) {
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                if (dataUrl.length <= 260000) return dataUrl;
            }

            scale *= 0.75;
        }

        throw new Error("Не удалось сжать изображение до допустимого размера.");
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
};

window.createAvatarElement = (source, fallback, className) => {
    const frame = document.createElement("div");
    frame.className = className;

    const initial = document.createElement("span");
    initial.className = "avatar-fallback";
    initial.textContent = String(fallback || "?").charAt(0).toUpperCase();
    frame.appendChild(initial);

    let validSource = typeof source === "string" && source.length <= 300000;
    if (validSource && source.startsWith("data:image/")) {
        validSource = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)
            && source.split(",")[1].length % 4 === 0;
    } else if (validSource) {
        try {
            validSource = ["https:", "http:"].includes(new URL(source).protocol);
        } catch (error) {
            validSource = false;
        }
    }

    if (validSource) {
        const image = document.createElement("img");
        image.className = "avatar-source";
        image.alt = "";
        image.addEventListener("load", () => {
            initial.hidden = true;
        }, { once: true });
        image.addEventListener("error", () => {
            image.remove();
        }, { once: true });
        image.src = source;
        frame.appendChild(image);
    }

    return frame;
};
