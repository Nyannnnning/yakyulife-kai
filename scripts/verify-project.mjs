import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [html, css, game, wiki, packageText] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../styles/game.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/game.js', import.meta.url), 'utf8'),
  readFile(new URL('../YaKyoLife-WIKI.md', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
]);
const packageInfo = JSON.parse(packageText);

function elementStub() {
  const classes = new Set();
  return {
    style: {},
    dataset: {},
    children: [],
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    open: false,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const next = force === undefined ? !classes.has(name) : Boolean(force);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    remove() {},
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
    addEventListener() {},
    querySelector: () => elementStub(),
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ height: 0, top: 0 }),
    animate: () => ({ cancel() {}, onfinish: null }),
  };
}

const elements = new Map();
const byId = (id) => {
  if (!elements.has(id)) elements.set(id, elementStub());
  return elements.get(id);
};
const documentStub = {
  body: elementStub(),
  head: elementStub(),
  documentElement: elementStub(),
  getElementById: byId,
  createElement: () => elementStub(),
  createDocumentFragment: () => elementStub(),
  querySelector: () => elementStub(),
  querySelectorAll: () => [],
  addEventListener() {},
};
const mediaStub = { matches: false, addEventListener() {}, removeEventListener() {} };
const locationStub = {
  search: '?seed=verification',
  protocol: 'file:',
  origin: 'file://',
  pathname: '/index.html',
  href: 'file:///index.html?seed=verification',
};
const localStorageStub = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
const windowStub = {
  addEventListener() {},
  scrollTo() {},
  matchMedia: () => mediaStub,
};

const sandbox = vm.createContext({
  console,
  document: documentStub,
  window: windowStub,
  location: locationStub,
  history: { replaceState() {} },
  localStorage: localStorageStub,
  navigator: {},
  matchMedia: () => mediaStub,
  getComputedStyle: () => ({ getPropertyValue: () => '', display: 'block' }),
  requestAnimationFrame: (callback) => callback(),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URL,
  URLSearchParams,
  Blob,
});

assert.match(html, /<link rel="stylesheet" href="styles\/game\.css">/, 'index.html must load the extracted stylesheet');
assert.match(html, /<script src="src\/game\.js"><\/script>/, 'index.html must load the extracted game script');
assert.doesNotMatch(html, /<style>/, 'inline CSS should not return to index.html');
assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/, 'inline JavaScript should not return to index.html');
assert.ok(css.length > 20_000, 'stylesheet looks unexpectedly small');
assert.ok(game.length > 180_000, 'game script looks unexpectedly small');

for (const id of ['start', 'btn-start', 'seed-show', 'board', 'log', 'act', 'modal']) {
  assert.match(html, new RegExp(`id="${id}"`), `missing required UI element #${id}`);
}

new vm.Script(game, { filename: 'src/game.js' }).runInContext(sandbox);

const evaluate = (source) => vm.runInContext(source, sandbox);
assert.equal(evaluate('APP_VER'), `v${packageInfo.version}`, 'package and game versions must match');
assert.equal(evaluate('EVENTS.length'), 17, 'event-card count changed unexpectedly');
assert.equal(evaluate('TRAIT_KEYS.pos.length + TRAIT_KEYS.neg.length'), 27, 'trait registry count changed unexpectedly');
assert.equal(evaluate('Object.keys(ACHIEVEMENTS).length'), 20, 'historical achievement/mark count changed unexpectedly');
assert.deepEqual(
  Array.from(evaluate('JSON.parse(JSON.stringify(TIER_TH))').CPBL),
  [12000, 7000, 4300, 2100],
  'career tier thresholds changed unexpectedly',
);

for (const name of ['newState', 'ovr', 'simSeason', 'injuryProb', 'startYear', 'phaseHistory', 'phaseOverseasHistory', 'overseasEventFor', 'playerStanding', 'unlockAchievement', 'achievementScore', 'declineDrugFlow', 'declineDrugTemptation', 'd20Check', 'annualDevelopmentPlan', 'developmentSeasonReview', 'intlEventForYear', 'phaseEnd', 'movement', 'endGame']) {
  assert.equal(evaluate(`typeof ${name}`), 'function', `missing core function ${name}`);
}

