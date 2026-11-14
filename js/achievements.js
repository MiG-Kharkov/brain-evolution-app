// Achievements (v3.2, extended in v3.4): a catalogue of goals in seven groups. A tiered goal has up to five steps
// (bronze, silver, gold, platinum, brilliant); a single goal has one. Each goal reads a value from the profile
// (context()) and compares it with its goal. Three kinds of tiered goals keep something to improve at any time:
//   counts          games, trainings, points, records … (the long ones go on to platinum and diamond);
//   by difficulty   a flawless game on easy is bronze, on medium silver, on hard gold (levelGoal);
//   personal bests  the best single result so far: points of one Quadronica rectangle, examples a minute …
// State in the profile:
//   achievements = {"<id>" | "<id>:<tier>": timestamp}         earned goals (never taken back)
//   stats = {v, games, points, records, hints, perfect: {game: n}, flawless: {game: level}, best: {key: value},
//            rbShortest, bigWins, winRun, bestWinRun, perfectTrainings, flags: {}, day: {date, n}, maxDay,
//            left: {"<exit|restart>:<mode>:<game>:<level>": n}, rec: {…}, matchRun}
// stats.rec and stats.matchRun belong to the record book (js/records.js), which also counts stats.records.
// stats are lifetime counters updated when a game, a training or a test ends (noteGame / noteTraining).
// A test task counts as a played game with its points; the records, the feats and the personal bests are for
// training and free play only (a test task has its own length and prices).
// stats.left is not an achievement: it counts the games left unfinished or restarted, for the balance.
// The old awards (best_<game>, training_complete, nobel) stay: progression and the diplomas read them.
// Removed in 3.11.4 (owner: «Не сдаваться убрать. А если я всё закрою — уровень не понизится»): goals that only a
// setback gives — «Never give up» (win back a level that went down) and «Welcome back» (a break of a week). A step
// earned before stays in profile.achievements and is no longer counted.
import { GAME_IDS, TRAINING_ORDER, testIndex, indexHistory, localDate, openedFacts } from './progression.js';

export const TIERS = [['Bronze', 'Бронза'], ['Silver', 'Серебро'], ['Gold', 'Золото'], ['Platinum', 'Платина'], ['Brilliant', 'Бриллиант']];
export const TIER_KINDS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
export const GROUPS = [
  {id: 'start', icon: 'play', color: 'var(--accent)', title: ['First steps', 'Первые шаги']},
  {id: 'habit', icon: 'flame', color: '#e8782a', title: ['Habit', 'Привычка']},
  {id: 'mastery', icon: 'trophy', color: '#7c5cff', title: ['Mastery', 'Мастерство']},
  {id: 'mark', icon: 'target', color: '#3b7ddd', title: ['Brain Mark', 'Brain Mark']},
  {id: 'feats', icon: 'star', color: '#d6458a', title: ['Feats', 'Подвиги']},
  {id: 'bests', icon: 'spark', color: '#c98a00', title: ['Personal bests', 'Личные рекорды']},
  {id: 'knowledge', icon: 'bulb', color: '#3a9d50', title: ['Knowledge', 'Знания']},
];

const flag = name => c => (c.flags[name] ? 1 : 0);
// A flawless game: the tier is the difficulty it was played on (1 easy … 3 hard, 4 ultra in Sudoku).
const feat = (game, icon, title, desc, levels = 3) => ({id: `feat_${game}`, group: 'feats', icon, game, title, desc, levelGoal: true,
  tiers: Array.from({length: levels}, (_, i) => i + 1), value: c => c.flawless[game] || 0});
const best = (id, icon, game, title, desc, tiers, value) => ({id, group: 'bests', icon, game, title, desc, tiers, value});

