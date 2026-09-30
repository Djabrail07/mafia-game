# Competitive Meta Ecosystem for Mafia Online

## 1. Design principles

This system is built as a single connected ecosystem, not as disconnected features. Every mechanic feeds the same core loop:

- play match
- get result + performance score
- receive rating, XP, progression
- unlock rewards, achievements, titles, cosmetics
- see rank in leaderboard and profile
- return to play again for better season placement and status

Important constraints:

- server-authoritative only
- no pay-to-win mechanics
- no direct gameplay advantage from cosmetics
- anti-abuse and anti-farm by design
- visible prestige, but not a trivial stat grind
- top rank must feel meaningful and rare

---

## 2. Core architecture

### 2.1 System modules

Backend split into modules:

- auth
  - registration, login, session, session validation, security checks
- users
  - profile data, avatar storage, settings, preferences, privacy, gallery
- rankings
  - leagues, divisions, MMR, leaderboard generation, ranking snapshots
- seasons
  - season lifecycle, rewards, leaderboard history, prestige logic
- achievements
  - achievement definitions, unlocking, rarity, secret logic, gallery
- titles
  - title catalog, unlock conditions, profile assignment
- role_mastery
  - per-role stats, XP, progression, role rewards
- tasks
  - daily, weekly, seasonal tasks, progress tracking, reward distribution
- cosmetics
  - avatar frames, profile backgrounds, emblems, title skins, fx, unlock state
- notifications
  - achievement unlock, rank up, season end, top-rank alerts, friend activity
- realtime
  - socket rooms, lobby updates, chat, phase sync, rank broadcast, season alerts
- matches
  - match result storage, actor logs, action logs, performance stats, rating delta

### 2.2 Single source of truth

All competitive systems must read from server state. Client is only a view.

Server-owned structures:

- users
- profiles
- rating history
- seasons
- achievements
- role mastery
- tasks
- cosmetics inventory
- match logs
- notifications
- leaderboard snapshots

Client responsibilities:

- render ranked profile
- render current league and progress
- send match result to server
- render lobby and profile UI
- display notifications from server
- no local rating calculation

---

## 3. Ranking system

### 3.1 Leagues and divisions

8 leagues:

1. Bronze
2. Silver
3. Gold
4. Platinum
5. Diamond
6. Master
7. Grandmaster
8. Legend

Each league includes divisions:

- Bronze: I, II, III, IV
- Silver: I, II, III, IV
- Gold: I, II, III, IV
- Platinum: I, II, III, IV
- Diamond: I, II, III, IV
- Master: I, II, III, IV
- Grandmaster: I, II, III, IV
- Legend: I, II, III, IV

Visibility model:

- public rating value + league + division
- hidden MMR for finer-grain matching
- division is visible, MMR remains the true competitive value

### 3.2 Rating model

Use a hybrid model:

- visible rating = skill rating range for display
- hidden core MMR = actual value used for matchups and competition

Formula:

$$
MMR_{new} = MMR_{old} + K \cdot (S - E)
$$

where:

- $K$ = dynamic coefficient based on league and match quality
- $S$ = match score, computed from win/loss + performance + opponent strength
- $E$ = expected outcome probability

Recommended values:

- Bronze/Silver: $K = 24$ to $36$
- Gold/Platinum: $K = 18$ to $28$
- Diamond/Master: $K = 12$ to $20$
- Grandmaster/Legend: $K = 8$ to $14$

Performance score includes:

- win/loss result
- role contribution
- survival time
- kill count / mafia pressure / detective correctness / doctor saves
- team impact value
- match quality relative to player skill

This means players can still gain rating after a loss if they performed well, while a poor performance can burn rating even in a win.

### 3.3 Rating and promotion rules

Promotion threshold:

- every division is a band of MMR points
- to promote, the player needs enough rating and a minimum number of rated matches in the division

Example:

- Bronze IV -> Bronze III: 1200 rating and 7 wins in the division
- Diamond I -> Diamond II: requires 1500+ and performance threshold
- Grandmaster -> Legend: requires seasonal points + playoff-like final evaluation

Demotion rules:

- player on losing streak drops faster
- player with high MMR loses a larger amount than low MMR player in a loss
- repeated intentional fallback is penalized by trust score

