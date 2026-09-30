document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('leaderboardContent');
  let requestInProgress = false;

  async function loadLeaderboard() {
    if (requestInProgress) return;
    requestInProgress = true;

    try {
      const response = await fetch('/api/leaderboard');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось загрузить рейтинг');

      root.replaceChildren();
      const entries = data.leaderboard || [];
      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Пока нет игроков в рейтинге.';
        root.appendChild(empty);
        return;
      }

      entries.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = `leaderboard-row ${index < 3 ? 'top-rank' : ''}`;

        const rank = document.createElement('div');
        rank.className = 'leaderboard-rank';
        rank.textContent = `#${index + 1}`;

        const user = document.createElement('div');
        user.className = 'leaderboard-user';
        user.appendChild(window.createAvatarElement(player.avatar, player.nickname, 'avatar-mini'));

        const details = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = player.nickname || 'Игрок';
        const league = document.createElement('small');
        league.textContent = `${player.league || 'Бронза'} ${player.division || '1'}`;
        details.append(name, league);
        user.appendChild(details);

        const score = document.createElement('div');
        score.className = 'leaderboard-score';
        score.textContent = `${player.rating ?? player.rating_end ?? 0} MMR`;

        row.append(rank, user, score);
        root.appendChild(row);
      });
    } catch (error) {
      root.textContent = '';
      const message = document.createElement('div');
      message.className = 'error-state';
      message.textContent = error.message;
      root.appendChild(message);
      window.gameToast && window.gameToast(error.message, 'error');
    } finally {
      requestInProgress = false;
    }
  }

  await loadLeaderboard();
  window.setInterval(loadLeaderboard, 10000);
});