// title/desc: [English, Russian]; %d in desc is the goal of the tier, %s — rankName(goal) for the ranks; a levelGoal
// description gets «Level: <difficulty of the tier>» after it.
export const ACHIEVEMENTS = [
  // ---- first steps
  {id: 'first_game', group: 'start', icon: 'play', title: ['First game', 'Первая партия'], desc: ['Play any game.', 'Сыграйте в любую игру.'], goal: 1, value: c => c.games},
  {id: 'first_training', group: 'start', icon: 'calendar', title: ['First training', 'Первая тренировка'], desc: ['Finish your first training.', 'Завершите первую тренировку.'], goal: 1, value: c => c.trainings},
  {id: 'first_test', group: 'start', icon: 'target', title: ['Starting point', 'Точка отсчёта'], desc: ['Take the Brain Mark test: your growth is counted from it.', 'Пройдите тест Brain Mark: от него считается ваш рост.'], goal: 1, value: c => c.tests},
  {id: 'all_played', group: 'start', icon: 'games', title: ['Tried them all', 'Попробовал всё'], desc: ['Play each of the 12 games.', 'Сыграйте в каждую из 12 игр.'], goal: 12, value: c => c.played},
  {id: 'all_open', group: 'start', icon: 'spark', title: ['All doors open', 'Все двери открыты'], desc: ['Unlock all 12 games in training.', 'Откройте в тренировке все 12 игр.'], goal: 12, value: c => c.open},
  {id: 'hint_used', group: 'start', icon: 'bulb', title: ['Learning by example', 'Учусь на примере'], desc: ['Use a hint in a game.', 'Воспользуйтесь подсказкой в игре.'], goal: 1, value: c => c.hints},
  // ---- habit
  // 3.11.4 (owner: «у нас всё на 3 месяца»): the long counters end at 90 days of play — 3, 7, 30, 60, 90 days,
  // 3 trainings a day (his estimate of the average), about 4.9 games a training once the games are open
  // (docs/achievements-review.md). Before: a streak of 365 days, 730 trainings, 5 000 games — years.
  {id: 'streak', group: 'habit', icon: 'flame', title: ['Streak', 'Серия'], desc: ['Train every day. Days in a row: %d', 'Тренируйтесь каждый день. Дней подряд: %d'], tiers: [3, 7, 30, 60, 90], value: c => c.bestStreak},
  {id: 'trainings', group: 'habit', icon: 'calendar', title: ['Trainer', 'Тренировки'], desc: ['Finished trainings: %d', 'Завершённых тренировок: %d'], tiers: [10, 20, 90, 180, 270], value: c => c.trainings},
  {id: 'games', group: 'habit', icon: 'games', title: ['Player', 'Игрок'], desc: ['Games played: %d', 'Сыграно партий: %d'], tiers: [30, 100, 400, 800, 1200], value: c => c.games},
  {id: 'two_a_day', group: 'habit', icon: 'restart', title: ['One more!', 'Ещё одну!'], desc: ['Finish two trainings in one day.', 'Завершите две тренировки за один день.'], goal: 2, value: c => c.maxTrainingsPerDay},
  {id: 'weekend', group: 'habit', icon: 'sun', title: ['No days off', 'Без выходных'], desc: ['Train on both Saturday and Sunday of one weekend.', 'Тренируйтесь и в субботу, и в воскресенье одних выходных.'], goal: 1, value: c => c.weekend},
  {id: 'early_bird', group: 'habit', icon: 'sun', secret: true, title: ['Early bird', 'Жаворонок'], desc: ['Finish a training before 8 in the morning.', 'Завершите тренировку до 8 утра.'], goal: 1, value: flag('early')},
  {id: 'night_owl', group: 'habit', icon: 'moon', secret: true, title: ['Night owl', 'Сова'], desc: ['Finish a training after 10 in the evening.', 'Завершите тренировку после 10 вечера.'], goal: 1, value: flag('night')},
  {id: 'marathon', group: 'habit', icon: 'timer', secret: true, title: ['Marathon', 'Марафон'], desc: ['Play 20 games in one day.', 'Сыграйте 20 партий за один день.'], goal: 20, value: c => c.maxGamesPerDay},
  // ---- mastery
  {id: 'level_ups', group: 'mastery', icon: 'up', title: ['Growing', 'Рост'], desc: ['Difficulty raised in training: %d', 'Повышений сложности в тренировке: %d'], tiers: [3, 12, 25], value: c => c.promotions},
  {id: 'hard_games', group: 'mastery', icon: 'target', title: ['High bar', 'Высокая планка'], desc: ['Games brought to «Hard»: %d', 'Игр на уровне «Сложно»: %d'], tiers: [1, 6, 12], value: c => c.hardGames},
  {id: 'champions', group: 'mastery', icon: 'trophy', title: ['Champion', 'Чемпион'], desc: ['Pass the top difficulty in training. Games: %d', 'Пройдите высшую сложность в тренировке. Игр: %d'], tiers: [1, 6, 12], value: c => c.champions},
  {id: 'records', group: 'mastery', icon: 'star', title: ['Record breaker', 'Рекордсмен'], desc: ['Beat your own record. Records: %d', 'Побейте свой рекорд. Рекордов: %d'], tiers: [5, 25, 60, 90, 110], value: c => c.records},   // 3.11.4: 90 days of 3 trainings give a median of 125 (113 for one player in ten); 130 was above it
  {id: 'perfectionist', group: 'mastery', icon: 'check', title: ['Perfectionist', 'Перфекционист'], desc: ['Flawless games in different games: %d', 'Безупречные партии в разных играх: %d'], tiers: [3, 6, 12], value: c => c.perfectGames},
  {id: 'points', group: 'mastery', icon: 'spark', title: ['Point collector', 'Копилка очков'], desc: ['Points over all games: %d', 'Очков за все партии: %d'], tiers: [50000, 500000, 2000000, 5000000, 10000000], value: c => c.points},
  // ---- Brain Mark
  {id: 'tests', group: 'mark', icon: 'target', title: ['Researcher', 'Исследователь'], desc: ['Tests taken: %d', 'Пройдено тестов: %d'], tiers: [3, 10, 25, 50, 90], value: c => c.tests},   // 3.11.4: 90 days at a test a day
  {id: 'rank', group: 'mark', icon: 'medal', title: ['Rank', 'Ранг'], desc: ['Reach the rank «%s».', 'Достигните ранга «%s».'], tiers: [3, 5, 7], rankGoal: true, value: c => c.bestRank},
  {id: 'growth', group: 'mark', icon: 'up', title: ['Visible progress', 'Заметный рост'], desc: ['Brain Mark above your first test by: %d', 'Brain Mark выше первого теста на: %d'], tiers: [5, 10, 20], value: c => c.growth},
  {id: 'all_round', group: 'mark', icon: 'brain', title: ['All-rounder', 'Разносторонний'], desc: ['Get 50 or more in all five games of one test.', 'Получите 50 и больше во всех пяти играх одного теста.'], goal: 1, value: c => c.allRound},
  {id: 'top_mark', group: 'mark', icon: 'star', title: ['Top mark', 'Отличник'], desc: ['Get 90 or more in any game of the test.', 'Получите 90 и больше в любой игре теста.'], goal: 1, value: c => c.topMark},
  {id: 'weak_spot', group: 'mark', icon: 'up', title: ['Working on it', 'Работа над ошибками'], desc: ['Raise the mark of your weakest test game by 10 or more in the next test.', 'Поднимите оценку самой слабой игры теста на 10 и больше в следующем тесте.'], goal: 1, value: c => c.weakSpot},
  {id: 'precise', group: 'mark', icon: 'check', title: ['Precise measure', 'Точное измерение'], desc: ['Narrow the range of your Brain Mark to 10 points: take the test regularly, with steady results.', 'Сузьте диапазон Brain Mark до 10 пунктов: проходите тест регулярно и с ровными результатами.'], goal: 1, value: c => c.precise},
  // ---- feats: a flawless game in every game, by difficulty
  feat('arithmetics', 'arithmetics', ['Flawless count', 'Безошибочный счёт'], ['Arithmetics without a single mistake.', 'Арифметика без единой ошибки.']),
  feat('quadronica', 'quadronica', ['Sharp eye', 'Зоркий глаз'], ['15 rectangles in one game of Quadronica without mistakes.', '15 прямоугольников за партию Квадроники без ошибок.']),
  feat('memorics', 'memorics', ['Photographic memory', 'Фотографическая память'], ['Memorics without a single mistake.', 'Запоминалка без единой ошибки.']),
  feat('sudoku', 'sudoku', ['Clean solution', 'Чистое решение'], ['Sudoku without mistakes and auto pencil marks.', 'Судоку без ошибок и автопометок.'], 4),
  feat('pairs', 'pairs', ['Nothing forgotten', 'Ничего не забыл'], ['Pairs without a repeated mistake.', 'Пары без повторных ошибок.']),
  feat('numbers', 'numbers', ['Clear field', 'Чистое поле'], ['Clear the Numbers field without mistakes.', 'Очистите поле «Чисел» без ошибок.']),
  feat('roadblocks', 'roadblocks', ['Precise shot', 'Точный удар'], ['Pass the Roadblocks without losing a ball.', 'Пройдите «Препятствия», не потеряв ни одного шарика.']),
  feat('guess_who', 'guess_who', ['Eagle eye', 'Орлиный глаз'], ['Guess Who without a single mistake.', '«Кто это?» без единой ошибки.']),
  feat('minesweeper', 'minesweeper', ['Not a single blast', 'Ни одного взрыва'], ['Clear a Minesweeper field without a blast.', 'Разминируйте поле «Сапёра» без взрывов.']),
  // 3.11.1: «every figure Very Good or better» instead of «90 % or more» — the tolerance of Medium and Hard is 2–3 times
  // narrower than that of Easy, so 90 % was out of reach there (tools/analysis/achievements_reach.mjs).
  feat('geometry', 'geometry', ['Steady hand', 'Твёрдая рука'], ['Get “Very Good” or better for every figure of Geometry.', 'Нарисуйте все фигуры «Геометрии» на «Очень хорошо» и выше.']),
  feat('encyclopedia', 'encyclopedia', ['Erudite', 'Эрудит'], ['Answer every Encyclopedia question right.', 'Ответьте на все вопросы «Энциклопедии» без ошибок.']),
  feat('matches', 'matches', ['First try', 'С первой попытки'], ['Solve a Matches puzzle without a wrong check.', 'Решите головоломку «Спичек» без неверных проверок.']),
  // ---- personal bests: the best single result so far
  best('quad_big', 'quadronica', 'quadronica', ['Big catch', 'Большой улов'], ['Points for one rectangle in Quadronica: %d', 'Очков за один прямоугольник в Квадронике: %d'], [400, 800, 1500, 2500], c => c.best.quadMove || 0),
  best('quad_count', 'quadronica', 'quadronica', ['Quick hands', 'Скорострел'], ['Rectangles in one game of Quadronica: %d', 'Прямоугольников за одну партию Квадроники: %d'], [12, 20, 30], c => c.best.quadCount || 0),
  best('calc_speed', 'timer', 'arithmetics', ['Human calculator', 'Живой калькулятор'], ['Examples a minute in a game of Arithmetics without mistakes: %d', 'Примеров в минуту в партии Арифметики без ошибок: %d'], [15, 20, 24], c => c.best.calcRate || 0),   // 3.11.2 (owner: 27 is too much): 24 = 2.5 s an example
  best('num_combo', 'numbers', 'numbers', ['One sweep', 'Одним махом'], ['Digits cleared by one move in Numbers: %d', 'Цифр убрано одним ходом в «Числах»: %d'], [3, 4, 5], c => c.best.numCombo || 0),   // 3.11.1: a move cannot clear more than 5 (was 5 / 6 / 7 / 8)
  best('gw_speed', 'guess_who', 'guess_who', ['Quick glance', 'Быстрый взгляд'], ['Rounds a minute in a game of Guess Who without mistakes: %d', 'Раундов в минуту в партии «Кто это?» без ошибок: %d'], [8, 12, 18], c => c.best.gwRate || 0),
  best('geo_accuracy', 'geometry', 'geometry', ['Draughtsman', 'Чертёжник'], ['Accuracy of the weakest figure in a game of Geometry, %: %d', 'Точность самой слабой фигуры за партию «Геометрии», %: %d'], [88, 93, 96], c => c.best.geoMin || 0),   // 3.12.3: the accuracy is on one scale for every level; 88 / 93 / 96 are the old 80 / 88 / 94 of Easy
  best('rb_shortest', 'roadblocks', 'roadblocks', ['Shortest way', 'Кратчайший путь'], ['Roadblocks fields passed in the fewest rolls: %d', 'Полей «Препятствий», пройденных за наименьшее число ходов: %d'], [1, 10, 30], c => c.rbShortest),
  // 3.11.4 (owner: «может быть нереально на трудном»): on Hard the strong model player reaches 150 % of the threshold
  // only in Quadronica, in Roadblocks and Geometry not on any level, so the count is made on Easy and Medium: the
  // average model player gets about 37 there, the strong one about 60. 50 was out of reach for the average.
  best('big_wins', 'up', null, ['With room to spare', 'С запасом'], ['Training games at 150 % of the threshold or more: %d', 'Партий в тренировке с результатом от 150 % порога: %d'], [3, 10, 25], c => c.bigWins),
  best('win_streak', 'flame', null, ['Winning streak', 'Серия побед'], ['Good training games in a row: %d', 'Удачных партий в тренировке подряд: %d'], [3, 7, 15], c => c.bestWinRun),
  best('perfect_training', 'check', null, ['Perfect training', 'Идеальная тренировка'], ['Trainings where every game passed its threshold: %d', 'Тренировок, где все игры прошли порог: %d'], [1, 5, 20, 50], c => c.perfectTrainings),
  // ---- knowledge
  {id: 'enc_right', group: 'knowledge', icon: 'encyclopedia', game: 'encyclopedia', title: ['Walking encyclopedia', 'Ходячая энциклопедия'], desc: ['Right answers in Encyclopedia: %d', 'Верных ответов в «Энциклопедии»: %d'], tiers: [25, 100, 250, 500], value: c => c.encRight},   // 3.11.4: the game opens after 13 level-ups and is in 5 of 12 games of a training; 1 000 took more than a year
  {id: 'units', group: 'knowledge', icon: 'swap', game: 'encyclopedia', title: ['Two systems', 'Две системы мер'], desc: ['Play Encyclopedia in metric and in US units.', 'Сыграйте в «Энциклопедию» и в метрических, и в американских единицах.'], goal: 2, value: c => c.unitSystems},
  {id: 'demo_seen', group: 'knowledge', icon: 'play', title: ['Visual lesson', 'Наглядный урок'], desc: ['Watch «Show me how» in the rules of a game.', 'Посмотрите «Показать, как играть» в правилах игры.'], goal: 1, value: flag('demo')},
  {id: 'bm_help', group: 'knowledge', icon: 'help', title: ['I know the scale', 'Понимаю шкалу'], desc: ['Open «How to read Brain Mark».', 'Откройте «Как читать Brain Mark».'], goal: 1, value: flag('bm_help')},
  {id: 'facts', group: 'knowledge', icon: 'bulb', title: ['Curious mind', 'Любопытный'], desc: ['Interesting facts opened: %d', 'Открыто интересных фактов: %d'], tiers: [5, 20, 50, 100, 180], value: c => c.facts},   // the last step is the whole list of data/facts.json
];
export const BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
// Every step counted in "earned of total".
export const STEPS = ACHIEVEMENTS.flatMap(a => (a.tiers ? a.tiers.map((goal, tier) => ({a, tier, goal, key: `${a.id}:${tier}`})) : [{a, tier: null, goal: a.goal, key: a.id}]));

