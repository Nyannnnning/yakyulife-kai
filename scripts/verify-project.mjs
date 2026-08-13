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
assert.equal(evaluate('Object.keys(ACHIEVEMENTS).length'), 22, 'historical achievement/mark count changed unexpectedly');
assert.deepEqual(
  Array.from(evaluate('JSON.parse(JSON.stringify(TIER_TH))').CPBL),
  [12000, 7000, 4300, 2100],
  'career tier thresholds changed unexpectedly',
);

for (const name of ['newState', 'ovr', 'simSeason', 'injuryProb', 'startYear', 'phaseHistory', 'historyCollapse1999', 'resolveCollapse1999', 'phaseOverseasHistory', 'overseasEventFor', 'playerStanding', 'unlockAchievement', 'achievementScore', 'declineDrugFlow', 'declineDrugTemptation', 'd20Check', 'annualDevelopmentPlan', 'developmentSeasonReview', 'intlEventForYear', 'intlSelectionProfile', 'maybeBeefNoodleReturn', 'phaseEnd', 'movement', 'endGame']) {
  assert.equal(evaluate(`typeof ${name}`), 'function', `missing core function ${name}`);
}

assert.doesNotMatch(game, /\b(?:HS|U)_CUPS\b/, 'legacy amateur tournament constants must not return');
assert.deepEqual(Array.from(evaluate(`(() => {
  seedInit('first-year-season-regression');
  S = newState('First Year', 'P', null);
  S.stage = 'HS'; S.year = 1990; S.age = 16; S.seasonFactor = 1;
  stepQ = [() => {}]; amateurSeason();
  const highSchoolLogs = S.log.length;

  seedInit('university-season-regression');
  S = newState('University', 'IF', null);
  S.stage = 'U'; S.year = 1995; S.age = 21; S.seasonFactor = 1;
  stepQ = [() => {}]; amateurSeason();
  return [highSchoolLogs, S.log.length];
})()`)), [1, 1], 'high-school and university seasons must finish with era-specific tournaments');

