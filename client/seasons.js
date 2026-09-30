document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('seasonContent');

  try {
    const response = await fetch('/api/seasons');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Не удалось загрузить сезоны');

    const season = data.season || {};
    const leaderboard = data.leaderboard || [];
    root.replaceChildren();

    const seasonCard = document.createElement('div');
    seasonCard.className = 'season-card';
    const seasonDetails = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = season.name || 'Сезон 1';
    const status = document.createElement('p');
    status.textContent = `Статус: ${season.status || 'active'}`;
    seasonDetails.append(title, status);
    seasonCard.appendChild(seasonDetails);

    const roster = document.createElement('div');
    roster.className = 'info-card full-width season-roster';
    const rosterTitle = document.createElement('h3');
    rosterTitle.textContent = 'Таблица сезона';
    roster.appendChild(rosterTitle);

    if (!leaderboard.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Пока нет данных сезона.';
      roster.appendChild(empty);
    } else {
      leaderboard.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = 'season-player-row';
        const rank = document.createElement('span');
        rank.className = 'season-player-rank';
        rank.textContent = `#${index + 1}`;
        row.append(rank, window.createAvatarElement(player.avatar, player.nickname, 'season-player-avatar'));

        const details = document.createElement('div');
        details.className = 'season-player-details';
        const name = document.createElement('strong');
        name.textContent = player.nickname || 'Игрок';
        const rating = document.createElement('small');
        rating.textContent = `${player.league || 'Бронза'} ${player.division || '1'} · ${player.rating ?? player.rating_end ?? 0} MMR`;
        details.append(name, rating);
        row.appendChild(details);
        roster.appendChild(row);
      });
    }

    root.append(seasonCard, roster);
  } catch (error) {
    root.textContent = '';
    const message = document.createElement('div');
    message.className = 'error-state';
    message.textContent = error.message;
    root.appendChild(message);
    window.gameToast && window.gameToast(error.message, 'error');
  }
});
