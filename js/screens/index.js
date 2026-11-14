import { renderHome } from './home.js';
import { renderTraining } from './training.js';
import { renderTest, renderTestResult } from './test.js';
import { renderGames } from './games.js';
import { renderProgress } from './progress.js';
import { renderProfile, renderAbout } from './profile.js';

// route name -> {render(app, main, restOfPath), tab}
export const SCREENS = {
  home: {render: renderHome, tab: 'home'},
  training: {render: renderTraining, tab: 'home'},
  test: {render: (app, main, rest) => (rest[0] === 'result' ? renderTestResult(app, main, rest) : renderTest(app, main)), tab: 'home'},
  games: {render: renderGames, tab: 'games'},
  progress: {render: renderProgress, tab: 'progress'},
  profile: {render: renderProfile, tab: 'profile'},
  about: {render: renderAbout, tab: 'profile'},
};