assert.equal(evaluate(`(() => { seedInit('era-start'); S = newState('測試球員', 'IF', null); return S.year; })()`), 1990, 'career must start in 1990');
assert.deepEqual(Array.from(evaluate('cpblTeamsForYear(1990)')), ['兄弟巨象', '府城雄獅', '北城赤龍', '首都猛虎'], '1990 founding teams are out of sync');
assert.equal(evaluate('cpblTeamsForYear(1993).length'), 6, '1993 expansion must produce six teams');
assert.equal(evaluate('cpblTeamsForYear(1996).length'), 6, 'the whale expansion club must not enter a year early');
assert.equal(evaluate('cpblTeamsForYear(1997).length'), 7, 'the 1997 CPBL field must contain seven teams');
assert.equal(evaluate('cpblTeamsForYear(2003).length'), 6, 'the 2003 league merger must produce six teams');
assert.equal(evaluate('cpblTeamsForYear(2009).length'), 4, 'the post-2008 contraction must produce four teams');
assert.equal(evaluate('cpblTeamsForYear(2024).length'), 6, 'modern CPBL continuity must return six teams');
assert.deepEqual(Array.from(evaluate('hsCupsForYear(1990)')), ['全國青棒選拔賽', '中正盃青棒賽', '世界青棒代表權賽'], '1990 high-school events are out of sync');
assert.equal(evaluate('intlEventForYear(1992).name'), '巴塞隆納奧運', '1992 international event is missing');
assert.equal(evaluate('intlEventForYear(1992).amateurOnly'), true, 'the 1992 Olympic roster must remain amateur-only');
assert.equal(evaluate('intlEventForYear(1994).amateurOnly'), true, 'the 1994 Asian Games roster must remain amateur-only');
assert.equal(evaluate('intlEventForYear(2004).amateur'), true, 'the 2004 Olympic roster must allow elite amateur players');
assert.equal(evaluate('intlEventForYear(1995)'), null, '1995 should not create a modern international event');
assert.equal(evaluate('intlEventForYear(1996)'), null, 'Taiwan did not qualify for the 1996 Olympic baseball tournament');
assert.equal(evaluate('intlEventForYear(2000)'), null, 'Taiwan did not qualify for the 2000 Olympic baseball tournament');
assert.deepEqual(Array.from(evaluate('[d20Mod(20),d20Mod(50),d20Mod(80)]')), [-6, 0, 6], 'D20 modifiers are out of sync');
assert.deepEqual(Array.from(evaluate('[levelGames("CPBL1",1990),levelGames("CPBL1",1997),levelGames("CPBL1",2000),levelGames("CPBL1",2003),levelGames("CPBL1",2009)]')), [90,96,90,100,120], 'era-specific CPBL schedules are out of sync');
assert.deepEqual(Array.from(evaluate(`(() => {
  S = newState('十八歲測試', 'P', null); S.year=1992; S.age=18; S.stage='HS';
  Object.keys(S.ab).forEach(k=>S.ab[k]=35); const outside=intlSelectionProfile(intlEventForYear(1992)).role;
  Object.keys(S.ab).forEach(k=>S.ab[k]=40); const training=intlSelectionProfile(intlEventForYear(1992)).role;
  Object.keys(S.ab).forEach(k=>S.ab[k]=44); const noResume=intlSelectionProfile(intlEventForYear(1992)).role;
  S.traits.genius=true; const fringe=intlSelectionProfile(intlEventForYear(1992)).role;
  return [outside,training,noResume,fringe];
})()`)), ['out','training','training','fringe'], 'the 1992 teenage selection ladder is out of sync');
assert.deepEqual(Array.from(evaluate(`(() => {
  const oldR=R; R=()=>.999;
  S = newState('十八歲測試', 'P', null); S.year=1992; S.age=18; S.stage='HS'; S.seasonFactor=1;
  Object.keys(S.ab).forEach(k=>S.ab[k]=44); S.traits.genius=true; let finished=false;
  $('act').children=[]; maybeIntl(()=>{finished=true;});
  const accept=$('act').children[0]; $('act').children=[]; accept.onclick();
  const join=$('act').children[0]; $('act').children=[]; join.onclick(); R=oldR;
  return [finished,S.era.barcelonaRole,S.intlStat.G,S.intlStat.IP,S.pool,S.injNext,S.achievements.includes('barcelona_youngest')];
})()`)), [true,'fringe',1,2,2,3,true], 'the 1992 teenage fringe-roster route is not playable');
assert.deepEqual(Array.from(evaluate(`(() => { S = newState('測試球員', 'IF', null); const before = usPathOpen(); S.year = 1999; return [before, usPathOpen()]; })()`)), [false, true], 'the 1999 US-path gate is out of sync');
assert.equal(evaluate(`(() => {
  S=newState('末代球員','IF',null);S.stage='PRO';S.org='CPBL';S.lv='CPBL1';S.orgTeam='北城赤龍';S.year=1999;
  $('act').children=[];historyCollapse1999(()=>{});const stay=$('act').children[0];$('act').children=[];stay.onclick();
  return S.orgTeam==='北城赤龍'&&S.era.collapseChoice==='stay';
})()`), true, 'a 1999 founding-team player must finish the final season before reassignment');
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
  S=newState('大聯盟測試','P',null);S.stage='PRO';S.org='MiLB';S.lv='MLB';S.year=1994;
  usStrike1994(playerStanding(),()=>{});const majorStopped=S.era.us94Stop;
  S=newState('小聯盟測試','P',null);S.stage='PRO';S.org='MiLB';S.lv='A3';S.year=1994;
  usStrike1994(playerStanding(),()=>{});return [majorStopped,S.era.us94Stop];
})()`)), [true,false], 'the 1994 strike must shorten MLB, not the ongoing minor-league season');
assert.equal(evaluate(`(() => {
  const oldR=R;R=()=>.999;
  S=newState('匿名調查測試','P',null);S.stage='PRO';S.org='MiLB';S.lv='MLB';S.year=2003;S.overseasDark.ped=true;S.overseasDark.evidence=1;
  $('act').children=[];usTesting2003(playerStanding(),()=>{});const disclose=$('act').children[0];$('act').children=[];disclose.onclick();const accept=$('act').children[0];$('act').children=[];accept.onclick();R=oldR;
  return S.era.suspension===0&&S.overseasDark.ped===false;
})()`), true, 'the anonymous 2003 survey must not directly suspend a player');
assert.equal(evaluate(`(() => {
  S=newState('首次陽性測試','P',null);S.stage='PRO';S.org='MiLB';S.lv='MLB';S.year=2004;S.overseasDark.ped=true;S.overseasDark.evidence=1;S.overseasDark.years=1;
  $('act').children=[];usHits2004(playerStanding(),()=>{});const cooperate=$('act').children[0];$('act').children=[];cooperate.onclick();
  return S.era.suspension===0&&S.overseasDark.ped===false&&S.overseasDark.disclosed===true;
})()`), true, 'a first positive in the 2004 MLB policy must lead to treatment, not suspension');
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
assert.equal(evaluate(`(() => {
  const oldR=R;R=()=>.999;
  S=newState('牛肉麵測試','P',null);S.stage='PRO';S.org='CPBL';S.lv='CPBL1';S.orgTeam='兄弟巨象';S.age=34;S.year=2012;
  S.teamName=function(){return this.orgTeam;};
  S.bigInj=1;S.traits.glass=true;S.era.justFinishedRehab=true;S.era.overseasArrival.US=2001;let finished=false;
  $('act').children=[];const shown=maybeBeefNoodleReturn(()=>{finished=true;},true);const openShop=$('act').children[0];$('act').children=[];openShop.onclick();const accept=$('act').children[0];$('act').children=[];accept.onclick();R=oldR;
  return shown&&finished&&S.org==='MiLB'&&S.lv==='MLB'&&!S.traits.glass&&S.achievements.includes('beef_noodle_return');
})()`), true, 'the rare beef-noodle injury comeback route is not playable');

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
console.log('- 1992 teenage training/fringe-roster selection and amateur-era eligibility');
console.log('- playable voluntary 1996 dark-route entry');
console.log('- Japan/US historical calendars and four-level player standing');
console.log('- historically timed 1994 strike and 2003/2004 MLB drug-testing consequences');
console.log('- overseas achievements, negative career marks, decline-era PED route, and rare beef-noodle comeback');
console.log('- package version and WIKI synchronization');
