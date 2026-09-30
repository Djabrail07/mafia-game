CREATE DATABASE IF NOT EXISTS mafia_game
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE mafia_game;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(20) NOT NULL UNIQUE,
    avatar LONGTEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    max_players TINYINT UNSIGNED NOT NULL,
    password_hash VARCHAR(255) DEFAULT NULL,
    status ENUM('waiting', 'playing', 'finished') NOT NULL DEFAULT 'waiting',
    owner_id INT UNSIGNED NOT NULL,
    game_state JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_rooms_owner
        FOREIGN KEY (owner_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS room_players (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    role VARCHAR(32) DEFAULT NULL,
    is_ready TINYINT(1) NOT NULL DEFAULT 0,
    is_alive TINYINT(1) NOT NULL DEFAULT 1,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_room_user (room_id, user_id),

    CONSTRAINT fk_room_players_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_room_players_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seasons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    status ENUM('active', 'finalizing', 'completed') NOT NULL DEFAULT 'active',
    start_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_at TIMESTAMP NULL,
    reward_pool JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_key VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    avatar_url LONGTEXT DEFAULT NULL,
    avatar_frame VARCHAR(255) DEFAULT NULL,
    profile_background VARCHAR(255) DEFAULT NULL,
    emblem VARCHAR(255) DEFAULT NULL,
    active_title_id INT UNSIGNED DEFAULT NULL,
    current_league VARCHAR(32) NOT NULL DEFAULT 'Бронза',
    current_division VARCHAR(8) NOT NULL DEFAULT '1',
    rating INT NOT NULL DEFAULT 0,
    hidden_mmr INT NOT NULL DEFAULT 0,
    prestige_points INT NOT NULL DEFAULT 0,
    account_level INT NOT NULL DEFAULT 1,
    total_matches INT NOT NULL DEFAULT 0,
    total_wins INT NOT NULL DEFAULT 0,
    total_losses INT NOT NULL DEFAULT 0,
    favorite_role VARCHAR(32) DEFAULT 'citizen',
    best_division VARCHAR(16) DEFAULT 'Bronze IV',
    best_rank INT DEFAULT NULL,
    season_rank INT DEFAULT NULL,
    trust_score INT NOT NULL DEFAULT 100,
    profile_privacy ENUM('public','friends','private') NOT NULL DEFAULT 'public',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_profiles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS season_players (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    season_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    rating_start INT NOT NULL DEFAULT 1200,
    rating_end INT NOT NULL DEFAULT 1200,
    league VARCHAR(32) NOT NULL DEFAULT 'Bronze',
    division VARCHAR(8) NOT NULL DEFAULT 'IV',
    final_rank INT DEFAULT NULL,
    total_points INT NOT NULL DEFAULT 0,
    prestige_earned INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_season_user (season_id, user_id),
    CONSTRAINT fk_season_players_season
        FOREIGN KEY (season_id) REFERENCES seasons(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_season_players_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rating_history (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    season_id INT UNSIGNED DEFAULT NULL,
    rating_before INT NOT NULL,
    rating_after INT NOT NULL,
    delta INT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rating_history_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_rating_history_season
        FOREIGN KEY (season_id) REFERENCES seasons(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ranked_player_stats (
    user_id INT UNSIGNED PRIMARY KEY,
    ranked_games INT UNSIGNED NOT NULL DEFAULT 0,
    infractions_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_ranked_at DATETIME DEFAULT NULL,
    next_decay_at DATETIME DEFAULT NULL,
    CONSTRAINT fk_ranked_player_stats_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ranked_match_results (
    match_id VARCHAR(64) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    result ENUM('win', 'loss', 'draw') NOT NULL,
    penalty VARCHAR(32) DEFAULT NULL,
    mmr_delta INT NOT NULL DEFAULT 0,
    rating_before INT NOT NULL DEFAULT 0,
    rating_after INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (match_id, user_id),
    CONSTRAINT fk_ranked_match_results_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS achievements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    rarity ENUM('common','rare','epic','legendary','secret') NOT NULL DEFAULT 'common',
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    secret TINYINT(1) NOT NULL DEFAULT 0,
    unlock_condition JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_achievements (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    achievement_id INT UNSIGNED NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    hidden_state TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY unique_user_achievement (user_id, achievement_id),
    CONSTRAINT fk_user_achievements_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_achievements_achievement
        FOREIGN KEY (achievement_id) REFERENCES achievements(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS titles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    rarity ENUM('common','rare','epic','legendary','mythic') NOT NULL DEFAULT 'common',
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    unlock_condition JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_titles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title_id INT UNSIGNED NOT NULL,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY unique_user_title (user_id, title_id),
    CONSTRAINT fk_user_titles_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_titles_title
        FOREIGN KEY (title_id) REFERENCES titles(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_mastery (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    role_name VARCHAR(32) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    xp INT NOT NULL DEFAULT 0,
    games_played INT NOT NULL DEFAULT 0,
    wins INT NOT NULL DEFAULT 0,
    losses INT NOT NULL DEFAULT 0,
    best_streak INT NOT NULL DEFAULT 0,
    title_id INT UNSIGNED DEFAULT NULL,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_role (user_id, role_name),
    CONSTRAINT fk_role_mastery_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_role_mastery_title
        FOREIGN KEY (title_id) REFERENCES titles(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    type ENUM('daily','weekly','seasonal') NOT NULL,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(255) NOT NULL,
    reward_type VARCHAR(32) NOT NULL DEFAULT 'xp',
    reward_value INT NOT NULL DEFAULT 0,
    target_value INT NOT NULL DEFAULT 1,
    season_id INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_season
        FOREIGN KEY (season_id) REFERENCES seasons(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_task_progress (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    task_id INT UNSIGNED NOT NULL,
    current_value INT NOT NULL DEFAULT 0,
    target_value INT NOT NULL DEFAULT 1,
    completed_at TIMESTAMP NULL,
    claimed_at TIMESTAMP NULL,
    UNIQUE KEY unique_user_task (user_id, task_id),
    CONSTRAINT fk_user_task_progress_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_task_progress_task
        FOREIGN KEY (task_id) REFERENCES tasks(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cosmetics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    type ENUM('frame','background','emblem','title_frame','aura') NOT NULL,
    name VARCHAR(100) NOT NULL,
    rarity ENUM('common','rare','epic','legendary','mythic') NOT NULL DEFAULT 'common',
    unlock_condition JSON DEFAULT NULL,
    prestige TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_cosmetics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    cosmetic_id INT UNSIGNED NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    equipped TINYINT(1) NOT NULL DEFAULT 0,
    visible TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY unique_user_cosmetic (user_id, cosmetic_id),
    CONSTRAINT fk_user_cosmetics_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_cosmetics_cosmetic
        FOREIGN KEY (cosmetic_id) REFERENCES cosmetics(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id INT UNSIGNED NOT NULL,
    season_id INT UNSIGNED DEFAULT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    winner_side VARCHAR(32) DEFAULT NULL,
    summary_json JSON DEFAULT NULL,
    CONSTRAINT fk_match_logs_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_match_logs_season
        FOREIGN KEY (season_id) REFERENCES seasons(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS match_participants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    match_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    role_name VARCHAR(32) DEFAULT NULL,
    team VARCHAR(32) DEFAULT NULL,
    result ENUM('win','loss','draw') DEFAULT 'loss',
    rating_before INT NOT NULL DEFAULT 1200,
    rating_after INT NOT NULL DEFAULT 1200,
    performance_score INT NOT NULL DEFAULT 0,
    action_log JSON DEFAULT NULL,
    CONSTRAINT fk_match_participants_match
        FOREIGN KEY (match_id) REFERENCES match_logs(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_match_participants_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);