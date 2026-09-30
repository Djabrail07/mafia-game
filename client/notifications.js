(function () {
    const styles = `
        .game-toast-container {
            position: fixed;
            right: 18px;
            bottom: 18px;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 10px;
            pointer-events: none;
        }

        .game-toast {
            position: relative;
            width: min(360px, calc(100vw - 32px));
            padding: 14px 16px;
            border-radius: 12px;
            background: rgba(22, 22, 22, 0.96);
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
            color: #fff;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            transform: translateY(12px);
            opacity: 0;
            transition: 0.25s ease;
            pointer-events: auto;
        }

        .game-toast.visible {
            transform: translateY(0);
            opacity: 1;
        }

        .game-toast:nth-child(n + 2) {
            margin-top: -10px;
            opacity: 0.9;
            box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
        }

        .game-toast:nth-child(n + 3) {
            opacity: 0.8;
            box-shadow: 0 5px 12px rgba(0, 0, 0, 0.1);
        }

        .game-toast--success {
            border-color: rgba(76, 175, 80, 0.7);
            background: rgba(16, 39, 21, 0.96);
        }

        .game-toast--error {
            border-color: rgba(244, 67, 54, 0.7);
            background: rgba(44, 14, 14, 0.96);
        }

        .game-toast--info {
            border-color: rgba(255, 255, 255, 0.14);
        }

        .game-toast__icon {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 800;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.08);
        }

        .game-toast--success .game-toast__icon {
            color: #8ef0a3;
        }

        .game-toast--error .game-toast__icon {
            color: #ff8585;
        }

        .game-toast--info .game-toast__icon {
            color: #dfe7ff;
        }

        .game-toast__text {
            flex: 1;
            font-size: 14px;
            line-height: 1.45;
            color: #f5f5f5;
            white-space: pre-line;
        }

        .game-toast__count {
            position: absolute;
            top: -8px;
            right: -8px;
            min-width: 24px;
            height: 24px;
            padding: 0 7px;
            border-radius: 999px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.9);
            color: #111;
            font-size: 12px;
            font-weight: 800;
            border: 2px solid rgba(17, 17, 17, 0.9);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
        }

        .game-confirm {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            padding: 20px;
        }

        .game-confirm__card {
            width: min(520px, calc(100vw - 32px));
            background: rgba(245, 245, 245, 0.96);
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
            padding: 22px 22px 18px;
            color: #111;
        }

        .game-confirm__title {
            font-size: clamp(20px, 2vw, 26px);
            font-weight: 700;
            margin-bottom: 12px;
            color: #111;
            text-align: center;
        }

        .game-confirm__message {
            color: #222;
            line-height: 1.5;
            margin-bottom: 18px;
            white-space: pre-line;
            text-align: center;
            font-size: 16px;
        }

        .game-confirm__actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        .game-confirm__button {
            border: 1px solid rgba(0, 0, 0, 0.14);
            border-radius: 12px;
            padding: 12px 16px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: 0.2s ease;
        }

        .game-confirm__button--cancel {
            background: #e9e9e9;
            color: #111;
        }

        .game-confirm__button--confirm {
            background: #111;
            color: #fff;
            border-color: #111;
        }

        .game-confirm__button:hover {
            opacity: 0.92;
        }
    `;

    const styleTag = document.createElement('style');
    styleTag.textContent = styles;
    document.head.appendChild(styleTag);

    function ensureContainer() {
        let container = document.getElementById('game-toast-container');

        if (!container) {
            container = document.createElement('div');
            container.id = 'game-toast-container';
            container.className = 'game-toast-container';
            document.body.appendChild(container);
        }

        return container;
    }

    function showToast(message, type = 'info', duration = 3000) {
        const text = String(message || '');

        if (!text) {
            return;
        }

        const container = ensureContainer();
        const existing = Array.from(container.querySelectorAll('.game-toast'));

        if (existing.length >= 3) {
            const oldest = existing[0];
            oldest.remove();
        }

        const toast = document.createElement('div');
        toast.className = `game-toast game-toast--${type}`;

        const icon = document.createElement('div');
        icon.className = 'game-toast__icon';
        icon.textContent = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';

        const content = document.createElement('div');
        content.className = 'game-toast__text';
        content.textContent = text;

        const count = document.createElement('div');
        count.className = 'game-toast__count';
        count.textContent = String(Math.min(3, (container.querySelectorAll('.game-toast').length || 0) + 1));

        toast.appendChild(icon);
        toast.appendChild(content);
        toast.appendChild(count);
        container.appendChild(toast);

        const visibleToasts = Array.from(container.querySelectorAll('.game-toast'));
        visibleToasts.forEach((item, index) => {
            const countBadge = item.querySelector('.game-toast__count');
            if (countBadge) {
                countBadge.textContent = String(index + 1);
            }
        });

        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => {
                toast.remove();
                const leftovers = Array.from(container.querySelectorAll('.game-toast'));
                leftovers.forEach((item, i) => {
                    const countBadge = item.querySelector('.game-toast__count');
                    if (countBadge) {
                        countBadge.textContent = String(i + 1);
                    }
                });
            }, 220);
        }, duration);
    }

    function showConfirm(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'game-confirm';

            const card = document.createElement('div');
            card.className = 'game-confirm__card';

            const title = document.createElement('div');
            title.className = 'game-confirm__title';
            title.textContent = 'Подтверждение';

            const text = document.createElement('div');
            text.className = 'game-confirm__message';
            text.textContent = String(message || '');

            const actions = document.createElement('div');
            actions.className = 'game-confirm__actions';

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'game-confirm__button game-confirm__button--cancel';
            cancel.textContent = 'Отмена';
            cancel.addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });

            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.className = 'game-confirm__button game-confirm__button--confirm';
            confirm.textContent = 'Да';
            confirm.addEventListener('click', () => {
                overlay.remove();
                resolve(true);
            });

            actions.appendChild(cancel);
            actions.appendChild(confirm);
            card.appendChild(title);
            card.appendChild(text);
            card.appendChild(actions);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
        });
    }

    window.gameToast = showToast;
    window.gameConfirm = showConfirm;

    const originalAlert = window.alert;
    window.alert = function (message) {
        if (typeof message === 'string' || typeof message === 'number') {
            showToast(message, 'info');
            return;
        }

        if (originalAlert) {
            originalAlert.call(window, message);
        }
    };
})();