// ---------------------------------------------------------------- lifetime counters
export function ensureStats(profile) {
  const s = profile.stats && typeof profile.stats === 'object' ? profile.stats : {};
  if (!s.v) {
    // First run of v3.2: start from the score history that is still kept (120 days).
    const hist = Array.isArray(profile.scoreHistory) ? profile.scoreHistory : [];
    const perDay = {};
    for (const item of hist) { const d = String(item.date || '').slice(0, 10); perDay[d] = (perDay[d] || 0) + 1; }
    Object.assign(s, {v: 1, games: hist.length, points: hist.reduce((sum, item) => sum + (Number(item.score) || 0), 0), records: 0, hints: 0,
      perfect: {}, flags: {}, day: {date: null, n: 0}, maxDay: Math.max(0, ...Object.values(perDay))});
  }
  s.perfect ||= {}; s.flags ||= {}; s.day ||= {date: null, n: 0}; s.flawless ||= {}; s.best ||= {};
  profile.stats = s;
  profile.achievements = profile.achievements && typeof profile.achievements === 'object' && !Array.isArray(profile.achievements) ? profile.achievements : {};
  return s;
}

// A game dropped (kind 'exit') or started again from the pause menu (kind 'restart') after it ran for a while.
export function noteLeft(profile, {gameId, difficulty, mode}, kind) {
  const s = ensureStats(profile), key = `${kind}:${mode}:${gameId}:${difficulty}`;
  s.left = s.left && typeof s.left === 'object' ? s.left : {};
  s.left[key] = (s.left[key] || 0) + 1;
}

