document.addEventListener('DOMContentLoaded', async () => {
  const content = document.getElementById('profileContent');
  const avatarInput = document.getElementById('avatarInput');

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Ошибка запроса');
    }
    return data;
  }

  const renderProfile = async () => {
    try {
      const [meResponse, profileResponse, achievementsResponse, notificationsResponse, seasonHistoryResponse] = await Promise.all([
        fetchJson('/api/me'),
        fetchJson('/api/profile'),
        fetchJson('/api/achievements'),
        fetchJson('/api/notifications'),
        fetchJson('/api/season-history')
      ]);

      const user = meResponse.user;
      const profile = profileResponse.profile || {};
      const achievements = achievementsResponse.achievements || [];
      const notifications = notificationsResponse.notifications || [];
      const seasons = seasonHistoryResponse.history || [];

      content.innerHTML = `
        <div class="profile-header-card">
          <div class="profile-avatar-wrap">
            <span class="avatar-fallback">${(user.nickname || '?').charAt(0).toUpperCase()}</span>
            ${user.avatar ? `<img src="${user.avatar}" alt="avatar" class="profile-avatar" />` : ''}
          </div>
          <div class="profile-summary">
            <h2>${user.nickname}</h2>
            <div class="badge-row">
              <span class="mini-badge">${profile.currentLeague || 'Бронза'} ${profile.currentDivision || '1'}</span>
              <span class="mini-badge">MMR ${profile.rating ?? 0}</span>
            </div>
            <p>Уровень ${profile.accountLevel || 1} • Побед ${profile.totalWins || 0} • Поражений ${profile.totalLosses || 0}</p>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <span>ММР</span>
            <strong>${profile.rating ?? 0}</strong>
          </div>
          <div class="stat-card">
            <span>Матчи</span>
            <strong>${profile.totalMatches || 0}</strong>
          </div>
          <div class="stat-card">
            <span>Достижения</span>
            <strong>${profile.achievementCount || 0}</strong>
          </div>
          <div class="stat-card">
            <span>Сезон</span>
            <strong>${profile.seasonProgress ? profile.seasonProgress.league : (profile.currentLeague || 'Бронза')}</strong>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-card">
            <h3>Достижения</h3>
            ${achievements.length ? achievements.map(item => `
              <div class="list-item ${item.unlocked ? 'is-unlocked' : ''}">
                <span>${item.name}</span>
                <small>${item.unlocked ? 'Получено' : 'Закрыто'}</small>
              </div>
            `).join('') : '<p>Нет достижений.</p>'}
          </div>

          <div class="info-card">
            <h3>Уведомления</h3>
            ${notifications.length ? notifications.map(note => `
              <div class="list-item">
                <span>${note.title}</span>
                <small>${new Date(note.created_at).toLocaleDateString()}</small>
              </div>
            `).join('') : '<p>Уведомлений нет.</p>'}
          </div>
        </div>

        <div class="info-card full-width">
          <h3>История сезонов</h3>
          ${seasons.length ? seasons.map(item => `
            <div class="list-item">
              <span>${item.season_name || 'Season'}</span>
              <small>${item.league || 'Бронза'} ${item.division || '1'} • ${item.total_points || 0} pts</small>
            </div>
          `).join('') : '<p>Сезоны ещё не начались.</p>'}
        </div>
      `;

      const profileAvatar = content.querySelector('.profile-avatar');
      if (profileAvatar) {
        const fallback = profileAvatar.previousElementSibling;
        profileAvatar.addEventListener('load', () => {
          if (fallback) fallback.hidden = true;
        }, { once: true });
        profileAvatar.addEventListener('error', () => profileAvatar.remove(), { once: true });
      }
    } catch (error) {
      content.innerHTML = `<div class="error-state">${error.message}</div>`;
      window.gameToast && window.gameToast(error.message, 'error');
    }
  };

  if (avatarInput) {
    avatarInput.addEventListener('change', async () => {
      const file = avatarInput.files[0];
      if (!file) return;

      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowed.includes(file.type)) {
        window.gameToast && window.gameToast('Можно загружать PNG, JPG или WEBP.', 'error');
        avatarInput.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        window.gameToast && window.gameToast('Размер аватара не должен превышать 5 МБ.', 'error');
        avatarInput.value = '';
        return;
      }

      try {
        const avatar = await window.encodeAvatarFile(file);
        const payload = await fetchJson('/api/me/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar })
        });

        avatarInput.value = '';
        window.gameToast && window.gameToast('Аватар обновлён.', 'success');
        if (payload.avatar) {
          const avatarImg = document.querySelector('.profile-avatar');
          if (avatarImg) avatarImg.src = payload.avatar;
        }
        await renderProfile();
      } catch (error) {
        window.gameToast && window.gameToast(error.message || 'Не удалось обновить аватар.', 'error');
      }
    });
  }

  await renderProfile();
});