assert.equal(evaluate(`(() => { seedInit('era-start'); S = newState('測試球員', 'IF', null); return S.year; })()`), 1990, 'career must start in 1990');
assert.deepEqual(Array.from(evaluate('cpblTeamsForYear(1990)')), ['兄弟巨象', '府城雄獅', '北城赤龍', '首都猛虎'], '1990 founding teams are out of sync');
assert.equal(evaluate('cpblTeamsForYear(1993).length'), 6, '1993 expansion must produce six teams');
assert.equal(evaluate('cpblTeamsForYear(2024).length'), 6, 'modern CPBL continuity must return six teams');
assert.deepEqual(Array.from(evaluate('hsCupsForYear(1990)')), ['全國青棒選拔賽', '中正盃青棒賽', '世界青棒代表權賽'], '1990 high-school events are out of sync');
assert.equal(evaluate('intlEventForYear(1992).name'), '巴塞隆納奧運', '1992 international event is missing');
assert.equal(evaluate('intlEventForYear(1995)'), null, '1995 should not create a modern international event');
assert.equal(evaluate('intlEventForYear(1996)'), null, 'Taiwan did not qualify for the 1996 Olympic baseball tournament');
assert.equal(evaluate('intlEventForYear(2000)'), null, 'Taiwan did not qualify for the 2000 Olympic baseball tournament');
assert.deepEqual(Array.from(evaluate('[d20Mod(20),d20Mod(50),d20Mod(80)]')), [-6, 0, 6], 'D20 modifiers are out of sync');
assert.deepEqual(Array.from(evaluate('[levelGames("CPBL1",1990),levelGames("CPBL1",1997),levelGames("CPBL1",2000)]')), [90, 96, 120], 'era-specific CPBL schedules are out of sync');
assert.deepEqual(Array.from(evaluate(`(() => { S = newState('測試球員', 'IF', null); const before = usPathOpen(); S.year = 1999; return [before, usPathOpen()]; })()`)), [false, true], 'the 1999 US-path gate is out of sync');
assert.deepEqual(
  Array.from(evaluate(`[
    [1993,1995,1996,1998,2001,2004].filter(y=>overseasEventFor('JP',y)).length,
    [1994,1995,1997,1998,2001,2003,2004].filter(y=>overseasEventFor('US',y)).length,
    overseasEventFor('JP',2004).name,
    overseasEventFor('US',1998).name
  ]`)),
  [6, 7, 'jpStrike2004', 'usPower1998'],
  'the Japan/US historical-event calendar is out of sync',
);
assert.deepEqual(Array.from(evaluate(`(() => {
  S = newState('測試球員', 'IF', null); S.stage='PRO'; S.org='CPBL'; S.orgTeam='兄弟巨象'; S.lv='CPBL2';
  const fringe=playerStanding().key;
  S.lv='CPBL1'; Object.keys(S.ab).forEach(k=>S.ab[k]=75); S.lastD=6;
  S.honors=['1999 中職年度MVP','1999 中職明星賽']; S.year=2000;
  return [fringe,playerStanding().key];
})()`)), ['fringe', 'icon'], 'player standing must distinguish a roster fringe player from a league icon');
assert.deepEqual(Array.from(evaluate(`(() => {
  S = newState('測試球員', 'IF', null); S.stage='PRO'; S.org='NPB'; S.orgTeam='橫濱海星'; S.lv='NPB2'; S.year=1998;
  $('act').children=[]; jpArrival(playerStanding(),()=>{}); const fringeOptions=$('act').children.length;
  S.lv='NPB1'; Object.keys(S.ab).forEach(k=>S.ab[k]=75); S.lastD=6; S.honors=['1997 日職年度MVP','1997 日職明星賽'];
  $('act').children=[]; jpArrival(playerStanding(),()=>{}); return [fringeOptions,$('act').children.length];
})()`)), [2, 3], 'overseas dialogue options must expand when the player becomes a star/icon');
assert.equal(evaluate(`(() => {
  const fns=[['jpFreeAgency1993',jpFreeAgency1993],['jpNomo1995',jpNomo1995],['jpWorkload1996',jpWorkload1996],['jpBay1998',jpBay1998],['jpIchiro2001',jpIchiro2001],['jpStrike2004',jpStrike2004],['usStrike1994',usStrike1994],['usNomo1995',usNomo1995],['usInterleague1997',usInterleague1997],['usPower1998',usPower1998],['usSeptember2001',usSeptember2001],['usTesting2003',usTesting2003],['usHits2004',usHits2004]];
  for(const [name,fn] of fns){
    S=newState('測試球員','IF',null);S.stage='PRO';S.org=name.startsWith('jp')?'NPB':'MiLB';S.lv=name.startsWith('jp')?'NPB1':'MLB';S.orgTeam=name==='jpBay1998'?'橫濱海星':'測試球隊';S.year=2004;
    $('act').children=[];fn(playerStanding(),()=>{});if($('act').children.length<1)return name;
  } return 'ok';
})()`), 'ok', 'every Japan/US historical event must present at least one playable choice');
assert.deepEqual(Array.from(evaluate(`(() => {
  S = newState('測試球員', 'IF', null);
  S.achievements=['us_clean','decline_shadow'];
  return [achievementScore('MLB'),achievementScore('NPB')];
})()`)), [-40, -260], 'positive achievements and negative career marks must affect evaluation');
assert.equal(evaluate(`(() => {
  seedInit('decline-drug-choice'); S = newState('測試球員', 'IF', null);
  S.stage='PRO'; S.org='CPBL'; S.orgTeam='兄弟巨象'; S.lv='CPBL1'; S.age=36; S.year=2010;
  S.achievements=['decline_clean']; S.achievementLog.decline_clean={year:2009,standing:'一軍主力'};
  $('act').children=[]; declineDrugTemptation(playerStanding(),5,()=>{});
  if($('act').children.length!==3)return false;
  $('act').children[2].onclick();
  return S.overseasDark.ped===true && S.overseasDark.evidence===1 && S.achievements.includes('decline_shadow') && !S.achievements.includes('decline_clean');
})()`), true, 'declining veterans must be able to voluntarily enter the PED route');
assert.equal(evaluate(`(() => {
  seedInit('dark-route');
  S = newState('測試球員', 'IF', null);
  S.year = 1996;
  S.stage = 'PRO';
  S.org = 'CPBL';
  S.lv = 'CPBL1';
  S.orgTeam = '兄弟巨象';
  $('act').children = [];
  stepQ = [() => {}];
  phaseHistory();
  if ($('act').children.length !== 3) return false;
  $('act').children[0].onclick();
  return S.dark.involved === 1 && S.dark.money === 80 && S.salary === 80;
})()`), true, 'the voluntary 1996 dark-route choice is not playable');