// A finished game: {gameId, difficulty, score, feats}; a test task comes without feats. The records it beats are
// counted by noteRecords (js/records.js).
export function noteGame(profile, {gameId, difficulty, score, before = 0, feats = null}) {
  const s = ensureStats(profile);
  s.games++;
  s.points += Math.max(0, Math.round(Number(score) || 0));
  const today = localDate();
  if (s.day.date !== today) s.day = {date: today, n: 0};
  s.day.n++;
  s.maxDay = Math.max(s.maxDay || 0, s.day.n);
  if (!feats) return;
  s.hints += Number(feats.hints) || 0;
  const level = Math.max(0, ['easy', 'medium', 'hard', 'ultra'].indexOf(difficulty)) + 1;
  const perfect = Boolean(feats.perfect) && !(feats.hints > 0);          // a hinted game is not flawless
  if (perfect) {
    s.flags[`feat_${gameId}`] = 1;
    s.perfect[gameId] = (s.perfect[gameId] || 0) + 1;
    s.flawless[gameId] = Math.max(s.flawless[gameId] || 0, level);
  }
  // Personal bests only grow.
  const best = (key, value) => { if (Number.isFinite(value) && value > (s.best[key] || 0)) s.best[key] = Math.floor(value); };
  if (gameId === 'quadronica') { best('quadMove', feats.bestMove); best('quadCount', feats.found); }
  if (gameId === 'arithmetics' && perfect && feats.perItem > 0) best('calcRate', 60 / feats.perItem);
  if (gameId === 'numbers') best('numCombo', feats.combo);
  if (gameId === 'guess_who' && perfect && feats.perItem > 0) best('gwRate', 60 / feats.perItem);
  if (gameId === 'geometry') best('geoMin', feats.minAccuracy);
  if (gameId === 'encyclopedia') {
    s.encRight = (s.encRight || 0) + (Number(feats.right) || 0);
    if (feats.units) s.flags[`units_${feats.units}`] = 1;
  }
  if (gameId === 'roadblocks') s.rbShortest = (s.rbShortest || 0) + (Number(feats.shortest) || 0);
}