### 3.4 Rating decay and season pressure

To stop stale rankings:

- inactive players lose small rating decay over 28 days
- severe non-participation can reduce division, but not below a safety floor
- season-end rating is used for prestige and reward placement

---

## 4. Seasonal system

### 4.1 Season lifecycle

Default season length: 8 weeks.

Structure:

- week 1: placement and calibration matches
- weeks 2-7: ranked ladder progression
- week 8: final push and season rewards
- 3-day reset window after season end

Season data:

- season_id
- start_date
- end_date
- reset_date
- status: active / finalizing / completed
- reward pool
- leaderboard snapshot
- total player count

### 4.2 Seasonal reward system

Every season awards:

- league-based rewards
- top percentile rewards
- role mastery rewards
- seasonal challenge rewards
- prestige cosmetics

Reward tiers:

- Top 1: exclusive profile frame, peak title, banner, mythic avatar
- Top 3: premium frame, high-tier title, emblem, profile background
- Top 10: rare profile cosmetic and seasonal badge
- Top 25%: premium seasonal emblem and title
- Top 50%: standard seasonal reward
- All participants: XP, seasonal currency, small reputation boost

Prestige rewards:

- earned only once per season cycle for certain ranks
- legacy prestige remains visible even if player drops later
- prestige is granted for strong performance, not just participation

### 4.3 History and past seasons

Player profile memory:

- previous leagues
- best rank achieved
- season placement history
- total seasons completed
- best seasonal reward
- highest earned prestige title

This turns long-term progress into identity.

---

## 5. Leaderboards

Multiple leaderboards, all generated from server data.

### 5.1 Global leaderboard

- ranked by current hidden MMR + visible rating
- top 1000 shown in UI
- top 10 special banner zone
- top 1 is a prestigious status screen with unique visual treatment

### 5.2 Friends leaderboard

- only friends and mutual connections
- friend-only comparison index
- encourages social pressure and group competition

### 5.3 Country leaderboard

- grouped by country or region
- geographic rivalry layer
- can be public or private depending on profile privacy settings

### 5.4 Role leaderboard

Separate leaderboard for each role:

- mafia ranking
- detective ranking
- doctor ranking
- citizen contribution leaderboard
- hidden role-specific MMR

Each role has its own XP and ladder:

- Detective Master
- Mafia Legend
- Doctor Prestige

### 5.5 Weekly and monthly top lists

- weekly top 10
- monthly top 50
- season leaderboard snapshots
- special challenge leaderboard

---

## 6. Player profiles

### 6.1 Profile data model

A profile is a long-term identity card.

Data includes:

- avatar URL
- avatar frame
- profile background
- emblem
- current league and division
- title
- rank number
- total wins
- total losses
- total matches
- win rate
- favorite role
- longest winstreak
- best division
- best season rank
- prestige points
- account level
- recent milestone history
- hidden profile settings

### 6.2 Profile features

- summary panel
- career stats
- role mastery panel
- season history panel
- achievement gallery
- title collection
- cosmetic showcase
- match history preview
- friend rivalry info

### 6.3 Privacy and gallery visibility

Profile gallery should support visibility levels:

- public: visible to everyone
- friends: visible only to friends
- private: visible only to self
- hidden: hidden from all except admin/restricted case

Player can select which achievements and medals are displayed publicly.

Rare reward visibility rule:

- mythic/legendary achievements are highlightable but not mandatory
- some are secret and cannot be shown until unlocked intentionally
- certain premium items are shown only after a special unlock action

---

## 7. Achievement system

### 7.1 Achievement tiers

- common
- rare
- epic
- legendary
- secret

### 7.2 Secret achievements

Secret achievements never show the condition upfront.

Examples:

- "Who was watching?"
- "The room had eyes"
- "You heard the silence"
- "The city forgot your name"

These require hidden triggers that are only revealed after unlock.

### 7.3 Achievement categories

- match wins
- role mastery
- social interactions
- season performance
- comeback wins
- first place placements
- hidden event achievements
- anti-abuse verification achievements

### 7.4 Achievement examples

Common:

- Win 10 matches
- Finish a season in Silver
- Play 50 games

Rare:

- Reach Gold division
- Win 3 comeback matches in a row
- Save 5 allies in one season

Epic:

- 3 consecutive season top-10 finishes
- Win a full season in Diamond
- Complete a role mastery milestone

Legendary:

- Finish top 1 in a season
- Achieve a legendary role mastery title
- Complete prestige milestone

Secret:

- Win while being the last role survivor but never taking a visible action
- Clear a hidden event with a completely different role build

### 7.5 Achievement progression and reward split

Every achievement gives:

- XP
- prestige points
- cosmetic unlock
- title progress
- small MMR boost if official and seasonal

Reward values reflect rarity.

---

## 8. Titles system

Titles are identity-level recognition. They are not just text; they are a status layer.

### 8.1 Title categories

- competitive titles
- event titles
- role titles
- seasonal titles
- prestige titles
- hidden titles

Examples:

- Bronze Survivor
- Diamond Strategist
- Master of the City
- Mafia Reaper
- Detective of the Month
- Top 1 Guardian
- Season 12 Legend
- Silenced by the City

### 8.2 Title unlock rules

- win season and reach high rank
- finish top 1 in role leaderboard
- complete elite achievement chain
- win a community event
- maintain a long streak

Player can equip one active title on profile and others remain in collection.

---

## 9. Role mastery system

This system makes each role a long-term progression track.

For each role, the player has:

- level
- XP
- current tier
- total matches played with role
- win rate by role
- best performance streak
- mastery title
- unique rewards

Example role tracks:

- Mafia: kill efficiency, bluff pressure, pressure control, win rate with role
- Detective: accuracy, correct suspicion rate, reveal efficiency
- Doctor: save rate, timing accuracy, heal efficiency
- Citizen: information gathering, survival, voting precision

Role titles examples:

- Master Detective
- Mafia Legend
- Healer of the City
- Silent Strategist
- City Guardian

This gives long-term identity beyond overall league rank.

### 9.1 Role mastery progression

Formula:

$$
roleXP_{new} = roleXP_{old} + performanceScore \cdot roleWeight \cdot matchModifier
$$

Role reward examples:

- role frame skin
- role-specific emblem
- title unlock
- seasonal badge
- profile animation

---

## 10. Quests, daily, weekly and seasonal tasks

The task system should not be only “play 20 games”. Tasks should reflect actual skill and engagement.

### 10.1 Daily tasks

Examples:

- win 1 ranked game as mafia
- successfully save 2 allies as doctor
- make 3 correct detective investigations
- survive until final 3 with any role
- win 2 games in 24 hours

### 10.2 Weekly tasks

Examples:

- complete 6 role-specific actions
- finish top 10 in weekly leaderboard
- win 4 matches while staying under 3 losses
- achieve 2 long comeback wins
- reach 1500+ personal rating

### 10.3 Seasonal goals

Examples:

- reach Gold league
- maintain top 25% across 3 weeks
- collect 30 achievements
- unlock 3 legendary role titles
- earn 1500 total prestige points

### 10.4 Task reward design

Rewards include:

- XP
- seasonal currency
- loyalty tokens
- title fragments
- cosmetics
- profile badge

Important rule: losing still gives progress.

Progress sources from losses:

- role participation
- survival
- correct actions
- useful influence on game outcome
- contribution score

This keeps the grind fair and avoids the “you only get rewarded when you win” trap.

---

## 11. Reward and progression psychology

The system must reward both accomplishment and effort.

### 11.1 Progression logic

A player must feel:

- I made progress even after loss
- my role skill matters
- my season rank matters
- my elite results are visible
- my top rank is worth something unique

Recommended rule set:

- win = large rating and major XP gain
- loss = smaller rating loss but still progression via XP, tasks, role mastery
- strong performance = extra rewards even if result is a loss
- excellent game = larger reward than average win
- poor performance = reduced rewards even in a win

This prevents lazy wins and promotes smart play.

### 11.2 Prestige as a long-term reward

Prestige should be scarce and meaningful.

Examples:

- Top 1 of season => unique prestige badge
- legendary role mastery => custom emblem
- 3 season top 3 placements => profile frame

Not all progress should be equal. Top-tier results should be rare, memorable, and visible.

---

## 12. Cosmetics and prestige status