for (const position of ['P', 'C', 'IF', 'OF']) {
  const repeatable = evaluate(`(() => {
    seedInit('repeatable-${position}');
    const first = newState('測試球員', '${position}', null);
    seedInit('repeatable-${position}');
    const second = newState('測試球員', '${position}', null);
    return JSON.stringify(first) === JSON.stringify(second);
  })()`);
  assert.equal(repeatable, true, `${position} creation is no longer deterministic`);

  const valid = evaluate(`(() => {
    for (let i = 0; i < 250; i++) {
      seedInit('${position}-' + i);
      S = newState('測試球員', '${position}', null);
      const values = Object.values(S.ab).concat(Object.values(S.pot));
      if (values.some((value) => value < 1 || value > 80)) return false;
      const overall = ovr();
      if (!Number.isFinite(overall) || overall < 1 || overall > 80) return false;
    }
    return true;
  })()`);
  assert.equal(valid, true, `${position} generated an invalid ability or overall rating`);
}

assert.equal(evaluate(`(() => {
  seedInit('injury-baseline');
  S = newState('測試球員', 'P', null);
  S.injNext = 0;
  S.tmpInj = 0;
  return injuryProb();
})()`), 15, 'baseline injury probability should be 15%');

assert.match(wiki, /基礎受傷率 15%/, 'WIKI injury baseline is out of sync');
assert.match(wiki, /事件卡一覽（共 17 張）/, 'WIKI event-card count is out of sync');
assert.match(wiki, /隱藏特性一覽（共 27 種）/, 'WIKI trait count is out of sync');

console.log('YaKyoLife verification passed:');
console.log('- HTML/CSS/JavaScript structure');
console.log('- JavaScript boot in a minimal browser environment');
console.log('- deterministic player generation (1,000 generated players)');
console.log('- core registries, thresholds, ratings, and injury baseline');
console.log('- 1990s teams, schedules, tournaments, international calendar, and D20 modifiers');
console.log('- playable voluntary 1996 dark-route entry');
console.log('- Japan/US historical calendars and four-level player standing');
console.log('- overseas achievements, negative career marks, and voluntary decline-era PED route');
console.log('- package version and WIKI synchronization');