// A training result (the events of recordTraining) and its score.
export function noteTraining(profile, events, score = 0, now = new Date()) {
  const s = ensureStats(profile);
  if (events?.regained?.length) s.flags.regained = 1;
  if (events && !events.noEffect && events.step) {
    const passed = events.step.kind === 'up', session = profile.training;
    s.winRun = passed ? (s.winRun || 0) + 1 : 0;
    s.bestWinRun = Math.max(s.bestWinRun || 0, s.winRun);
    if (passed && events.step.up > 1 && score >= 1.5 * events.step.up) s.bigWins = (s.bigWins || 0) + 1;
    if (session && !passed) session.missed = true;
    if (events.complete !== undefined && session && !session.missed) s.perfectTrainings = (s.perfectTrainings || 0) + 1;
  }
  if (events?.complete !== undefined) {
    const hour = now.getHours();
    if (hour < 8) s.flags.early = 1;
    if (hour >= 22) s.flags.night = 1;
  }
}

// ---------------------------------------------------------------- values
const dayNumber = date => Math.round(Date.parse(`${date}T12:00:00Z`) / 86400000);

// Days in a row with a finished training up to today; a streak that ended yesterday is still alive today.
export function currentStreak(profile, today = localDate()) {
  const days = new Set((profile.history || []).map(item => item.date).filter(Boolean).map(dayNumber));
  let d = dayNumber(today), n = 0;
  const trainedToday = days.has(d);
  if (!trainedToday) d -= 1;
  while (days.has(d)) { n++; d--; }
  return {days: n, today: trainedToday};
}