Cosmetics should never grant gameplay advantage.

### 12.1 Cosmetic categories

- avatar frame
- profile background
- emblem
- title frame
- seasonal badge
- aura / visual effect
- small animated overlay on profile

Examples:

- Bronze frame
- Silver royal border
- Gold city crest
- Diamond glow
- Master aura
- Legend flame effect

These are prestige objects: they display status and achievement, not power.

### 12.2 Cosmetic rarity

- common: league rewards
- rare: seasonal rewards
- epic: role mastery rewards
- legendary: top seasonal rank reward
- mythic: only special event or prestige reward

---

## 13. History and player memory

The profile should tell a story.

### 13.1 History pages

- previous leagues and divisions
- best rank
- best season result
- total premium awards collected
- all major achievements unlocked
- significant role progression milestones
- highest profile prestige rating

### 13.2 Season timeline

- season identifier
- final league
- final division
- rank position
- best streak
- biggest achievement in season
- reward earned

---

## 14. Profile comparison system

Players should be able to compare themselves with others.

### 14.1 Compare fields

- current league and division
- total rank placement
- win rate
- total matches
- achievements count
- role mastery levels
- prize collection
- seasonal history
- favorite role
- title

### 14.2 Comparison logic

Comparison UI should show:

- who is ahead in rating
- who has better role mastery
- who has more prestige awards
- who has stronger seasonal results
- who has better recent momentum

This creates meaningful competition and long-term identity.

---

## 15. Notifications system

Notifications are a core retention driver.

### 15.1 Trigger events

- achievement unlocked
- role mastered
- league promotion
- division promotion
- season final standings update
- top-10 rank reached
- top-1 gained
- title equipped
- reward available
- seasonal challenge completed
- rare cosmetic unlocked

### 15.2 Notification UX

Notification design should feel premium and not spammy.

Examples:

- “You reached Diamond II”
- “You unlocked the Master Detective title”
- “You finished Season 12 in Top 3”
- “You are now in the Global Top 100”
- “New secret achievement unlocked”

These should appear as bottom notifications, like other user-facing events, but with high-contrast status styling.

---

## 16. Anti-abuse and anti-cheat by design

This is essential for rank integrity.

### 16.1 Core anti-abuse rules

- no vanity loadout grants gameplay power
- MMR changes are calculated from result + performance, not only win/loss
- repeated match manipulation triggers a trust decay
- suspicious short match behavior is flagged
- boosts from side accounts are detected via account linking and behavior patterns
- intentional throw behavior reduces rating and triggers review
- role manipulation and fake afk patterns are logged

### 16.2 Trust score model

Each account has a trust score:

- + if consistent play, fair match history, normal behavior
- - if repeated abandonment, suspicious queue behavior, rapid rank inflation, repeated surrender

Trust score affects:

- match quality filter
- MMR adjustments
- reward protection
- leaderboard eligibility

### 16.3 Anti-farm logic

Anti-farm protections:

- account must meet minimum match variety before leaderboard eligibility
- role variety matters
- repeated easy-mode wins are capped
- fake low-skill boosts are not rewarded equally
- suspicious account clustering is flagged

### 16.4 Anti-boost logic

- no rating transfer between accounts
- account family correlation detection
- seasonal reward restrictions if suspicious behavior is found
- fake user groups are detected by repeated same hardware/session pattern

---

## 17. UI and UX design system

### 17.1 Visual principles

- premium dark theme with contrast and readability
- strong hierarchy between normal, rare, epic, legendary rewards
- all cards have one consistent padding and radius pattern
- leaderboard rows show rank, rating, title, progress, streak
- profiles feel like a personal identity hub

### 17.2 UI modules

- profile dashboard
- league panel
- seasonal panel
- achievements board
- titles collection
- glory gallery
- compare panel
- task tracker
- role mastery panel
- notifications center

### 17.3 Interaction goals

- users should see status immediately
- rank changes should feel like a real achievement
- top ranks must feel rare and prestigious
- player should be motivated to return tomorrow

---

## 18. Data schema overview

### 18.1 Users and profiles

```
users
- id
- email
- password_hash
- nickname
- avatar_url
- avatar_frame_id
- profile_background_id
- emblem_id
- active_title_id
- current_league
- current_division
- rating
- hidden_mmr
- prestige_points
- account_level
- created_at
```

```
user_profiles
- user_id
- bio
- privacy_mode
- friend_count
- total_matches
- total_wins
- total_losses
- win_rate
- best_division
- best_rank
- favorite_role
- last_active_at
```

### 18.2 Seasons and leaderboard history

```
seasons
- id
- name
- start_at
- end_at
- status
- reward_pool
```

```
season_players
- season_id
- user_id
- rating_start
- rating_end
- league_id
- division_id
- final_rank
- total_points
- prestige_earned
```

### 18.3 Achievements and titles

```
achievements
- id
- code
- name
- description
- rarity
- secret
- category
- unlock_condition_json
```

```
user_achievements
- user_id
- achievement_id
- unlocked_at
- hidden_state
- visible
```

```
titles
- id
- code
- name
- rarity
- unlock_condition_json
- category
```

```
user_titles
- user_id
- title_id
- acquired_at
- is_active
```

### 18.4 Role mastery

```
role_mastery
- user_id
- role_name
- level
- xp
- games_played
- wins
- losses
- best_streak
- title_id
- last_updated_at
```

### 18.5 Tasks and rewards

```
seasonal_tasks
- id
- type
- code
- title
- description
- reward_type
- reward_value
- start_at
- end_at
```

```
user_task_progress
- user_id
- task_id
- current_value
- target_value
- completed_at
- claimed_at
```

### 18.6 Cosmetics and inventory

```
cosmetics
- id
- type
- name
- rarity
- unlock_condition_json
- is_prestige
```

```
user_cosmetics
- user_id
- cosmetic_id
- unlocked_at
- equipped
- visible
```

### 18.7 Match logs and rating history

```
match_logs
- id
- room_id
- season_id
- creator_user_id
- started_at
- ended_at
- winner_side
- result_json
```

```
match_participants
- match_id
- user_id
- role
- team
- result
- rating_before
- rating_after
- performance_score
- action_log_json
```

```
rating_history
- user_id
- season_id
- match_id
- old_mmr
- new_mmr
- delta
- reason
- created_at
```

---

## 19. API concept

Suggested endpoints:

- GET /api/profile/:userId
- GET /api/profile/compare/:leftId/:rightId
- GET /api/rank/summary
- GET /api/leaderboards/global
- GET /api/leaderboards/friends
- GET /api/leaderboards/country
- GET /api/leaderboards/role/:role
- GET /api/seasons/current
- GET /api/seasons/history
- GET /api/achievements
- GET /api/titles
- GET /api/role-mastery
- GET /api/tasks/daily
- GET /api/tasks/weekly
- GET /api/notifications
- POST /api/profile/gallery/visibility
- POST /api/profile/equip-title
- POST /api/profile/equip-cosmetic
- POST /api/rank/recalculate

All ranking-related calculations and rewards should be run server-side only.

---

## 20. Progression loop design

The system must create a strong lifecycle:

1. player plays a match
2. server logs actions and performance
3. server recalculates rating, XP, tasks, mastery, achievements
4. player sees updated rank, notifications, rewards
5. player opens new cosmetics, title, seasonal badge
6. profile becomes more prestigious and visible
7. player returns for season rank, top placement, and reputation

This loop is the real retention engine.

---

## 21. Why this system works long-term

This design creates:

- status competition
- role identity
- season pressure
- long-term progression
- visible prestige
- strong retention loop
- fairness through anti-abuse
- no pay-to-win advantage

The strongest feeling is not just “I won a match”, but:

- “I moved up to Gold.”
- “My Mafia mastery is genuinely progressing.”
- “I am in the global top 100.”
- “My profile reflects who I am as a competitive player.”
- “I want to defend my rank next season.”

Top 1 becomes a social status, not a number.

---

## 22. Implementation priority

Best order to implement:

1. rating + league + division core
2. season system + leaderboard snapshots
3. profile + title + cosmetics layer
4. achievements + gallery visibility
5. role mastery
6. daily/weekly/seasonal tasks
7. anti-abuse and trust score
8. notifications and comparison
9. premium UI polish and identity screens

This order keeps the project stable and prevents building cosmetic layers before the fundamental competitive backbone exists.