export function context(profile, config) {
  const s = ensureStats(profile);
  const dates = [...new Set(profile.history.map(item => item.date).filter(Boolean))].sort();
  const nums = dates.map(dayNumber);
  let best = nums.length ? 1 : 0, run = best, weekend = 0;
  for (let i = 1; i < nums.length; i++) {
    run = nums[i] - nums[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const set = new Set(nums);
  for (const date of dates) if (new Date(`${date}T12:00:00`).getDay() === 6 && set.has(dayNumber(date) + 1)) weekend = 1;
  const perDay = {};
  for (const item of profile.history) perDay[item.date] = (perDay[item.date] || 0) + 1;
  const played = new Set([...Object.keys(profile.highScores || {}), ...Object.keys(profile.bestByDiff || {})].filter(id => TRAINING_ORDER.includes(id)));
  const tests = profile.tests || [];
  const detailed = tests.filter(test => test.version >= 2 && test.items?.length);
  const bestRank = Math.max(0, ...indexHistory(tests, config).map(state => state.rank));
  const index = testIndex(profile, config);
  let weakSpot = 0;
  for (let i = 1; i < detailed.length; i++) {
    const weakest = [...detailed[i - 1].items].sort((a, b) => a.mark - b.mark)[0];
    const now = detailed[i].items.find(item => item.game === weakest?.game);
    if (weakest && now && now.mark - weakest.mark >= 1000) weakSpot = 1;
  }
  // v3.2 kept only a flag for a flawless game: it counts as the easy level.
  const flawless = Object.fromEntries(TRAINING_ORDER.map(id => [id, Math.max(s.flawless[id] || 0, s.flags[`feat_${id}`] ? 1 : 0)]));
  return {
    flags: s.flags, games: s.games, points: s.points, records: s.records, hints: s.hints,
    encRight: s.encRight || 0, unitSystems: Object.keys(s.flags).filter(k => k.startsWith('units_')).length,
    flawless, best: s.best, rbShortest: s.rbShortest || 0, bigWins: s.bigWins || 0, bestWinRun: s.bestWinRun || 0, perfectTrainings: s.perfectTrainings || 0,
    perfectGames: Object.keys(s.perfect).length, maxGamesPerDay: s.maxDay || 0,
    trainings: profile.history.length, bestStreak: best, weekend, maxTrainingsPerDay: Math.max(0, ...Object.values(perDay)),
    played: played.size, open: (profile.unlockedGames || []).length, promotions: profile.promotions || 0,
    hardGames: TRAINING_ORDER.filter(id => (Number(profile.progress?.[id]?.maxDifficulty) || Number(profile.progress?.[id]?.difficulty) || 0) >= 2).length,
    champions: Object.values(GAME_IDS).filter(id => profile.awards.includes(`best_${id}`)).length,
    tests: tests.length, bestRank,
    growth: tests.length >= 2 && index.value !== null ? Math.max(0, Math.floor(index.value - tests[0].bm)) : 0,
    allRound: detailed.some(test => test.items.length >= 5 && test.items.every(item => item.mark >= 5000)) ? 1 : 0,
    topMark: detailed.some(test => test.items.some(item => item.mark >= 9000)) ? 1 : 0,
    weakSpot, precise: index.tests >= 3 && index.plusMinus <= 5 ? 1 : 0,
    facts: openedFacts(profile, config?.factsTotal ?? Infinity).length,
  };
}

// Progress of one goal: the next step to earn (or the last one), its goal and the share done.
export function progressOf(a, c, profile) {
  const value = Math.max(0, Number(a.value(c)) || 0);
  if (!a.tiers) return {value, goal: a.goal, tier: null, earnedTiers: profile.achievements[a.id] ? 1 : 0, done: Boolean(profile.achievements[a.id]), share: Math.min(1, value / a.goal)};
  const earnedTiers = a.tiers.filter((_, tier) => profile.achievements[`${a.id}:${tier}`]).length;
  const next = Math.min(earnedTiers, a.tiers.length - 1);
  return {value, goal: a.tiers[next], tier: next, earnedTiers, done: earnedTiers === a.tiers.length, share: Math.min(1, value / a.tiers[next])};
}

// Marks the goals reached now; returns the new steps [{a, tier, key, goal}] (silent: no list, for migration).
export function checkAchievements(profile, config, now = Date.now()) {
  ensureStats(profile);
  const c = context(profile, config), earned = [];
  for (const step of STEPS) {
    if (profile.achievements[step.key]) continue;
    if ((Number(step.a.value(c)) || 0) >= step.goal) { profile.achievements[step.key] = now; earned.push(step); }
  }
  return earned;
}

// A thing the player did outside a game (watched an example, read a help sheet): kept as a flag, awarded at the next check.
export function noteFlag(profile, name) { ensureStats(profile).flags[name] = 1; }

export const earnedCount = profile => STEPS.filter(step => profile.achievements?.[step.key]).length;
