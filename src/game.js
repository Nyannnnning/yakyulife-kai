/* ================= RNG（種子化） ================= */
let SEED = new URLSearchParams(location.search).get('seed') || Math.random().toString(36).slice(2,10);
let _s = 0;
function seedInit(str){ _s = 1779033703; for(let i=0;i<str.length;i++){ _s = Math.imul(_s ^ str.charCodeAt(i), 3432918353); _s = _s<<13 | _s>>>19; } }
function R(){ _s|=0; _s = _s + 0x6D2B79F5 |0; let t = Math.imul(_s ^ _s>>>15, 1|_s); t = t + Math.imul(t ^ t>>>7, 61|t) ^ t; return ((t ^ t>>>14)>>>0)/4294967296; }
const ri=(a,b)=>a+Math.floor(R()*(b-a+1));
const pick=a=>a[Math.floor(R()*a.length)];
const chance=p=>R()*100<p;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function scrollBottom(){ /* iOS Safari 於 iframe 內平滑滾動易觸發白畫面,改用同步滾動+rAF */
  try{ requestAnimationFrame(function(){ window.scrollTo(0, document.body.scrollHeight); }); }
  catch(e){ try{ window.scrollTo(0, document.body.scrollHeight); }catch(_){} }
}
const N0=(sd)=> (R()+R()+R()+R()-2)/2*sd*2; /* 近似常態 */

/* ================= 靜態資料 ================= */
const ABL={sta:'體力',vel:'球速',ctl:'控球',brk:'變化球',con:'Contact',pow:'力量',spd:'速度',eye:'選球',rng:'守備範圍',fld:'接球',arm:'臂力',cat:'配球'};
const POS_AB={P:['sta','vel','ctl','brk'],C:['sta','con','pow','spd','eye','rng','fld','arm','cat'],IF:['sta','con','pow','spd','eye','rng','fld','arm'],OF:['sta','con','pow','spd','eye','rng','fld','arm']};
const POSN={P:'投手',C:'捕手',IF:'內野手',OF:'外野手'};
/* ---------- 守位系統 ---------- */
const DPN={SS:'游擊手','2B':'二壘手','3B':'三壘手','1B':'一壘手',
 CF:'中外野手',RF:'右外野手',LF:'左外野手',DH:'指定打擊',C:'捕手'};
/* 每個守位對 範圍/接球/臂力 各有自己的門檻(相對聯盟基準的位移)
   例:三壘不需要游擊等級的範圍,一壘的臂力幾乎不看 */
/* 各守位守備分公式:依守位看重不同能力(回傳一個綜合守備分) */
function dpScore(p){ const a=S.ab;
  switch(p){
    case 'SS': return a.rng*0.5 + a.fld*0.3 + a.arm*0.2;   /* 游擊:範圍主導 */
    case '2B': return a.rng*0.45+ a.fld*0.4 + a.arm*0.15;  /* 二壘:範圍+守備,臂力次要 */
    case '3B': return a.arm*0.45+ a.fld*0.35+ a.rng*0.2;   /* 三壘:臂力主導 */
    case 'CF': return a.rng*0.55+ a.fld*0.3 + a.arm*0.15;  /* 中外野:範圍主導 */
    case 'RF': return a.arm*0.45+ a.rng*0.35+ a.fld*0.2;   /* 右外野:強臂 */
    case 'LF': return a.rng*0.4 + a.fld*0.35+ a.arm*0.25;  /* 左外野:範圍為主,要求低 */
    case 'C':  return a.fld*0.4 + a.cat*0.4 + a.arm*0.2;   /* 捕手:接球+配球+臂力,不看範圍 */
    case '1B': return a.fld*0.6 + a.rng*0.2 + a.arm*0.2;   /* 一壘:守備為主,門檻低 */
    default: return 99;
  }
}
/* 各守位 × 各聯盟 守備門檻(守備分需 >= 此值才守得動);大聯盟最嚴 */
const DP_TH={
  C:  {CPBL1:46, NPB1:54, MLB:60},
  SS: {CPBL1:50, NPB1:58, MLB:64},
  CF: {CPBL1:49, NPB1:57, MLB:63},
  '2B':{CPBL1:46,NPB1:53, MLB:59},
  '3B':{CPBL1:44,NPB1:51, MLB:57},
  RF: {CPBL1:43, NPB1:50, MLB:56},
  LF: {CPBL1:41, NPB1:47, MLB:53},
  '1B':{CPBL1:36,NPB1:42, MLB:48}};
const DP_BAR={CPBL1:45,NPB1:54,MLB:60}; /* 保留給捕手 cOk 等舊判定 */
const DP_MULT={SS:1.15,CF:1.15,C:1.12,'2B':1.05,'3B':1.05,RF:1.05,'1B':1.0,LF:1.0,DH:0.92};
function dpBar(){ /* 年輕球員吃潛力紅利,球團不急著拔守位 */
  const base=DP_BAR[S.lv]||0;
  const disc=S.age<=21?7:S.age<=24?5:S.age<=26?2:0;
  return base-disc;
}
function dpQual(p){
  if(p==='DH')return true;
  if(!DP_TH[p]||!DP_TH[p][S.lv])return true;   /* 非頂級聯盟不設限 */
  /* 年輕球員吃潛力紅利:門檻略降(球團給時間成長) */
  const youthAdj = S.age<24?-3 : S.age<26?-1.5 : 0;
  return dpScore(p) >= DP_TH[p][S.lv]+youthAdj;
}
const DP_RANK={SS:0,CF:0,'2B':1,'3B':2,RF:2,'1B':3,LF:3,DH:4,C:0}; /* 守位身價階層(SS>2B>3B) */
function dpList(){ /* 依守位難度掃描:內野手守內野序、外野手守外野序,選出守得動的(最高階在前) */
  /* 候選守位依當前守位群:內野走內野光譜、外野走外野光譜 */
  const order = S.pos==='IF'
    ? ['SS','2B','3B','1B']       /* 內野:游擊>二壘>三壘>一壘 */
    : ['CF','RF','LF','1B'];      /* 外野:中外野>右外野>左外野>(一壘) */
  const q=order.filter(dpQual); q.push('DH'); return q;
}
function dpMult(){ return (S.pos!=='P'&&S.dpos)?(DP_MULT[S.dpos]||1):1; }
function dposReview(cont){
  if(S.stage!=='PRO'||!(S.lv==='CPBL1'||S.lv==='NPB1'||S.lv==='MLB')){ cont(); return; }
  if(S.pos==='C'){ /* 捕手容忍度高,但爛到底也會被移去一壘或DH */
    if(!S.dpos)S.dpos='C';
    const cOk=()=>{ const bar=dpBar(), a=S.ab;
      return a.fld>=bar-6 && a.cat>=bar-4 && a.arm>=bar-2; };
    if(S.dpos==='C'){
      if(cOk()){ cont(); return; }
      const opts=[];
      if(dpQual('1B'))opts.push({t:'移防 一壘手',main:true,s:'薪資係數 ×1.00',
        f:()=>{S.dpos='1B';card('info','守位調整','捕手裝備收進置物櫃——新球季改守<b class="hl">一壘</b>。');cont();}});
      opts.push({t:'轉任 指定打擊',main:!opts.length,s:'薪資係數 ×0.92',
        f:()=>{S.dpos='DH';card('info','守位調整','阻殺率成了聯盟笑話，球團決定讓你專心打擊——<b class="hl">DH</b>。');cont();}});
      choose(`守位會議：教練團已經不敢讓你蹲捕（${LV[S.lv].n}標準）`,opts); return;
    }
    if(cOk()){ /* 守備練回來了,可以回鍋蹲捕 */
      choose('守位會議：牛棚捕手回報你的接捕又行了',[
        {t:'重披捕手裝備',main:true,s:'薪資係數 ×1.12',
         f:()=>{S.dpos='C';card('good','守位調整','面罩戴回來——新球季重新登錄為<b class="hl">捕手</b>。');cont();}},
        {t:'維持現狀',f:()=>cont()}]); return; }
    if(S.dpos==='1B'&&!dpQual('1B')){ S.dpos='DH';
      card('info','守位調整','連一壘都站不住了，新球季登錄為<b class="hl">指定打擊</b>。'); }
    cont(); return; }
  if(S.pos==='P'){ /* 體力決定投手類型;牛棚→先發需玩家同意,先發→牛棚仍自動 */
    const nr=pitcherRole(), old=S.role;
    if((old==='MR'||old==='CL')&&nr==='SP'){
      /* 後援投手體力練上先發線:球團徵詢,不強制轉 */
      choose('球團徵詢：你的體力已達先發水準，要轉任先發嗎？',[
        {t:'轉任先發，扛起輪值',main:true,f:()=>{ S.role='SP';
          card('info','定位調整',`你點頭接下先發任務。新球季起，你是輪值的一員——<b class="hl">先發</b>。`); cont(); }},
        {t:'留在牛棚，守住我的位置',s:'維持'+roleN(old)+'定位',f:()=>{ S.role=old;
          card('info','留守牛棚',`你婉拒了教練團的提議——永遠準備待命，在球隊最需要我的時候，登板救火。`); cont(); }}]);
      return;
    }
    S.role=nr;
    if(old&&old!==nr){
      card('info','定位調整',`球團季末評估你的體力狀況，新球季將你的角色調整為 <b class="hl">${roleN(nr)}</b>。`); }
    else if(!old){
      card('info','投手定位',`教練團評估你的體力，將你登錄為 <b class="hl">${roleN(nr)}</b>。`); }
    cont(); return;
  }
  const q=dpList();
  if(!S.dpos){ S.dpos=q[0];
    card('info','守位登錄',`教練團評估守備工具後，將你登錄為 <b class="hl">${DPN[S.dpos]}</b>。`); cont(); return; }
  if(dpQual(S.dpos)){
    const best=q[0];
    if(DP_RANK[best]<DP_RANK[S.dpos]){ /* 更高身價守位站得住了 */
      choose(`守位會議：教練團想把你推上更吃重的位置`,[
        {t:`升防 ${DPN[best]}`,main:true,s:`薪資係數 ×${(DP_MULT[best]||1).toFixed(2)}`,
         f:()=>{S.dpos=best;card('good','守位調整',`守備數據說服了所有人——新球季改守 <b class="hl">${DPN[best]}</b>。`);cont();}},
        {t:`留守 ${DPN[S.dpos]}`,f:()=>cont()}]); return; }
    cont(); return; }
  const opts=q.slice(0,2).map((p,i)=>({t:`移防 ${DPN[p]}`,main:i===0,
    s:p==='DH'?'守備已無處可站｜薪資係數 ×0.92':`薪資係數 ×${(DP_MULT[p]||1).toFixed(2)}`,
    f:()=>{ S.dpos=p; card('info','守位調整',`球團季末評估後，新球季改守 <b class="hl">${DPN[p]}</b>。`); cont(); }}));
  choose(`守位會議：教練團認為你的守備已撐不住 ${DPN[S.dpos]}（${LV[S.lv].n}標準）`,opts);
}
const APP_VER='v1.6.2';
const TEAM_COLOR={
  /* 中職 */
  '兄弟巨象':'#ffd800','府城雄獅':'#ff7f00','北城赤龍':'#c8102e','首都猛虎':'#1a7a3a','華報飛鷹':'#7a263a','中州棕熊':'#6f4e37','中州公牛':'#264653','海灣巨鯨':'#246bce',
  '北都烈陽':'#f06d22','中州金剛':'#8b1a1a','嘉南戰士':'#3857a6','南方雷霆':'#6a3fa0',
  '台中猛瑪':'#ffd800','桃園金剛':'#8b1a1a','新北騎士':'#003f87','台北恐龍':'#c8102e','高雄神鵰':'#1a7a3a',
  /* 日職 */
  '東京大人':'#f97709','阪神猛虎':'#ffe201','橫濱海星':'#0a3ce0','廣島紅鯉':'#e60012','神宮飛燕':'#0a7bc2','名古屋神龍':'#003a70','福岡猛禽':'#f5c400','北海道培根':'#0a2d5c','千葉海潮':'#111111','仙台金梟':'#8b0000','大阪蠻牛':'#0033a0','埼玉雄獅':'#1268b3',
  /* 大聯盟 */
  '洛城藍電':'#005A9C',   '聖港修士':'#2F241D', 
  '灣區大人':'#FD5A1E',
  '紐約帝國':'#0C2340', 
  '波士頓襪王':'#BD3039',
  '紐約大蘋果':'#FF5910',
  '費城鐵魂':'#E81828',
  '亞城戰斧':'#13274F',
  '風城幼熊':'#0E3386',
  '河濱緋雀':'#C41E3A',
  '星港火箭':'#EB6E1F',
  '孤星騎兵':'#003278',
  '翡翠水兵':'#005C5C', 
  '洛城神使':'#BA0021',
  '楓葉藍鴉':'#134A8E',
  '快船金鷗':'#DF4601',
  '海灣雷射':'#092C5C', 
  '森林悍將':'#E31937',
  '汽車城猛虎':'#0C2340',
  '北星雙塔':'#002B5C',
  '風城襪王':'#27251F',
  '向日葵王室':'#174885',
  '競技者':'#003831',
  '奶油杜康':'#FFC52F',
  '鋼鐵船長':'#FDB827',
  '魔法魚人':'#00A3E0',
  '首都人民':'#AB0003',
  '沙漠眼鏡蛇':'#A71930',
  '黛紫高原':'#33006F',
  '女王城紅軍':'#C6011F'
};
/* Team colours are jersey primaries, not text colours. Measured against the old #1a1a1a chip
   background, 29 of the 48 fell below 3:1 and 紐約帝國 (#0C2340) sat at 1.10:1, which is what
   players reported as too dark to read. Use the colour as the chip's background instead and
   pick the text from its luminance: that keeps the team identity at full saturation and puts
   every one of the 48 above 4.5:1. The border is the text colour at low alpha so a dark team
   still reads as a chip against a dark card. */
function teamChip(hex){
  const h=hex.replace('#','');
  const v=[0,2,4].map(i=>{ const c=parseInt(h.slice(i,i+2),16)/255;
    return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4); });
  const L=.2126*v[0]+.7152*v[1]+.0722*v[2];
  const dark=(L+.05)/.05 > 1.05/(L+.05); /* black text out-contrasts white on this colour */
  return {bg:hex,fg:dark?'#000000':'#ffffff',bd:dark?'rgba(0,0,0,.4)':'rgba(255,255,255,.45)'};
}
const CPBL_TEAMS=['兄弟巨象','府城雄獅','桃園金剛','新北騎士','台北恐龍','高雄神鵰'];
const RIVAL_TEAMS=['北都烈陽','中州金剛','嘉南戰士','南方雷霆'];
function cpblTeamsForYear(y){
  if(y<=1992)return ['兄弟巨象','府城雄獅','北城赤龍','首都猛虎'];
  if(y<=1995)return ['兄弟巨象','府城雄獅','北城赤龍','首都猛虎','華報飛鷹','中州棕熊'];
  if(y===1996)return ['兄弟巨象','府城雄獅','北城赤龍','首都猛虎','華報飛鷹','中州公牛'];
  if(y===1997)return ['兄弟巨象','府城雄獅','北城赤龍','首都猛虎','華報飛鷹','中州公牛','海灣巨鯨'];
  if(y===1998)return ['兄弟巨象','府城雄獅','北城赤龍','首都猛虎','中州公牛','海灣巨鯨'];
  if(y===1999)return ['兄弟巨象','府城雄獅','北城赤龍','首都猛虎','中州公牛','海灣巨鯨'];
  if(y<=2002)return ['兄弟巨象','府城雄獅','中州公牛','海灣巨鯨'];
  if(y<=2008)return ['兄弟巨象','府城雄獅','中州公牛','海灣巨鯨','北都烈陽','中州金剛'];
  if(y<=2012)return ['兄弟巨象','府城雄獅','中州公牛','桃園金剛'];
  if(y<=2020)return ['兄弟巨象','府城雄獅','桃園金剛','新北騎士'];
  if(y<=2023)return ['兄弟巨象','府城雄獅','桃園金剛','新北騎士','台北恐龍'];
  return CPBL_TEAMS.slice();
}
const NPB_TEAMS=['東京大人','阪神猛虎','橫濱海星','廣島紅鯉','神宮飛燕','名古屋神龍','福岡猛禽','北海道培根','千葉海潮','仙台金梟','大阪蠻牛','埼玉雄獅'];
const MLB_TEAMS=['洛城藍電','聖港修士','灣區大人','紐約帝國','波士頓襪王','紐約大蘋果','費城鐵魂','亞城戰斧','風城幼熊','河濱緋雀','星港火箭','孤星騎兵','翡翠水兵','洛城神使','楓葉藍鴉','快船金鷗','海灣雷射','森林悍將','汽車城猛虎','北星雙塔','風城襪王','向日葵王室','競技者','奶油杜康','鋼鐵船長','魔法魚人','首都人民','沙漠眼鏡蛇','黛紫高原','女王城紅軍'];
/* par=該層級平均水準, min=最低限度(低於→降級/戰力外), g=球季場次 */
const LV={
 CPBL2:{n:'中職二軍',par:34,min:30,g:80, org:'CPBL'},
 CPBL1:{n:'中職一軍',par:44,min:41,g:120,org:'CPBL',top:'CPBL'},
 NPB2:{n:'日職二軍',par:47,min:44,g:100,org:'NPB'},
 NPB1:{n:'日職一軍',par:53,min:50,g:143,org:'NPB',top:'NPB'},
 R:{n:'新人聯盟',par:41,min:39,g:55, org:'MiLB'},
 A1:{n:'1A',par:45,min:43,g:110,org:'MiLB'},
 A2:{n:'2A',par:49,min:47,g:120,org:'MiLB'},
 A3:{n:'3A',par:54,min:52,g:130,org:'MiLB'},
 MLB:{n:'大聯盟',par:59,min:56,g:162,org:'MiLB',top:'MLB'},
};
function levelGames(lv,y){
  if(lv==='CPBL1')return y<=1994?90:y<=1996?100:y===1997?96:y<=1999?105:y<=2002?90:y<=2008?100:120;
  if(lv==='CPBL2'&&y<2006)return 60; /* 正式二軍成立前，以預備隊／練習賽規模呈現 */
  return LV[lv].g;
}
const PATHS={CPBL:['CPBL2','CPBL1'],NPB:['NPB2','NPB1'],MiLB:['R','A1','A2','A3','MLB']};
function hsCupsForYear(y){
  if(y<1995)return ['全國青棒選拔賽','中正盃青棒賽','世界青棒代表權賽'];
  if(y<2007)return ['高中棒球聯賽','金龍旗青棒賽','全國青棒選拔賽'];
  if(y<2013)return ['木棒聯賽','金龍旗青棒賽','玉山盃'];
  return ['木棒聯賽','黑豹旗','玉山盃'];
}
function uCupsForYear(y){ return y<2000?['甲組成棒春季聯賽','大專盃']:['大學春季聯賽','大專盃']; }
/* 事件卡：全部中性，好結果機率 50%（天才 70%） */
const EVENTS=[
 {n:'打擊機特訓',for:'B',gt:'手感火燙，擊球點完全咬中',bt:'越打越糊，姿勢跑掉了',g:{con:2},b:{con:-2}},
 {n:'重量訓練週期',for:'A',gt:'深蹲破 PR，全身充滿力量',bt:'操之過急，肌肉緊繃了好幾週',g:{pow:2,sta:1},b:{sta:-2}},
 {n:'牛棚加練',for:'P',gt:'新的握法找到了，尾勁明顯提升',bt:'越丟越歪，投球機制亂掉',g:{brk:2},b:{ctl:-2}},
 {n:'長傳接訓練',for:'A',gt:'雷射肩養成中',bt:'肩膀有點緊，教練喊停',g:{arm:2},b:{arm:-2}},
 {n:'影像分析課',for:'*',gt:'看穿投打習性，判斷力大增',bt:'資訊爆炸，站上場反而想太多',g:{eye:2,cat:2,ctl:1},b:{eye:-2,ctl:-1}},
 {n:'跑壘特訓',for:'A',gt:'起跑判斷進步神速',bt:'拉傷大腿後側，休了兩週',g:{spd:2},b:{spd:-1,inj:5}},
 {n:'守備千球練習',for:'A',gt:'手套像吸塵器一樣',bt:'吃了無數個彈跳球，信心受挫',g:{rng:1,fld:2},b:{fld:-2}},
 {n:'觸身球驚魂',for:'*',gt:'側身閃過，反應快得嚇人',bt:'結結實實吃了一顆速球',g:{spd:1},b:{inj:12}},
 {n:'媒體專訪',for:'*',gt:'應對得體，人氣上升，打球更有動力',bt:'失言上了新聞，壓力影響狀態',g:{sta:1},b:{con:-1,ctl:-1,sta:-1}},
 {n:'教練團關注',for:'*',gt:'獲得單獨指導的機會',bt:'被盯上缺點，一直被要求改動作',g:{rand:2},b:{rand:-2}},
 {n:'伙食與睡眠計畫',for:'*',gt:'體脂下降，恢復速度變快',bt:'水土不服，腸胃炎折騰一週',g:{sta:2},b:{sta:-1,inj:4}},
 {n:'學長／老將指點',for:'*',gt:'一句話點醒夢中人',bt:'學了不適合自己的招，繞了遠路',g:{rand:2},b:{rand:-2}},
 {n:'球速測定日',for:'P',gt:'雷達槍跳出生涯新高',bt:'出力過猛，手肘發炎',g:{vel:2},b:{inj:10}},
 {n:'配球讀書會',for:'P',gt:'進壘點的想像力打開了',bt:'想得太多，投得綁手綁腳',g:{ctl:2},b:{brk:-2}},
 {n:'宵夜文化',for:'*',gt:'控制住了，體態維持得宜',bt:'體重直線上升，第一步變慢了',g:{sta:1},b:{spd:-2,sta:-1,rng:-1}},
 {n:'場外代言邀約',for:'PRO',gt:'商演安排得宜，多賺零用錢也沒荒廢訓練',bt:'行程太滿，訓練量明顯掉了',g:{sta:1},b:{rand:-2,sta:-1}},
 {n:'季中低潮',for:'*',gt:'靠著調整心態走出來，更強了',bt:'低潮拖了一個月',g:{eye:1,ctl:1,sta:1},b:{con:-2,brk:-1,sta:-1}},
];
/* ================= 遊戲狀態 ================= */
let S=null, stepQ=[];
function newState(name,pos,role){
  const ab={}; POS_AB[pos].forEach(k=>ab[k]=ri(20,32));
  if(pos==='P'){ab.vel+=ri(0,6);ab.brk+=ri(0,4);} else {ab.con+=ri(0,6);ab.pow+=ri(0,4);}
  /* OOTP 式潛力天花板:洗牌後 1 項頂尖工具、1 項優質、1 項中上,其餘平庸 */
  const pot={}, sh=POS_AB[pos].slice();
  for(let i=sh.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=sh[i];sh[i]=sh[j];sh[j]=t;}
  if(pos==='P'){
    /* 投手只有 4 項能力,天花板更集中:1 項招牌武器,其餘明顯壓低,避免動輒雙 70/四滿天賦 */
    sh.forEach((k,i)=>{ pot[k]= i===0?ri(70,80) : i===1?ri(58,68) : i===2?ri(50,60) : ri(44,54); });
  } else {
    sh.forEach((k,i)=>{ pot[k]= i===0?ri(72,80) : i===1?ri(64,74) : i===2?ri(56,68) : ri(46,62); });
  }
  /* 高中固定分級表(隱藏):T1 名門 +6 / T2 中堅 ±0 / T3 弱旅 -6 */
  const hsMap={'北城華興':1,'屏南美和':1,'榮工青棒':2,'府城南英':2,'東岸農工':3,'嘉南商工':3};
  const schools=Object.keys(hsMap);
  const myTeam=schools[Math.floor(R()*schools.length)];
  return {name,pos,role:pos==='P'?null:null,age:16,year:1990,stage:'HS',stageYr:1,pot,
    hsMap,hsTier:hsMap[myTeam],team:myTeam,potSum0:Object.values(pot).reduce((a,b)=>a+b,0),
    league:null,org:null,orgTeam:null,teamTally:{CPBL:{},NPB:{},MLB:{}},
    ab,traits:{genius:false,glass:false,iron:false,scum:false,
      late:false,disc:false,academy:false,intlace:false,franchise:false,clutch:false,phoenix:false,combo:false,onetool:false,rubber:false,legend:false,
      yips:false,distract:false,cancer:false,ambience:false,goldcloth:false,thief:false,mrteam:false,confidante:false,smallschool:false,grinder:false,rainbow:false,taiwan:false},
    removed:[], /* 被覆蓋/解除的特性,結算畫刪除線 */
    cntSave:0,cntSaveWin:0,cntSnack:0,cntBoldWin:0,cntBoldFail:0,samePick:0,samePickKey:null,teamYears:0,
    six:0,bigInj:0,ironStreak:0,npbYears:0,
    injNext:0,tmpInj:0,rehab:0,salary:0,pool:0,seasonFactor:1,
    mind:{discipline:ri(35,55),nerve:ri(35,55),insight:ri(35,55)},
    dev:{plan:null,focus:null,fatigue:0,trust:0,spring:0},
    era:{seen:{},overseasSeen:{},overseasArrival:{},fameLeagues:{},olympicDream:false,intlEdge:0,rivalLeague:false,suspension:0,usDoor:false},
    dark:{involved:0,evidence:0,danger:0,money:0,refused:false,exited:false,cooperated:false,exposed:false},
    overseasDark:{ped:false,evidence:0,clean:false,disclosed:false,years:0,caught:false,refused:0},
    stats:{CPBL:null,NPB:null,MLB:null,MINOR:null},honors:[],achievements:[],achievementLog:{},intlCount:0,intlLock:null,intlStat:{G:0,PA:0,AB:0,H:0,HR:0,RBI:0,IP:0,SO:0,ER:0,W:0,SV:0},intlBest:null,dpos:null,dposYears:{},roleYears:{},tradeRefuse:0,champThisTeam:false,svc:0,svcOrg:null,faElig:false,tradeHeat:0,complainCount:0,demotionRefused:false,tj:0,tjCount:0,effort:'普通',tjSuccess:0,love:{st:'single',partner:null,kids:0,caught:0,affairs:0,exes:[],dyrs:0,datedTimes:0},traits2:{},log:[],ct:null,done:false};
}
function blankStat(){return {yr:0,G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,AS:0,DEF:0};}
function bucketOf(lv){ const l=lv&&LV[lv]; return l&&l.top?l.top:'MINOR'; } /* 業餘引退時 lv 為空,歸類 MINOR */
function traitCard(key,name,desc,tone){ S.traits[key]=true;
  card(tone||'gold','隱藏屬性解鎖：'+name,desc); board(0); }
function removeTrait(key,label){ if(S.traits[key]){ S.traits[key]=false;
    if(!S.removed.includes(label))S.removed.push(label); } }
/* ---------- trait names/order/styles/effects, shared by the settlement tags, the share image and the desktop trait panel ---------- */
const TRAIT_KEYS={pos:['legend','taiwan','goldcloth','mrteam','confidante','genius','iron','late','disc','academy','intlace','franchise','clutch','phoenix','rubber','onetool','smallschool','grinder','combo','rainbow'],
  neg:['glass','scum','yips','distract','cancer','ambience','thief']};
const TRAIT_N={genius:'天才',iron:'鐵人',glass:'玻璃人',scum:'渣男',late:'大器晚成',disc:'自律狂',academy:'學院派',intlace:'國際賽之鬼',franchise:'神主牌',clutch:'大心臟',phoenix:'浴火重生',onetool:'只會這個',rubber:'橡膠手臂',goldcloth:'黃金聖衣',confidante:'閨中密友',smallschool:'小學校之光',grinder:'努力仔',yips:'失憶症',distract:'外務纏身',cancer:'更衣室毒瘤',ambience:'氣氛大師',thief:'薪水小倫',combo:'大巧不工',taiwan:'Team Taiwan'};
function traitName(k){
  if(k==='mrteam')return (teamNick(S.mrTeamName||'')||'')+'先生';
  if(k==='legend')return (S.legendLeague||'')+'歷史級球星';
  if(k==='rainbow')return (S.rainbowLg||'')+'七彩球衣';
  return TRAIT_N[k]||k; }
function traitTagStyle(k){
  if(TRAIT_KEYS.neg.includes(k))return 'background:#2a0f0f;border-color:#c0392b;color:#ff8b7a'; /* 負向:紅 */
  if(k==='legend'||k==='taiwan')return 'background:#3a2c05;border-color:#ffc95c;color:#ffe08a'; /* 歷史級/挺台灣:金 */
  if(k==='goldcloth')return 'background:#3a3505;border-color:#e8d43a;color:#fff35a'; /* 黃金聖衣:黃 */
  if(k==='mrteam'){ const c=teamChip(TEAM_COLOR[S.mrTeamName]||'#ffc95c'); return 'background:'+c.bg+';border-color:'+c.bd+';color:'+c.fg; }
  if(k==='genius')return 'background:#232733;border-color:#c8d0e0;color:#e8eef7'; /* 天才:銀 */
  return ''; /* 正向:預設琥珀 */ }
const TRAIT_FX={genius:'訓練骰永久 4 點起，事件卡好結果機率 70%',late:'訓練骰永久 3 點起，事件卡好結果機率 70%',disc:'衰退曲線整體延後兩年',academy:'25 歲前受傷率 −5%、季初擲骰期望值提升',iron:'受傷機率上限 10%',clutch:'全力一搏成功率天才級、成功 +4／失敗僅 −2、受傷風險降級',combo:'季初自動擲 1 顆骰，加在專精的能力上',rubber:'TJ 量表上限翻倍、打針成功率翻倍',phoenix:'玻璃人懲罰解除，受傷率恢復正常',intlace:'國際賽不增加受傷風險，每次徵召能力點保底 +2',franchise:'母隊續約年薪係數固定 ≥×1.2，引退評價加成',goldcloth:'效力兄弟巨象滿十年，主場的信仰',mrteam:'同一支球隊十五年，球隊的代名詞',taiwan:'國際賽徵召超過 5 次的國家隊常客',confidante:'紅粉知己遍佈，情場的隱藏稱號',smallschool:'小學校出身，站上頂級舞台',grinder:'平庸天賦，靠汗水熬成的生涯',legend:'名人堂首輪入選的歷史級評價',rainbow:'同一聯盟效力球隊數爆表',glass:'受傷機率下限 40%',yips:'系統評價 −3，升上更高層級或奪得年度獎項可解除',distract:'季初擲骰永久 −1 顆（最低 2 顆）',cancer:'季中被交易機率大增、續約條件惡化',ambience:'轉隊機率永久提高',thief:'事件卡失敗率永久 +10%',scum:'每次外遇被抓到，全能力 −5',onetool:'只剩一項武器的替補奇兵，出賽數銳減'};
function renderTraits(){ /* desktop trait side panel (presentation only) */
  const el=$('trait-tags'),box=$('trait-side'); if(!el||!box)return;
  let h='';
  if(S&&S.traits){
    /* one row per trait: tag + inline effect text (ellipsized; full text on hover) */
    const row=(style,name,fx)=>`<div class="trow" title="${fx}"><span class="tag" style="${style}" title="${fx}">${name}</span><span class="td">${fx}</span></div>`;
    [...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].forEach(k=>{ if(S.traits[k])h+=row(traitTagStyle(k),traitName(k),TRAIT_FX[k]||''); });
    (S.removed||[]).forEach(l=>h+=`<div class="trow"><span class="tag" style="text-decoration:line-through;opacity:.4;color:#8a8a8a;border-color:#4a4a4a">${l}</span><span class="td" style="opacity:.4">已解除</span></div>`);
  }
  el.innerHTML=h;
  box.classList.toggle('empty',!h); }
/* 只會這個:只吃三種角色維度——打擊(力量/Contact)、跑壘(速度)、守備(綜合) */
function careerAllStars(){ let n=0; ['CPBL','NPB','MLB'].forEach(b=>{ if(S.stats[b])n+=(S.stats[b].AS||0); }); return n; }
function toolGap(){ const a=S.ab;
  const hit=Math.max(a.pow,a.con);        /* 打擊維度:力量或 Contact 取高 */
  const run=a.spd;                         /* 跑壘維度 */
  const def=S.pos==='C'?(a.rng+a.fld+a.arm+a.cat)/4:(a.rng+a.fld+a.arm)/3; /* 守備綜合 */
  const dims=[['hit',hit,'代打'],['run',run,'代跑'],['def',def,'代守']];
  dims.sort((x,y)=>y[1]-x[1]);
  const topDim=dims[0], secDim=dims[1];
  const gap=topDim[1]-secDim[1];
  /* 對照角色:代打看力量/Contact 哪個高決定文案來源 */
  const role=topDim[2];
  return {gap, role, val:topDim[1], dim:topDim[0]}; }
function tjAccrue(){ /* 每季累積 TJ 量表:球速+變化球越高負擔越大,投法決定倍率 */
  if(S.pos!=='P'||S.seasonFactor<=0)return;
  const mult={'全力投':1.25,'普通投':1.0,'養生球':0.65}[S.effort]||1.0;
  const base=(S.ab.vel+S.ab.brk)/19*mult*(S.tjCount>=1?1.15:1); /* 動過刀後累積加快 */
  S.tj+=base;
}
function tjCap(){ return S.traits.rubber?100:50; }
function tjGamble(cont){ /* 量表達上限:先扣 -5,再對賭 */
  if(S.pos!=='P'||S.tj<tjCap()){ cont(); return; }
  addAb('vel',-5); addAb('brk',-5); board(1);
  card('bad','手肘拉起警報',`累積的負荷讓韌帶發出哀鳴——球速、變化球各 <b class="dn">−5</b>。醫療團隊把兩個選項攤在你面前。`);
  const succP=S.traits.rubber?85:55;
  choose('TJ 抉擇：你的手肘撐到極限了',[
    {t:'動 Tommy John 手術',main:true,s:'報銷一整年，回來球速/變化球回春（各 +3~+10）',f:()=>{
      S.tj=0; S.tjCount++; S.rehab=1;
      const gv=ri(3,10),gb=ri(3,10); addAb('vel',gv); addAb('brk',gb);
      if(S.tjCount>=2){ tjTwoStrike(); }
      board(1);
      card('gold','手術成功',`手術很順利。漫長復健後，你的球威煥然一新——球速 <b class="up">+${gv}</b>、變化球 <b class="up">+${gb}</b>。（本季報銷）`);
      afterGamble('surgery',cont); }},
    {t:'打針硬撐這一季',warn:true,s:`成功率 ${succP}%｜失敗＝TJ 大傷（隔年報銷、能力再崩）`,f:()=>{
      if(chance(succP)){ S.tj=Math.max(0,S.tj-20); addAb('vel',5); addAb('brk',5); board(1);
        card('good','險過一關',`封閉針撐住了，你咬牙投完球季——量表 <b class="hl">−20</b>，球速、變化球各 <b class="up">+5</b>。但這是在跟時間借命。`);
        afterGamble('inject',cont); }
      else { tjBigInjury(cont); } }}]);
}
function tjTwoStrike(){ /* 累計 2 次 TJ:球速與變化球砍半 */
  S.ab.vel=clamp(Math.round(S.ab.vel/2),1,80);
  S.ab.brk=clamp(Math.round(S.ab.brk/2),1,80);
  card('bad','兩度動刀的代價','第二次進手術室——韌帶再也不是原廠的了。球速與變化球<b class="dn">直接砍半</b>。');
}
function tjBigInjury(cont){
  S.tjCount++; S.rehab=1; S.tj=0;
  /* 5% 肩膀報廢 */
  if(chance(5)){ S.ab.vel=10; S.ab.brk=10; S.pot.vel=20; S.pot.brk=20;
    card('bad','最壞的結果',`針扎下去的瞬間，肩膀傳來從未有過的撕裂感。醫生的臉色說明了一切——<b class="dn">肩膀報廢，球速與變化球歸零剩 10，潛力上限砍到 20</b>。你的投手生涯，大概到這裡了。`);
    board(1); afterGamble('fail',cont); return; }

  /* 韌帶斷裂的懲罰 (-5) 以及手術後的回春 (+3~+10) */
  const gv=ri(3,10), gb=ri(3,10);
  const netV = gv - 5;
  const netB = gb - 5;
  /* 直接改絕對值,避免蓄力 Bug;鎖 1~80 */
  S.ab.vel = clamp(S.ab.vel + netV, 1, 80);
  S.ab.brk = clamp(S.ab.brk + netB, 1, 80);

  if(S.tjCount>=2)tjTwoStrike();
  board(1);

  const vStr = netV > 0 ? `<b class="up">+${netV}</b>` : netV < 0 ? `<b class="dn">${netV}</b>` : `<b>0</b>`;
  const bStr = netB > 0 ? `<b class="up">+${netB}</b>` : netB < 0 ? `<b class="dn">${netB}</b>` : `<b>0</b>`;
  card('bad','TJ 大傷',`硬撐的代價來了——韌帶當場斷裂。隔年<b class="dn">全年報銷</b>。經歷了漫長的手術與復健（斷裂 −5 加上手術回春），最終你的球速 ${vStr}、變化球 ${bStr}。就算滿血回歸，也真的只是勉強打平。`);
  afterGamble('fail',cont);
}
function afterGamble(kind,cont){
  if(kind==='inject'){ S.tjSuccess++;
    if(S.tjSuccess>=2&&!S.traits.rubber){ S.traits.rubber=true;
      card('gold','隱藏屬性解鎖：橡膠手臂','連續兩次靠打針硬撐挺過手肘危機、完全不進手術室——你的韌帶像橡膠一樣柔韌。<b class="hl">TJ 量表上限翻倍、打針成功率翻倍</b>。'); board(1); } }
  else if(kind==='surgery'){ S.tjSuccess=0; /* 開刀重置連續 */
    if(S.traits.rubber){ removeTrait('rubber','橡膠手臂');
      card('bad','橡膠不再','終究還是進了手術室——那雙被稱為橡膠的手臂，也有極限。<b class="dn">橡膠手臂失效</b>。'); board(1); } }
  else { S.tjSuccess=0; } /* 大傷失敗重置 */
  cont();
}
function pitcherRole(){ /* 體力 >=52 先發;否則牛棚,牛棚內看表現升終結者 */
  if(S.ab.sta>=52)return 'SP';
  /* 牛棚:讀「上一季」的 d(prevD,因為 lastD 已被 phasePre 清空);頂尖 → 終結者 */
  const pd=(S.prevD!==undefined?S.prevD:(S.lastD||0));
  const d=(S.role&&S.role!=='SP')?pd:-99;
  if(S.role==='CL')return d>=1?'CL':'MR';   /* 終結者崩盤才降中繼 */
  return d>=3?'CL':'MR';                     /* 中繼打出頂尖成績升終結者 */
}
function fmtIP(ip){ /* 十進位局數轉棒球表示:小數部分 →三分之幾(出局數) */
  if(ip==null)return '0.0';
  const whole=Math.floor(ip); const frac=ip-whole;
  const outs=Math.round(frac*3); /* 0/1/2/3 */
  if(outs>=3)return (whole+1)+'.0';
  return whole+'.'+outs;
}
function roleN(r){ return {SP:'先發',MR:'中繼',CL:'終結者'}[r]||'—'; }
function isSP(){ return S.role==='SP'; } /* 先發引擎判定 */
function ovr(){
  const a=S.ab;
  if(S.pos==='P'){ const arr=[a.vel,a.ctl,a.brk].sort((x,y)=>y-x);
    return Math.round(arr[0]*0.42+arr[1]*0.30+arr[2]*0.18+a.sta*0.10); }
  const off=[a.con,a.pow,a.eye,a.spd].sort((x,y)=>y-x);
  const offv=off[0]*0.38+off[1]*0.27+off[2]*0.20+off[3]*0.15;
  /* 守備分:用當前守位的 dpScore(與守位門檻系統一致);DH 無守備價值 → 以「1B 守備分 −12」計(確保同打擊下 1B 恆 > DH);未定守位則取最佳可守守位的分 */
  const dpForOvr = S.dpos || (S.pos==='C'?'C':(S.pos==='OF'?'CF':'SS'));
  const def = S.dpos==='DH' ? (dpScore('1B')-12) : dpScore(dpForOvr);
  /* 守備權重:關鍵守位(SS/CF/C)最高 30%,角落降低;DH 用與 1B 相同權重(守備分已內含 DH 懲罰) */
  const dw=S.dpos?({SS:0.30,CF:0.30,C:0.30,'2B':0.22,'3B':0.22,RF:0.20,'1B':0.12,LF:0.14,DH:0.12})[S.dpos]??0.22:0.24;
  let v=Math.round(offv*(1-dw)+def*dw);
  if(S.traits.yips)v-=3; /* 失憶症:心理陰影,系統評價 -3 */
  return v;
}
function playerType(){
  const a=S.ab;
  if(S.traits.onetool&&S.toolRole)return S.toolRole+'工具人';
  if(S.pos==='P'){
    const m=Math.max(a.vel,a.ctl,a.brk);
    if(m<52)return '潛力股';
    if(a.sta>=m&&a.sta>=62)return '工作馬';
    if(m===a.vel)return '火球男'; if(m===a.brk)return '變化球藝師'; return '控球大師';
  }
  if(S.pos==='C'){ const rest=Math.max(a.con,a.pow,a.spd,a.eye,a.rng,a.fld,a.arm);
    if(a.cat>=58&&rest<=a.cat-8)return '配球皇帝'; }
  const dv=S.pos==='C'?(a.rng+a.fld+a.cat)/3:(a.rng+a.fld+a.arm)/3;
  const cand=[['巨炮型',a.pow],['安打製造機',a.con],['選球大師',a.eye],['飛毛腿',a.spd],['守備至上',dv]];
  cand.sort((x,y)=>y[1]-x[1]);
  if(cand[0][1]<52)return '潛力股';
  if(cand[0][1]-cand[1][1]<=3&&cand[0][1]>=60)return '全能型';
  return cand[0][0];
}
function abCost(k){ /* 目前這一級要花幾點(須與 addAb 成本公式一致) */
  const cur=S.ab[k], pk=(S.pot&&S.pot[k])||62, isP=S.pos==='P';
  let c=isP?(cur>=66?7:cur>=58?4:cur>=50?2:1):(cur>=72?3:cur>=64?2:1);
  if(cur>=pk)c*=isP?4:3; return c;
}
function addAb(k,v){ if(!(k in S.ab))return 0; const o=S.ab[k];
  S.lastOverflow=0; /* 【修正】紀錄真正溢出的點數 */
  if(v<0){ S.ab[k]=clamp(o+v,1,80); return S.ab[k]-o; } /* 扣值 1:1,不吃量表成本 */
  if(!S.carry)S.carry={};
  let cur=o,bud=v+(S.carry[k]||0); /* 未滿一級的點數累積在進度槽,不再蒸發 */
  const pk=(S&&S.pot&&S.pot[k])||62;
  const isP=S&&S.pos==='P';
  while(bud>0&&cur<80){
    let cost=isP?(cur>=66?7:cur>=58?4:cur>=50?2:1)      /* 投手只有4項,養成成本最陡 */
              :(cur>=72?3:cur>=64?2:1);                    /* 野手9項,中高段變貴 */
    if(cur>=pk)cost*=isP?4:3; /* 天花板之上:投手×4、野手×3 */
    if(bud>=cost){bud-=cost;cur++;} else break; }
  if(cur>=80) S.lastOverflow=bud; /* 滿 80 後，剩下的點數才是真正的溢出 */
  S.carry[k]=cur>=80?0:bud;
  S.ab[k]=cur; return cur-o; }
function injuryProb(){ /* 基礎風險從 24 降為 15，減少動不動就受傷的頻率 */
  let p=15+S.injNext;
  p+=Math.floor(((S.dev&&S.dev.fatigue)||0)/10); /* 前一季負荷會跟著球員進春訓，不會憑空消失 */
  if(S.age>=35)p+=12; else if(S.age>=32)p+=6;
  if(S.traits.academy&&S.age<25)p-=5; /* 學院派:25歲前科學化管理 */
  if(S.traits.iron&&S.traits.glass)p=25;
  else if(S.traits.iron)p=Math.min(p,10); /* 鐵人:基礎風險上限 10% */
  else if(S.traits.glass)p=Math.max(p,40);
  /* 事件卡等自找的額外風險(tmpInj)疊加在基礎之上,不受鐵人上限保護 */
  p+=(S.tmpInj||0);
  return clamp(p,3,95);
}
/* ================= 數據模擬 ================= */
function simSeason(lv){
  if(S.pos==='P'&&!S.role)S.role=pitcherRole();
  const baseL=LV[lv], L={...baseL,g:levelGames(lv,S.year)}, par=L.par, a=S.ab, f=S.seasonFactor;
  const st={G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,IP:0,SO:0,ER:0,avg:0,era:0,d:0};
  if(f<=0) return st;
  if(S.pos==='P'){
    const q=(a.vel+a.ctl+a.brk)/3, d=q-par; st.d=d;
    /* 表現係數:投得好給滿局數,投爛減少出賽(比照野手) */
    const perfF=clamp(0.80+d*0.028,0.42,1.12);
    if(isSP()){
      const gs=Math.round(clamp(20+(a.sta-40)*0.18,10,30)*f*perfF*(0.94+R()*0.08));
      st.G=Math.max(1,gs);
      /* IP/GS:聯盟平均~5.0、優質先發5.2-6.0、工作馬6.1-6.5;由 d 值(綜合實力)決定,控球差略減 */
      const ipg=clamp(5.0+d*0.05+(a.sta-50)*0.012+(a.ctl-par)*0.006+N0(0.12),4.8,6.5);
      st.IP=+(st.G*ipg).toFixed(1);
    }else{
      st.G=Math.max(1,Math.round(clamp(45+(Math.min(a.sta,60)-40)*0.3,25,68)*f*perfF*(0.94+R()*0.08))); /* 高體力後援:出賽數貢獻以 sta60 封頂,不會貼近先發工作量 */
      st.IP=+(st.G*1.05).toFixed(1);
    }
    st.era=clamp(4.32-d*0.17+N0(0.35),1.40,9.90);
    st.ER=Math.round(st.era*st.IP/9);
    const k9=clamp(6.2+(a.vel-par)*0.11+(a.brk-par)*0.06+N0(0.5),3.5,13.5);
    st.SO=Math.round(st.IP/9*k9);
    /* 保送:控球決定(BB/9);被安打:d 值決定;WHIP=(H+BB)/IP */
    const bb9=clamp(4.6-(a.ctl-par)*0.13+N0(0.4),1.2,7.5);
    st.BB=Math.round(st.IP/9*bb9);
    const h9=clamp(9.2-d*0.16+N0(0.5),5.0,13.5);
    st.H=Math.round(st.IP/9*h9);
    st.WHIP=st.IP>0?+((st.H+st.BB)/st.IP).toFixed(2):0;
    if(isSP()){
      const dec=Math.round(st.G*0.72), wp=clamp(0.50+d*0.014+N0(0.05),0.15,0.85);
      st.W=Math.round(dec*wp); st.L=dec-st.W;
    }else if(S.role==='CL'){
      /* 終結者:救援以出賽數為基礎(轉化率隨表現 d),SV 天生 <= G;每場最多 1 救援 */
      const svRate=clamp(0.55+d*0.02,0.35,0.82);            /* 救援轉化率:35%~82% */
      st.SV=Math.min(st.G, Math.round(st.G*svRate));         /* 不可超過出賽數 */
      st.HLD=Math.min(Math.max(0,st.G-st.SV), Math.round(st.G*0.12)); /* 非救援登板的中繼 */
      const dec=Math.max(1,Math.round(st.G*0.14)); st.W=Math.round(dec*clamp(0.45+d*0.02,0.3,0.7)); st.L=Math.max(0,dec-st.W);
    }else{ /* 中繼:中繼成功 HLD 以出賽數為基礎 */
      const hldRate=clamp(0.45+d*0.02,0.25,0.72);
      st.HLD=Math.min(st.G, Math.round(st.G*hldRate));       /* 不可超過出賽數 */
      st.SV=Math.min(Math.max(0,st.G-st.HLD), chance(25)?ri(1,5):0);
      const dec=Math.max(1,Math.round(st.G*0.14)); st.W=Math.round(dec*clamp(0.5+d*0.015,0.35,0.7)); st.L=Math.max(0,dec-st.W);
    }
    /* 物理約束:每場最多一種結果 → 救援占比<=85%、勝+敗+救援+中繼 總和不可超過出賽數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(st.G*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,st.G-st.SV));
      const decCap=Math.max(0,st.G-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
  }else{
    const q=a.con*0.5+a.pow*0.2+a.eye*0.18+a.spd*0.12, d=q-par-0.5; st.d=d; /* 加入 pow(長打產能計入實力);-0.5 校準,整體分布與舊版對齊 */
    /* 出賽規模:體力設上限,表現(d)決定實際多寡 */
    /* 體力係數:50+ 接近滿(~0.9-1.0)、45~50 尚可、40 明顯少、35 只剩代打量(~0.35) */
    let staF;
    if(a.sta>=55)staF=1.0; else if(a.sta>=50)staF=0.90+(a.sta-50)*0.02;
    else if(a.sta>=45)staF=0.72+(a.sta-45)*0.036; else if(a.sta>=40)staF=0.52+(a.sta-40)*0.04;
    else if(a.sta>=35)staF=0.35+(a.sta-35)*0.034; else staF=Math.max(0.15,0.35-(35-a.sta)*0.03);
    /* B. 明星級強打(d>=10)但體力撐不住守備(staF<0.75) → 該季轉 DH,只站打擊區,staF 拉到 0.9 下限 */
    let dhThisYear=false;
    if(d>=10 && staF<0.75 && S.dpos!=='DH' && S.dpos!=='C'){
      staF=Math.max(staF,0.9); dhThisYear=true;
    }
    /* 表現係數:打得好才有滿打席,爛表現(d<0)出賽再打折 */
    const perfF=clamp(0.82+d*0.03,0.45,1.12);
    st.G=Math.min(L.g, Math.round(L.g*clamp(staF*perfF,0.10,1.0)*f*(0.95+R()*0.06))); /* 上限=聯盟場次,不可超過 */
    st.PA=Math.round(st.G*4.25);
    st._dh=dhThisYear; /* 供 accStat 記 DH 年 */
    st.BB=Math.round(st.PA*clamp(0.062+(a.eye-par)*0.0034,0.045,0.17));
    st.AB=st.PA-st.BB;
    st.avg=clamp(0.252+d*0.0058+(a.sta-50)*0.0003+(a.spd-par)*0.0006+N0(0.014),0.140,0.380);
    st.H=Math.round(st.AB*st.avg); st.avg=st.AB?st.H/st.AB:0;
    st.HR=Math.round(st.AB*clamp(0.010+(a.pow-par)*0.0022,0.001,0.075)*(0.85+R()*0.3));
    st.SB=Math.round(clamp((a.spd-45)*0.5+(a.spd-par)*1.3+N0(4),0,70)*f);
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
    st.DEF=defRuns(lv);
  }
  applySeasonForm(st,lv);   /* 低潮年/生涯年:調整率值與產出(不動出賽數) */
  return st;
}
/* 賽季狀態:10% 低潮(成績×0.65)、10% 生涯年(成績×1.2,需健康);倍率只作用產出/率值,出賽數 G 不變 */
function applySeasonForm(st,lv){
  if(S.seasonFactor<=0)return;                 /* 傷缺全季不觸發 */
  st.form=0;                                    /* 0=正常 1=生涯年 -1=低潮 */
  const roll=R();
  const canCareer=S.seasonFactor>=0.9;          /* 生涯年需該季健康 */
  let m=1;
  if(roll<0.10){ st.form=-1; m=0.65; }          /* 低潮:成績打 65 折 */
  else if(canCareer && roll<0.20){ st.form=1; m=1.20; } /* 生涯年:成績 ×1.2 */
  if(m===1)return;
  if(S.pos==='P'){
    /* 投手:三振/勝場隨倍率;被安打與自責分反向(生涯年變少、低潮變多);SV/HLD 依倍率但不超過出賽數 */
    st.SO=Math.round(st.SO*m);
    st.W=Math.round(st.W*m); if(st.L!=null)st.L=Math.max(0,Math.round(st.L/(m||1)));
    st.H=Math.max(0,Math.round(st.H/m)); st.ER=Math.max(0,Math.round(st.ER/m));
    st.era=st.IP>0?+(st.ER*9/st.IP).toFixed(2):st.era;
    st.WHIP=st.IP>0?+((st.H+st.BB)/st.IP).toFixed(2):st.WHIP;
    if(st.SV)st.SV=Math.min(st.G,Math.round(st.SV*m));
    if(st.HLD)st.HLD=Math.min(Math.max(0,st.G-(st.SV||0)),Math.round(st.HLD*m));
    /* 物理約束(倍率後再夾):救援占比<=85%、勝+敗+救援+中繼 <= 出賽數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(st.G*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,st.G-st.SV));
      const decCap=Math.max(0,st.G-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
  }else{
    /* 打者:安打/全壘打/盜壘/打點隨倍率;打席與出賽數不變(打率連帶變動) */
    st.H=Math.round(st.H*m); st.HR=Math.round(st.HR*m); st.SB=Math.round(st.SB*m);
    if(st.H>st.AB)st.H=st.AB;                   /* 安打不可超過打數 */
    st.avg=st.AB?st.H/st.AB:0;
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
  }
  /* d 值(影響評價/獎項/下放)跟著狀態調整 */
  st.d += st.form===1?4:st.form===-1?-4:0;
}
/* 守備分(近似 defensive runs):守位難度權重 × 守備工具相對聯盟基準的幅度 × 出賽比重 */
function defRuns(lv){
  if(S.pos==='P')return 0;
  const a=S.ab, par=LV[lv].par;
  const dp=S.dpos||(S.pos==='C'?'C':'2B');
  if(dp==='DH')return 0; /* DH 不產生守備分 */
  const posW={SS:1.25,CF:1.20,C:1.15,'2B':1.05,'3B':1.00,RF:0.95,'1B':0.75,LF:0.80}[dp]||1;
  const skill=dp==='C'?(a.fld*0.4+a.arm*0.3+a.cat*0.3)
    :(a.rng*0.45+a.fld*0.40+a.arm*0.15);
  const gw=1; /* 出賽比重已含在 seasonFactor */
  return Math.round((skill-par)*posW*0.55*(S.seasonFactor||1));
}
function accStat(bucket,st){
  if(!S.stats[bucket]) S.stats[bucket]=blankStat();
  const t=S.stats[bucket]; t.yr++;
  if(bucket!=='MINOR'&&S.orgTeam){ const tb=S.teamTally[bucket]||(S.teamTally[bucket]={});
    tb[S.orgTeam]=(tb[S.orgTeam]||0)+1; }
  if(S.pos!=='P'){ const dp=(st&&st._dh)?'DH':(S.dpos||'—'); S.dposYears[dp]=(S.dposYears[dp]||0)+1; }
  else if(S.role){ S.roleYears[S.role]=(S.roleYears[S.role]||0)+1; }
  ['G','PA','AB','H','HR','RBI','SB','BB','W','L','SV','HLD','SO','ER'].forEach(k=>t[k]+=(st[k]||0));
  t.DEF+=(st.DEF||0);
  t.IP=+(t.IP+st.IP).toFixed(1);
}
function statLine(st){
  if(S.pos==='P'){ const role=roleN(S.role); const relief=(S.role==='CL'&&st.SV)?`｜${st.SV}救援`:(S.role==='MR'&&st.HLD)?`｜${st.HLD}中繼`:''; return `出賽 ${st.G}｜局數 ${fmtIP(st.IP)}｜${st.W}勝${st.L}敗${relief}｜三振 ${st.SO}｜保送 ${st.BB||0}｜ERA ${st.era.toFixed(2)}｜WHIP ${(st.WHIP||0).toFixed(2)}`; }
  const obpN=st.PA>0?(st.H+st.BB)/st.PA:0;
  const slgN=slgOf(st);
  const obp=st.PA>0?obpN.toFixed(3).replace(/^0/,''):'-';
  const slg=st.AB>0?slgN.toFixed(3).replace(/^0/,''):'-';
  const ops=st.AB>0?(obpN+slgN).toFixed(3).replace(/^0/,''):'-';
  return `出賽 ${st.G}｜打席 ${st.PA}｜打擊率 ${st.avg.toFixed(3).replace(/^0/,'')}｜上壘率 ${obp}｜長打率 ${slg}｜OPS ${ops}｜安打 ${st.H}｜全壘打 ${st.HR}｜打點 ${st.RBI}｜保送 ${st.BB}｜盜壘 ${st.SB}${st.DEF!==undefined?`｜守備 ${st.DEF>0?'+':''}${st.DEF}`:''}`;
}
/* 長打率估算:無二三壘數據,依全壘打比例與力量推估壘打數 */
function slgOf(st){
  if(!st.AB)return 0;
  const hr=st.HR, nonHR=Math.max(0,st.H-hr);
  /* 非全壘打安打中,約 22% 二壘打、3% 三壘打——取整數支數,壘打數必為整數,小樣本 SLG 才不會出現 .320 這種不可能的值 */
  const doubles=Math.round(nonHR*0.22), triples=Math.round(nonHR*0.03);
  const singles=Math.max(0,nonHR-doubles-triples);
  const tb=singles + doubles*2 + triples*3 + hr*4;
  return tb/st.AB;
}
/* 年薪（萬台幣） */
function salaryFor(lv,d){
  switch(lv){
    case 'CPBL2':return 84; case 'NPB2':return 240;
    case 'R':return 60; case 'A1':return 95; case 'A2':return 135; case 'A3':return 270;
    case 'CPBL1':return Math.round(300+clamp(d,0,25)*120);
    case 'NPB1':return Math.round(1600+clamp(d,0,26)*560);
    case 'MLB':return Math.round(2400+clamp(d,0,26)*4300);
  } return 0;
}
const fmtMoney=w=>{ const y=Math.floor(w/10000),m=Math.round(w%10000); return (y?y+'億':'')+(m?m.toLocaleString()+'萬':(y?'':'0萬')); };
/* scoreboard-only compact form: one unit at a time, 1 decimal above 1億.
   Value and unit are returned separately so the unit can sit in the cell label,
   leaving the value row purely numeric like the other three cells.
   Truncated, never rounded up, so the glanceable figure never exceeds the real one
   (19,999萬 -> 1.9億, matching the card's 1億9,999萬 rather than overstating it as 2.0億).
   Switches unit at exactly the same 10,000萬 threshold as fmtMoney. */
const salParts=w=>w<10000?{v:w.toLocaleString(),u:'萬'}:{v:(Math.floor(w/1000)/10).toFixed(1),u:'億'};
/* ================= UI 基礎 ================= */
const $=id=>document.getElementById(id);
var _curYearBody=null; /* 當前年度的內容容器 */
var MAX_YEARS=8;         /* DOM 最多保留幾個年度區塊 */
function logTarget(){ return _curYearBody || $('log'); }
/* ================= 主題系統(純呈現層) ================= */
const THEME_KEY='yakyu-theme';
function applyTheme(t){
  if(t!=='a'&&t!=='b'&&t!=='c'&&t!=='d')t='a';
  document.body.dataset.theme=t;
  try{localStorage.setItem(THEME_KEY,t);}catch(e){}
  document.querySelectorAll('#seg-theme button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  updDispSum();
  const m=document.querySelector('meta[name="theme-color"]');
  if(m)m.setAttribute('content',(getComputedStyle(document.body).getPropertyValue('--bg')||'#081510').trim());
}
/* ---------- 主題化對話框(純呈現層) ---------- */
function modalOpen(html){ const m=$('modal'); if(!m)return; $('modal-box').innerHTML=html; m.classList.add('show'); }
function modalClose(){ const m=$('modal'); if(m)m.classList.remove('show'); }
function applyMobileUI(on){
  document.body.classList.toggle('mobile-ui',!!on);
  try{localStorage.setItem('yakyu-mobile-ui',on?'1':'0');}catch(e){}
  document.querySelectorAll('#seg-ui button').forEach(b=>b.classList.toggle('on',(b.dataset.u==='1')===!!on));
  updDispSum();
  allocPlace(); /* switching layout mid-allocation must re-home the rows, not strand them */
}
/* The desktop layout is @media(min-width:921px) AND body:not(.mobile-ui). A phone fails
   the media query and never carries the class, so both halves have to be tested; checking
   the class alone would report "desktop" on every real phone. */
const isMobileLayout=()=>!(matchMedia('(min-width:921px)').matches&&!document.body.classList.contains('mobile-ui'));
const BIG_KEY='yakyu-big-text';
function applyBigText(on){
  document.body.classList.toggle('big-text',!!on);
  try{localStorage.setItem(BIG_KEY,on?'1':'0');}catch(e){}
  document.querySelectorAll('#seg-big button').forEach(b=>b.classList.toggle('on',(b.dataset.b==='1')===!!on));
  updDispSum();
  allocPlace();
}
function allocFullOpen(){ const f=$('alloc-full'); if(f)f.classList.add('show'); }
function allocFullClose(){ const f=$('alloc-full'); if(f)f.classList.remove('show'); }
/* The live allocation, so its nodes can be re-homed when a setting changes mid-way.
   render() only ever writes into these same three nodes, which is what makes moving
   them between the panel and the overlay safe. */
let ALLOC=null;
function allocPlace(){
  if(!ALLOC)return;
  const a=$('act'), full=document.body.classList.contains('big-text')&&isMobileLayout();
  const s=$('act-side'); if(s)s.classList.toggle('alloc',!full);
  if(full){
    /* move the nodes out of #act before rewriting it, or the rewrite would destroy them */
    const fb=$('af-body');
    fb.appendChild(ALLOC.top); fb.appendChild(ALLOC.rows); fb.appendChild(ALLOC.btm);
    const ft=$('af-title'); if(ft)ft.textContent=ALLOC.label;
    a.innerHTML=`<div class="title">${ALLOC.label}</div><div class="pool" id="al-cue"></div>`;
    /* both entry points already sit behind an explicit 分配 button, so the overlay opens
       straight away; this one is only the way back after the player dismisses it */
    const ob=document.createElement('button'); ob.className='btn main'; ob.id='al-open';
    ob.style.textAlign='center'; ob.textContent='繼續分配 ▸'; ob.onclick=allocFullOpen;
    a.appendChild(ob);
    allocFullOpen();
  }else{
    const frag=document.createDocumentFragment();
    frag.appendChild(ALLOC.top); frag.appendChild(ALLOC.rows); frag.appendChild(ALLOC.btm);
    a.innerHTML=`<div class="title">${ALLOC.label}</div>`;
    a.appendChild(frag);
    allocFullClose();
  }
  ALLOC.render();
}
function menuModal(){
  const wide=matchMedia('(min-width:921px)').matches;
  const mob=document.body.classList.contains('mobile-ui');
  const big=document.body.classList.contains('big-text');
  modalOpen(`<h3>選單</h3>
    <button class="btn" id="md-theme" style="text-align:center">切換佈景主題</button>
    <button class="btn" id="md-big" style="text-align:center">${big?'切回標準字級':'改用大字級'}</button>
    ${wide?`<button class="btn" id="md-ui" style="text-align:center">${mob?'切回電腦版介面':'改用手機版介面'}</button>`:''}
    <button class="btn warn" id="md-restart0" style="text-align:center">重新開始</button>
    <button class="btn" id="md-close" style="text-align:center;margin-top:14px">關閉</button>`);
  $('md-theme').onclick=themeModal;
  $('md-big').onclick=()=>{ applyBigText(!big); menuModal(); };
  const mu=$('md-ui'); if(mu)mu.onclick=()=>{ applyMobileUI(!mob); menuModal(); };
  $('md-restart0').onclick=restartModal;
  $('md-close').onclick=modalClose;
}
function restartModal(){
  modalOpen(`<h3>重新開始</h3><p>確定要放棄這段人生，從頭開始嗎？</p>
    <button class="btn warn" id="md-restart" style="text-align:center">放棄這段人生，重新開始</button>
    <button class="btn" id="md-cancel" style="text-align:center">繼續目前的生涯</button>`);
  $('md-restart').onclick=()=>{ _allowLeave=true; location.href=location.pathname; };
  $('md-cancel').onclick=menuModal;
}
/* Accidental-reload guard: pull-to-refresh / F5 / tab close mid-game triggers the
   native leave prompt; intentional restarts set _allowLeave, finished games skip it */
let _allowLeave=false;
window.addEventListener('beforeunload',function(ev){
  if(!S||S.done||_allowLeave)return;
  ev.preventDefault(); ev.returnValue='';
});
const THEME_NAMES={a:'深綠記分板',b:'電子看板',c:'報紙版面',d:'現代儀表板'};
/* Keeps the collapsed 顯示設定 line reporting the current values, so the player never has to
   expand it just to find out what is set. Layout is left out on purpose: it is hidden below
   921px, and naming a setting that cannot be seen would be worse than saying nothing. */
function updDispSum(){ const el=document.getElementById('disp-sum'); if(!el)return;
  const parts=[THEME_NAMES[document.body.dataset.theme||'a'],
    document.body.classList.contains('big-text')?'大字':'標準'];
  /* The layout row only exists at desktop width. Read its computed display instead of
     repeating the 921px breakpoint here, so the summary keeps listing exactly the settings
     the player can actually see even if that breakpoint ever moves. */
  const ui=document.getElementById('fld-ui');
  if(ui&&getComputedStyle(ui).display!=='none')
    parts.push(document.body.classList.contains('mobile-ui')?'手機版':'電腦版');
  el.textContent='\u3000'+parts.join(' · '); }
function themeModal(){
  const cur=document.body.dataset.theme||'a';
  modalOpen('<h3>佈景主題</h3>'+['a','b','c','d'].map(t=>
    `<button class="btn${t===cur?' main':''}" data-mt="${t}" style="text-align:center">${THEME_NAMES[t]}${t===cur?' ✓':''}</button>`).join('')+
    `<button class="btn" id="md-back" style="text-align:center;margin-top:14px">返回選單</button>`);
  $('modal-box').querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>{ applyTheme(b.dataset.mt); themeModal(); });
  $('md-back').onclick=menuModal;
}
/* ================= 生涯時間軸(純呈現層,不觸碰 RNG) ================= */
let TL=[];
function tlStage(){
  if(!S)return '';
  if(S.stage==='HS')return '高中 · '+S.team;
  if(S.stage==='U')return '大學 · '+S.team;
  if(S.stage==='AMA')return '業餘 · '+S.team;
  const og={CPBL:'中職',NPB:'旅日',MiLB:'旅美'}[S.org]||'職業';
  return og+' · '+(S.orgTeam||'');
}
function tlPush(){
  TL.push({year:S.year,stage:tlStage(),lab:stageLabel(),note:'',pri:0,el:_curYearBody?_curYearBody.parentElement:null});
  renderTimeline();
}
function tlNote(pri,txt){ /* keep only the highest-priority note per year */
  const e=TL[TL.length-1]; if(!e||!txt)return;
  if(pri>=e.pri){ e.note=txt; e.pri=pri; renderTimeline(); }
}
function renderTimeline(){
  const list=$('tl-list'), strip=$('tl-strip');
  if(list){
    let html='',cur=null;
    TL.forEach((e,i)=>{
      if(e.stage!==cur){ if(cur!==null)html+='</div>'; html+=`<div class="tlg"><div class="tlg-h">${e.stage}</div>`; cur=e.stage; }
      const now=i===TL.length-1, gone=!(e.el&&e.el.isConnected);
      html+=`<div class="tl-item${now?' now':''}${(gone&&!now)?' gone':''}" data-i="${i}"><span class="dot"></span><span class="t">${e.year} ${e.lab}${e.note?' <b>'+e.note+'</b>':''}</span></div>`;
    });
    if(cur!==null)html+='</div>';
    list.innerHTML='<div id="tl-wrap">'+html+'</div>';
    list.scrollTop=list.scrollHeight; /* keep the newest year in view */
  }
  if(strip){
    strip.innerHTML=TL.map((e,i)=>`<span class="tl-chip${i===TL.length-1?' now':''}" data-i="${i}">${e.year}${e.note?'★':''}</span>`).join('');
    strip.scrollLeft=strip.scrollWidth;
  }
}
function tlScrollTo(e){ /* scroll via window.scrollTo (not scrollIntoView; see handoff) */
  if(!e||!e.el||!e.el.isConnected)return;
  e.el.classList.remove('collapsed'); /* expand the target year so the jump has visible feedback */
  const bd=$('board'), off=(bd?bd.offsetHeight:0)+10;
  window.scrollTo(0,Math.max(0,e.el.getBoundingClientRect().top+window.scrollY-off));
}
function careerTimelineCard(){ /* two-layer horizontal timeline for the career summary */
  if(!TL.length)return;
  const eras=[];
  TL.forEach(e=>{ const last=eras[eras.length-1];
    if(last&&last.stage===e.stage)last.n++; else eras.push({stage:e.stage,from:e.year,n:1}); });
  const eraCols=['var(--info)','var(--good)','var(--accent)','var(--dim)'];
  const bands=eras.map((e,i)=>{ const to=e.from+e.n-1;
    const span=e.n>1?`${e.from}–${String(to).slice(2)}`:String(e.from);
    return `<div title="${e.stage} ${span}" style="flex:${e.n};min-width:0;background:var(--panel2);border-top:3px solid ${eraCols[i%4]};border-radius:var(--r);padding:6px 8px 5px">`+
      `<div style="font-family:var(--head);font-size:11px;font-weight:700;letter-spacing:.08em;white-space:nowrap;overflow:hidden">${e.stage}</div>`+
      `<div style="font-family:var(--mono);font-size:10px;opacity:.75;white-space:nowrap;overflow:hidden">${span}</div></div>`; }).join('');
  const y0=TL[0].year, span=Math.max(1,TL.length-1);
  let ms=TL.filter(e=>e.note);
  if(ms.length>7)ms=ms.slice().sort((a,b)=>b.pri-a.pri||a.year-b.year).slice(0,7).sort((a,b)=>a.year-b.year);
  /* width-aware greedy lanes: each label takes the first of 3 rows where it
     clears that row's previous label (widths estimated from char count at the
     guaranteed min-width, so wider containers only add slack); if 3 rows are
     not enough, the per-year pixel width grows until everything fits */
  const estW=s=>{let w=0;for(const c of s)w+=c.codePointAt(0)>0x2E7F?10.5:7.5;return w;};
  const labW=e=>Math.max(estW(String(e.year)),estW(e.note))+10;
  let pxY=32,placed=null;
  while(!placed&&pxY<=320){
    const axisW=TL.length*pxY-52,right=[],out=[];
    for(const e of ms){
      const x=(e.year-y0)/span*axisW,w=labW(e);
      let r=0;
      while(r<right.length&&x-w/2<right[r])r++;
      if(r>2){out.length=0;break;}
      right[r]=x+w/2;out.push({e,r});
    }
    if(out.length===ms.length)placed=out;else pxY+=8;
  }
  if(!placed)placed=ms.map((e,j)=>({e,r:j%3})); /* same-year duplicates can never separate; degrade gracefully */
  const maxR=placed.reduce((m,p)=>Math.max(m,p.r),0);
  const dots=placed.map(({e,r})=>`<div style="position:absolute;left:${((e.year-y0)/span*100).toFixed(2)}%;top:0;transform:translateX(-50%);text-align:center">`+
      `<span style="width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:var(--glow);display:block;margin:4px auto 0"></span>`+
      `<div style="margin-top:${4+r*38}px">`+ /* row step 38px: the 2-line label block is ~33px tall at the inherited 1.6 line-height */
      `<span style="font-family:var(--mono);font-size:10px;color:var(--dim);display:block;white-space:nowrap">${e.year}</span>`+
      `<span style="font-size:10.5px;font-weight:700;display:block;white-space:nowrap">${e.note}</span></div></div>`).join('');
  /* guaranteed width per year; long careers scroll horizontally inside the card */
  const minW=TL.length*pxY;
  card('','生涯時間軸',
    `<div style="overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;margin-top:4px;padding-bottom:4px">`+
    `<div style="min-width:${minW}px">`+
    `<div style="display:flex;gap:3px;margin-bottom:6px">${bands}</div>`+
    `<div style="margin:0 26px"><div style="position:relative;height:${62+38*maxR}px">`+
    `<i style="position:absolute;left:0;right:0;top:8px;height:2px;background:var(--edge)"></i>${dots}</div></div>`+
    `</div></div>`);
}
function card(cls,title,html){ const d=document.createElement('div'); d.className='card '+cls;
  d.innerHTML=(title?`<h4>${title}</h4>`:'')+html; logTarget().appendChild(d);
  renderTraits(); /* settlement-time trait unlocks emit a card without a board() refresh */
  scrollBottom(); }
function divider(t){ /* 每個 divider 開啟新的年度摺疊區塊 */ const log=$('log'); const blocks=log.querySelectorAll('.yr-block'); /* 替剛結束的「上一年」加上下拉箭頭標記，但保留展開（不加上 collapsed） */ const prev = blocks[blocks.length - 1]; if(prev){ const h = prev.querySelector('.yr-head'); if(h && prev.querySelector('.yr-body').children.length) h.classList.add('has-body'); } /* 找到「前年」（倒數第二個區塊）並將其摺疊起來 */ const prevPrev = blocks[blocks.length - 2]; if(prevPrev){ prevPrev.classList.add('collapsed'); } /* 建新區塊 */ const block=document.createElement('div'); block.className='yr-block'; const head=document.createElement('div'); head.className='yr-head'; head.textContent=t; const body=document.createElement('div'); body.className='yr-body'; head.onclick=()=>block.classList.toggle('collapsed'); block.appendChild(head); block.appendChild(body); log.appendChild(block); _curYearBody=body; /* 超過上限:移除最舊的年度區塊(釋放 DOM) */ const newBlocks=log.querySelectorAll('.yr-block'); if(newBlocks.length>MAX_YEARS){ for(let i=0;i<newBlocks.length-MAX_YEARS;i++)newBlocks[i].remove(); } }
function board(phase){
  renderTraits();
  $('bd-name').innerHTML=`${S.name}<small>${S.dpos?DPN[S.dpos]:POSN[S.pos]}${S.role?'·'+roleN(S.role):''}·${playerType()}${S.traits.genius?' ★':''}</small>`;
  let t;
  if(S.stage==='HS')t=S.team+'（高'+['一','二','三'][S.stageYr-1]+'）';
  else if(S.stage==='U')t=S.team+'（大'+['一','二','三','四'][S.stageYr-1]+'）';
  else if(S.stage==='AMA')t=S.team+'（業餘）';
  else t=S.teamName();
  { const tc = (S.orgTeam && TEAM_COLOR[S.orgTeam]) || 'var(--amber)';
    /* 判斷顏色是否為白色，避免白底白字 */
    const isWhite = (tc.toLowerCase() === '#ffffff' || tc.toLowerCase() === '#fff');
    
    /* 只有進入職業且有設定代表色時，才加上白底標籤樣式 */
    const isProColored = (S.stage === 'PRO' && TEAM_COLOR[S.orgTeam]);
    const txtColor = isProColored ? (isWhite ? '#000000' : tc) : 'var(--amber)';
    const bgStyle = isProColored ? 'background:#ffffff; padding:2px 8px; border-radius:6px; box-shadow:0 2px 4px rgba(0,0,0,0.4);' : '';
    
    const dot = isProColored ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isWhite ? '#cccccc' : tc};margin-right:6px;vertical-align:middle;box-shadow:0 0 2px rgba(0,0,0,0.2);"></span>` : '';
    
    $('bd-team').innerHTML = dot + `<span style="color:${txtColor}; ${bgStyle} font-weight:900;">${t}</span>`; }
  $('bd-age').textContent=S.age; $('bd-year').textContent=S.year;
  $('bd-ovr').textContent=ovr(); if(S.pos==='P'){const el=$('bd-tj'); if(el)el.textContent='';}
  { const sal=Math.round(S.salary),sp=salParts(sal); $('bd-sal').textContent=sp.v;
    const lb=$('bd-sal-lbl');
    if(lb){ const prev=lb.dataset.u; lb.textContent='生涯薪('+sp.u+')';
      /* prev is unset on the first render of a career, so the opening board never pulses */
      if(prev&&prev!==sp.u){ lb.classList.remove('unitflip'); void lb.offsetWidth; lb.classList.add('unitflip'); }
      lb.dataset.u=sp.u; }
    const tip=$('bd-sal-tip'); if(tip)tip.textContent=fmtMoney(sal)+' 台幣'; }
  [0,1,2].forEach(i=>$('lp'+i).classList.toggle('on',i===phase));
}
function actClear(){ const a=$('act'); a.innerHTML=''; a.classList.remove('collapsed');
  const t=$('act-toggle'); if(t)t.style.display='none';
  /* every actClear() site is a point where an allocation has ended or is restarting,
     so this is also where the overlay is torn down and the live allocation forgotten */
  ALLOC=null; allocFullClose(); const fb=$('af-body'); if(fb)fb.innerHTML='';
  const s=$('act-side'); if(s)s.classList.remove('alloc'); }
function actToggleSync(){
  const a=$('act'), t=$('act-toggle'); if(!t)return;
  const has=a.innerHTML.trim()!=='' && a.style.display!=='none';
  t.style.display=has?'block':'none';
  t.textContent=a.classList.contains('collapsed')?'⌃ 展開選項':'⌄ 收合選項';
}
function choose(title,opts){
  actClear(); const a=$('act');
  a.classList.remove('collapsed'); /* 新選項出現時自動展開 */
  if(title)a.innerHTML=`<div class="title">${title}</div>`;
  opts.forEach(o=>{ const b=document.createElement('button');
    b.className='btn'+(o.main?' main':'')+(o.warn?' warn':'');
    b.innerHTML=o.t+(o.s?`<small>${o.s}</small>`:'');
    b.onclick=()=>{ actClear(); o.f(); }; a.appendChild(b); });
  actToggleSync(); scrollBottom();
}
/* ---------- 關鍵判定：D20 + 能力修正 vs DC ---------- */
const MIND_N={discipline:'自律',nerve:'沉著',insight:'洞察'};
function ensureCampaignState(){
  if(!S.mind)S.mind={discipline:45,nerve:45,insight:45};
  if(!S.dev)S.dev={plan:null,focus:null,fatigue:0,trust:0,spring:0};
  if(!S.era)S.era={seen:{},olympicDream:false,intlEdge:0,rivalLeague:false,suspension:0,usDoor:false};
  if(!S.era.seen)S.era.seen={};
  if(!S.era.overseasSeen)S.era.overseasSeen={};
  if(!S.era.overseasArrival)S.era.overseasArrival={};
  if(!S.era.fameLeagues)S.era.fameLeagues={};
  if(!S.dark)S.dark={involved:0,evidence:0,danger:0,money:0,refused:false,exited:false,cooperated:false,exposed:false};
  if(!S.overseasDark)S.overseasDark={ped:false,evidence:0,clean:false,disclosed:false,years:0,caught:false,refused:0};
  if(S.overseasDark.years==null)S.overseasDark.years=0;
  if(S.overseasDark.caught==null)S.overseasDark.caught=false;
  if(S.overseasDark.refused==null)S.overseasDark.refused=0;
  if(!S.achievements)S.achievements=[];
  if(!S.achievementLog)S.achievementLog={};
}
function d20Mod(score){ return clamp(Math.round((score-50)/5),-6,6); }
function d20Check(cfg,done){
  ensureCampaignState();
  const score=clamp(Math.round(cfg.score==null?(S.mind[cfg.ability]||50):cfg.score),1,80);
  const label=cfg.label||MIND_N[cfg.ability]||ABL[cfg.ability]||'能力';
  const mod=d20Mod(score)+(cfg.bonus||0), edge=clamp(cfg.edge||0,-1,1);
  const rolls=[ri(1,20)]; if(edge)rolls.push(ri(1,20));
  const die=edge>0?Math.max(...rolls):edge<0?Math.min(...rolls):rolls[0];
  const total=die+mod, success=die===20||(die!==1&&total>=cfg.dc), margin=total-cfg.dc;
  const strong=success&&(die===20||margin>=5), hardFail=!success&&(die===1||margin<=-5);
  const tier=strong?'strong':success?'success':hardFail?'hardFail':'mixed';
  const sign=mod>=0?`+${mod}`:String(mod), kept=edge?`，取 ${die}`:'';
  const edgeTxt=edge>0?'優勢':edge<0?'劣勢':'正常';
  const resultTxt=strong?'漂亮成功':success?'成功':hardFail?'嚴重失敗':'失敗，但還沒到最糟';
  card(success?(strong?'gold':'good'):'bad',`D20 判定｜${cfg.title}`,
    `${cfg.stakes?cfg.stakes+'<br>':''}<div id="dice">${rolls.map(v=>`<div class="die ${v===die?'active':''} ${v===20?'six':''}">${v}</div>`).join('')}</div>`+
    `<div class="statline">${edgeTxt}${kept}｜${label} ${score}（修正 ${sign}）｜DC ${cfg.dc}<br>`+
    `<b class="${success?'up':'dn'}">${die} ${sign} = ${total}｜${resultTxt}</b></div>`);
  choose('',[{t:'▸ 接受判定結果',main:true,f:()=>done({score,mod,rolls,die,total,success,strong,hardFail,tier,margin})}]);
}
function improveMind(k,n){ ensureCampaignState(); S.mind[k]=clamp(S.mind[k]+n,1,80); }
function usPathOpen(){ return !!(S&&(S.year>=1999||(S.era&&S.era.usDoor))); }

/* ---------- 咖位與年代成就：你說同一句話，聯盟不一定用同一種音量聽 ---------- */
const ACHIEVEMENTS={
  barcelona_youngest:{name:'十八歲的第二十人',desc:'十八歲越級擠進巴塞隆納最後名單；舞台很大，位置很小，但名字已經寫在銀牌旁邊。',league:'ALL',pts:160},
  beef_noodle_return:{name:'一碗投回美國',desc:'大傷後回家賣牛肉麵，喝完自己的湯忽然通體舒暢，最後又站回美國職棒的投手丘。',league:'ALL',pts:220},
  jp_arrival:{name:'助人不是助拳',desc:'在日本不只交出成績，也讓休息室真正叫出你的名字。',league:'NPB',pts:120},
  jp_fa_voice:{name:'自己的名字，自己簽',desc:'在自由球員制度起步時，替球員選擇權留下聲音。',league:'NPB',pts:180},
  jp_bridge:{name:'太平洋的風',desc:'在旅美先驅打開窄門時，讓自己的資料也跟著過海。',league:'NPB',pts:180},
  jp_workload:{name:'一百球以後',desc:'在「王牌就該撐」的年代，保住身體也保住位置。',league:'NPB',pts:150},
  jp_bay_star:{name:'灣岸之星',desc:'成為 1998 年橫濱奇蹟的一部分。',league:'NPB',pts:240},
  jp_nextwave:{name:'下一張船票',desc:'在亞洲野手跨海成功後，讓球探也重新看見自己的球路或揮棒。',league:'NPB',pts:190},
  jp_union:{name:'十二支球隊',desc:'在合併風暴與罷賽中，站到球員和球迷這一邊。',league:'NPB',pts:260},
  us_arrival:{name:'異鄉的第一句',desc:'在美國第一次用自己的聲音站穩休息室。',league:'MLB',pts:120},
  us_union:{name:'沒有世界大賽的秋天',desc:'在 1994 年停擺風暴中守住自己的立場。',league:'MLB',pts:220},
  us_nomo:{name:'旋風之後',desc:'沒有躲開亞洲球員的標籤，反而替後來的人多留一扇門。',league:'MLB',pts:170},
  us_interleague:{name:'兩個聯盟的第一夜',desc:'在跨聯盟賽初登場的燈光下留下名字。',league:'MLB',pts:180},
  us_clean:{name:'乾淨的球衣',desc:'在力量競賽最瘋狂的年代拒絕灰色捷徑。',league:'MLB',pts:220},
  us_ichiro:{name:'海的另一邊',desc:'在亞洲野手浪潮來臨時，用球棒而不是標籤回答。',league:'MLB',pts:180},
  us_community:{name:'不只是棒球',desc:'在城市最需要人的時候，明白球員不只是一張成績表。',league:'MLB',pts:240},
  us_truth:{name:'把名字寫上去',desc:'在藥檢制度成形前選擇誠實，承擔代價也停止說謊。',league:'MLB',pts:180},
  us_262:{name:'數字不需要翻譯',desc:'在長打至上的時代，證明安打與上壘也能改變比賽。',league:'MLB',pts:220},
  decline_clean:{name:'慢下來也是真實的我',desc:'進入衰退期後拒絕禁藥，接受歲月也不借回假的巔峰。',league:'ALL',pts:200},
  decline_truth:{name:'退潮時不說謊',desc:'在禁藥秘密曝光前主動交代，承擔停賽並停止使用。',league:'ALL',pts:100},
  decline_shadow:{name:'把巔峰借回來',desc:'在衰退期選擇禁藥；數字回來了，生涯也從此留下一道陰影。',league:'ALL',pts:-260,bad:true},
  world_headline:{name:'三地頭條',desc:'在台灣、日本與美國都曾成為聯盟明星。',league:'ALL',pts:300}
};
function playerStanding(){
  if(!S||S.stage!=='PRO')return {key:'fringe',index:0,name:'邊緣人',bonus:-1,edge:0};
  const l=LV[S.lv]||{}, top=!!l.top, prev=S.lastD||(S.era&&S.era.standingD)||S.prevD||0;
  const recent=(S.honors||[]).filter(h=>{const y=parseInt(h,10);return Number.isFinite(y)&&y>=S.year-2;});
  const allStars=careerAllStars(), major=recent.some(h=>/年度MVP|年度最佳投手|賽揚|澤村/.test(h));
  const crown=recent.some(h=>/新人王|打擊王|全壘打王|勝投王|三振王|救援王|金手套|守備王/.test(h));
  const trust=S.dev&&S.dev.trust||0;
  const heat=(top?7:-7)+clamp(ovr()-(l.par||45),-12,18)+clamp(prev,-7,7)*1.6+Math.min(8,allStars*2)+(major?13:0)+(crown?6:0)+trust*0.35;
  let index=0;
  if(top&&((major&&heat>=16)||(allStars>=3&&heat>=22)||heat>=31))index=3;
  else if(top&&(major||crown||allStars>=1||heat>=16))index=2;
  else if(top&&heat>=2)index=1;
  const rows=[['fringe','邊緣人',-1,0],['regular','一軍主力',0,0],['star','明星球員',1,0],['icon','聯盟門面',2,1]];
  const r=rows[index]; return {key:r[0],index,name:r[1],bonus:r[2],edge:r[3],heat:Math.round(heat)};
}
function standingLine(p){
  const tag=`<span class="sub">目前咖位：${p.name}</span><br>`;
  return tag+(p.index===3?'你的名字印在海報正中央；一句話就足以變成隔天社論。':
    p.index===2?'記者已經會在賽前等你。你不是最大聲的人，卻是不能假裝沒看見的人。':
    p.index===1?'你有自己的置物櫃，也有必須守住的位置。聯盟開始聽見你，但還不會等你。':
    '教練有時只喊你的背號。這種時候，立場很貴，沉默也不便宜。');
}
function unlockAchievement(id,note){
  ensureCampaignState(); const a=ACHIEVEMENTS[id]; if(!a||S.achievements.includes(id))return false;
  const p=playerStanding(); S.achievements.push(id); S.achievementLog[id]={year:S.year,standing:p.name};
  const sign=a.pts>=0?`+${a.pts}`:String(a.pts);
  card(a.bad?'bad':'gold',`${a.bad?'生涯印記':'年代成就'}解鎖：${a.name}`,`${a.desc}${note?'<br>'+note:''}<br><span class="sub">${S.year}｜當時咖位：${p.name}｜生涯評價 ${sign}</span>`);
  return true;
}
function revokeAchievement(id,note){
  ensureCampaignState(); const i=S.achievements.indexOf(id),a=ACHIEVEMENTS[id]; if(i<0||!a)return false;
  S.achievements.splice(i,1); delete S.achievementLog[id];
  card('bad',`年代成就失效：${a.name}`,`${note||'後來的選擇，改寫了這項成就原本代表的事。'}<br><span class="sub">相關生涯評價加成已移除</span>`);
  return true;
}
function achievementScore(bucket){
  ensureCampaignState(); return S.achievements.reduce((sum,id)=>{const a=ACHIEVEMENTS[id];return sum+(a&&(a.league===bucket||a.league==='ALL')?a.pts:0);},0);
}
function recordFameLeague(){
  if(S.stage!=='PRO')return; ensureCampaignState(); const b=bucketOf(S.lv),p=playerStanding();
  if(['CPBL','NPB','MLB'].includes(b)&&p.index>=2)S.era.fameLeagues[b]=true;
  if(['CPBL','NPB','MLB'].every(k=>S.era.fameLeagues[k]))unlockAchievement('world_headline','三個地方都曾有人為你的名字提早進場。');
}

/* 衰退期禁藥線：不是固定劇情，每一年都由壓力、傷勢與咖位共同決定是否敲門。 */
function declineDrugFlow(done){
  ensureCampaignState(); const O=S.overseasDark, dec=S.era.declineNow||0;
  if(S.stage!=='PRO'||dec<=0||S.skipMid||O.caught){done();return;}
  if(!S.era.declineDrugSeen)S.era.declineDrugSeen={};
  const p=playerStanding(), handledUS=S.org==='MiLB'&&[1998,2003,2004].includes(S.year);
  if(handledUS){done();return;}
  if(O.ped){
    const expose=clamp(8+O.evidence*7+O.years*5+(p.index>=2?6:0),8,70);
    if(chance(expose)){declineDrugExposure(p,done);return;}
    declineDrugActive(p,dec,done);return;
  }
  if(O.disclosed||S.era.declineDrugSeen[S.year]){done();return;}
  S.era.declineDrugSeen[S.year]=true;
  const pressure=clamp(10+dec*4+(S.bigInj||0)*3+p.index*3-(O.refused||0)*4,8,48);
  if(!chance(pressure)){done();return;}
  declineDrugTemptation(p,dec,done);
}
function declineDrugTemptation(p,dec,done){
  const O=S.overseasDark, core=S.pos==='P'?'球速和恢復':'揮棒速度和恢復';
  const who=p.index===3?'贊助商介紹的「身體顧問」在高級餐廳等你':p.index===2?'經紀人把房門反鎖，說這能保住你的招牌數字':p.index===1?'老隊友洗完澡後留下來，從包裡拿出一只沒有標籤的盒子':'一個你叫不出名字的訓練員說，這能讓你留在名單上';
  card('bad',`${S.year}｜身體慢了，誘惑追上來`,`${who}。「不是變強，只是把被年紀拿走的拿回來。」他說能讓${core}回到去年，沒說代價會在哪一年追上。<br>${standingLine(p)}`);
  choose('這不是訓練方法的選擇，是你願不願意把生涯交給一個秘密。',[
    {t:'不要。慢下來也是真實的我',main:true,s:'拒絕禁藥｜解鎖正面年代成就',f:()=>{O.clean=true;O.refused=(O.refused||0)+1;improveMind('discipline',2);unlockAchievement('decline_clean',p.index>=2?'你接受海報終有一天會換人，卻不讓舊海報替你做決定。':'名單可能不等你；至少上面的數字仍然是你。');done();}},
    {t:'先找球員會、隊醫或可信任的人談',s:`D20 洞察 DC ${13+p.index}｜成功找到合法調整方案`,f:()=>d20Check({title:'把盒子帶到光下',ability:'insight',dc:13+p.index,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'牽涉你的人越多，新聞越大。你得先找到會保護球員，而不是保護球團的人。':'你沒有證據鏈，只有一句話和一只還沒打開的盒子。'},r=>{O.clean=true;O.refused=(O.refused||0)+1;if(r.success){S.dev.fatigue=Math.max(0,S.dev.fatigue-8);S.dev.trust+=2;S.pool+=1;unlockAchievement('decline_clean','合法的恢復計畫不會把歲月倒轉，但讓你知道還能怎麼打。');}else{S.dev.trust--;card('info','消息先漏了出去','你沒有碰禁藥，報紙卻先用了「禁藥疑雲」四個字。清白有時也得花時間證明。');}done();})},
    {t:'收下。我要把巔峰借回來',warn:true,s:`恢復本季部分衰退｜留下證據，往後可能遭藥檢、曝光與停賽`,f:()=>{revokeAchievement('decline_clean','你曾經把盒子推回去，這一次卻把它帶回家。');revokeAchievement('us_clean','乾淨球衣的承諾，在這次選擇後失去原來的意義。');O.ped=true;O.evidence=Math.max(1,O.evidence+1);O.years=1;const back=Math.max(1,Math.ceil(dec*.6));POS_AB[S.pos].forEach(k=>addAb(k,back));S.dev.trust+=p.index>=2?2:1;unlockAchievement('decline_shadow',`所有能力暫時回升 ${back}；這些數字從今天起不再只屬於球場。`);done();}}
  ]);
}
function declineDrugActive(p,dec,done){
  const O=S.overseasDark, back=Math.max(1,Math.ceil(dec*.45));
  card('bad',`${S.year}｜借來的巔峰又來收利息`,`${p.index>=2?'每個人都在等你維持招牌數字。':'名單又縮短了，你知道盒子裡還剩什麼。'} 去年的秘密沒有消失，只是變成今年必須再做一次的選擇。`);
  choose('你還要繼續嗎？',[
    {t:'繼續使用',warn:true,s:`所有能力回補 ${back}｜證據與曝光率上升`,f:()=>{POS_AB[S.pos].forEach(k=>addAb(k,back));O.years++;O.evidence++;S.dev.trust++;card('bad','數字又回來了',`所有能力暫時回升 <b class="up">${back}</b>。檢測表上的空格，也離你的背號更近。`);done();}},
    {t:'到此為止，停下來',main:true,s:'停止使用｜既有證據不會消失',f:()=>{O.ped=false;addAb(S.pos==='P'?'vel':'pow',-2);card('info','盒子空了，影子還在','你把剩下的東西交出去處理。身體往下掉了一點，至少不會再拿新的秘密撐住。');done();}},
    {t:'主動交代並接受處分',s:'本季出賽量降至 60%｜解鎖誠實成就',f:()=>{O.ped=false;O.disclosed=true;S.seasonFactor=Math.min(S.seasonFactor,.6);S.dev.trust=Math.max(0,S.dev.trust-1);unlockAchievement('decline_truth','你沒有要求大家忘記，只要求從今天開始照實寫。');done();}}
  ]);
}
function declineDrugExposure(p,done){
  const O=S.overseasDark, source=S.org==='CPBL'?'聯盟檢測與匿名檢舉':S.org==='NPB'?'球團內部檢測與週刊爆料':'聯盟藥檢名單';
  card('bad',`${S.year}｜秘密被叫到名字`,`${source}同時指向你。${p.index>=2?'球場外已經排滿採訪車；你的說法會直接變成聯盟的說法。':'主管把門關上，要你在球團聲明之前先給一個答案。'}`);
  choose('證據已經上桌。你怎麼回答？',[
    {t:'承認、停止使用並配合調查',main:true,s:'本季出賽量降至 45%｜保留重建生涯的機會',f:()=>{O.ped=false;O.disclosed=true;O.caught=true;S.seasonFactor=Math.min(S.seasonFactor,.45);S.dev.trust=Math.max(0,S.dev.trust-3);unlockAchievement('decline_truth','你失去掌聲，也終於不用再背著盒子進休息室。');done();}},
    {t:'否認到底',warn:true,s:`D20 沉著 DC ${14+O.evidence}｜失敗可能整季禁賽`,f:()=>d20Check({title:'禁藥風暴的公開說法',ability:'nerve',dc:14+O.evidence,bonus:p.bonus,edge:p.edge,stakes:'這次判定不會改變你做過的事，只決定證據能不能當場拆穿你。'},r=>{if(r.success){S.seasonFactor=Math.min(S.seasonFactor,.75);O.evidence++;card('info','暫時沒有定案','程序上的縫隙替你爭回一些比賽。球迷沒有因此停止懷疑。');}else{O.ped=false;O.caught=true;S.seasonFactor=0;S.skipMid=true;S.dev.trust=Math.max(0,S.dev.trust-6);card('bad','整季從名單消失','檢測、證詞與紀錄對上了。球團把你的置物櫃封起來，這一年只剩空白。');}done();})}
  ]);
}

/* ---------- 年度養成：目標 → 春訓判定 → 賽季負荷 ---------- */
function springTrainingCheck(done){
  ensureCampaignState();
  const D=S.dev, focus=D.focus;
  const score=D.plan==='skill'&&focus?S.ab[focus]:D.plan==='body'?S.ab.sta:S.mind.nerve;
  const label=D.plan==='skill'&&focus?ABL[focus]:D.plan==='body'?'體力':'沉著';
  const edge=D.fatigue>=25?-1:D.fatigue<=5?1:0;
  d20Check({title:'春訓成果驗收',label,score,dc:S.stage==='PRO'?13:11,edge,
    stakes:'目標訂了，現在看身體和手感買不買單。'},r=>{
    D.spring=r.strong?2:r.success?1:r.hardFail?-2:-1;
    if(r.strong){ S.pendStat=(S.pendStat||0)+2; D.trust+=2; card('good','春訓大爆發','教練本來只是站著看，後來把手上的名單擦掉重寫。<b class="up">本季狀態 +2、教練信任 +2</b>。'); }
    else if(r.success){ S.pendStat=(S.pendStat||0)+1; D.trust++; card('good','春訓過關','沒有煙火，但每一顆球都比去年更像樣。<b class="up">本季狀態 +1</b>。'); }
    else if(r.hardFail){ D.fatigue=clamp(D.fatigue+10,0,50); S.tmpInj=(S.tmpInj||0)+5; card('bad','春訓拉警報','想搶快，身體先踩了煞車。<b class="dn">疲勞 +10、受傷風險 +5%</b>。'); }
    else { D.fatigue=clamp(D.fatigue+5,0,50); card('info','春訓卡關','動作還沒走順。不是世界末日，只是開季得多花一點時間追。'); }
    done();
  });
}
function annualDevelopmentPlan(done){
  ensureCampaignState(); const D=S.dev;
  if(S.skipMid){ D.plan='recovery'; D.focus=null; D.fatigue=Math.max(0,D.fatigue-20);
    card('info','復健年度計畫','今年不追數字。能把身體完整帶回來，就是最大的進步。<b class="up">疲勞 −20</b>。'); done(); return; }
  choose(`年度養成目標｜疲勞 ${D.fatigue}/50｜自律 ${S.mind.discipline}・沉著 ${S.mind.nerve}・洞察 ${S.mind.insight}`,[
    {t:'磨一項武器',main:true,s:'指定能力做全年主軸｜春訓用該能力判定',f:()=>{
      choose('這一年，要把哪一項練成你的名字？',POS_AB[S.pos].map(k=>({t:ABL[k],main:k===POS_AB[S.pos][0],s:`目前 ${S.ab[k]}／潛力 ${S.pot[k]||62}`,f:()=>{D.plan='skill';D.focus=k;springTrainingCheck(done);}})));}},
    {t:'先把身體顧好',s:'體力 +1、疲勞 −15｜少一點爆發，多一點明年',f:()=>{D.plan='body';D.focus='sta';addAb('sta',1);D.fatigue=Math.max(0,D.fatigue-15);springTrainingCheck(done);}},
    {t:'搶一個上場位置',warn:true,s:'用沉著接受春訓檢驗｜成功會換來教練信任',f:()=>{D.plan='role';D.focus=null;D.trust++;springTrainingCheck(done);}}]);
}
function developmentSeasonReview(){
  ensureCampaignState(); const D=S.dev;
  const load=S.seasonFactor<=0?0:S.stage==='PRO'?Math.round(8+Math.max(0,(S.lastSt&&S.lastSt.G)||0)/12):10;
  D.fatigue=clamp(D.fatigue+load-(D.plan==='body'?5:0),0,50);
  if(D.plan==='skill'&&D.focus&&S.seasonFactor>=0.65){ const got=addAb(D.focus,D.spring>=1?2:1);
    if(got>0)card('good','年度養成回顧',`整季反覆磨的東西，終於長在身上。<b class="up">${ABL[D.focus]} +${got}</b>｜季末疲勞 ${D.fatigue}/50。`);
    else card('info','年度養成回顧',`${ABL[D.focus]} 的進度沒有消失，只是高段能力從來不肯白送。季末疲勞 ${D.fatigue}/50。`); }
  else card('info','年度養成回顧',`球季結束，防護員在表上寫下：疲勞 <b class="hl">${D.fatigue}/50</b>。明年春訓，這筆帳還是要算。`);
}

/* ---------- 1990 年代篇：大時代先敲門，球員再決定怎麼活 ---------- */
function phaseHistory(){
  ensureCampaignState();
  if(S.year<1990||S.year>1999||S.era.seen[S.year]){ nextStep(); return; }
  S.era.seen[S.year]=true; const done=()=>nextStep();
  const title=`${S.year}｜島嶼棒球記事`;
  if(S.year===1990){
    card('gold',title,'四支球隊、滿場紙花、第一次真正屬於這座島的職業球季。你隔著電視看見燈光，忽然覺得那片草皮沒有那麼遠。');
    choose('那一年，你把什麼放進心裡？',[
      {t:'總有一天，我要站上去',main:true,s:'沉著 +2',f:()=>{improveMind('nerve',2);done();}},
      {t:'先把每天的基本功做好',s:'自律 +2、季末能力點 +1',f:()=>{improveMind('discipline',2);S.pool++;done();}},
      {t:'家裡需要錢，夢想得算成本',s:'洞察 +2｜黑暗事件會記得這個念頭',f:()=>{improveMind('insight',2);S.era.moneyPressure=1;done();}}]); return;
  }
  if(S.year===1991){
    card('info',title,'奧運資格賽的消息一路燒進校園。那個年代，國家隊不是職業生涯旁邊的支線；有時候，它就是唯一的門。');
    choose('學長問你：要不要把巴塞隆納寫進明年的目標？',[
      {t:'寫。貼在床頭每天看',main:true,s:'1992 代表隊名單判定取得優勢｜自律 +1',f:()=>{S.era.olympicDream=true;S.era.intlEdge=1;improveMind('discipline',1);done();}},
      {t:'先顧校隊，別想得太遠',s:'疲勞 −5',f:()=>{S.dev.fatigue=Math.max(0,S.dev.fatigue-5);done();}}]); return;
  }
  if(S.year===1992){
    card('gold',title,'巴塞隆納的夏天，全島守著轉播。銀牌後來會被寫進歷史；此刻，最後一張名單還壓在教練桌上。');
    if(S.era.olympicDream)S.era.intlEdge=1;
    choose('',[{t:'▸ 把這一年打完',main:true,s:'季中若達門檻，將進行奧運代表隊 D20 名單判定',f:done}]); return;
  }
  if(S.year===1993){
    card('info',title,'球迷變多、球隊也變多。擴編像突然多開了幾扇門——只是每扇門後面，都有人等著搶同一個位置。');
    d20Check({title:'擴編年代的曝光機會',ability:'nerve',dc:11,edge:S.stage==='PRO'?1:0,stakes:'球探和記者都來了。你只有幾球，讓他們記住你的名字。'},r=>{
      if(r.success){S.pool+=r.strong?3:2;card('good','名字被圈了起來',`名單邊上多了一個紅圈。季末能力點 <b class="up">+${r.strong?3:2}</b>。`);} else card('info','鏡頭擦肩而過','你沒有搞砸，只是那天更亮的是別人。球季還長。'); done();}); return;
  }
  if(S.year===1994){
    card('info',title,'職棒進入電視黃金時段。以前失誤只會被球場裡的人看見；現在，全家都能在晚飯桌前看重播。');
    choose('鏡頭開始追著球員跑，你怎麼調整？',[
      {t:'把壓力當成主場燈光',main:true,s:'沉著 +2、疲勞 +3',f:()=>{improveMind('nerve',2);S.dev.fatigue=clamp(S.dev.fatigue+3,0,50);done();}},
      {t:'少看報紙，照自己的節奏',s:'自律 +1、疲勞 −3',f:()=>{improveMind('discipline',1);S.dev.fatigue=Math.max(0,S.dev.fatigue-3);done();}}]); return;
  }
  if(S.year===1995){
    card('info',title,'票房、轉播權、廣告，一切都在往上。棒球第一次像一門大生意，而每個人都以為好日子會一直下去。');
    d20Check({title:'鎂光燈下的一句話',ability:'insight',dc:12,stakes:'麥克風遞到嘴邊。說對了是人氣，說錯了是明天的頭版。'},r=>{
      if(r.success){improveMind('insight',1);S.dev.trust+=r.strong?2:1;card('good','訪問過關','沒有金句，也沒有失言。球團公關鬆了一口氣——這在職棒已經算一種天分。');}
      else {S.dev.trust=Math.max(0,S.dev.trust-1);card('bad','一句話被剪成十秒','你講了三分鐘，播出的偏偏是最糟的那十秒。');} done();}); return;
  }
  if(S.year===1996){ historyBlackMist1996(done); return; }
  if(S.year===1997){ historyLeagueWar1997(done); return; }
  if(S.year===1998){ historyReckoning1998(done); return; }
  historyCollapse1999(done);
}
function historyBlackMist1996(done){
  const pro=S.stage==='PRO', D=S.dark;
  if(pro&&S.org!=='CPBL'){
    card('bad','1996｜故鄉來的壞消息','越洋電話那頭，老隊友先問你好不好，停了很久才說：「這裡出事了。」你離黑霧很遠，名字和牽掛卻都還在島上。');
    choose('你能做的不多，但不能假裝沒聽見。',[
      {t:'勸他把知道的說出來',main:true,s:'洞察 +1',f:()=>{improveMind('insight',1);D.refused=true;done();}},
      {t:'先替家人和老隊友找律師',s:'花費 20 萬｜沉著 +1',f:()=>{S.salary=Math.max(0,S.salary-20);improveMind('nerve',1);D.cooperated=true;done();}}]); return;
  }
  card('bad','1996｜黑霧進場',pro?'飯局最後，那個沒穿球衣的人把信封推過來。「不用輸，照我們說的讓一局難看就好。」冷氣很強，你的手心還是濕了。':'學長說只是報一下傷勢和先發名單，「大家都這樣，哪算什麼？」桌上的信封沒有署名。');
  choose('這不是骰運。這一步，你自己走。',[
    {t:'收下信封',warn:true,s:`進入黑暗路線｜立刻得到 ${pro?'80':'25'} 萬｜證據與危險開始累積`,f:()=>{const m=pro?80:25;D.involved=1;D.evidence=1;D.danger=1;D.money=m;S.salary+=m;card('bad','信封進了包包',`錢是真的，胃裡那個結也是真的。生涯收入 <b class="up">+${m} 萬</b>。從今天起，有些電話不能不接。`);done();}},
    {t:'把信封推回去',main:true,s:'拒絕是你的決定；D20 判定對方是否就此收手',f:()=>{D.refused=true;d20Check({title:'拒絕黑霧',ability:'nerve',dc:13,stakes:'你站起來。門在身後，對方的笑聲也在身後。'},r=>{if(r.success){D.danger=0;card('good','門關上了','你一路走到街口才敢呼吸。至少今晚，沒有人跟上來。');}else{D.danger=2;card('bad','電話沒有停','你沒有拿錢。但從此每次回家，都會多看一次後照鏡。');}done();});}},
    {t:'先記下人名，找可信任的人談',s:'D20 洞察判定｜成功可提早取得保護',f:()=>d20Check({title:'找對的人',ability:'insight',dc:12,stakes:'不是每個穿西裝的人都站在你這邊。你得選對第一個開口的對象。'},r=>{D.refused=true;if(r.success){D.cooperated=true;D.danger=0;S.dev.trust+=2;card('good','有人把門鎖上','對方沒有問你為什麼拖到現在，只說：「接下來不要一個人走。」');}else{D.danger=2;card('bad','風聲走漏','消息比你想像得更快。你還沒得到保護，對方先知道你開過口。');}done();})}]);
}
function historyLeagueWar1997(done){
  const D=S.dark;
  card('bad','1997｜兩個聯盟，一場風暴','新聯盟開打，舊聯盟的看台卻開始空。場外在搶球員、搶轉播，場內流言像黏土，踩進去就拔不出鞋。');
  if(D.involved>0&&!D.exited&&!D.cooperated){
    choose('那支電話又來了。這次，他們要的更多。',[
      {t:'繼續做，價碼也要加',warn:true,s:'黑暗路線加深｜收入 +180 萬｜證據、危險大增',f:()=>{D.involved++;D.evidence+=2;D.danger+=2;D.money+=180;S.salary+=180;card('bad','第二個信封','第一次還能說服自己只是一步。第二次之後，路已經開始替你選方向。');done();}},
      {t:'我要退出',main:true,s:'D20 沉著 DC 15｜成功才能乾淨抽身',f:()=>d20Check({title:'從黑霧裡退場',ability:'nerve',dc:15,stakes:'你把剩下的話一次說完。電話那頭安靜得比威脅更可怕。'},r=>{if(r.success){D.exited=true;D.danger=Math.max(0,D.danger-1);card('good','暫時斷線','電話掛了。你知道事情沒有消失，但至少下一球重新是你自己的。');}else{D.danger+=2;card('bad','他們不接受辭職','對方只回了一句：「球季還沒結束。」');}done();})},
      {t:'帶著資料去找檢調',s:'D20 洞察 DC 13｜成功可轉為合作證人',f:()=>d20Check({title:'把證據交出去',ability:'insight',dc:13,stakes:'你帶著的不只是一疊紙，也是自己做過的事。'},r=>{D.cooperated=true;if(r.success){D.danger=0;card('good','筆錄做到天亮','走出大樓時天已經亮了。你不乾淨，但你終於站到風的另一邊。');}else{D.danger+=1;card('bad','證據還不夠','他們記下你的話，卻還不能保證任何事。黑霧知道你動了。');}done();})}]); return;
  }
  const canJump=S.stage==='PRO'&&S.org==='CPBL';
  choose('新聯盟也在找人。你要站哪一邊？',[
    {t:'留在原來的聯盟',main:true,s:'教練信任 +1',f:()=>{S.dev.trust++;done();}},
    {t:canJump?'跳去新聯盟':'把新聯盟記在未來選項裡',warn:true,s:canJump?'換一件球衣，從混戰裡搶位置':'沉著 +1',f:()=>{S.era.rivalLeague=true;if(canJump){S.orgTeam=pick(RIVAL_TEAMS);S.teamYears=0;tlNote(2,'轉戰新聯盟 '+S.orgTeam);card('info','換邊','行李不多，爭議不少。新球場的燈一亮，你還是得用成績回答。');}else improveMind('nerve',1);board(1);done();}},
    {t:'誰都不信，只管把球打好',s:'疲勞 +3、自律 +1',f:()=>{S.dev.fatigue=clamp(S.dev.fatigue+3,0,50);improveMind('discipline',1);done();}}]);
}
function historyReckoning1998(done){
  const D=S.dark;
  card('bad','1998｜飛鷹折翼','約談、搜索、停賽。曾經滿場的歡呼突然安靜下來，一支球隊倒下，所有人的名字都被拿到光底下照。');
  if(D.involved>0&&!D.exited&&!D.cooperated){
    choose('調查找上門了。你怎麼面對自己留下的東西？',[
      {t:'承認並配合調查',main:true,s:'停止黑暗路線｜可能遭短期停賽，但可降低最終處分',f:()=>d20Check({title:'完整交代',ability:'insight',dc:12,bonus:-Math.min(2,D.evidence-1),stakes:'不是在找漂亮的說法。每一個名字、每一通電話，都得照實說。'},r=>{D.cooperated=true;D.exposed=true;D.danger=0;S.era.suspension=r.success?0.35:0.65;card(r.success?'info':'bad','代價',`你不再說謊，但時間不會倒轉。<b class="dn">本季出賽量降至 ${Math.round((1-S.era.suspension)*100)}%</b>。`);done();})},
      {t:'否認到底',warn:true,s:'D20 沉著 DC 16｜成功只是暫時沒被定罪，失敗將重罰',f:()=>d20Check({title:'調查室攻防',ability:'nerve',dc:16,bonus:-Math.min(3,D.evidence),stakes:'對方把照片一張張排開。你能聽見牆上時鐘每一格的聲音。'},r=>{if(r.success){D.danger+=1;card('info','暫時走出大門','沒有直接證據把你留下。但記者還在門口，電話也還在響。');}else{D.exposed=true;S.era.suspension=r.hardFail?1:0.7;card('bad','名字上了頭條',r.hardFail?'禁賽處分落下。本季不會再有你的打席。':'證詞對上了。球團先把你移出名單，等候處分。');}done();})}]); return;
  }
  if(S.stage==='PRO'&&S.org==='CPBL'&&S.orgTeam==='華報飛鷹'){
    const nt=pick(cpblTeamsForYear(1998));S.orgTeam=nt;S.teamYears=0;tlNote(2,'飛鷹解散後轉至 '+nt);
    card('bad','置物櫃被清空','飛鷹沒有下一季了。你抱著紙箱離開球場，新的球衣是 <b class="hl">'+nt+'</b>——沒有人知道這個聯盟還能撐多久。');board(1);
  } else if(D.cooperated) card('info','證人席','你不是英雄，也洗不掉做過的事。但至少這一次，你把知道的都說了。');
  choose('',[{t:'▸ 繼續這個球季',main:true,f:done}]);
}
function historyCollapse1999(done){
  const collapse=S.stage==='PRO'&&S.org==='CPBL'&&['北城赤龍','首都猛虎'].includes(S.orgTeam);
  card('bad','1999｜創始球隊的最後一季','兩支開國元老已經撐到牆邊。有人開始把紀念物收進紙箱；同一個冬天，太平洋另一端也出現一扇終於能讓這一代接著走的窄門。');
  const finish=()=>{S.era.usDoor=true;done();};
  if(S.stage==='PRO'&&S.org==='MiLB'){
    S.era.usDoor=true;
    card('info','你已經在門的另一側','故鄉的兩支老球隊熄燈時，你正在美國整理下一場客場行李。那扇窄門對別人剛打開，對你卻已經是每天都得守住的工作。');
    choose('',[{t:'▸ 打一通電話回家',main:true,s:'沉著 +1',f:()=>{improveMind('nerve',1);done();}}]); return;
  }
  if(collapse){
    choose(`${S.orgTeam} 沒人敢保證還有明年；眼前這一季，你仍穿著原來的球衣。`,[
      {t:'把最後一季打完，季末接受安置',main:true,s:'1999 成績仍記在母隊｜球季結束後轉隊',f:()=>{S.era.collapseChoice='stay';finish();}},
      {t:'把最後一季打完，同時把資料寄往美國',warn:true,s:'1999 成績仍記在母隊｜季末 D20 爭取小聯盟機會',f:()=>{S.era.collapseChoice='us';finish();}}]); return;
  }
  d20Check({title:'這一代的旅美窄門',ability:'insight',dc:13,bonus:ovr()>=48?2:0,stakes:'球探不再只問「你想不想」，而是問「你的資料能不能留下，下一次能不能再看」。'},r=>{if(r.success){S.pool+=r.strong?4:2;card('good','資料被帶走了',`沒有承諾。但你的名字跟著球探上了飛機。季末能力點 <b class="up">+${r.strong?4:2}</b>。`);}else card('info','門開了，還沒輪到你','這次球探帶走的是別人的資料。至少從今天起，那條路確實存在。');finish();});
}
function resolveCollapse1999(done){
  const choice=S.era.collapseChoice;if(!choice){done();return;}
  S.era.collapseChoice=null;const old=S.orgTeam;
  card('bad','最後一場打完了',`${old} 的球衣沒有下一季。你把最後一件留在自己的衣架上，合約則和球隊一起走到句點。`);
  const stay=()=>{const nt=pick(cpblTeamsForYear(2000));S.orgTeam=nt;S.teamYears=0;S.era.rivalLeague=false;tlNote(2,'球隊解散後轉至 '+nt);card('info','換一只置物櫃',`1999 的成績留在 ${old}。明年，你會穿著 <b class="hl">${nt}</b> 繼續打。`);board(1);choose('',[{t:'▸ 前往新球隊',main:true,f:done}]);};
  if(choice==='stay'){stay();return;}
  d20Check({title:'太平洋另一端的回信',ability:'insight',dc:14,bonus:ovr()>=48?2:0,stakes:'最後一季的錄影帶、剪報、幾張球探報告。球隊熄燈後，信封終於有了回音。'},r=>{if(r.success&&ovr()>=41){signTo('MiLB',ovr()>=48?'A1':'R',null,3,1);S.era.rivalLeague=false;card('gold','回信來了','不是大聯盟保證書，只是一張從最底層開始的車票。你簽了。');choose('',[{t:'▸ 飛往美國',main:true,f:done}]);}else{card('info','沒有美國合約','回信沒有變成合約。台灣還有球隊願意留一只置物櫃給你。');stay();}});
}

/* ---------- 海外年代篇：史實是風向，選擇才是球員留下的痕跡 ---------- */
function phaseOverseasHistory(){
  ensureCampaignState();
  if(S.stage!=='PRO'||!['NPB','MiLB'].includes(S.org)){nextStep();return;}
  const route=S.org==='NPB'?'JP':'US', p=playerStanding(), done=()=>nextStep();
  const runYear=()=>{
    const key=route+'-'+S.year, fn=overseasEventFor(route,S.year);
    if(!fn||S.era.overseasSeen[key]){done();return;}
    S.era.overseasSeen[key]=true; fn(p,done);
  };
  if(!S.era.overseasArrival[route]){
    S.era.overseasArrival[route]=S.year;
    (route==='JP'?jpArrival:usArrival)(p,runYear);
  }else runYear();
}
function overseasEventFor(route,year){
  const maps=route==='JP'?{
    1993:jpFreeAgency1993,1995:jpNomo1995,1996:jpWorkload1996,1998:jpBay1998,2001:jpIchiro2001,2004:jpStrike2004
  }:{
    1994:usStrike1994,1995:usNomo1995,1997:usInterleague1997,1998:usPower1998,2001:usSeptember2001,2003:usTesting2003,2004:usHits2004
  };
  return maps[year]||null;
}
function jpArrival(p,done){
  const caller=p.index>=2?'全國體育台把麥克風伸進休息室':'翻譯趁教練走開，悄悄把戰術暗號又說了一遍';
  card('info',`${S.year}｜日本，第一只置物櫃`,`${caller}。牆上寫的是你還讀不快的字，名單上則只有一個很清楚的身分：外國人。<br>${standingLine(p)}`);
  const opts=[
    {t:'先把暗號和隊友名字學會',main:true,s:`D20 洞察 DC ${13-p.bonus}｜成功可解鎖年代成就`,f:()=>d20Check({title:'休息室的共同語言',ability:'insight',dc:13-p.bonus,edge:p.edge,stakes:'不是考日文。是讓隊友在需要補位時，知道你聽得懂。'},r=>{if(r.success){S.dev.trust+=r.strong?3:2;improveMind('insight',1);unlockAchievement('jp_arrival',r.strong?'到了季中，捕手已經懶得等翻譯。':'你的名字終於比「那個助人」更常被喊。');}else{S.dev.trust=Math.max(0,S.dev.trust-1);card('info','慢了半拍','你聽懂了句子，沒聽懂空氣。下一次集合，翻譯還是站在你旁邊。');}done();})},
    {t:'成績就是最好的語言',s:'季末能力點 +2｜教練信任 −1',f:()=>{S.pool+=2;S.dev.trust=Math.max(0,S.dev.trust-1);card('info','少說，多做','你把採訪推掉，留下來多揮一百次。隊友不討厭你，只是還不認識你。');done();}}
  ];
  if(p.index>=2)opts.push({t:'對鏡頭說：我不是來當救世主',s:'D20 沉著｜名氣越大，回音越大',f:()=>d20Check({title:'第一場記者會',ability:'nerve',dc:14,bonus:p.bonus,edge:p.edge,stakes:'一句太軟，會被當客套；一句太硬，明天就只剩標題。'},r=>{if(r.success){S.dev.trust+=2;unlockAchievement('jp_arrival','你把「助人」兩個字，慢慢說成了隊友。');}else{S.dev.trust--;card('bad','標題先到了','你說了很多關於團隊的話，報紙只留下「我不是救世主」。');}done();})});
  choose(`你目前是：${p.name}。第一步怎麼走？`,opts);
}
function jpFreeAgency1993(p,done){
  const who=p.index>=3?'球員會代表直接坐進你的飯店房間':p.index>=2?'資深球星在打擊籠旁叫住你':'二軍學長把一張連署紙壓在便當下面';
  card('info','1993｜自己的名字，誰來決定',`${who}。「自由球員制度要上路了。今天不是問你走不走，是問球員有沒有資格自己選。」<br>${standingLine(p)}`);
  const opts=[
    {t:p.index>=2?'站到球員會旁邊，公開支持':'把名字簽在連署紙上',main:true,s:`D20 洞察｜${p.index>=2?'成功會改變報紙風向':'成功能避開球團秋後算帳'}`,f:()=>d20Check({title:'自由球員制度的第一步',ability:'insight',dc:p.index>=2?14:12,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'記者問：「你是不是已經想離隊？」你得把個人去留和制度分開。':'紙傳到你面前，旁邊的人全都假裝沒看。'},r=>{if(r.success){S.dev.trust+=p.index>=2?2:1;improveMind('insight',1);unlockAchievement('jp_fa_voice',p.index>=2?'你的發言被剪進晚間新聞；這一次，句子沒有被剪壞。':'你不是領頭的人，但名單上確實有你。');}else{S.dev.trust=Math.max(0,S.dev.trust-2);card('bad','話被換了一個意思',p.index>=2?'隔天標題變成「明星逼宮」。制度還沒走穩，你先被推到風口。':'教練沒有問，只把你的打序往後挪了一格。');}done();})},
    {t:'這是日本球員的事，我不表態',s:'教練信任 +1｜失去本事件成就',f:()=>{S.dev.trust++;card('info','安全的位置','沒有人責怪一個外國人沉默。也沒有人再把紙遞給你。');done();}},
    {t:'拿新制度去談自己的合約',warn:true,s:p.index>=2?'薪資 +120 萬｜教練信任 −2':'咖位不足：談判容易被看成不識相',f:()=>{if(p.index>=2){S.salary+=120;S.dev.trust=Math.max(0,S.dev.trust-2);card('info','先替自己簽','你拿到比較好的條件。散會時，學長只朝你點了一下頭。');}else{S.dev.trust=Math.max(0,S.dev.trust-2);card('bad','門很快就開了','主管把你的合約闔上：「先站穩一軍，再談選擇。」');}done();}}
  ];
  choose('制度第一次站上打席，你站哪邊？',opts);
}
function jpNomo1995(p,done){
  card('gold','1995｜旋風從太平洋另一邊吹回來',`那位扭身投球的日本投手，在洛杉磯拿下新人王。球探嘴裡那句「日本球員去不了美國」，突然少了半截。<br>${standingLine(p)}`);
  const key=S.pos==='P'?(S.ab.brk>=S.ab.ctl?'brk':'ctl'):(S.ab.con>=S.ab.pow?'con':'pow');
  choose('這陣風，對你是新聞還是路標？',[
    {t:'整理影片，請經紀人送去美國',main:true,s:`D20 ${ABL[key]} DC ${p.index>=2?14:16}｜成功提早打開旅美路線`,f:()=>d20Check({title:'太平洋另一端的球探報告',label:ABL[key],score:S.ab[key],dc:p.index>=2?14:16,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'球團知道這卷帶子的存在。你的下一步會被當成新聞。':'沒有球團替你背書。錄影帶得先從一疊陌生名字裡活下來。'},r=>{if(r.success){S.era.usDoor=true;S.pool+=r.strong?3:1;unlockAchievement('jp_bridge','回信只有一句：「我們會繼續看。」那已經足夠。');}else card('info','沒有回信','影帶寄出去了，沉默也寄了回來。你把副本留在抽屜，沒有丟。');done();})},
    {t:'先把自己的招牌練到無法忽視',s:`${ABL[key]} +1、自律 +1`,f:()=>{addAb(key,1);improveMind('discipline',1);card('good','風先留在牛棚','別人的路證明門存在。你的工作，是走到門前時有東西能帶。');done();}},
    {t:'那是特例，不值得賭',s:'疲勞 −5｜失去提早旅美機會',f:()=>{S.dev.fatigue=Math.max(0,S.dev.fatigue-5);card('info','把報紙折起來','你留在熟悉的球場。至少今年，風沒有改變你的方向。');done();}}
  ]);
}
function jpWorkload1996(p,done){
  const pit=S.pos==='P', body=pit?'肩膀':'手腕', demand=pit?'「王牌沒有球數限制。」':'「中心打者不能因為這點痛休息。」';
  card('bad','1996｜能上場，和該不該上場',`防護員摸完你的${body}，沒有點頭。教練卻把門關上，只留下一句：${demand}<br>${standingLine(p)}`);
  choose('你怎麼處理身體發出的聲音？',[
    {t:'把疼痛寫進正式報告',main:true,s:`D20 自律 DC ${13+p.index}｜咖位越大，球隊越不願放人`,f:()=>d20Check({title:'對「硬撐」說不',ability:'discipline',dc:13+p.index,bonus:p.bonus,edge:p.index===3?-1:0,stakes:p.index>=2?'少了你，轉播和票房都得改。主管不是來問病情，是來問你能不能吞下去。':'你怕的不是報告被退，是位置先被別人拿走。'},r=>{if(r.success){S.dev.fatigue=Math.max(0,S.dev.fatigue-12);S.tmpInj=Math.max(0,S.tmpInj-5);S.dev.trust+=r.strong?2:1;unlockAchievement('jp_workload','你休了該休的日子，回來時球還在手裡。');}else{S.dev.trust=Math.max(0,S.dev.trust-2);S.tmpInj+=6;card('bad','報告被塞回抽屜','你沒有上場，也沒得到真正的休息。位置和身體一起懸著。');}done();})},
    {t:'不說，照常出賽',warn:true,s:`眼前保住位置｜疲勞 +12、受傷風險 +${p.index>=2?12:8}%`,f:()=>{S.dev.trust+=2;S.dev.fatigue=clamp(S.dev.fatigue+12,0,50);S.tmpInj+=p.index>=2?12:8;card('bad','名字還在先發名單','掌聲很大，${body}也很痛。報紙寫你有責任感；防護員什麼都沒寫。');done();}},
    {t:p.index>=2?'帶著隊友一起要求負荷規則':'請老將替你開口',s:'D20 洞察｜成功可同時保住隊友信任與身體',f:()=>d20Check({title:'把個人疼痛變成規則',ability:'insight',dc:p.index>=2?15:14,bonus:p.bonus,edge:p.edge,stakes:'單獨請假是軟弱；變成所有人的規則，才可能留下來。'},r=>{if(r.success){S.dev.fatigue=Math.max(0,S.dev.fatigue-8);S.dev.trust+=3;unlockAchievement('jp_workload','隔年春訓，牛棚牆上第一次出現完整的負荷表。');}else{S.dev.fatigue+=5;card('info','會議沒有紀錄','大家都說理解。第二天，先發表沒有任何改變。');}done();})}
  ]);
}
function jpBay1998(p,done){
  const bay=S.orgTeam==='橫濱海星', top=!!(LV[S.lv]&&LV[S.lv].top);
  card('gold','1998｜灣岸的十月',bay?(top?`三十八年的等待壓在橫濱每一張票根上。教練把你叫進辦公室：「我們不是來參加秋天的。」<br>${standingLine(p)}`:`一軍把整座城市帶進秋天，二軍宿舍的電視也整夜亮著。教練說，也許會需要一個熟悉對手、隨時能補上去的人。<br>${standingLine(p)}`):`橫濱那支總被笑的球隊一路衝上來。你的休息室開始研究，怎麼讓這個童話少一頁。<br>${standingLine(p)}`);
  if(!bay){
    choose('你怎麼面對這股浪？',[
      {t:'把他們當真正的冠軍級對手',main:true,s:'洞察 +1、教練信任 +1',f:()=>{improveMind('insight',1);S.dev.trust++;card('info','不笑的人看得最清楚','情蒐會議裡，只有你沒有說「他們遲早會掉下來」。');done();}},
      {t:'我要親手讓童話停在這裡',s:'D20 沉著｜成功得季末能力點',f:()=>d20Check({title:'灣岸決戰',ability:'nerve',dc:14,bonus:p.bonus,edge:p.edge,stakes:'滿場藍色旗子把聲音推回場內。你得先聽見自己的呼吸。'},r=>{if(r.success){S.pool+=r.strong?3:1;card('good','你讓他們多等了一晚',`這不是改寫冠軍，只是讓冠軍記得你的名字。季末能力點 <b class="up">+${r.strong?3:1}</b>。`);}else card('bad','浪打上來了','球一落地，全場像同時站起來。你第一次知道一座城市能有多重。');done();})},
      {t:'那只是媒體故事',s:'疲勞 −3｜教練信任 −1',f:()=>{S.dev.fatigue=Math.max(0,S.dev.fatigue-3);S.dev.trust=Math.max(0,S.dev.trust-1);done();}}
    ]);return;
  }
  if(!top){
    choose('你不在封王名單中央，還能替它做什麼？',[
      {t:'主動當假想對手，替一軍準備',main:true,s:'D20 自律｜成功也能成為冠軍的一部分',f:()=>d20Check({title:'看不見的封王練習',ability:'discipline',dc:13,bonus:p.bonus,edge:p.edge,stakes:'沒有轉播，沒有滿場旗子。你每天模仿下一個對手，讓一軍多看懂一種球。'},r=>{if(r.success){S.dev.trust+=3;S.pool+=r.strong?3:1;unlockAchievement('jp_bay_star','封王照片裡沒有你，香檳回到二軍基地時，第一瓶先遞到你手上。');}else card('info','留在名單外','你做完所有準備，最後沒有被叫上去。冠軍是真的，遺憾也是真的。');done();})},
      {t:'把每一場轉播看完，等緊急召集',s:'洞察 +1、教練信任 +1',f:()=>{improveMind('insight',1);S.dev.trust++;card('good','電話始終沒響','你沒有上場，卻一次也沒有讓裝備離開手邊。');done();}},
      {t:'那不是我的冠軍',warn:true,s:'疲勞 −5｜教練信任 −2',f:()=>{S.dev.fatigue=Math.max(0,S.dev.fatigue-5);S.dev.trust=Math.max(0,S.dev.trust-2);card('info','電視被你關掉','窗外每一聲歡呼，都像在提醒你不在那裡。');done();}}
    ]);return;
  }
  choose('輪到你替這個秋天留下一球。',[
    {t:p.index>=2?'接下最關鍵的打席／局數':'告訴教練：我準備好了',main:true,s:`D20 沉著 DC ${p.index>=2?15:13}｜結果依咖位放大`,f:()=>d20Check({title:'橫濱的最後一哩',ability:'nerve',dc:p.index>=2?15:13,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'全城等的是你。成功會被做成海報，失敗也會。':'你原本不在劇本中央。現在，球剛好滾到你面前。'},r=>{if(r.success){S.pool+=r.strong?5:3;S.dev.trust+=3;unlockAchievement('jp_bay_star',r.strong?'封王畫面重播很多年，你一直在畫面裡。':'你沒有成為唯一的英雄，但確實推了這支球隊一把。');}else{S.dev.trust--;card('bad','球從手套邊出去','隊友最後仍把秋天帶回橫濱。你跟著繞場，笑得比誰都用力。');}done();})},
    {t:'把舞台讓給狀況更好的隊友',s:'教練信任 +2｜無個人成就',f:()=>{S.dev.trust+=2;card('good','正確的人站上去','你沒有出現在最後一球，卻是第一個衝出休息室的人。');done();}},
    {t:'我要當英雄，不接受替補',warn:true,s:'成功成名、失敗重傷信任',f:()=>d20Check({title:'把劇本搶過來',ability:'nerve',dc:17,bonus:p.bonus,edge:p.edge,stakes:'你不是請戰，是要求所有人把秋天押在你身上。'},r=>{if(r.strong){S.pool+=6;unlockAchievement('jp_bay_star','那一夜，你真的把大話打成了安打。');}else{S.dev.trust=Math.max(0,S.dev.trust-3);card('bad','英雄的位子太窄','你上去了，結果沒有跟上。封王香檳裡，有一小塊地方始終是苦的。');}done();})}
  ]);
}
function jpIchiro2001(p,done){
  const key=S.pos==='P'?(S.ab.ctl>=S.ab.brk?'ctl':'brk'):(S.ab.con>=S.ab.eye?'con':'eye');
  card('gold','2001｜野手也能過海',`西雅圖每天傳回新的安打。以前球探問亞洲野手「能不能適應」；現在，他們開始問「下一個在哪裡」。<br>${standingLine(p)}`);
  choose('球探坐上看台，你把什麼留給他？',[
    {t:`把 ${ABL[key]} 練成不需要翻譯的招牌`,main:true,s:'D20 技術判定｜成功開啟旅美並解鎖成就',f:()=>d20Check({title:'下一張船票',label:ABL[key],score:S.ab[key],dc:p.index>=2?14:16,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'每一隊都已經有你的完整報告。今天看的是你能不能承受比較。':'球探表上還把你寫成「台灣來的那位」。你只有幾個球改掉稱呼。'},r=>{if(r.success){S.era.usDoor=true;S.pool+=r.strong?4:2;unlockAchievement('jp_nextwave','球探離場前，向你的經紀人要了電話。');}else card('info','報告沒有闔上','你沒有讓他當場點頭。但這一次，他把報告帶走了。');done();})},
    {t:'替後輩翻譯球探真正想看的東西',s:'洞察 +2、教練信任 +2',f:()=>{improveMind('insight',2);S.dev.trust+=2;card('good','門不只留給自己','你把自己的資料放在最後一頁，前面先放了兩個年輕隊友。');done();}},
    {t:'拒絕當「下一個誰」',s:'沉著 +1｜若為聯盟門面，球迷信任 +2',f:()=>{improveMind('nerve',1);if(p.index===3)S.dev.trust+=2;card('info','只當第一個自己','標題不滿意，球迷卻喜歡。你把比較留給記者，把球留在場內。');done();}}
  ]);
}
function jpStrike2004(p,done){
  const who=p.index>=3?'球員會要你坐在記者會正中央':p.index>=2?'球員代表把麥克風交到你手裡':p.index===1?'休息室推你當這一排的代表':'學長問你願不願意在連署板最下面簽名';
  card('bad','2004｜少一隊，還是少一個聯盟',`球團合併的消息落下，十二支球隊忽然可能只剩十一支。${who}。<br>${standingLine(p)}`);
  choose('第一次罷賽逼近，你站哪裡？',[
    {t:p.index>=2?'站上麥克風，與球員會一起停賽':'簽名，跟著隊友站出去',main:true,s:`D20 ${p.index>=2?'沉著':'洞察'}｜咖位決定你要承受的目光`,f:()=>d20Check({title:'十二支球隊',ability:p.index>=2?'nerve':'insight',dc:12+p.index,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'你說的每一句都可能影響談判，也可能成為球團明年不續約的理由。':'沒有攝影機拍你，但主管會記得誰沒有進場。'},r=>{if(r.success){S.dev.trust+=r.strong?4:2;improveMind('nerve',1);unlockAchievement('jp_union',p.index>=2?'你的話被球迷抄在看台布條上。':'歷史照片裡看不清你的臉，但那一排確實有你。');}else{S.dev.trust=Math.max(0,S.dev.trust-2);card('bad','停賽結束，帳還沒結束','球隊保住了，主管也記住了你。冬天的續約桌，比往年冷。');}done();})},
    {t:'站在球團這邊，反對停賽',warn:true,s:`薪資 +${p.index>=2?180:60} 萬｜隊友信任大減`,f:()=>{const money=p.index>=2?180:60;S.salary+=money;S.dev.trust=Math.max(0,S.dev.trust-4);card('bad','進場的人','空看台前，你照常換上球衣。帳戶多了一筆錢，休息室少了很多聲音。');done();}},
    {t:'我只是外國球員，不介入',s:'保住合約｜失去本事件成就',f:()=>{S.dev.trust=Math.max(0,S.dev.trust-1);card('info','站在門內','你沒有越線，也沒有被誰推走。門外的歌聲一直唱到很晚。');done();}}
  ]);
}
function usArrival(p,done){
  const place=LV[S.lv]&&LV[S.lv].top?'大聯盟休息室':'小聯盟巴士', who=p.index>=2?'全國記者先問你能不能成為亞洲市場的臉':'隊友把口香糖往旁邊一推，問你會不會打牌';
  card('info',`${S.year}｜美國，第一段客場路`,`${place}裡，${who}。翻譯不是每一站都有，明天的名單也不是。<br>${standingLine(p)}`);
  choose('你先讓這裡認識哪一部分的你？',[
    {t:'自己開口，先學會休息室的語言',main:true,s:'D20 洞察｜成功解鎖年代成就',f:()=>d20Check({title:'異鄉的第一句',ability:'insight',dc:13-p.bonus,edge:p.edge,stakes:'文法不重要。重要的是失誤後，你能不能第一個跟隊友說「下一球」。'},r=>{if(r.success){S.dev.trust+=r.strong?3:2;improveMind('insight',1);unlockAchievement('us_arrival','句子不長，笑聲是真的。');}else{S.dev.trust--;card('info','笑點慢了一拍','大家沒有惡意，只是巴士開到下一站，你還沒跟上那個笑話。');}done();})},
    {t:'把所有事情交給經紀人',s:'省下疲勞 5｜洞察 −1、談判風險留下伏筆',f:()=>{S.dev.fatigue=Math.max(0,S.dev.fatigue-5);improveMind('insight',-1);S.era.agentDependence=1;card('info','有人替你說話','行程很順，帳單也很順。只有幾份文件，經紀人說不必細看。');done();}},
    {t:'只談棒球，其他一概不答',s:'自律 +1｜教練信任依咖位而異',f:()=>{improveMind('discipline',1);S.dev.trust+=p.index>=2?1:-1;card('info','球棒代替名片',p.index>=2?'沉默被解讀成專注。名氣有時會替人補完句子。':'沉默沒有得罪人，只讓你更容易在下一次名單被忘記。');done();}}
  ]);
}
function usStrike1994(p,done){
  const top=!!(LV[S.lv]&&LV[S.lv].top);
  S.era.us94Stop=top;
  card('bad','1994｜沒有十月',top?`八月，球員停下來。大聯盟球季、季後賽、世界大賽一起消失；你的置物櫃還在球場裡，門卻鎖了。<br>${standingLine(p)}`:`大聯盟八月停擺，小聯盟球季仍照常打。真正讓休息室安靜下來的，是球團暗示：如果明年還談不攏，春訓會需要一批「替補球員」。<br>${standingLine(p)}`);
  choose(top?'沒有比賽的日子，你把名字放在哪一邊？':'小聯盟還有比賽；明年春訓那件球衣，你穿不穿？',[
    {t:'跟球員站在一起，不跨線',main:true,s:top?'大聯盟本季出賽量降至約 70%｜D20 沉著':'拒絕明年春訓替補邀請｜D20 沉著',f:()=>d20Check({title:'停擺中的立場',ability:'nerve',dc:top?13+p.index:14,bonus:p.bonus,edge:p.edge,stakes:top?'記者每天問你何時回去。真正的答案不只屬於你。':'小聯盟球照打，眼前的名單也還在；你拒絕的是明年那條看似更快的假門。'},r=>{if(r.success){S.dev.trust+=3;unlockAchievement('us_union',top?'你沒有替整場談判贏球，但你沒有讓隊友少一個人。':'你拒絕一件不屬於自己的大聯盟球衣，替自己留下真正進門的資格。');}else{S.dev.trust--;card('bad','冬天比想像中長','你守住立場，卻失去一部分訓練資源。明年要重新證明自己還能打。');}done();})},
    {t:top?'公開要求雙方立刻談判':'收下明年春訓的替補合約',warn:!top,s:top?'聯盟門面影響力較大｜D20 洞察':'預付金 +100 萬｜隊友信任崩落',f:()=>{if(top){d20Check({title:'把麥克風轉向談判桌',ability:'insight',dc:15,bonus:p.bonus,edge:p.edge,stakes:'你不能替任何一方簽字，只能逼他們記得看台也有人。'},r=>{if(r.success){S.dev.trust+=2;unlockAchievement('us_union','你的發言沒有結束停擺，卻讓球迷知道球員不是數字。');}else card('info','兩邊都不滿意','老闆說你不懂生意，隊友說你太急。這也許正表示你站在中間。');done();});}else{S.salary+=100;S.dev.trust=Math.max(0,S.dev.trust-5);card('bad','那件球衣不合身','你收下明年春訓的預付金，也拿到一個整個休息室都不願叫的稱呼。');done();}}},
    {t:'回台灣維持訓練，不公開表態',s:'疲勞 −8｜失去本事件成就',f:()=>{S.dev.fatigue=Math.max(0,S.dev.fatigue-8);card('info','把秋天留在電視外','你每天照常跑步。只是這一次，沒有比分可以證明等待值不值得。');done();}}
  ]);
}
function usNomo1995(p,done){
  card('gold','1995｜旋風之後',`洛杉磯那位扭身投球的日本新人，讓全美第一次每天學著念一個亞洲投手的名字。記者轉過來看你：「所以，你們都這樣投球／打球嗎？」<br>${standingLine(p)}`);
  choose('你怎麼回答這個被放大的問題？',[
    {t:'不躲標籤，用自己的球回答',main:true,s:'D20 沉著｜成功替後來者留下空間',f:()=>d20Check({title:'不是下一個誰',ability:'nerve',dc:14,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'全國轉播等著比較兩個亞洲名字。':'記者不一定會刊你的完整回答，但隊友正在旁邊聽。'},r=>{if(r.success){S.pool+=r.strong?3:1;S.dev.trust+=2;unlockAchievement('us_nomo','報紙仍然做了比較；至少最後一段，留下的是你的名字。');}else card('bad','問題比回答活得久','你打得不好，隔天所有報導都把那句比較放進標題。');done();})},
    {t:'主動幫下一批亞洲球員適應',s:'洞察 +2、教練信任 +2',f:()=>{improveMind('insight',2);S.dev.trust+=2;unlockAchievement('us_nomo','你沒有上頭版，卻成了很多人下飛機後第一通電話。');done();}},
    {t:'我只代表自己',s:'自律 +1｜不承擔媒體風險',f:()=>{improveMind('discipline',1);card('info','把國旗留在問題外','回答很短。有人說你冷淡，也有人終於只看你的成績。');done();}}
  ]);
}
function usInterleague1997(p,done){
  const top=LV[S.lv]&&LV[S.lv].top;
  card('info','1997｜兩個聯盟第一次在例行賽碰面',top?`球場字幕把「第一次」打得很大。${p.index>=2?'轉播單位把你的臉放進開場。':'教練直到最後一刻才把你的名字寫進名單。'}<br>${standingLine(p)}`:'小聯盟休息室看著跨聯盟賽轉播。球探說，聯盟之間的牆一倒，能比較的球員就更多了。');
  if(!top){choose('',[{t:'▸ 把新的對手資料抄進筆記本',main:true,s:'洞察 +1、季末能力點 +1',f:()=>{improveMind('insight',1);S.pool++;done();}}]);return;}
  choose('第一次交手，你想留下什麼？',[
    {t:p.index>=2?'接下全國轉播的正面對決':'爭取那個代打／中繼機會',main:true,s:'D20 沉著｜成功解鎖成就',f:()=>d20Check({title:'跨聯盟第一夜',ability:'nerve',dc:p.index>=2?15:13,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'大家已經知道你是誰；現在要看招牌能不能跨過聯盟。':'你可能只有一球。第一次有時候就是這麼小。'},r=>{if(r.success){S.pool+=r.strong?4:2;unlockAchievement('us_interleague',r.strong?'精華畫面播了一整週。':'紀錄簿不會替你加註咖位，只會寫下結果。');}else card('bad','新對手，舊弱點','對方第一次見你，卻像讀過整本報告。');done();})},
    {t:'先研究陌生對手，不搶鏡頭',s:'洞察 +2、疲勞 −3',f:()=>{improveMind('insight',2);S.dev.fatigue=Math.max(0,S.dev.fatigue-3);done();}},
    {t:'在鏡頭前挑釁另一聯盟',warn:true,s:'成功人氣大增、失敗教練信任 −3',f:()=>d20Check({title:'先把話說滿',ability:'nerve',dc:17,bonus:p.bonus,edge:p.edge,stakes:'開賽前的話，九局後都會有人拿回來。'},r=>{if(r.strong){S.dev.trust+=2;unlockAchievement('us_interleague','你說完，也真的做到了。');}else{S.dev.trust=Math.max(0,S.dev.trust-3);card('bad','對方把剪報貼在牆上','九局後，那張剪報被送回你的置物櫃。');}done();})}
  ]);
}
function usPower1998(p,done){
  const O=S.overseasDark, key=S.pos==='P'?'vel':'pow';
  card('bad','1998｜每一顆球都飛得更遠',`全壘打競賽把整個夏天點亮。某天，訓練員把沒有標籤的小瓶子放進你櫃子：「大家都在追上時代。」<br>${standingLine(p)}`);
  choose('這一步不是訓練菜單，是你要留下的版本。',[
    {t:'把瓶子退回去',main:true,s:'拒絕灰色捷徑｜D20 自律決定能否在競爭中守住位置',f:()=>{O.clean=true;d20Check({title:'乾淨地追趕',ability:'discipline',dc:14+p.index,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'你拒絕的不只是一瓶東西，也是所有人對明星數字的期待。':'別人的力量突然長得很快；你的名單位置不會等道德勝利。'},r=>{unlockAchievement('us_clean',r.success?'你沒有變得比較輕鬆，只是每一筆成績都能直視。':'你掉出一段時間的名單，仍沒有回頭拿那只瓶子。');if(r.success){S.dev.trust+=2;improveMind('discipline',1);}else{S.dev.trust--;S.pool=Math.max(0,S.pool-1);card('info','乾淨沒有保證先發','你守住自己，卻沒守住所有機會。那也是代價。');}done();})}},
    {t:'收下，不問裡面是什麼',warn:true,s:`${ABL[key]} +4｜證據與日後藥檢風險開始累積`,f:()=>{revokeAchievement('decline_clean');revokeAchievement('us_clean');O.ped=true;O.evidence=1;addAb(key,4);S.dev.trust+=1;card('bad','數字先替你說話',`${ABL[key]} <b class="up">+4</b>。球飛得更快，恢復也更快。只有那只空瓶，你不知道該丟去哪裡。`);done();}},
    {t:p.index>=2?'要求球團正式調查訓練員':'悄悄提醒可信任的隊友',s:'D20 洞察｜成功清除風險並提高信任',f:()=>d20Check({title:'把灰色東西拿到光下',ability:'insight',dc:p.index>=2?16:13,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'你的指控會碰到球團、贊助與隊友。說出口就沒有私下解決。':'你沒有證據鏈，只有一只不該出現的瓶子。'},r=>{if(r.success){O.clean=true;S.dev.trust+=r.strong?4:2;unlockAchievement('us_clean','不是每個人都感謝你，但那個櫃子再也沒有出現無標籤藥瓶。');}else{S.dev.trust=Math.max(0,S.dev.trust-2);O.evidence++;card('bad','瓶子不見了','隔天，訓練員說從沒見過你。隊友開始在你進門時停下話題。');}done();})}
  ]);
}
function usSeptember2001(p,done){
  const wave=()=>{
    card('gold','2001｜海的另一邊',`西雅圖的亞洲野手用安打把「身材不夠」四個字一筆筆劃掉。${p.index>=2?'記者問你是不是下一個象徵。':'球探第一次主動問你的打擊與守備，而不只問市場。'}<br>${standingLine(p)}`);
    choose('你怎麼接住這次目光？',[
      {t:'不當樣板，用自己的方式打',main:true,s:'D20 技術判定｜成功解鎖年代成就',f:()=>{const key=S.pos==='P'?'ctl':(S.ab.con>=S.ab.eye?'con':'eye');d20Check({title:'數字前面的名字',label:ABL[key],score:S.ab[key],dc:p.index>=2?15:14,bonus:p.bonus,edge:p.edge,stakes:'這次不是證明亞洲球員都一樣，是證明你不必跟誰一樣。'},r=>{if(r.success){S.pool+=r.strong?4:2;unlockAchievement('us_ichiro','比較沒有消失，但你的球探報告終於有了自己的第一頁。');}else card('info','聚光燈先走了','熱潮沒有等你調整好。你只能留在下一場重新開始。');community();})}},
      {t:'替新來的亞洲球員當第一個隊友',s:'洞察 +2、教練信任 +2',f:()=>{improveMind('insight',2);S.dev.trust+=2;unlockAchievement('us_ichiro','很多年後，他們記得的不是翻譯內容，是你在門口等。');community();}},
      {t:'把熱潮變成代言與曝光',warn:true,s:`收入 +${p.index>=2?220:70} 萬｜D20 洞察避免只剩標籤`,f:()=>{S.salary+=p.index>=2?220:70;d20Check({title:'市場與球場之間',ability:'insight',dc:14,bonus:p.bonus,edge:p.edge,stakes:'廣告想要一張亞洲臉，球隊需要一個球員。你得讓兩者別互相吃掉。'},r=>{if(r.success){S.dev.trust++;unlockAchievement('us_ichiro','你拿了代言，也沒有把名字借給刻板印象。');}else{S.dev.trust-=2;card('bad','海報比成績醒目','球迷認得你的臉，教練卻開始問你是否還看得見好球帶。');}community();})}}
    ]);
  };
  const community=()=>{
    card('bad','2001｜城市需要的不是比分','九月的比賽停了。重新開燈那天，球場不再只是球場；看台裡有人哭，也有人只是需要跟陌生人坐在一起。');
    choose('你能做的事很小，但不是沒有。',[
      {t:p.index>=2?'站到社區與球迷面前':'跟著球隊去社區幫忙',main:true,s:'D20 洞察｜名氣越大，影響與失言風險都越大',f:()=>d20Check({title:'不只是棒球',ability:'insight',dc:12+p.index,bonus:p.bonus,edge:p.edge,stakes:p.index>=2?'大家不是來聽漂亮話。你得知道什麼時候說，也知道什麼時候只陪著。':'沒有人拍你。你搬箱子、簽幾顆球，然後坐下來聽。'},r=>{if(r.success){S.dev.trust+=r.strong?4:2;unlockAchievement('us_community',p.index>=2?'那天的報導沒有寫你的成績。這反而是最重要的一次。':'沒有頭條，只有幾個孩子第二天又回到球場。');}else{card('info','話不夠好，人在就好','你說錯了一句，停下來道歉。沒有人需要球員永遠正確，只需要你別轉身就走。');if(!r.hardFail)unlockAchievement('us_community','你留下來把剩下的事情做完。');}done();})},
      {t:'把薪水的一部分匿名捐出去',s:`支出 ${p.index>=2?120:30} 萬｜沉著 +1`,f:()=>{S.salary=Math.max(0,S.salary-(p.index>=2?120:30));improveMind('nerve',1);card('info','沒有署名的支票','沒有人知道是你。這正是你想要的方式。');done();}},
      {t:'我不知道該說什麼，留在隊內',s:'不受媒體風險｜失去本事件成就',f:()=>{card('info','沉默的休息室','你和隊友一起看著空白的電視畫面。不是每個人都能立刻找到話。');done();}}
    ]);
  };
  wave();
}
function usTesting2003(p,done){
  const O=S.overseasDark;
  card('bad','2003｜名單之外，還有一張檢測表',`聯盟開始匿名調查。更嚴格的藥檢像遠處的雷，所有人都知道會來，只是不知道先劈中誰。<br>${standingLine(p)}`);
  if(!O.ped){
    choose('你在球員會議裡怎麼表態？',[
      {t:'支持檢測，也要求程序保護球員',main:true,s:'洞察 +2、教練信任 +1',f:()=>{improveMind('insight',2);S.dev.trust++;card('good','兩件事可以同時成立','乾淨不代表放棄權利。會議紀錄第一次把兩句話寫在同一頁。');done();}},
      {t:'保持沉默，專心比賽',s:'疲勞 −3',f:()=>{S.dev.fatigue=Math.max(0,S.dev.fatigue-3);done();}},
      {t:p.index>=2?'公開要求聯盟說清楚規則':'提醒隊友別碰來路不明的東西',s:'教練信任 +2｜自律 +1',f:()=>{S.dev.trust+=2;improveMind('discipline',1);done();}}
    ]);return;
  }
  choose('抽屜裡那只空瓶，終於等到你。',[
    {t:'主動向球員會與醫療人員完整交代',main:true,s:'停止使用｜2003 匿名調查不會直接停賽',f:()=>d20Check({title:'把名字寫上去',ability:'insight',dc:13+O.evidence,bonus:p.bonus,edge:p.edge,stakes:'這張調查表原本匿名、也不帶處分。你要處理的是身體和身邊知道秘密的人，不是拿匿名結果換一張禁賽單。'},r=>{O.ped=false;O.disclosed=true;if(r.success){O.evidence=Math.max(0,O.evidence-1);S.dev.trust+=1;unlockAchievement('us_truth','沒有停賽公告。只有醫療室裡那份從今天開始算的治療紀錄。');}else{S.dev.fatigue=clamp(S.dev.fatigue+5,0,50);S.dev.trust-=1;card('bad','匿名不等於沒有人知道','聯盟不能拿這次調查直接處分你，但經紀人和供應者都還握著話。你停用了，影子沒有一起停。');}done();})},
    {t:'立刻停用，但不告訴任何人',s:'能力回落 2｜證據仍在',f:()=>{O.ped=false;addAb(S.pos==='P'?'vel':'pow',-2);O.evidence++;card('info','把瓶子丟了，影子還在','身體慢慢回到原來速度。紀錄和認得你的人，不會一起消失。');done();}},
    {t:'繼續，賭檢測不會抽到你',warn:true,s:'能力 +2｜2004 曝光風險大增',f:()=>{O.evidence+=2;addAb(S.pos==='P'?'vel':'pow',2);card('bad','再快一年','你把雷聲當成很遠。其實它只是在等名單。');done();}}
  ]);
}
function usHits2004(p,done){
  const O=S.overseasDark;
  const contact=()=>{
    const key=S.pos==='P'?'ctl':(S.ab.con>=S.ab.eye?'con':'eye');
    card('gold','2004｜二百六十二支不同的回答',`西雅圖那位亞洲打者把單季安打紀錄推到 262。長打還在統治海報，但安打、速度與每天上壘，重新有了自己的重量。<br>${standingLine(p)}`);
    choose('你要怎麼回應這個新數字？',[
      {t:`把 ${ABL[key]} 做成每天都能帶上場的武器`,main:true,s:'D20 技術判定｜成功解鎖年代成就',f:()=>d20Check({title:'數字不需要翻譯',label:ABL[key],score:S.ab[key],dc:14,bonus:p.bonus,edge:p.edge,stakes:S.pos==='P'?'打者開始更重視每一顆可碰到的球；你得把邊角控得更細。':'不是追 262。是證明不靠同一種身材，也能每天改變比賽。'},r=>{if(r.success){addAb(key,r.strong?3:2);unlockAchievement('us_262',r.strong?'球探報告把「亞洲型球員」刪掉，改寫成你的名字。':'沒有紀錄，只有一整季很難被拿出先發的理由。');}else card('info','方法不是複製','你照著別人的節奏揮，卻忘了自己的好球帶。明年得重新拆開。');done();})},
      {t:'還是追求能決定比分的力量',s:`${ABL[S.pos==='P'?'vel':'pow']} +1｜疲勞 +5`,f:()=>{addAb(S.pos==='P'?'vel':'pow',1);S.dev.fatigue=clamp(S.dev.fatigue+5,0,50);done();}},
      {t:p.index>=2?'告訴年輕球員：別只學一種成功':'把剪報留在置物櫃',s:'洞察 +2、教練信任 +2',f:()=>{improveMind('insight',2);S.dev.trust+=2;unlockAchievement('us_262','你沒有追那個數字，只把可走的路多留一條。');done();}}
    ]);
  };
  if(O.ped&&!O.disclosed){
    card('bad','2004｜名單抽到了你的背號',`記名強制藥檢開始進場。第一次陽性會進入治療與追蹤，不公開、也不停賽；再度陽性或違反治療計畫，才會有十五天等逐級處分。工作人員站在門口，手上的表沒有任何表情。`);
    choose('最後一刻，你怎麼面對？',[
      {t:'承認並配合治療計畫',main:true,s:'首次陽性不禁賽｜停止使用並留下治療紀錄',f:()=>{O.ped=false;O.disclosed=true;S.dev.trust-=1;unlockAchievement('us_truth','沒有公開處分，也沒有漂亮的洗白；你只是終於接受治療，不再把身體交給抽屜。');contact();}},
      {t:'否認，要求重新檢測',warn:true,s:'D20 沉著｜首次陽性不禁賽；累犯失敗可能停 15 天',f:()=>d20Check({title:'藥檢申訴',ability:'nerve',dc:15+O.evidence,bonus:p.bonus,edge:p.edge,stakes:'這不是骰子決定你有沒有做過，只決定程序與舊紀錄能不能拆穿這次說法。'},r=>{const repeat=(O.years||0)>=2||O.evidence>=4;O.ped=false;if(r.success){O.evidence++;card('info','沒有禁賽，只有更密的檢測','程序沒有把你公開釘上名單；你仍被放進治療與追蹤，下一次不會再只是談話。');}else if(repeat){O.disclosed=true;S.era.suspension=.1;S.dev.trust=Math.max(0,S.dev.trust-3);card('bad','第二次的十五天','舊紀錄與這次結果對上。這不是整季消失，而是當年制度對再度陽性的十五天處分。');}else{O.disclosed=true;S.dev.trust=Math.max(0,S.dev.trust-2);card('bad','第一次陽性','申訴失敗，你被放進保密治療與追蹤；依當年規則，第一次不會直接停賽。');}contact();})}
    ]);
  }else contact();
}
/* 加點介面：mode {dice:[..]} 或 {pool:n} */
function allocUI(mode,label,done){
  actClear();
  const a=$('act'); const keys=POS_AB[S.pos];
  let dice=mode.dice?mode.dice.slice():null, pool=mode.pool||0, idx=0, hist=[];
  a.innerHTML=`<div class="title">${label}</div><div id="al-top"></div><div id="al-rows"></div><div class="row2" id="al-btm"></div>`;
  const touchedKeys={};
  const top=$('al-top'),rows=$('al-rows'),btm=$('al-btm');
  /* allocPlace() below decides panel vs overlay from the current settings, and can be
     called again by applyMobileUI / applyBigText if the player changes them mid-allocation */
  ALLOC={top,rows,btm,label,render};
  function remaining(){ return dice?dice.length-idx:pool; }
  function render(){
    if(dice){ top.innerHTML='<div id="dice">'+dice.map((v,i)=>`<div class="die ${i<idx?'used':''} ${i===idx?'active':''} ${v===6?'six':''}">${v}</div>`).join('')+'</div>'; }
    else top.innerHTML=`<div class="pool">剩餘可分配點數：${pool} 點（點一下能力 +1）</div>`;
    const cue=$('al-cue'); if(cue)cue.textContent=dice?`剩餘 ${remaining()} 顆骰子未分配`:`剩餘 ${remaining()} 點未分配`;
    rows.innerHTML='';
    keys.forEach(k=>{ const v=S.ab[k],cap=v>=80;
      const r=document.createElement('div'); r.className='abrow'+(cap?' capped':'');
      const pk=(S.pot&&S.pot[k])||62, cst=abCost(k), cr=(S.carry&&S.carry[k])||0;
      r.innerHTML=`<span class="nm">${ABL[k]}</span><span class="bar"><i style="width:${v/80*100}%"></i><em style="left:${pk/80*100}%"></em></span><span class="val" style="line-height:1.1">${v}<small style="opacity:.5">/${pk}</small>${cst>1?`<span style="display:block;opacity:.5;font-size:10.5px;letter-spacing:1px;margin-top:-2px">${cr}/${cst}</span>`:''}</span>`;
      if(!cap&&remaining()>0)r.onclick=()=>{ const amt=dice?dice[idx]:1;
        const pc=(S.carry&&S.carry[k])||0;
        const got=addAb(k,amt); touchedKeys[k]=(touchedKeys[k]||0)+amt; hist.push([k,got,pc]); if(dice)idx++; else pool--;
        r.querySelector('.val').innerHTML=`${S.ab[k]} <b style="display:block;font-size:10.5px">${got>0?'+'+got:'蓄力中'}</b>`; render(); board(0); };
      rows.appendChild(r); });
    btm.innerHTML='';
    /* 復原鈕固定佔位:無可復原時 disabled 而非消失,避免版面跳動誤觸 */
    const u=document.createElement('button'); u.className='btn'; u.style.textAlign='center';
    u.textContent='↩ 復原'; u.disabled=!hist.length;
    u.style.opacity=hist.length?'1':'0.35'; u.style.cursor=hist.length?'pointer':'default';
    if(hist.length)u.onclick=()=>{ const [k,got,pc]=hist.pop(); S.ab[k]-=got; if(S.carry)S.carry[k]=pc; if(dice)idx--; else pool++; render(); board(0); };
    btm.appendChild(u);
    const allCap=keys.every(k=>S.ab[k]>=80);
    if(remaining()===0||allCap){ const c=document.createElement('button'); c.className='btn main';
      c.textContent=(remaining()>0&&allCap)?'能力已達上限，捨棄剩餘骰子 ▸':'確認 ▸';
      c.onclick=()=>{ actClear(); allocDone(touchedKeys,dice?true:false); done(); }; btm.appendChild(c); }
    actToggleSync();
  }
  allocPlace();
  /* Roll-in animation on first render only; purely visual (Math.random, not the
     seeded RNG) — game values always come from dice[]. Scoped to `top` rather than #act
     because in the overlay form the dice live in #af-body, where #act cannot see them. */
  if(dice && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    top.querySelectorAll('#dice .die').forEach((el,i)=>{
      el.classList.add('rolling');
      const iv=setInterval(()=>{ el.textContent=1+Math.floor(Math.random()*6); },70);
      setTimeout(()=>{ clearInterval(iv); el.classList.remove('rolling'); el.textContent=dice[i];
        if(dice[i]===6)el.classList.add('flash6'); },260+i*90);
    });
  }
}
/* ================= 年度流程 ================= */
function nextStep(){ if(S.done){ stepQ=[]; return; } /* 已引退:清空後續步驟,不再跑續約/結算 */ const f=stepQ.shift(); if(f)f(); }
function stageLabel(){
  if(S.stage==='HS')return '高'+['一','二','三'][S.stageYr-1];
  if(S.stage==='U')return '大'+['一','二','三','四'][S.stageYr-1];
  if(S.stage==='AMA')return '業餘成棒';
  if(S.lv==='CPBL2'&&S.year<2006)return '中職預備隊';
  return LV[S.lv].n;
}
function startYear(){ stepQ=[phaseHistory,phaseOverseasHistory,phasePre,phaseMid,phaseEnd]; divider(`${S.year} 年 · ${S.age} 歲 · ${stageLabel()}`); tlPush(); nextStep(); }
/* ---------- 季初 ---------- */
function phasePre(){
  board(0); S.tmpInj=0; S.seasonFactor=1; S.skipMid=false; S.prevD=S.lastD||0; S.lastD=0; /* 先保留上季 d 供投手定位判定 */
  ensureCampaignState();
  S.era.standingD=S.prevD; S.era.declineNow=0; S.era.justFinishedRehab=false;
  if(S.era.us94Stop&&S.year===1994){S.seasonFactor=.7;card('bad','停擺球季','八月以後的大聯盟賽程被整片撕掉。本季最多只剩約 <b class="dn">70%</b> 的出賽量，也不會有季後賽。');}
  if(S.era.suspension>0){
    if(S.era.suspension>=1){ S.skipMid=true; S.seasonFactor=0; card('bad','禁賽處分','球衣還掛在置物櫃，名字卻不在登錄名單。本季確定無法出賽。'); }
    else { S.seasonFactor=Math.min(S.seasonFactor,1-S.era.suspension); card('bad','停賽處分',`處分仍在，本季最多只剩 <b class="dn">${Math.round(S.seasonFactor*100)}%</b> 的出賽量。`); }
    S.era.suspension=0;
  }
  if(S.age>=48){ buyoutRemaining(1); endGame('身體已到極限，'+S.year+' 年春訓後宣布引退。'); return; }
  const declAge=S.age-(S.traits.disc?2:0); /* 自律狂:衰退曲線整體延後兩年 */
  if(declAge>=32){ const dec=declAge>=35?5+(declAge-35):2;
    S.era.declineNow=dec;
    POS_AB[S.pos].forEach(k=>S.ab[k]=clamp(S.ab[k]-dec,1,80));
    card('bad','歲月不饒人',`${declAge>=35?'第二階段（逐年加劇）':'第一階段'}衰退：所有能力 <b class="dn">−${dec}</b>${S.traits.disc?'（自律狂：生涯延後兩年）':''}。訓練加點照常，但身體回不去了。`); board(0); }
  if(S.rehab>0){ const finalRehab=S.rehab===1; S.rehab--; S.skipMid=true; S.seasonFactor=0; S.era.justFinishedRehab=finalRehab;
    card('bad','復健年',`大傷尚未痊癒，本季確定<b class="dn">全年報銷</b>，只能在復健室度過。（擲骰減為 2 顆）`);
    const dummySt = {G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0};
    S.log.push({y:S.year,age:S.age,tm:S.stage==='PRO'?S.teamName():(S.team||stageLabel()),line:'復健年・全年報銷', inj: true, st: S.stage==='PRO'?dummySt:null}); }
  let afterAsk=()=>{
    let n=S.skipMid?2:(()=>{const r=R();return r<0.35?3:r<0.75?4:r<0.95?5:6;})();
    if(S.traits.distract&&!S.skipMid)n=Math.max(2,n-1); /* 外務纏身 */
    if(S.traits.academy&&!S.skipMid&&chance(35))n++; /* 學院派:期望值略升 */
    
    const dice=[]; let newSix=0;
    for(let i=0;i<n;i++){ const v=S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6); dice.push(v);
      if(v===6&&S.age<22&&!S.traits.genius){S.six++;newSix++;} }
      
    let msg=`自主訓練擲出 <b class="hl">${n}</b> 顆骰。`;
    if(newSix&&!S.traits.genius)msg+=` 高標值「6」累計 <b class="hl">${S.six}/5</b> 次。`;
    
    /* 【修正】大巧不工改為：自動擲骰並加點，滿額溢出轉為成績加成 */
    if(S.traits.combo && !S.skipMid && (S.comboKey||S.samePickKey)) {
      const ck = S.comboKey||S.samePickKey; /* 永遠用解鎖當下鎖定的能力 */
      const cv = S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6);
      const gained = addAb(ck, cv);
      const overflow = S.lastOverflow || 0;

      if(overflow > 0) S.pendStat = (S.pendStat || 0) + overflow;

      let cmsg = `<br>大巧不工發動：系統自動擲出 <b class="hl">${cv}</b> 點，挹注於 <b class="hl">${ABL[ck]}</b>`;
      if(gained > 0) cmsg += `（能力 <b class="up">+${gained}</b>）`;
      if(overflow > 0) cmsg += `（頂峰造極：溢出的 ${overflow} 點轉為<b class="up">本季成績加成</b>）`;
      if(gained===0 && overflow===0) cmsg += `（能力加點，但不足以提升一級）`;
      msg += cmsg + `。`;
    }
    
    card('','季初特訓',msg);
    if(S.six>=5&&!S.traits.genius&&S.age<22){ S.traits.genius=true;
      {
      const exDef=S.pos==='C'?['rng','fld','arm','cat']:[];
      const cands=POS_AB[S.pos].filter(k=>S.ab[k]<70&&!exDef.includes(k));
      for(let i=cands.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=cands[i];cands[i]=cands[j];cands[j]=t;}
      const boost=cands.slice(0,2), bl=[];
      boost.forEach(k=>{ S.pot[k]=Math.min(80,(S.pot[k]||62)+10);
        S.ab[k]=clamp(S.ab[k]+5,1,80); bl.push(`${ABL[k]} <b class="up">+5</b>（潛力上限 +10 → ${S.pot[k]}）`); });
      card('gold','隱藏素質解鎖：天才','22 歲前五度擲出高標值！從今以後，每一顆訓練骰<b class="hl">永久固定 4 點以上</b>，事件卡好結果機率提升至 <b class="hl">70%</b>。'+(bl.length?`天賦覺醒，潛能重新被評估：${bl.join('、')}。`:'')+'天賦，是藏不住的。');
      board(1);
    } }
    choose('',[{t:`▸ 分配訓練成果（${dice.length} 顆骰）`,main:true,f:()=>dposReview(()=>allocUI({dice},'分配訓練成果（點骰套用｜球探量表：'+(S.pos==='P'?'60/70/75':'70/75')+' 以上成長遞減）',()=>nextStep()))}]);
  };
  /* 投手開季：投球強度(續航+TJ 量表) */
  const preAsk=afterAsk;
  if(S.pos==='P'&&S.stage==='PRO'&&!S.skipMid){
    afterAsk=()=>{
      choose(`開季投球規劃（手臂狀況：${(function(){const r=S.tj/tjCap();return S.rehab>0?'復健中':r>=0.85?'手肘隱隱作痛':r>=0.6?'手臂略感疲勞':r>=0.35?'狀況尚可':'手感輕盈';})()}）`,[
        {t:'全力投',warn:true,s:'成績最佳｜手臂負荷最大（TJ 累積 ×1.25）',f:()=>{S.effort='全力投';preAsk();}},
        {t:'普通投',main:true,s:'標準強度｜TJ 累積正常',f:()=>{S.effort='普通投';preAsk();}},
        {t:'養生球',s:'成績保守｜省手臂（TJ 累積 ×0.65）',f:()=>{S.effort='養生球';preAsk();}}]);
    };
  }
  const beginTraining=()=>declineDrugFlow(()=>annualDevelopmentPlan(afterAsk));
  /* 大學季前：是否投入選秀與旅外（大二～大四） */
  if(S.stage==='U'&&S.stageYr>=2){
    const o=ovr();
    const opts=[
      {t:'投入中華職棒選秀',s:`目前綜合 ${o}｜年齡加權：越年輕評價越高`,f:()=>runDraft(true,beginTraining)},
      {t:'留在大學繼續磨練',main:true,f:beginTraining}
    ];
    /* 年齡懲罰：每長一歲，門檻微調，但簽約金大幅縮水 */
    const agePenalty = Math.max(0, S.age - 18);
    const reqNPB = 44 + Math.floor(agePenalty / 2);   // 門檻：18歲44 -> 22歲46
    const reqMiLB = 50 + Math.floor(agePenalty / 2);  // 門檻：18歲50 -> 22歲52
    const bonusNPB = Math.max(100, 800 - agePenalty * 180);   // 日職簽約金逐年大減
    const bonusMiLB = Math.max(150, 1500 - agePenalty * 350); // 美職簽約金逐年大減
    if(o>=reqNPB)opts.push({t:'洽談旅日合約',s:`休學挑戰日職｜大齡影響簽約金`,f:()=>{
      S.stage='PRO'; S.team=''; S.svc=0; S.faElig=false;
      pickOfferUI('日職球團報價','NPB',makeOffers('NPB',2,bonusNPB,2,3,'NPB2',null),beginTraining);}});
    if(usPathOpen()&&o>=reqMiLB)opts.push({t:'洽談旅美合約',s:`休學挑戰小聯盟｜大齡影響簽約金`,f:()=>{
      S.stage='PRO'; S.team=''; S.svc=0; S.faElig=false;
      pickOfferUI('大聯盟球團報價','MiLB',makeOffers('MiLB',2,bonusMiLB,3,4,o>=55?'A1':'R',null),beginTraining);}});
    choose(`大${['一','二','三','四'][S.stageYr-1]}季前 · 升學與職棒的十字路口`,opts);
    return;
  }
  if(S.stage==='PRO'&&S.age>=36&&S.rehab===0){
    const oldOpts=[{t:'再戰一年',main:true,f:beginTraining}];
    /* 旅外老將(衰退期):放棄現有合約,落葉歸根返台;ovr<30(真的打不動)不給 */
    if(S.org!=='CPBL'&&ovr()>=LV.CPBL2.min){
      oldOpts.push({t:'放棄合約，落葉歸根',s:'狀態不再，仍想把最後的球打給家鄉看',f:()=>{
        card('good','落葉歸根',`狀態早已不在巔峰。但家鄉球隊仍然向你招手——他們要的不是現在的數據，是你這個名字陪著大家走過的那些年。你決定放棄合約，回家，把最後的球打給臺灣的球迷看。`);
        signTo('CPBL','CPBL1'); beginTraining();
      }});
    }
    oldOpts.push({t:'召開引退記者會',warn:true,s:'結束選手生涯',f:()=>{buyoutRemaining();daibaFarewell(()=>endGame('功成身退，於 '+S.year+' 年宣布引退。'));}});
    choose('又是一年春訓，身體大不如前了',oldOpts);
    return;
  }
  beginTraining();
}
/* ---------- 賽季中 ---------- */
function phaseMid(){
  board(1);
  if(S.skipMid){ S.ironStreak=0; nextStep(); return; }
  const nEv=S.stage==='PRO'?3:2;
  loveEvent(()=>drawEvents(nEv,()=>{
    choose('',[{t:'▸ 季中健康檢查',main:true,f:()=>{ rollInjury();
      choose('',[{t:'▸ 查看球季表現',main:true,f:()=>{
        if(S.stage==='PRO')proSeason();
        else amateurSeason(); }}]); }}]);
  }));
}
function evOdds(){ /* 事件卡成功率:顯示與擲骰共用同一來源 */
  let base=(S.traits.genius||S.traits.late||S.traits.clutch)?70:50; /* 天才/大器晚成/大心臟 70 */
  if(S.traits.thief)base-=10; /* 薪水小倫 -10 */
  const boldPen=S.traits.clutch?0:15; /* 大心臟:豪賭無懲罰 */
  return {safe:Math.min(95,base+20), norm:base, bold:base-boldPen};
}
function drawEvents(n,done){
  if(n<=0){ done(); return; }
  choose('',[{t:`抽事件卡（剩 ${n} 張）`,main:true,f:()=>{
    const pool=EVENTS.filter(e=>e.for==='*'||(e.for==='P'&&S.pos==='P')||((e.for==='A'||e.for==='B')&&S.pos!=='P')||(e.for==='PRO'&&S.stage==='PRO'));
    const ev=pick(pool);
    const od=evOdds(); /* 與實際擲骰同源 */
    const after=()=>{ board(1); drawEvents(n-1,done); };
    choose(`事件｜${ev.n} — 你要怎麼應對？`,[
      {t:'全力一搏',warn:true,s:`成功率 ${od.bold}%｜${S.traits.clutch?'成功 +4／失敗僅 −2':'加成／減益幅度最大（±3）'}`,f:()=>{resolveEvent(ev,'bold',after);}},
      {t:'照常執行',main:true,s:`成功率 ${od.norm}%｜標準幅度（±2）`,f:()=>{resolveEvent(ev,'norm',after);}},
      {t:'保守應對',s:`成功率 ${od.safe}%｜加成／減益幅度最小（±1）`,f:()=>{resolveEvent(ev,'safe',after);}}]);
  }}]);
}
/* 出廠預設為全虛構人名;玩家可透過隱藏編輯器自訂名單(僅存於玩家本機) */
let CHEER=['林曉晴','陳若彤','張沛慈','王詠恩','許昀熙','蘇采蓁','周依潔','郭芷萱'];
const CHEER_DEFAULT=CHEER.slice();
let CHEER_SAFE=['馮海莎']; /* 不會變成小三的名單:可交往/結婚,永不出現在外遇人選 */
function datePool(){ /* 交往/結婚名單 */
  if(CHEER_SAFE.length>=CHEER.length) return CHEER_SAFE.slice();      /* 安全名單較長:直接整組替換 */
  return CHEER_SAFE.concat(CHEER.slice(CHEER_SAFE.length));           /* 較短:同數量替換進名單 */
}
function affairPool(){ return CHEER.slice(); } /* 外遇名單=原啦啦隊名單 */
function loveEvent(next){
  const L=S.love;
  if(S.stage!=='PRO'||S.age<20){ next(); return; }
  /* ---------- 交往中:每年必定走一輪(不吃機率門檻) ---------- */
  if(L.st==='dating'){
    L.dyrs=(L.dyrs||0)+1;
    const y=L.dyrs;
    /* 交往太久不結婚 → 分手風險逐年升高 */
    const cheatPen=(L.cheatYr===S.year-1||L.cheatYr===S.year)?30:0; /* 劈腿當年分手率+30% */
    const bkP=(y>=4?20+(y-4)*15:0)+cheatPen;
    if(bkP>0&&chance(bkP)){
      const k1=pick(POS_AB[S.pos]),k2=pick(POS_AB[S.pos]);
      const g1=addAb(k1,-3),g2=addAb(k2,-3); board(1);
      const ex=L.partner; L.st=L.exes.length?'divorced':'single'; L.partner=null; L.dyrs=0;
      card('bad','分手',`${cheatPen?'那晚的事她其實都知道。':''}交往 ${y} 年，婚期一延再延。<b class="hl">${ex}</b> 最後留下一句：「我等不到了。」轉身離開。整個休賽季你魂不守舍——<b class="dn">${ABL[k1]} ${g1}、${ABL[k2]} ${g2}</b>。`);
      next(); return; }
    const ask=()=>proposalAsk(next);
    if(chance(30)){ /* 三成機率先來一段插曲,結束後照樣問婚 */
      const r=R()*100;
      if(r<40){ const t=pick(affairPool().filter(n=>n!==L.partner));
        choose(`聚餐散場，${t} 說順路想搭你的車`,[
          {t:'讓她上車（賭一把）',warn:true,s:'沒被抓到＝體力提升｜被抓到＝能力下跌、當年分手率+30%',f:()=>{
            L.affairs++;
            if(chance(55)){ const gt=loveGainTxt('sta',2); board(1);
              card('bad','深夜兜風',`沒有人拍到。你把方向盤握得很緊——${gt}。（這條路不會有好結局）`); ask(); }
            else loveCaughtDating(next); }},
          {t:`「不順路。」直接載 ${L.partner} 回家`,main:true,s:'感情穩固，絕對不虧',f:()=>{
            const gt=loveGainTxt('sta',1); board(1);
            card('good','正確答案',`你傳訊息給 ${L.partner}：「馬上到。」——${gt}。`); ask(); }}]); return; }
      if(r<70){ const gt=loveGainTxt('sta',1); board(1);
        card('good','明星賽放閃',`明星賽表演賽，鏡頭掃到看台上的 <b class="hl">${L.partner}</b>，你隔著全場比了一個手勢，轉播單位立刻切出愛心特效，隔天甜上熱搜——${gt}。`); ask(); return; }
      const gt=loveGainTxt('sta',1); board(1);
      card('good','愛情長跑',`交往邁入第 ${y} 年。沒有大新聞，只有每個客場系列賽結束後，機場出口那杯她替你買好的熱美式——${gt}。`); ask(); return; }
    ask(); return;
  }
  const fire=(L.st==='married'&&L.kids===0)?40:(L.st==='single'||L.st==='divorced')?40:30;
  if(!chance(fire)){ next(); return; }
  /* ---------- 未婚/離婚:緋聞 → 雙重關卡 → 交往 ---------- */
  if(L.st==='single'||L.st==='divorced'){
    const p=pick(datePool());
    card('info','場外話題',`你和啦啦隊女神 <b class="hl">${p}</b> 被拍到球場外同框，緋聞登上娛樂版頭條。${L.exes.length?'（評論區：「離過婚還這麼搶手」）':''}`);
    choose('記者把麥克風遞到你面前：「兩位是在交往嗎？」',[
      {t:'大方承認：「請大家祝福我們」',s:'還要看她那邊敢不敢承認（球團有禁愛令傳聞）',f:()=>{
        if(chance(65)){ L.st='dating'; L.partner=p; L.dyrs=0; L.datedTimes=(L.datedTimes||0)+1;
          const gt=loveGainTxt('sta',1); board(1);
          card('gold','戀情公開',`<b class="hl">${p}</b> 在社群發出十指緊扣的照片：「謝謝大家的祝福。」戀愛使人容光煥發——${gt}。你們正式交往了。`);
          if(L.datedTimes>=3&&L.kids===0&&!S.traits.married&&!S.traits.confidante){ S.traits.confidante=true;
            card('gold','隱藏稱號：閨中密友',`第三段戀情，還是走到了同樣的結局。「我愛上了你，你卻只把我當好姊妹。」——有些人註定是別人生命裡的過客。`); board(1); }
        }
        else{ card('bad','單方面承認',`她隔天透過經紀公司否認：「只是普通朋友。」據傳啦啦隊<b class="dn">禁愛令</b>壓力不小。你一個人站在風裡，超級尷尬。`); }
        next(); }},
      {t:'笑而不答，快步走過',main:true,s:'不承認就沒有下文',f:()=>{
        card('info','未完待續','緋聞燒了三天就退燒。也許時機還沒到。'); next(); }}]); return;
  }
  /* ---------- 已婚 ---------- */
  if(L.kids<4&&chance([65,45,30,20][L.kids])){ /* 生子:第一胎最優先,越生越少 */
    L.kids++; const kk=pick(POS_AB[S.pos]); const gt=loveGainTxt(kk,2); board(1);
    card('gold','新生命',`${L.partner} 平安生下你們的第 <b class="hl">${L.kids}</b> 個孩子。當了${L.kids>1?'幾次':''}爸爸的男人，眼神都不一樣了——${gt}。`);
    next(); return;
  }
  const r=R()*100;
  if(r<40){ /* 外遇誘惑:唯一可以賭的婚內事件 */
    const t=pick(affairPool().filter(n=>n!==L.partner));
    choose(`客場飯店酒吧，${t} 傳來訊息：「睡了嗎？」`,[
      {t:'赴約（賭一把）',warn:true,s:'沒被抓到＝體力提升｜被抓到＝能力下跌、婚姻危機',f:()=>{
        L.affairs++;
        if(chance(55)){ const gt=loveGainTxt('sta',2); board(1);
          card('bad','深夜行程',`你僥倖沒被拍到。不知為何，罪惡感反而讓你精神亢奮——${gt}。（你知道這不會有好下場）`);
          next(); }
        else loveCaught(next); }},
      {t:'回訊息：「陪小孩讀完故事書了，晚安」',main:true,s:'家庭和睦，絕對不虧',f:()=>{
        const gt=loveGainTxt('sta',1); board(1);
        card('good','家的方向',`你把手機扣在桌上，撥了視訊回家。${L.partner} 和孩子在鏡頭那頭揮手。心定了，身體就穩了——${gt}。`); next(); }}]); return; }
  if(r<70&&L.kids>0){ /* 愛小孩新聞 */
    const gt=loveGainTxt('sta',1); board(1);
    card('good','球場邊的父親',`你被拍到賽前隔著護網教孩子怎麼戴手套，影片配文「最強棒球教室」瘋傳。網友：「這才是人生勝利組。」——${gt}。`); next(); return; }
  /* 結婚紀念日 */
  const gt=loveGainTxt('sta',1); board(1);
  card('good','結婚紀念日',`結婚紀念日，你推掉了自主訓練，陪 <b class="hl">${L.partner}</b> 回到當年辦婚禮的場地。她說：「明年也要來喔。」——${gt}。`); next();
}
function divorceRec(){ const L=S.love;
  L.exes.push({name:L.partner,kids:L.kids});
  L.st='divorced'; L.partner=null; L.kids=0; /* 再婚後小孩重新計算 */ }
function loveCaught(next){
  const L=S.love; L.caught++;
  const kk=pick(POS_AB[S.pos]); const g=addAb(kk,-3);
  let extra='';
  if(L.caught>=2){
    if(!S.traits.scum){ S.traits.scum=true;
      card('bad','隱藏屬性解鎖：渣男','第二次被逮個正著。從今以後你在球迷心中的形象定型了——<b class="dn">每次外遇被抓到，全能力 −5</b>。'); }
    POS_AB[S.pos].forEach(k=>{ S.ab[k]=clamp(S.ab[k]-5,1,80); });
    extra='<b class="dn">全能力 −5</b>（渣男的代價）。'; }
  board(1);
  card('bad','頭版醜聞',`狗仔的鏡頭比你想的更快，照片鋪滿版面。贊助商緊急撤圖，你在鏡頭前鞠躬 90 度。<b class="dn">${ABL[kk]} ${g}</b>。${extra}`);
  choose(`${L.partner} 把離婚協議書放在餐桌上`,[
    {t:'跪著道歉，求她再給一次機會',s:'成功保住婚姻｜失敗＝再扣能力並離婚',f:()=>{
      if(chance(40)){
        card('info','低谷之後',`長談了一整夜。<b class="hl">${L.partner}</b> 最後說：「為了孩子，也為了那個我認識的你——最後一次。」婚姻保住了，但有些東西回不去了。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2);
        const ex=L.partner; divorceRec(); board(1);
        card('bad','道歉無效',`她聽完只是搖頭，隔天律師的存證信函就到了。<b class="hl">${ex}</b> 正式與你離婚，輿論二次發酵——<b class="dn">${ABL[k2]} ${g2}</b>。`); next(); } }},
    {t:'簽字離婚',f:()=>{ const ex=L.partner; divorceRec();
      card('bad','離婚',`你在協議書上簽了名。<b class="hl">${ex}</b> 的聲明只有一句：「祝彼此安好。」`); next(); }}]);
}
function proposalAsk(next){
  const L=S.love; if(L.st!=='dating'){ next(); return; }
  choose(`交往第 ${L.dyrs} 年——${L.partner} 看著別人的婚禮影片看了很久`,[
    {t:'就是現在——求婚',s:'固定加成：全體力提升、本季更不容易受傷',f:()=>{
      L.st='married'; L.kids=0; L.dyrs=0;
      const gTxt=loveGainTxt('sta',2)+'、'; S.tmpInj-=5; board(1);
      card('gold','婚禮',`你在主場本壘板後方單膝跪地，大螢幕打出「Marry Me」。<b class="hl">${L.partner}</b> 哭著點頭。休賽季完婚，紅毯用壘包排成——${gTxt}本季受傷機率 <b class="up">−5%</b>。`); next(); }},
    {t:'再存一點錢吧',main:true,s:'她沒說什麼,但交往越久分手風險越高',f:()=>{
      card('info','再等等','她關掉影片，笑著說沒事。你假裝沒看到她眼裡的東西。'); next(); }}]);
}
function loveCaughtDating(next){
  const L=S.love; L.caught++; L.cheatYr=S.year; /* 被抓到才觸發當年分手率+30% */
  const kk=pick(POS_AB[S.pos]); const g=addAb(kk,-3);
  let extra='';
  if(L.caught>=2){
    if(!S.traits.scum){ S.traits.scum=true;
      card('bad','隱藏屬性解鎖：渣男','第二次被逮個正著。從今以後你在球迷心中的形象定型了——<b class="dn">每次劈腿/外遇被抓到，全能力 −5</b>。'); }
    POS_AB[S.pos].forEach(k=>{ S.ab[k]=clamp(S.ab[k]-5,1,80); });
    extra='<b class="dn">全能力 −5</b>（渣男的代價）。'; }
  board(1);
  card('bad','劈腿曝光',`行車紀錄器畫面流出，時間軸對得整整齊齊。<b class="dn">${ABL[kk]} ${g}</b>。${extra}`);
  choose(`${L.partner} 已讀不回三天後，終於答應見面`,[
    {t:'道歉，求她再給一次機會',s:'成功保住感情｜失敗＝再扣能力並分手',f:()=>{
      if(chance(40)){
        card('info','低谷之後',`她哭著罵完，最後說：「最後一次。」感情保住了，但信任的裂痕補不回來。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2);
        const ex=L.partner; L.st=L.exes.length?'divorced':'single'; L.partner=null; L.dyrs=0; board(1);
        card('bad','道歉無效',`她把你送的東西整箱寄回。<b class="hl">${ex}</b> 封鎖了所有聯絡方式——<b class="dn">${ABL[k2]} ${g2}</b>。`); next(); } }},
    {t:'坦然分手',f:()=>{ const ex=L.partner;
      L.st=L.exes.length?'divorced':'single'; L.partner=null; L.dyrs=0;
      card('bad','分手',`<b class="hl">${ex}</b> 的限時動態只有一片黑。粉絲全都知道是誰的錯。`); next(); }}]);
}
function loveGainTxt(k,amt){ /* 戀愛事件加點:機制同事件卡(addAbStat);回傳誠實的顯示文字 */
  const before=S.pendStat||0;
  const g=addAbStat(k,amt);
  const over=(S.pendStat||0)-before;
  if(g>0&&over>0)return `<b class="up">${ABL[k]} +${g}</b>（溢出 ${over} 點轉為本季成績加成）`;
  if(g>0)return `<b class="up">${ABL[k]} +${g}</b>`;
  if(over>0)return `<b class="up">本季成績加成 +${over}</b>（${ABL[k]} 已達潛力上限）`;
  return `${ABL[k]} 能力加點，但不足以提升一級`;
}
function addAbStat(k,amt){ 
  if(amt<=0)return addAb(k,amt);
  const pk=(S.pot&&S.pot[k])||62;
  const isP=S.pos==='P';
  let cur=S.ab[k], bud=amt, cr=(S.carry&&S.carry[k])||0, gained=0;
  /* 潛力已滿：直接全額轉為狀態火燙 */
  if(cur>=pk){ S.pendStat=(S.pendStat||0)+bud; return 0; }
  
  /* 潛力未滿：依正常成本加點，達到潛力上限就停止 */
  while(bud>0 && cur<pk){
    let c = isP ? (cur>=66?7:cur>=58?4:cur>=50?2:1) : (cur>=72?3:cur>=64?2:1);
    bud--; cr++; if(cr>=c){ cr-=c; cur++; gained++; }
  }
  
  if(!S.carry) S.carry={}; S.carry[k]=cr; S.ab[k]=cur;
  
  /* 達到潛力上限後剩餘的點數轉為成績加成 */
  if(bud>0) S.pendStat=(S.pendStat||0)+bud;
  return gained;
}
function statBonus(pts,out){ /* 能力已達潛力上限,獎勵轉成當季成績加成(下次結算套用) */
  S.pendStat=(S.pendStat||0)+pts;
  out.push(`<span class="up">狀態火燙（本季成績加成 ×${pts}）</span>`);
}
function resolveEvent(ev,mode,done){
  done=done||function(){};
  const od=evOdds(); /* 與畫面顯示同源,保證所見即所得 */
  if(mode==='safe')S.cntSave++;
  let good,tag;
  if(mode==='safe'){ good=chance(od.safe); tag='保守應對'; }
  else if(mode==='bold'){ good=chance(od.bold); tag='全力一搏';
    if(good)S.cntBoldWin++; else S.cntBoldFail++; }
  else { good=chance(od.norm); tag=''; }
  if(mode==='safe'&&good)S.cntSaveWin=(S.cntSaveWin||0)+1; /* 自律狂:保守成功才算 */
  if((ev.n==='宵夜文化'||ev.n==='場外代言邀約')&&mode!=='safe'&&!good)S.cntSnack++;
  /* 效果固定 ±1;豪賭成功則同一項再 +1(等於賭中加倍成長),豪賭失敗則 -1 再 -1 */
  /* 效果級距:保守 ±1 / 照常 ±2 / 豪賭 ±3;大心臟豪賭成功 +4、失敗 -2 */
  let mag=mode==='safe'?1:mode==='bold'?3:2;
  if(mode==='bold'&&S.traits.clutch)mag=good?4:2; /* 大心臟:上檔更高、下檔更軟 */
  const fx=good?ev.g:ev.b; let out=[],touched=false;
  const applyAbil=(k,dir)=>{ const step=dir*mag;
    if(dir>0){
      const pk=(S.pot&&S.pot[k])||62;
      const isP=S.pos==='P';
      let cur=S.ab[k], bud=step, cr=(S.carry&&S.carry[k])||0, gained=0;
      
      if(cur>=pk){
        statBonus(bud,out); /* 全額轉換為成績加成 */
      } else {
        while(bud>0 && cur<pk){
          let c = isP ? (cur>=66?7:cur>=58?4:cur>=50?2:1) : (cur>=72?3:cur>=64?2:1);
          bud--; cr++; if(cr>=c){ cr-=c; cur++; gained++; }
        }
        if(!S.carry) S.carry={}; S.carry[k]=cr; S.ab[k]=cur;
        
        if(gained>0) out.push(`${ABL[k]} <span class="up">+${gained}</span>`);
        else if(bud<=0) out.push(`${ABL[k]}：能力加點，但不足以提升一級`); /* 點數進了進度槽,未滿一級 */
        if(bud>0) statBonus(bud,out); /* 溢出部分轉換為成績加成 */
      }
      touched=true;
    } else { const g=addAb(k,step); touched=true;
      out.push(`${ABL[k]} <span class="dn">${g}</span>`); }
  };
  for(const k in fx){ const dir=fx[k]>0?1:-1;
    if(k==='inj'){ let v=({1:8,2:12,3:16,4:16})[mag]; if(mode==='bold'&&S.traits.clutch)v=12; /* 大心臟:豪賭受傷率降到普通級 */ S.tmpInj+=v; out.push(`本季受傷機率 <span class="dn">+${v}%</span>`);}
    else if(k==='rand'){ applyAbil(pick(POS_AB[S.pos]),dir); }
    else if(k in S.ab){ applyAbil(k,dir); } }
  if(!touched){ applyAbil(pick(POS_AB[S.pos]),good?1:-1); }
  card(good?'good':'bad','事件卡｜'+ev.n+(tag?`（${tag}）`:''),
    `${good?ev.gt:ev.bt}。${mode==='bold'&&good?'<b class="hl">豪賭成功！</b>':''}${mode==='bold'&&!good?'<b class="dn">豪賭失敗……</b>':''}<br>${out.join('｜')||'（能力加點，但不足以提升一級）'}`);
  checkTraitsMid();
  done();
}
/* 賽季中即時可解鎖的特性 */
function allocDone(touched,isDice){
  const keys=Object.keys(touched);
  if(isDice&&S.stage!=='HS'&&keys.length){ /* 只計職業/大學季初骰的專注度 */
    const tot=Object.values(touched).reduce((a,b)=>a+b,0);
    let mk=keys[0]; keys.forEach(k=>{ if(touched[k]>touched[mk])mk=k; });
    const focused=(touched[mk]/tot>=0.75)?mk:null; /* 七成五以上灌同一項 */
    if(focused&&focused===S.samePickKey)S.samePick++;
    else if(focused){ S.samePickKey=focused; S.samePick=1; }
    else { S.samePickKey=null; S.samePick=0; }
    if(S.samePick>=3&&!S.traits.combo){ S.traits.combo=true; S.samePickBonus=true;
      S.comboKey=S.samePickKey; /* 鎖定解鎖當下的能力,之後不再變動 */
      traitCard('combo','大巧不工',`連續三年，你把所有汗水都澆在同一個工具上——<b class="hl">季初系統會自動擲 1 顆骰，永遠加在你專精的「${ABL[S.comboKey]}」上</b>。專精者的複利。`); }
  }
  /* 大器晚成:25 歲後單季加點總幅度 >=8 */
  const gain=Object.values(touched).reduce((a,b)=>a+b,0);
  if(!S.traits.late&&!S.traits.genius&&ovr()<47&&S.age>=25&&S.age<32&&isDice&&gain>=16){
    S.traits.late=true;
    const exDef=S.pos==='C'?['rng','fld','arm','cat']:[];
    const cands=POS_AB[S.pos].filter(k=>S.ab[k]<70&&!exDef.includes(k));
    for(let i=cands.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=cands[i];cands[i]=cands[j];cands[j]=t;}
    const boost=cands.slice(0,2), bl=[];
    boost.forEach(k=>{ S.pot[k]=Math.min(80,(S.pot[k]||62)+10); S.ab[k]=clamp(S.ab[k]+5,1,80);
      bl.push(`${ABL[k]} <b class="up">+5</b>（潛力上限 +10 → ${S.pot[k]}）`); });
    card('gold','隱藏素質解鎖：大器晚成',`別人都以為你到頂了，你卻在這一年脫胎換骨——從今以後，每一顆訓練骰<b class="hl">永久固定 3 點以上</b>，事件卡好結果機率提升至 <b class="hl">70%</b>。`+(bl.length?`潛能重新被評估：${bl.join('、')}。`:'')+'你的故事，才正要展開。');
    board(1); }
}
function checkTraitsMid(){
  /* 自律狂:25 歲前累積保守「成功」15 次 + 從未外遇被抓 + 宵夜 <5 次 */
  if(!S.traits.disc&&S.age<25&&(S.cntSaveWin||0)>=15&&S.love.caught===0&&S.cntSnack<5){
    traitCard('disc','自律狂','你見過凌晨四點的洛杉磯嗎？——年紀輕輕就把身體當成聖殿經營，沒有派對、沒有酒精，只有重訓室的鐵片聲：<b class="hl">整條衰退曲線延後兩年</b>，你的巔峰比同梯更長。'); }
  /* 大心臟:25 歲前豪賭(全力一搏)成功 7 次(允許失敗) */
  if(!S.traits.clutch&&S.age<25&&S.cntBoldWin>=7){
    traitCard('clutch','大心臟','大心臟','經歷了無數次的豪賭，你的心態堅毅無比，無論甚麼事情都不可能讓你心驚膽跳，從此以後，賭得更多，得到更多，輸得更少。——<b class="hl">「全力一搏」成功率提升至天才級、成功加成 +4、失敗只 −2、受傷風險降到普通級</b>，總冠軍與國際賽 MVP 機率提升。'); }
  /* 外務纏身:宵夜/代言/緋聞累計(以宵夜次數 + 感情事件觸發次數估) */
  if(!S.traits.distract&&!S.traits.disc&&(S.love.affairs+S.love.caught+S.cntSnack)>=4&&(S.love.affairs+S.love.caught)>=1){
    traitCard('distract','外務纏身','通告、代言、社群媒體佔據了你太多心神，休賽季很久沒有完整專注在棒球上——<b class="dn">季初擲骰永久 −1 顆</b>（最低 2 顆）。','bad'); }
  /* 更衣室毒瘤:豪賭失敗 4+ 次,或渣男 */
  if(!S.traits.cancer&&!S.traits.franchise&&!S.traits.intlace&&(S.cntBoldFail>=10||S.traits.scum)){
    traitCard('cancer','更衣室毒瘤','教練受夠了你的不可控，隊友對你的新聞指指點點。比起成績，球團現在更想清理休息室的氣氛——<b class="dn">季中被交易機率大增、續約條件惡化</b>。','bad'); }
}
function teamNick(team){ /* ◯◯先生的◯◯:取隊名代表詞 */
  const map={'兄弟巨象':'巨象','府城雄獅':'雄獅','北城赤龍':'赤龍','首都猛虎':'猛虎','華報飛鷹':'飛鷹','中州棕熊':'棕熊','中州公牛':'公牛','海灣巨鯨':'巨鯨',
    '北都烈陽':'烈陽','中州金剛':'金剛','嘉南戰士':'戰士','南方雷霆':'雷霆','台中猛瑪':'猛瑪','桃園金剛':'金剛','新北騎士':'騎士','台北恐龍':'恐龍','高雄神鵰':'神鵰',
    /* 撞名處理:襪王以顏色區分;大人兩隊隊色同為橘,以城市區分 */
    '波士頓襪王':'紅襪王','風城襪王':'白襪王','東京大人':'東京大人','灣區大人':'灣區大人',
    /* slice(-2) 切字修正 */
    '競技者':'競技者','沙漠眼鏡蛇':'眼鏡蛇'};
  return map[team]||(team||'').slice(-2);
}
function teamChampRate(team){ /* 顯示用奪冠率:每隊每年略有波動,以隊名雜湊出基準 */
  let h=0; for(let i=0;i<team.length;i++)h=(h*31+team.charCodeAt(i))&0xffff;
  const base=8+(h%22); /* 8~29% */
  return Math.round(base);
}
function faYears(d,cap){ /* FA 年限:成績穩定+傷病少→年限長;上限 cap(野手15/投手7) */
  const perf=Math.max(0,Math.min(1,(d+2)/8)); /* d=-2→0, d=6→1 */
  const injPenalty=(S.bigInj||0)*0.12+(S.tjCount||0)*0.15;
  let yrs=Math.round(2+perf*(cap-2)-injPenalty*cap);
  /* 年齡上限:球團不會賭老將的長約(考慮引退年齡與衰退) */
  let ageCap=cap;
  if(S.age>=36)ageCap=2; else if(S.age>=34)ageCap=3; else if(S.age>=32)ageCap=5; else if(S.age>=30)ageCap=8;
  yrs=Math.min(yrs,ageCap);
  return Math.max(1,Math.min(cap,yrs));
}
function demotionAudit(cont){
  if(!S.demotionRefused){ cont(); return; }
  S.demotionRefused=false;
  /* 打回身價:d >= 該合約薪資係數應有的水準(mult 越高要求越高) */
  const need=Math.round((S.ct&&S.ct.mult?S.ct.mult:1)*2)-1; /* mult1→1, mult1.2→1.4→1, mult2→3 */
  if((S.lastD||0)>=need){
    if(S.traits.cancer){ removeTrait('cancer','更衣室毒瘤');
      card('good','用成績說話','你用一整季的表現堵住了所有人的嘴——<b class="hl">更衣室毒瘤洗刷</b>。當初拒絕下放的決定，被證明是對的。'); board(1); }
    else card('good','守住身價','你證明了自己還配得上這份合約。');
  } else {
    if(!S.traits.thief){ S.traits.thief=true;
      card('bad','隱藏屬性解鎖：薪水小倫','拒絕下放後，你的成績依然沒有起色。球迷開始在社群叫你「薪水小倫」——<b class="dn">事件卡失敗率永久 +10%</b>，這個名聲跟著你到退休。'); board(1); }
    else card('bad','薪水小倫','又是虛擲的一年。看台上的噓聲更大了。');
  }
  cont();
}
function tradeCheck(cont){
  if(S.stage!=='PRO'||!LV[S.lv].top||S.seasonFactor<=0){ cont(); return; }
  const star = ovr()>=LV[S.lv].par+4; /* 明星:綜合≥聯盟平均+4 */
  let p=15+ (S.tradeHeat||0); /* 基礎 15% + 累積怨氣 */
  if(S.traits.cancer)p+=25; if(S.traits.ambience)p+=20;
  if(!chance(p)){ cont(); return; }
  /* 一人一城:神主牌/◯◯先生是城市的象徵,球團絕不放人(非賣品) */
  if(S.traits.franchise||S.traits.mrteam){
    card('info','非賣品',`他隊捧著誘人的包裹來詢價，高層連會議都沒開就回絕了——<b class="hl">「他是這座城市的象徵，非賣品。」</b>`);
    board(1); cont(); return;
  }
  if(star){
    /* 明星:否決權詢問(同舊設定) */
    if(S.traits.cancer){ doTradeExec(); card('bad','毒瘤交易','球團受夠了休息室的氣氛，直接把你打包送走。'); board(1); cont(); return; }
    choose('交易大限：他隊送來報價，球團徵詢你的否決權',[
      {t:'點頭同意，換個環境',main:true,f:()=>{ doTradeExec(); card('info','轉隊','你打包行李，前往新的城市。'); board(1); cont(); }},
      {t:'行使否決權，我要留下',warn:true,s:'未來 2 年冠軍機率略降、下張合約薪水 −15%',f:()=>{
        S.tradeRefuse=2; card('info','否決交易',`你按下否決鍵。忠誠是一種選擇——球團的重建計畫被你打亂了，短期戰力和你的下張合約都會付出一點代價，但這件球衣，你留下來了。`); board(1); cont(); }}]);
    return;
  }
  /* 非明星:交易傳言,可抱怨或沉默 */
  choose('交易傳言：媒體報導你可能被交易',[
    {t:'公開抱怨表達不滿',warn:true,s:'增加本次被交易的可能性',f:()=>{
      S.complainCount=(S.complainCount||0)+1;
      if(S.complainCount>=2&&!S.traits.ambience){ S.traits.ambience=true;
        card('bad','隱藏屬性解鎖：氣氛大師','你又一次對媒體大吐苦水。球團高層看在眼裡——這種選手，留著也是不定時炸彈。<b class="dn">往後轉隊機率永久提高</b>。'); board(1); }
      if(chance(60)){ doTradeExec(); card('bad','弄假成真',`你的抱怨上了頭條，球團順勢把你送走。新東家，好好打吧。`); board(1); }
      else card('info','雷聲大雨點小','抱怨歸抱怨，這次交易最後沒有成局。你還在原隊，但氣氛有點僵。');
      cont(); }},
    {t:'保持沉默，專心打球',main:true,s:'交易機率不變',f:()=>{
      if(chance(35)){ doTradeExec(); card('info','交易成局',`儘管你不動聲色，球團還是完成了這筆交易。'`); board(1); }
      else card('info','留了下來','傳言就是傳言。新球季，你還是穿著同一件球衣。');
      cont(); }}]);
}
function doTradeExec(){
  /* 季末交易 = 下季起改效力新隊(乾淨轉隊,不設 tradeFrom,避免隔年被誤顯示成兩隊 split) */
  S.teamYears=0; S.champThisTeam=false; S.champTeam=null;
  const list=S.org==='CPBL'?cpblTeamsForYear(S.year):S.org==='NPB'?NPB_TEAMS:MLB_TEAMS;
  const nt=pick(list.filter(t=>t!==S.orgTeam)); S.orgTeam=nt; tlNote(2,'轉隊 '+nt); board(1);
}
function portionOf(st,r){
  const p={...st};
  ['G','PA','AB','H','HR','RBI','SB','BB','W','L','SV','SO','ER'].forEach(k=>p[k]=Math.round(st[k]*r));
  p.IP=+(st.IP*r).toFixed(1);
  p.avg=p.AB>0?p.H/p.AB:0; p.era=p.IP>0?p.ER*9/p.IP:0;
  return p;
}
function rollInjury(){
  const p=injuryProb();
  if(!chance(p)){ card('info','健康回報',`本季平安出賽。（受傷機率 ${p}%）`); S.injNext=0; return; }
  S.injNext=0;
  if(chance(64)){ // 64% 的機率是小傷
    const cut=ri(20,45); S.seasonFactor=1-cut/100; S.ironStreak=0;
    card('bad','小傷',`肌肉拉傷進了傷兵名單，本季出賽量預估減少 <b class="dn">${cut}%</b>。${injStatLoss(false)}`);
  }else{
    const played = ri(5, 45); /* 讓賽季隨機進行了 5% ~ 45% 時才受傷 */
    S.seasonFactor = played / 100; /* 把比例套用到當季出賽 */
    S.bigInj++; S.ironStreak=0;
    let txt=`重大傷勢——進手術室了。<b class="dn">賽季提前報銷</b>（本季留下 ${played}% 的出賽紀錄）。`;
    if(chance(20)){ S.rehab=1; txt+=`醫生搖搖頭：<b class="dn">明年也很難趕上開季</b>（明年整季報廢）。`; }
    card('bad','大傷',txt+injStatLoss(true));
    if(S.bigInj>=2&&!S.traits.glass&&S.age<32){ /* 32 歲後的大傷是老化,不再定性為玻璃體質 */
      S.traits.glass=true;
      card('bad','隱藏素質解鎖：玻璃人','生涯第二次大傷。從此傷病如影隨形，未來每季受傷機率<b class="dn">不低於 40%</b>。'); }
    else if(S.bigInj>=2&&!S.traits.glass&&S.age>=32){
      card('info','醫療團隊評估','「這是歲月的損耗，不是體質問題。」——老將的傷,球團看得比誰都開。'); }
  }
}
function injStatLoss(big){
  if(big){ /* 每一次大傷:全能力 −5,身體被實質性摧毀 */
    POS_AB[S.pos].forEach(k=>{ S.ab[k]=clamp(S.ab[k]-5,1,80); }); board(1);
    return `重大傷勢重創身體素質：<b class="dn">全能力 −5</b>。`;
  }
  if(!chance(40))return '';
  const keys=POS_AB[S.pos];
  let k=pick(keys); if(!(k in S.ab))k=pick(keys);
  const amt=ri(1,2);
  S.ab[k]=clamp(S.ab[k]-amt,1,80); board(1);
  return `傷勢留下後遺症：<b class="dn">${ABL[k]} −${amt}</b>。`;
}
function amateurSeason(){
  if(S.seasonFactor===0){ card('bad','','整季只能在場邊看著隊友比賽。');
    S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:'傷缺全季', inj:true}); nextStep(); return; }
  const cups=S.stage==='HS'?hsCupsForYear(S.year):S.stage==='U'?uCupsForYear(S.year):['成棒甲組春季聯賽','成棒甲組秋季聯賽'];
  const thr=S.stage==='HS'?[52,46,40,34,28]:[60,54,48,42,36];
  let gain=0,lines=[],plain=[];
  const tB=S.stage==='HS'?({1:6,2:0,3:-6})[S.hsTier||2]:0; /* 高中隱藏強度分級 */
  cups.forEach(c=>{ const pw=ovr()+tB+ri(-8,8);
    const i=pw>=thr[0]?0:pw>=thr[1]?1:pw>=thr[2]?2:pw>=thr[3]?3:pw>=thr[4]?4:5;
    const rk=['冠軍','亞軍','四強','八強','十六強','預賽出局'][i];
    const pts=[7,5,4,3,2,1][i]+Math.floor(ovr()/22);
    gain+=pts; lines.push(`${c}：<b class="hl">${rk}</b>（+${pts} 點）`); plain.push(`${c}${rk}`);
    if(S.stage==='U'&&rk==='冠軍'&&!S.traits.academy){ S.traits.academy=true;
      card('gold','隱藏屬性解鎖：學院派','大學殿堂的科學化訓練與防護打下扎實基礎——<b class="hl">25 歲前受傷率 −5%、季初擲骰期望值提升</b>。'); }
    if(i===0)S.honors.push(`${S.year} ${c}冠軍`); });
  S.pool+=gain;
  S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:plain.join('、'), inj:false});
  card('','年度大賽',lines.join('<br>')+`<div class="statline">獲得能力點 ${gain} 點，季末統一分配。能力越高，大賽收穫越多。</div>`);
  maybeIntl(()=>nextStep());
}
function proSeason(){
 const st=simSeason(S.lv); S.lastSt=st; S.lastD=st.d;
  
  /* 1. 聯盟極限出賽數防呆 */
  const maxG = levelGames(S.lv,S.year);
  st.G = Math.min(st.G, maxG);

  /* 2. 投手進階數據合理性防呆 */
  if(S.pos==='P'){ 
    st.G = Math.max(st.G, Math.ceil(st.IP/9)); // 局數保障出賽
    st.SV = Math.min(st.SV || 0, st.G); // 救援不可能大於出賽
    st.HLD = Math.min(st.HLD || 0, st.G - (st.SV || 0)); // 中繼不可能大於 (出賽-救援)
    
    // 勝敗場加總若大於出賽數，等比例縮減
    if ((st.W + st.L) > st.G) {
      const ratio = st.G / (st.W + st.L);
      st.W = Math.floor(st.W * ratio);
      st.L = Math.floor(st.L * ratio);
    }
  } else {
    /* 野手防呆：打席數不可能少於出賽數 */
    st.PA = Math.max(st.PA, st.G); 
  }
  if(S.pendStat>0&&S.seasonFactor>0){
    /* 【修正】狀態火燙的加成，必須依照該季實際出賽的比例（seasonFactor）進行打折 */
    const p = S.pendStat * S.seasonFactor;
    if(S.pos==='P'){
      /* 狀態火燙=教練重用:後援先加出賽(不超過場次上限),再加內容;物理約束重夾 */
      if(!isSP()){ const addG=Math.min(Math.max(0,68-st.G),Math.round(p*1.2)); st.G+=addG; st.IP=+(st.IP+addG*1.05).toFixed(1); }
      st.SO+=Math.round(p*8); st.IP=+(st.IP+p*4).toFixed(1);
      if(isSP())st.W+=Math.round(p*0.4); else st.SV+=Math.round(p*0.6);
      st.era=st.IP>0?clamp(st.era-p*0.05,1.40,9.90):st.era; st.ER=Math.round(st.era*st.IP/9);
      if(!isSP()){ /* 救援/勝敗不可超過出賽數(物理約束) */
        st.SV=Math.min(st.SV||0,Math.floor(st.G*0.85));
        st.HLD=Math.min(st.HLD||0,Math.max(0,st.G-st.SV));
        const decCap=Math.max(0,st.G-st.SV-st.HLD);
        if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
      } }
    else { const Lg={...LV[S.lv],g:levelGames(S.lv,S.year)};
      /* 狀態火燙=教練重用:先轉為上場機會(G/PA 連動,不超過聯盟場次),打擊內容同步升溫 */
      const addG=Math.min(Math.max(0,(Lg.g||120)-st.G), Math.round(p*1.5));
      const addPA=Math.round(addG*4.25), addAB=Math.round(addPA*0.9);
      st.G+=addG; st.PA+=addPA; st.AB+=addAB;
      let addH=Math.round(addAB*0.55)+Math.round(p*1.5); /* 新打席打得火燙+原打席手感提升 */
      addH=Math.max(0,Math.min(addH, st.AB-st.H));        /* 安打不可超過打數 */
      const addHR=Math.min(addH, Math.round(p*1.2));
      st.H+=addH; st.HR+=addHR; st.RBI+=Math.round(addHR*2.1+(addH-addHR)*0.3);
      st.avg=st.AB?st.H/st.AB:0; }
  }
  S.pendStat=0;
  /* 投法對成績的加成/折損 */
  if(S.pos==='P'&&S.seasonFactor>0){ const em={'全力投':1,'普通投':0,'養生球':-1}[S.effort]||0;
    if(em!==0){ st.d+=em; st.era=clamp(st.era-em*0.25,1.40,9.90); st.ER=Math.round(st.era*st.IP/9);
      st.SO=Math.round(st.SO*(1+em*0.06)); } }
  if(S.traits.onetool&&S.seasonFactor>0){ /* 工具人:那項工具讓他「多爭取」到代打/代跑/代守上場(加成,非砍半) */
    const boost=1.25; /* 工具帶來的額外上場機會 */
    ['G','PA','AB'].forEach(k=>{ if(typeof st[k]==='number')st[k]=Math.round(st[k]*boost); });
    /* 累積型數據隨打席等比微調 */
    ['H','HR','RBI','SB','BB'].forEach(k=>{ if(typeof st[k]==='number')st[k]=Math.round(st[k]*boost); });
    st.avg=st.AB>0?st.H/st.AB:0; }
  const bucket=bucketOf(S.lv); accStat(bucket,st);
  if(S.seasonFactor===0){ card('bad','球季數據','（傷缺，本季無出賽紀錄）'); }
  else if(S.tradeFrom){ /* 季中轉隊:列出兩段+合計 */
    const r=0.35+R()*0.3, p1=portionOf(st,r), p2=portionOf(st,1-r);
    card('','球季數據（季中轉隊）',
      `<span class="tag">${S.tradeFrom}</span><div class="statline">${statLine(p1)}</div>`+
      `<span class="tag">${S.teamName()}</span><div class="statline">${statLine(p2)}</div>`+
      `<span class="tag">合計</span><div class="statline">${statLine(st)}</div>`);
  }
  else card('','球季數據',`<span class="tag">${S.teamName()}${S.dpos?'｜'+S.dpos:''}</span><div class="statline">${statLine(st)}</div>`);
  /* 低潮年 / 生涯年 敘述卡 */
  if(st.form===-1){
    card('bad','巨大的低潮',`身體狀況很好，但是成績一直打不出來，遇到了巨大的低潮。孤獨、無助，就像是溺水一樣，只能隨意抓取孤木。`);
  }else if(st.form===1){
    if(S.pos==='P') card('gold','生涯年','縫線掠過指尖的感覺無與倫比，而你投出去的球像是有了生命，用一個無人能想像得到的角度，閃過了打者的球棒，並穩穩投進捕手的手套。');
    else card('gold','生涯年','投來的每顆球看起來都像籃球一樣大，你看得到縫線、球的轉動，就和駭客任務的子彈一樣慢了下來，而你每一顆擊中甜蜜點的球，都往全壘打牆奔去。');
  }
  const isInj = S.seasonFactor <= 0.45; /* 判斷是否為大傷報廢年 */
  S.log.push({y:S.year,age:S.age,tm:S.tradeFrom?`${S.tradeFrom}→${S.teamName()}`:S.teamName(),p:S.dpos||'',line:S.seasonFactor===0?'傷缺全季':statLine(st), inj: isInj, st: st});
  S.tradeFrom=null;
  /* 鐵人累計 */
  const healthy=S.seasonFactor>=0.95&&(S.pos==='P'?(isSP()?st.IP>=Math.min(120,levelGames(S.lv,S.year)):st.G>=Math.min(42,levelGames(S.lv,S.year)*0.4)):st.G>=levelGames(S.lv,S.year)*0.8);
  if(healthy){ S.ironStreak++;
    if(S.ironStreak>=5&&!S.traits.iron){ S.traits.iron=true;
      card('gold','隱藏素質解鎖：鐵人','連續五年全勤級出賽！鋼鐵般的身體，未來每季受傷機率<b class="hl">不高於 10%</b>。'); } }
  else if(S.seasonFactor<0.95)S.ironStreak=0;
  /* 只會這個:先看夠不夠格當主力,夠格絕不判工具人;不夠格才看有無突出工具 */
  if(S.pos!=='P'){ const tg=toolGap();
    /* 主力判定:還原健康狀態下的預估出賽數,傷病缺陣不影響評估
       (出賽數公式含 seasonFactor,除回即得健康時的預估;表現係數仍保留) */
    const projG = S.seasonFactor > 0 ? (st.G / S.seasonFactor) : 0;
    const isRegular = projG >= levelGames(S.lv,S.year) * 0.60;
    if(!S.traits.onetool && !isRegular && tg.gap>=22 && tg.val>=58 && careerAllStars()<4){ S.traits.onetool=true;
      const wasBefore=S.removed.includes('只會這個');
      S.removed=S.removed.filter(x=>x!=='只會這個'); /* 重新觸發:清掉刪除線記錄 */
      const role=tg.role;
      S.toolRole=role;
      if(wasBefore||S.age>=33)
        traitCard('onetool','只會這個',`歲月帶走了你的其他工具，只剩<b class="hl">${role}</b>那一項本領還在。教練把你當成板凳上的秘密武器——關鍵時刻，你仍然可靠。`,'bad');
      else
        traitCard('onetool','只會這個',`你只有一項武器強得誇張，其餘全是破洞。教練不敢讓你先發，只在關鍵時刻派你上去做一件事——你成了球隊的<b class="hl">${role}</b>。出賽數銳減，但那一項本領無人能及。`,'bad'); }
    else if(S.traits.onetool && (tg.gap<18 || isRegular)){ /* 補起來 或 實力打回主力 → 解除 */
      removeTrait('onetool','只會這個'); S.toolRole=null;
      card('good','不再是工具人','教練終於敢把你放進先發打線——你證明了自己不只是板凳上的一招鮮。<b class="hl">「只會這個」解除</b>，你是個完整的球員了。'); board(1); } }
  awards(bucket,st);
  if(S.pos==='P'&&S.seasonFactor>0)tjAccrue();
  tjGamble(()=>demotionAudit(()=>tradeCheck(()=>maybeIntl(()=>nextStep()))));
}
function awards(bucket,st){
  if(!LV[S.lv].top||S.seasonFactor===0)return;
  const y=S.year,h=S.honors,lgN={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];

  /* 建立符合 simSeason 數學邏輯的門檻表 [基礎門檻, 鬼神保底門檻] */
  /* 比率數據(ERA/AVG/OBP)與非場次連動數據(SV/HLD/SB)三個聯盟統一標準 */
  /* 只有吃打席/局數的(HR/RBI/SO)依 120:143:162 場次等比放大 */
  const TH = {
    CPBL: { g: 120, era: [3.20, 2.20], sv: [22, 35], hld: [18, 30], so: [130, 180], avg: [0.300, 0.360], hr: [20, 32], rbi: [75, 105], obp: [0.370, 0.430] },
    NPB:  { g: 143, era: [3.20, 2.20], sv: [22, 35], hld: [18, 30], so: [155, 215], avg: [0.300, 0.360], hr: [24, 38], rbi: [90, 125], obp: [0.370, 0.430] },
    MLB:  { g: 162, era: [3.20, 2.20], sv: [22, 35], hld: [18, 30], so: [175, 240], avg: [0.300, 0.360], hr: [27, 43], rbi: [100, 140], obp: [0.370, 0.430] }
  };
  const th = TH[bucket] || TH.CPBL;

  /* 1. 明星賽入選：隨表現 (d值) 動態提升機率 */
  { const d=st.d;
    let asP=clamp(28+d*7,3,92);
    if(bucket==='CPBL'&&S.orgTeam==='兄弟巨象')asP=clamp(asP+30,3,97); /* 人氣球團加成 */
    if(chance(asP)){ S.stats[bucket].AS++;
      h.push(`${y} ${lgN}明星賽`+((bucket==='CPBL'&&S.orgTeam==='兄弟巨象'&&d<2)?'（人氣入選）':'')); } }

  /* 2. 新人王：依 d 值成長機率 */
  const rookieOK=bucket!=='CPBL'||!(S.stats.NPB||S.stats.MLB||S.stats.MINOR);
  if(S.stats[bucket].yr===1&&rookieOK&&st.d>=4){
    const rkP = clamp(30 + (st.d - 4) * 15, 30, 95);
    if(chance(rkP)) h.push(`${y} ${lgN}新人王`);
  }

  /* 3. 投手個人獎項 */
  if(S.pos==='P'){
    const aw='年度最佳投手';
    if(isSP() && st.era <= th.era[0] && st.IP >= th.g){ 
      const god = st.era <= th.era[1] && st.IP >= 150;
      const p = god ? 100 : clamp(30 + Math.round((th.era[0] - st.era) * 35 + (st.IP - th.g) * 0.4), 30, 95);
      if(chance(p)) h.push(`${y} ${aw}`);
    }
    if(S.role==='CL' && st.SV >= th.sv[0]){
      const god = st.SV >= th.sv[1];
      const p = god ? 100 : clamp(28 + (st.SV - th.sv[0]) * 5, 28, 95);
      if(chance(p)) h.push(`${y} ${lgN}救援王`);
    }
    if(S.role==='MR' && (st.HLD||0) >= th.hld[0]){
      const god = (st.HLD||0) >= th.hld[1];
      const p = god ? 100 : clamp(28 + ((st.HLD||0) - th.hld[0]) * 4, 28, 95);
      if(chance(p)) h.push(`${y} ${lgN}中繼王`);
    }
    if(st.SO >= th.so[0]){
      const god = st.SO >= th.so[1];
      const p = god ? 100 : clamp(25 + Math.round((st.SO - th.so[0]) * 1.2), 25, 95);
      if(chance(p)) h.push(`${y} ${lgN}三振王`);
    }
  }
  /* 4. 野手個人獎項 */
  else{
    if(st.PA >= 350 && st.avg >= th.avg[0]){
      const god = st.avg >= th.avg[1];
      const p = god ? 100 : clamp(25 + Math.floor((st.avg - th.avg[0]) / 0.005) * 6, 25, 95);
      if(chance(p)) h.push(`${y} ${lgN}打擊王`);
    }
    if(st.PA >= 300 && st.HR >= th.hr[0]){
      const god = st.HR >= th.hr[1];
      const p = god ? 100 : clamp(25 + (st.HR - th.hr[0]) * 5, 25, 95);
      if(chance(p)) h.push(`${y} ${lgN}全壘打王`);
    }
    if(st.PA >= 300 && st.SB >= 25){ // SB不隨場次放大，全聯盟標準一致
      const god = st.SB >= 45;
      const p = god ? 100 : clamp(25 + (st.SB - 25) * 4, 25, 95);
      if(chance(p)) h.push(`${y} ${lgN}盜壘王`);
    }
    if(st.PA >= 300 && st.RBI >= th.rbi[0]){
      const god = st.RBI >= th.rbi[1];
      const p = god ? 100 : clamp(25 + (st.RBI - th.rbi[0]) * 2, 25, 95);
      if(chance(p)) h.push(`${y} ${lgN}打點王`);
    }
    const obp = st.PA > 0 ? (st.H + st.BB) / st.PA : 0;
    if(st.PA >= 350 && obp >= th.obp[0]){
      const god = obp >= th.obp[1];
      const p = god ? 100 : clamp(25 + Math.floor((obp - th.obp[0]) / 0.005) * 5, 25, 95);
      if(chance(p)) h.push(`${y} ${lgN}上壘王`);
    }
    const def1 = st.DEF || 0;
    if(S.dpos !== 'DH' && S.seasonFactor >= 0.7){
      if(def1 >= 6){
        const pGlove = clamp(38 + (def1 - 6) * 5, 38, 95);
        if(chance(pGlove)) h.push(`${y} ${lgN}金手套`);
      }
      if(def1 >= 11){
        const pDef = clamp(30 + (def1 - 11) * 6, 30, 95);
        if(chance(pDef)) h.push(`${y} ${lgN}守備王`);
      }
    }
  }

  /* 5. 年度 MVP（最高榮譽） */
  const mvpQual = S.pos==='P'
    ? (isSP() ? st.IP >= 120 : st.G >= 45)
    : st.PA >= levelGames(S.lv,S.year) * 3.4;

  if(st.d >= 6 && mvpQual && S.seasonFactor >= 0.9){
    const god = st.d >= 15;
    const baseMult = (S.pos === 'P' && S.role !== 'SP') ? 5 : 12; 
    const pMVP = god ? 100 : clamp(baseMult + (st.d - 6) * 11, baseMult, 95);
    if(chance(pMVP)) h.push(`${y} ${lgN}年度MVP`);
  }

  /* 6. 後續獲獎觸發特質 */
  const added=h.filter(x=>x.startsWith(String(y)));
  if(added.length){ card('gold','年度獎項',added.map(x=>x.slice(5)).join('｜'));
    const topAw=added.find(x=>/年度MVP/.test(x))||added.find(x=>/最佳投手|王/.test(x))||added.find(x=>/新人王/.test(x))||added[0];
    tlNote(3,topAw.slice(5));
    if(S.traits.yips){ removeTrait('yips','失憶症'); card('good','走出陰影','站上大舞台拿下獎項的那一刻，腦海裡的雜音消失了——<b class="hl">失憶症痊癒</b>。'); }
    if(S.traits.glass&&!S.traits.phoenix){ const big=added.some(x=>/MVP|最佳投手|打擊王|全壘打王|新人王/.test(x));
      if(big){ S.traits.phoenix=true; removeTrait('glass','玻璃人');
        S.pool+=8;
        card('gold','隱藏屬性解鎖：浴火重生','那些殺不死你的，真的讓你更強大了。撕裂的韌帶長成更堅韌的形狀——<b class="hl">玻璃人懲罰解除，受傷率恢復正常，並獲得一大筆能力點</b>。'); } }
  }
}
function intlEventForYear(y){
  const fixed={
    1992:{name:'巴塞隆納奧運',short:'奧運',amateur:true,amateurOnly:true,req:40,dc:14},
    1994:{name:'廣島亞運',short:'亞運',amateur:true,amateurOnly:true,req:36,dc:12},
    1998:{name:'曼谷亞運',short:'亞運',amateur:true,req:40,dc:13},
    2001:{name:'世界盃棒球賽',short:'世界盃',amateur:true,req:43,dc:13},
    2002:{name:'釜山亞運',short:'亞運',amateur:true,req:44,dc:13},
    2004:{name:'雅典奧運',short:'奧運',amateur:true,req:46,dc:13},
    2006:{name:'世界棒球經典賽',short:'經典賽',amateur:true,req:48,dc:13},
    2008:{name:'北京奧運',short:'奧運',amateur:true,req:48,dc:13},
    2009:{name:'世界棒球經典賽',short:'經典賽',amateur:true,req:50,dc:13},
    2013:{name:'世界棒球經典賽',short:'經典賽',amateur:true,req:50,dc:13},
    2015:{name:'世界12強賽',short:'12強',amateur:true,req:50,dc:13,p12:true},
    2017:{name:'世界棒球經典賽',short:'經典賽',amateur:true,req:50,dc:13},
    2019:{name:'世界12強賽',short:'12強',amateur:true,req:50,dc:13,p12:true},
    2023:{name:'世界棒球經典賽',short:'經典賽',amateur:true,req:50,dc:13},
    2024:{name:'世界12強賽',short:'12強',amateur:true,req:50,dc:13,p12:true},
    2026:{name:'世界棒球經典賽',short:'經典賽',amateur:true,req:50,dc:13}
  };
  if(fixed[y])return fixed[y];
  if(y>2026&&(y-2026)%4===0)return {name:'世界棒球經典賽',short:'經典賽',amateur:true,req:50,dc:13};
  if(y>2024&&(y-2024)%4===0)return {name:'世界12強賽',short:'12強',amateur:true,req:50,dc:13,p12:true};
  return null;
}
function intlSelectionProfile(ev){
  const rating=ovr();
  const youngBarcelona=S.year===1992&&S.stage==='HS'&&S.age<=18;
  if(youngBarcelona){
    const champion=(S.honors||[]).some(h=>/^199[0-2] .*冠軍$/.test(h));
    const eliteResume=!!(S.traits.genius||champion||(S.dev.trust||0)>=4||rating>=48);
    const eligible=rating>=44&&eliteResume;
    return {rating,youngBarcelona:true,eligible,training:!eligible&&rating>=36,
      role:eligible?'fringe':rating>=36?'training':'out',req:44,dc:15,eliteResume};
  }
  return {rating,youngBarcelona:false,eligible:rating>=ev.req,training:false,
    role:rating<ev.req+5?'reserve':'core',req:ev.req,dc:ev.dc,eliteResume:true};
}
function maybeIntl(done){
  ensureCampaignState(); const ev=intlEventForYear(S.year);
  if(!ev||(ev.p12&&S.lv==='MLB')||(S.stage!=='PRO'&&!ev.amateur)||S.seasonFactor<0.5||S.rehab>0||S.skipMid){ done(); return; }
  if(ev.amateurOnly&&S.stage==='PRO'){
    S.era.intlEdge=0;
    card('info',`${ev.name}｜業餘國家隊年代`,`那一屆的正式名單仍只向業餘球員開放。你已經穿上職業球衣，只能從電視前看著昔日隊友出發；直到 1998 年，職業球員才真正走進這類國際賽名單。`);
    done(); return;
  }
  const profile=intlSelectionProfile(ev);
  if(!profile.eligible){
    S.era.intlEdge=0;
    if(profile.youngBarcelona){
      S.era.barcelonaRole=profile.role;
      if(profile.training){
        S.dev.trust=clamp((S.dev.trust||0)+1,-5,10);
        const why=profile.rating<44?'球探願意看你的下一年，還不願意把奧運名額押在今年。':'球威已經到了，履歷上卻還少一場能讓選訓委員閉嘴的大賽。';
        card('info','巴塞隆納培訓名單',`你被叫去替成棒代表隊陪練。${why}<br><span class="sub">綜合能力 ${profile.rating}｜十八歲越級門檻 44＋頂尖履歷｜教練信任 +1</span><br>你沒有取得正式國手資格，也不會隨隊領取奧運獎牌。`);
      }else{
        card('info','名單還在山的另一頭',`電視裡公布了巴塞隆納培訓名單，你的名字沒有出現。十八歲不是不能去，只是那必須是全島幾年才出一個的例外。<br><span class="sub">綜合能力 ${profile.rating}｜陪練觀察門檻 36</span>`);
      }
    }
    done(); return;
  }
  const selectionScore=clamp(Math.round(ovr()+20+Math.min(8,S.dev.trust||0)),1,80);
  const edge=clamp((S.era.intlEdge||0)+(S.traits.clutch?1:0),-1,1); S.era.intlEdge=0;
  d20Check({title:`${ev.name}最終名單`,label:'競技狀態',score:selectionScore,dc:profile.dc,edge,
    stakes:profile.youngBarcelona?'十八歲的高中生要搶成棒隊最後一席。教練看的是足以越級的球威，不是潛力兩個字。':S.stage==='PRO'?'教練團把最後兩個名字留到會議最末。你的近況，現在要被放上秤。':'那個年代，業餘球員也能從校隊一路走進國家隊。最後一張名單，就差一個名字。'},sel=>{
    if(!sel.success){ card('info','名單公布','你從第一行看到最後一行。沒有自己的名字。難受是真的，明天還是得練球。'); done(); return; }
    const fringe=profile.role==='fringe';
    choose(`中華隊徵召 · ${ev.name}`,[
      {t:'披上國家隊戰袍',main:true,s:fringe?'名單末席｜低張力出賽｜能力點上限 2｜下季受傷機率 +3%':'依成績獲得能力點｜下季受傷機率 +10%',f:()=>{
        if(profile.youngBarcelona)S.era.barcelonaRole='fringe';
        const b=clamp(Math.round((ovr()-ev.req)*0.35)+(sel.strong?3:0),0,10), r=R()*100+b;
        const i=S.year===1992?1:(r>=96?0:r>=88?1:r>=79?2:r>=46?3:4); /* 巴塞隆納銀牌是時代錨點，不由個人改寫 */
        const rk=['冠軍','亞軍','季軍','複賽止步','預賽出局'][i], pts=[6,5,4,2,1][i];
        let gpts=fringe?Math.min(2,pts):pts; if(S.traits.intlace)gpts=Math.max(gpts,2);
        S.pool+=gpts; S.injNext=S.traits.intlace?0:fringe?3:10; S.intlCount++;
        if(fringe&&S.age===18)unlockAchievement('barcelona_youngest','你不是球隊的主角，卻成了那屆最年輕的一個名字。');
        if(!S.traits.taiwan&&S.intlCount>5){ S.traits.taiwan=true;
          card('gold','隱藏稱號：Team Taiwan','永遠把國家榮耀放在比職涯更高的位子，台灣球迷的心中永遠有一幅畫：你在球場上向全場比劃著胸口，那是你心中最榮耀的地方。'); board(1); }
        { const a=S.ab, par=ev.req; const IS=S.intlStat;
          if(S.pos==='P'){ const dd=(a.vel+a.ctl+a.brk)/3-par; let g,ip;
            if(fringe){g=1;ip=2;}else if(isSP()){g=ri(1,2);ip=+(g*(4.5+R()*2.5)).toFixed(1);}else{g=ri(3,6);ip=+(g*(0.8+R()*0.8)).toFixed(1);}
            IS.IP=+(IS.IP+ip).toFixed(1);IS.G+=g;IS.SO+=Math.round(ip/9*clamp(7.5+dd*0.12,4,14));IS.ER+=Math.round(clamp(3.6-dd*0.16,0.8,8)*ip/9);
            if(i<=2&&chance(45))IS.W++;if(!isSP()&&chance(30))IS.SV++;
          }else{const dd=(a.con*0.5+a.pow*0.2+a.eye*0.18+a.spd*0.12)-par-0.5,g=fringe?ri(1,3):ri(5,8),pa=fringe?ri(1,4):g*ri(3,4),ab=Math.round(pa*0.86);
            IS.G+=g;IS.PA+=pa;IS.AB+=ab;const h=Math.round(ab*clamp(0.270+dd*0.006,0.15,0.5));IS.H+=h;const hr=Math.round(h*clamp(0.06+Math.max(0,a.pow-par)*0.006,0.03,0.28));IS.HR+=hr;IS.RBI+=Math.round(hr*2.1+h*0.35);}
        }
        if(i<=1)S.intlTop4=(S.intlTop4||0)+1;
        if(!S.traits.intlace&&S.intlCount>=3&&(S.intlTop4||0)>=2){S.traits.intlace=true;card('gold','隱藏屬性解鎖：國際賽之鬼','只要穿上 CT 球衣，你的痛覺就會消失——你是為大場面而生的男人。<b class="hl">國際賽不再增加受傷風險，且每次徵召能力點保底 +2</b>。');}
        if(i<=2)S.honors.push(`${S.year} ${ev.name}${rk}`);if(i===0)tlNote(3,ev.short+'冠軍');
        let ex='';const mp=S.traits.clutch?2:1;if(!fringe&&((i===0&&chance(30*mp))||(i===1&&chance(8*mp)))){S.honors.push(`${S.year} ${ev.name}MVP`);ex='你被選為<b class="hl">賽會MVP</b>！';}
        const roleText=fringe?`你以 ${S.age} 歲的名單末席隨隊，只在低張力局面得到少量機會。`:'';
        card(i<=1?'gold':'info',ev.name,`${roleText}中華隊最終成績：<b class="hl">${rk}</b>。${ex}獲得能力點 <b class="hl">${gpts}</b> 點。${S.traits.intlace?'國家英雄不知何謂疲憊。':fringe?'有限出賽仍留下疲勞，下季受傷風險小幅上升。':'國際賽的高強度消耗，讓下季受傷風險上升。'}`);done();}},
      {t:'婉拒徵召，留隊調整',warn:true,s:'保住身體，但錯過這一屆',f:done}]);
  });
}
/* ---------- 季末 ---------- */
function phaseEnd(){
  board(2);
  if(S.stage==='PRO'){
    let sal=Math.round(salaryFor(S.lv,S.lastD||0)*(S.ct?S.ct.mult:1)*dpMult()); if(S.seasonFactor===0)sal=Math.round(sal*0.5);
    S.salary+=sal;
    let extra='';
    if(LV[S.lv].top&&S.seasonFactor>0){
      const tp=LV[S.lv].top;
      const pc=clamp(({CPBL:15,NPB:8,MLB:3.5})[tp]+(S.lastD||0)*0.5,2,({CPBL:26,NPB:15,MLB:9})[tp]);
      let pcc=pc; if(S.traits.clutch)pcc*=1.25; /* 大心臟 */
      if(S.tradeRefuse>0){ pcc*=0.75; } /* 否決交易:戰力略受影響(成本已降) */
      const noPostseason=tp==='MLB'&&S.year===1994;
      const fixedBay=tp==='NPB'&&S.year===1998;
      const wonFixedBay=fixedBay&&S.orgTeam==='橫濱海星';
      if((wonFixedBay||(!noPostseason&&!fixedBay&&chance(pcc)))){ const cN={CPBL:'中職總冠軍',NPB:'日本一',MLB:'世界大賽冠軍'}[LV[S.lv].top];
        S.honors.push(`${S.year} ${cN}`); S.wonChamp=true; S.champThisTeam=true; S.champTeam=S.orgTeam; extra=`<br>球隊奪下 <b class="hl">${cN}</b>，全城陷入瘋狂！`; } }
    if(S.tradeRefuse>0)S.tradeRefuse--;
    if(S.tradeHeat>0)S.tradeHeat=Math.max(0,S.tradeHeat-5);
    card('','季末結算',`本年度薪資：<b class="hl">${fmtMoney(sal)}</b>（生涯累計 ${fmtMoney(Math.round(S.salary))}）${S.ct?`｜合約剩 ${Math.max(0,S.ct.yrs-1)} 年`:''}${extra}`);
    board(2);
  }
  recordFameLeague();
  developmentSeasonReview();
  const go=()=>movement();
  if(S.pool>0){ const p=S.pool; S.pool=0;
    choose('',[{t:`▸ 分配能力點（${p} 點·大賽／國際賽成果）`,main:true,f:()=>allocUI({pool:p},'季末能力點分配（大賽／國際賽成果）',go)}]); }
  else go();
}
/* ---------- 升降級與去向 ---------- */
function maybeBeefNoodleReturn(done,force){
  ensureCampaignState();
  const hadUS=!!(S.org==='MiLB'||S.era.overseasArrival.US);
  const eligible=S.pos==='P'&&S.stage==='PRO'&&S.age>=28&&S.era.justFinishedRehab&&
    ((S.bigInj||0)>0||(S.tjCount||0)>0)&&hadUS&&!S.era.beefNoodleSeen;
  if(!eligible||(!force&&!chance(3)))return false;
  S.era.beefNoodleSeen=true;
  card('info','休息室以外的工作','整整一年復健，球團仍只願意給你一句「再看看」。你回到家，把棒球包塞進牛肉麵店後面；切肉、熬湯、擦桌子，至少每件事都有確定的答案。');
  choose('招牌掛上去以前，你要不要真的離開球場？',[
    {t:'先把牛肉麵煮好，棒球以後再說',main:true,s:'超低機率搞笑路線｜手傷奇蹟復原｜重返美國職棒',f:()=>{
      card('gold','老闆自己吃一碗','開店第三個月，打烊後你替自己盛了一大碗。第一口下去，背脊發熱；第二口下去，肩膀喀一聲；湯喝完，你整個人通體舒暢。你順手把空湯鍋往流理台一甩——球速看起來比復健前還快。');
      S.tj=0;S.rehab=0;S.tmpInj=0;S.injNext=0;S.skipMid=false;
      if(S.traits.glass)removeTrait('glass','玻璃人');
      addAb('vel',5);addAb('brk',5);addAb('sta',3);
      const arm=Math.round((S.ab.vel+S.ab.ctl+S.ab.brk+S.ab.sta)/4);
      d20Check({title:'把湯勺換回球',label:'復活後手感',score:arm,dc:14,edge:1,stakes:'來吃麵的美國球探本來只想加辣。看見你把那口鍋甩出去，他把名片壓在帳單下面：「明年春訓，帶手套。也帶一包湯底。」'},r=>{
        const lv=r.strong?'MLB':r.success?'A3':'A1';
        signTo('MiLB',lv,null,r.strong?2:3,1);
        S.era.usDoor=true;S.era.beefNoodleReturn=true;
        unlockAchievement('beef_noodle_return',r.strong?'球探後來堅稱自己看的是手臂，不是湯頭。沒有人相信。':r.success?'你從高階小聯盟重新排隊，行李裡多了一罐牛油。':'測試數字不算漂亮，但球探想知道下一碗能不能再來一次。');
        tlNote(4,'牛肉麵奇蹟重返美職');
        card('gold','火球重新上桌',`你從 <b class="hl">${LV[lv].n}</b> 回到美國職棒。醫師看了核磁共振，沉默很久，只問：「那家店週一有開嗎？」`);done();
      });
    }},
    {t:'笑一笑，把招牌收起來，照原復健計畫走',s:'維持原球隊與正常傷後路線',f:()=>{card('info','湯是湯，球是球','你把試賣的麵分給鄰居，隔天照表回到重量室。奇蹟沒有發生，復健至少是真的。');done();}}
  ]);
  return true;
}
function movement(){
  const o=ovr();
  if(S.stage==='HS'){ if(S.stageYr<3)advance(); else pathChoiceHS(); return; }
  if(S.stage==='U'){ if(S.stageYr<4)advance(); else pathChoiceU4(); return; }
  if(S.stage==='AMA'){
    if(S.age>=26){ endGame('選秀多年落榜，'+S.year+' 年結束球員身分，轉任基層教練。'); return; }
    choose('業餘年度結束',[
      {t:'再次投入中職選秀',main:true,f:()=>runDraft(false,()=>advance())},
      {t:'高掛球鞋',warn:true,f:()=>endGame('在業餘球隊劃下句點。')}]);
    return;
  }
  /* 職業 */
  if(S.year===1999&&S.era.collapseChoice){resolveCollapse1999(()=>movement());return;}
  if(S.skipMid&&maybeBeefNoodleReturn(()=>advance()))return;
  if(S.skipMid){ advance(); return; } /* 復健年不異動 */
  if(o<30){ buyoutRemaining(1); endGame('能力已跌破中職二軍最低水準，'+S.year+' 年球季後遭釋出，被迫引退。'); return; }
  if(S.org==='NPB')S.npbYears++;
  if(LV[S.lv].top){ /* 轉換聯盟：直接解除球團 5 年控制期限制，往後只要合約到期就是自由球員 */
    if(S.svcOrg && S.svcOrg!==S.org){ S.faElig=true; }
    S.svcOrg=S.org;
    S.svc=(S.svc||0)+1; if(S.svc>=5)S.faElig=true;
  }
  /* 神主牌:同隊連續年數(轉隊會歸零,見 doTrade/signTo) */
  if(S.stage==='PRO'&&LV[S.lv].top){ S.teamYears=(S.teamYears||0)+1;
    if(!S.traits.goldcloth&&S.orgTeam==='兄弟巨象'&&(S.teamTally.CPBL&&S.teamTally.CPBL['兄弟巨象']>=10)){ S.traits.goldcloth=true;
      card('gold','隱藏屬性解鎖：黃金聖衣','效力 兄弟巨象 滿十年，你已是這支球隊的象徵。披上那件黃金戰袍，你就是主場的信仰。'); board(1); }
    if(!S.traits.franchise&&S.teamYears>=7&&S.champThisTeam&&S.champTeam===S.orgTeam){ S.traits.franchise=true;
      card('gold','隱藏屬性解鎖：神主牌','這座城市的球迷看著你長大。球團高層很清楚，放你走球迷會把主場拆了——<b class="hl">母隊續約年薪係數固定 ≥×1.2，引退評價加成</b>。'); }
    /* ◯◯先生:同一支球隊效力滿 15 年且成績穩定 */
    if(!S.traits.mrteam&&S.teamYears>=15&&(S.lastD||0)>=0){ S.traits.mrteam=true; S.mrTeamName=S.orgTeam;
      const nick=teamNick(S.orgTeam);
      card('gold','隱藏稱號：'+nick+'先生',`十五個年頭，同一件球衣。球迷不再喊你的名字，他們喊你「<b class="hl">${nick}先生</b>」——你就是這支球隊的代名詞。`); board(1); }
    /* ◯◯七彩球衣:同一聯盟生涯效力球隊數超標(中職>3、日職>5、美職>5) */
    if(!S.traits.rainbow){
      const RB={CPBL:['中職',3],NPB:['日職',5],MLB:['大聯盟',5]};
      for(const lg in RB){
        const n=Object.keys((S.teamTally&&S.teamTally[lg])||{}).length;
        if(n>RB[lg][1]){ S.traits.rainbow=true; S.rainbowLg=RB[lg][0];
          card('info','隱藏稱號：'+RB[lg][0]+'七彩球衣',`打開衣櫃，${n} 件不同的球衣掛在眼前——${RB[lg][0]}的球隊你快穿過一輪了。球迷笑稱你是「<b class="hl">七彩球衣</b>」：去到哪裡都能活下來，這也是一種本事。`); board(1); break; }
      }
    } }
  const path=PATHS[S.org], idx=path.indexOf(S.lv);
  let minReq=LV[S.lv].min;
  if(S.org==='NPB'&&S.npbYears>=8){ minReq-=4; }
  const perf=(S.seasonFactor>=0.5)?(S.lastD||0):null; /* 傷缺季不看成績 */
  /* 得獎保護傘:當季拿過個人獎項(MVP/王/最佳投手,不含明星賽)→絕不下放/釋出 */
  const wonAward = S.honors.some(x=>x.startsWith(String(S.year))&&/王|MVP|賽揚|澤村|最佳投手|金手套/.test(x)&&!/明星賽/.test(x));
  /* Fix C:實際成績達標保護傘——用當季真實數據(不看能力 d),打得好就不下放 */
  let goodReal=false;
  { const st=S.lastSt;
    if(st&&S.seasonFactor>=0.5){
      if(S.pos==='P'){
        const era=st.IP>0?st.ER*9/st.IP:99, whip=st.IP>0?(st.H+st.BB)/st.IP:99;
        /* 投手:ERA 或 WHIP 達聯盟一線水準,或有一定救援/中繼產能 */
        if(era<=4.20||whip<=1.35||(st.SV||0)>=15||(st.HLD||0)>=15)goodReal=true;
      }else{
        const obp=st.PA>0?(st.H+st.BB)/st.PA:0, slg=slgOf(st), ops=obp+slg;
        /* 野手:OPS 達聯盟主力水準(.720+),或雙位數轟/盜等實質產能 */
        if(ops>=0.720||st.HR>=12||st.SB>=15||st.RBI>=(levelGames(S.lv,S.year)>=150?70:55))goodReal=true;
      }
    }
  }
  if(wonAward||goodReal){ /* 拿獎 或 帳面成績達標 → 球團不會處理掉 */ }
  else if(o<minReq){
    if(perf!==null&&perf>=0){ /* 帳面成績夠好,球團續留觀察 */
      card('info','球團評估',`體能檢測數字亮紅燈，但你用<b class="hl">實際成績</b>說話——本季表現達聯盟水準，球團決定續留一線觀察。`);
    }else{ handleDemotion(o,path,idx); return; }
  }else if(perf!==null&&perf<=-6&&chance(55)){ /* 能力還在但成績崩盤,一樣會被下放 */
    card('bad','球團評估','帳面數據遠低於聯盟水準，教練團失去耐心。');
    handleDemotion(o,path,idx); return;
  }
  /* 升級(壓倒性表現可連跳兩級) */
  if(idx<path.length-1){ const nx=path[idx+1];
    if(o>=LV[nx].min&&((S.lastD||0)>=0||chance(50))){
      let to=nx;
      if(idx<path.length-2){ const nx2=path[idx+2];
        if(o>=LV[nx2].min+2&&(S.lastD||0)>=4)to=nx2; }
      S.lv=to; card('good','升級通知',`表現獲得肯定，${to!==nx?'<b class="hl">連跳兩級</b>':'晉升'} <b class="hl">${LV[to].n}</b>！`); board(2);
      if(LV[to].top)tlNote(2,'升上'+LV[to].n);
      if(S.traits.yips){ removeTrait('yips','失憶症'); card('good','走出陰影','重回上一層舞台，你終於找回了節奏——<b class="hl">失憶症痊癒</b>。'); } } }
  if(!S.ct)S.ct={yrs:2,mult:1};
  S.ct.yrs--;
  /* 母隊延長/換約時機:多年約跑到倒數第二年、或最後一張約剩1年,可談延長 */
  if(S.ct.yrs===1&&LV[S.lv].top&&!S.ct.extOffered&&S.faElig&&(S.lastD||0)>=1&&chance(45)){
    S.ct.extOffered=true; extensionOffer(o); return;
  }
  if(S.ct.yrs<=0){
    if(LV[S.lv].top){
      if(S.faElig){ faFlow(o); return; }
      /* 菜鳥5年內:球團行使續約權,續短約,薪資不低於層級基數 */
      S.ct={yrs:ri(1,2),mult:1,extOffered:false};
      card('info','球團續約',`你仍在選秀球隊掌控期（服務 ${S.svc}/5 年），球團行使續約權——續 <b class="hl">${S.ct.yrs} 年</b>，薪資照層級基數。`); board(1);
    } else { S.ct={yrs:ri(1,2),mult:1}; } /* 非頂級層級 */
  }
  crossOffers(o);
}
function buyoutRemaining(rate){ /* 合約剩餘年數給付:玩家自請提前結束=七成(預設);球團主動終止=十成全額 */
  rate=rate||0.7;
  if(!S.ct||!(S.ct.yrs>1)||(!LV[S.lv].top&&rate<1))return 0; /* 球團主動終止不受二軍守衛限制 */
  const remain=S.ct.yrs-1; /* 當年已算過,剩餘為 yrs-1 */
  if(remain<=0)return 0;
  const yearly=Math.round(salaryFor(S.lv,S.lastD||0)*(S.ct.mult||1));
  const full=yearly*remain;                 /* 剩餘合約總額 */
  const total=Math.round(full*rate);
  if(total>0){ S.salary+=total;
    if(rate>=1) card('gold','合約全額給付',`合約還有 <b class="hl">${remain} 年</b>，但這次不是你要走——球團主動終止合約，依約剩餘薪資<b class="hl">十成全額</b>給付，<b class="hl">${fmtMoney(total)}</b> 一次入帳。白紙黑字的長約，在此刻護住了你。`);
    else card('gold','合約買斷',`你仍在合約中，球團依約買斷剩餘 <b class="hl">${remain} 年</b>合約——雙方談定以 <b class="hl">七成</b> 價碼結清，<b class="hl">${fmtMoney(total)}</b> 一次入帳。合約精神，該給的一毛不少。`); }
  S.ct={yrs:1,mult:S.ct.mult}; /* 給付後合約結清 */
  return total;
}
/* 引退時若沒回中職,補一場大巨蛋開球告別 */
function daibaFarewell(cont){
  if(S.stage==='PRO'&&S.org!=='CPBL'&&!S._daiba){ S._daiba=true;
    card('gold','最後一球',`雖然沒能回到主場獻技，你還是接受了邀請，回到 <b class="hl">臺北大巨蛋</b> 當一日中職球員。開球儀式上，四萬人的注視下，你投出了生涯的最後一球——不為勝負，只為那個曾經在紅土上作夢的自己。`);
  }
  cont();
}
function handleDemotion(o,path,idx){
  if((S.lv==='CPBL1'||S.lv==='NPB1'||S.lv==='MLB')&&(S.lastD||0)<=-6&&!S.traits.yips&&S.seasonFactor>=0.5){
    traitCard('yips','失憶症',`生理上明明沒受傷，但站上場的瞬間，腦海全是上個賽季被痛宰的畫面——<b class="dn">系統評價暫時 −3，直到再次升級或奪得年度獎項才能解除</b>。`,'bad'); }
  const doDemote=()=>{
    /* 找同組織中符合的層級 */
    let t=-1; for(let i=idx-1;i>=0;i--){ if(o>=LV[path[i]].min){t=i;break;} }
    if(t>=0){
      /* 旅外體系下放時,亞洲球團同步遞約 */
      const alts=[];
      if(S.org==='MiLB'){
        if(o>=LV.NPB1.min&&chance(Math.round(60*ageGateJP())))alts.push({t:'跳槽日職一軍',s:'旅日合約',f:()=>{buyoutRemaining();signTo('NPB','NPB1');advance();}});
        else if(o>=LV.NPB2.min&&chance(50))alts.push({t:'轉戰日職二軍（支配下）',f:()=>{buyoutRemaining();signTo('NPB','NPB2');advance();}});
        if(o>=LV.CPBL1.min)alts.push({t:'返台加盟中職一軍',s:'落葉歸根',f:()=>{buyoutRemaining();signTo('CPBL','CPBL1');advance();}});
      }else if(S.org==='NPB'&&o>=LV.CPBL1.min&&chance(70)){
        alts.push({t:'返台加盟中職一軍',f:()=>{buyoutRemaining();signTo('CPBL','CPBL1');advance();}});
      }
      if(alts.length){
        card('bad','降級通知',`成績未達標，球團打算將你下放 <b class="dn">${LV[path[t]].n}</b>——但消息一出，其他聯盟的邀請也到了。`);
        choose('接受下放，還是換個舞台？',[
          {t:'接受下放 '+LV[path[t]].n,main:true,f:()=>{S.lv=path[t];board(2);advance();}},...alts]);
      }else{ S.lv=path[t]; card('bad','降級通知',`成績未達標，被下放至 <b class="dn">${LV[path[t]].n}</b>。`); board(2); advance(); }
    }
    else outOfOrg(o);
  };
  const longContract = S.ct && S.ct.yrs>1 && LV[S.lv].top;
  if(longContract){
    choose('球團約談：成績未達當前層級要求，打算將你下放',[
      {t:'接受下放，繼續奮鬥',main:true,f:doDemote},
      {t:'行使長約條款，拒絕下放',warn:true,s:'觸發更衣室毒瘤；隔年成績打回身價才能洗刷，否則更慘',f:()=>{
        S.demotionRefused=true;
        if(!S.traits.cancer&&!S.traits.franchise&&!S.traits.intlace){ S.traits.cancer=true;
          card('bad','隱藏屬性解鎖：更衣室毒瘤','你搬出合約條款拒絕下放。教練搖頭，隊友私下議論——你保住了位置，卻失去了更衣室。'); }
        else card('info','拒絕下放','你搬出合約條款留在一軍。球團記住了這件事。');
        board(1); advance(); }},
      {t:'就此引退',warn:true,s:'以現役身分光榮退場',f:()=>{buyoutRemaining();daibaFarewell(()=>endGame('不願下放，'+S.year+' 年宣布引退。'));}}]);
  } else if(S.age>=33){
    choose('球團約談：成績未達當前層級的最低要求',[
      {t:'接受下放，繼續奮鬥',f:doDemote},
      {t:'選擇引退',warn:true,s:'以現役身分光榮退場',f:()=>{buyoutRemaining();daibaFarewell(()=>endGame('不願下放低階聯盟，'+S.year+' 年宣布引退。'));}}]);
  } else doDemote();
}
function outOfOrg(o){
  /* 遭原聯盟釋出，尋找重疊層級合約 */
  const offers=[];
  if(S.org!=='NPB'&&o>=44)offers.push({t:'日職二軍（支配下）合約',f:()=>{buyoutRemaining(1);signTo('NPB','NPB2');}});
  if(S.org!=='CPBL'){ if(o>=41)offers.push({t:'中職一軍合約',f:()=>{buyoutRemaining(1);signTo('CPBL','CPBL1');}});
    else if(o>=30)offers.push({t:'中職二軍合約',f:()=>{buyoutRemaining(1);signTo('CPBL','CPBL2');}}); }
  if(!offers.length){ buyoutRemaining(1); daibaFarewell(()=>endGame('遭球團釋出且無人問津，'+S.year+' 年黯然引退。')); return; }
  card('bad','戰力外通告',`未達 ${S.org==='NPB'?'日職':'原聯盟'}留用門檻，遭到釋出。所幸還有球隊捎來邀請——`);
  if(S.age>=33){ offers.push({t:'就此引退',warn:true,f:()=>{buyoutRemaining(1);daibaFarewell(()=>endGame('收到戰力外通告後，'+S.year+' 年選擇引退。'));}}); }
  choose('新東家的邀請',offers.map(x=>({...x,f:()=>{x.f();advance();}})));
}
function teamListOf(org){ return org==='CPBL'?cpblTeamsForYear(S?S.year:1990):org==='NPB'?NPB_TEAMS:MLB_TEAMS; }
function signTo(org,lv,team,yrs,mult){
  S.org=org; S.lv=lv;
  /* 【修正】先決定新球隊是誰，比對不一樣才把年資歸零，最後再蓋掉 S.orgTeam */
  const newTeam = team || pick(teamListOf(org));
  if(newTeam !== S.orgTeam){ S.teamYears=0; S.champThisTeam=false; S.champTeam=null; tlNote(2,'加盟 '+newTeam); }
  S.orgTeam = newTeam;
  S.ct={yrs:yrs||2,mult:mult||1};
  if(org!=='NPB')S.npbYears=0;
  card('info','簽約',`與 <b class="hl">${S.teamName()}</b> 簽下 <b class="hl">${S.ct.yrs} 年</b>合約${S.ct.mult!==1?`（年薪係數 ×${S.ct.mult.toFixed(2)}）`:''}。`); board(2);
}
/* 多隊報價選擇:opts=[{team,bonus,yrs,mult,lv}] */
function pickOfferUI(title,org,offers,after){
  choose(title,offers.map(of=>({
    t:of.team+(of.lv?`（${LV[of.lv].n}）`:''),
    s:`簽約金 ${fmtMoney(of.bonus)}｜${of.yrs} 年約${of.mult&&of.mult!==1?`｜年薪係數 ×${of.mult.toFixed(2)}`:''}`,
    f:()=>{ S.salary+=of.bonus;
      signTo(org,of.lv||S.lv,of.team,of.yrs,of.mult||1);
      card('gold','簽約金',`入袋 <b class="hl">${fmtMoney(of.bonus)}</b>。`); after(); }
  })));
}
function makeOffers(org,n,bonusBase,yrsLo,yrsHi,lv,exclude){
  const list=teamListOf(org).filter(t=>t!==exclude);
  const teams=[]; const pool=list.slice();
  for(let i=0;i<n&&pool.length;i++)teams.push(pool.splice(Math.floor(R()*pool.length),1)[0]);
  return teams.map(t=>({team:t,bonus:Math.round(bonusBase*(0.8+R()*0.5)),yrs:ri(yrsLo,yrsHi),lv,mult:1}));
}
/* ---------- 長約/短約 選擇器 ---------- */
function termParams(d,lv){ /* 長約 >2 年、短約 1-2 年;年齡大或成績爛 → 不夠格長約 */
  const cap=S.pos==='P'?7:15;
  const maxY=faYears(d,cap);              /* 已含年齡上限 */
  const longEligible = maxY>2 && d>=0;    /* 值得長約:年限>2 且成績不差(d>=0) */
  const longY=Math.max(3,maxY);           /* 長約至少 3 年 */
  const shortY=Math.min(2,Math.max(1,maxY)); /* 短約 1-2 年 */
  let baseM=d>=3?1.2:d>=0?1:0.8;
  if(S.traits.franchise)baseM=Math.max(baseM,1.2);
  if(S.tradeRefuse>0)baseM*=0.85;
  return {longEligible,longY,shortY,longM:+(baseM*0.92).toFixed(2),shortM:+(baseM*1.12).toFixed(2)};
}
function termChoice(o,d,baseTitle,onPick,onReject){
  const tp=termParams(d,S.lv);
  const est=(y,m)=>fmtMoney(Math.round(salaryFor(S.lv,d)*m));
  const opts=[];
  if(tp.longEligible){ /* 夠格才給長約選項 */
    opts.push({t:`長約（${tp.longY} 年）`,main:true,s:`年限長、年薪係數略低 ×${tp.longM}（估 ${est(tp.longY,tp.longM)}/年）｜穩定保障`,
      f:()=>onPick(tp.longY,tp.longM)});
    opts.push({t:`短約（${tp.shortY} 年）`,warn:true,s:`年限短、年薪係數高 ×${tp.shortM}（估 ${est(tp.shortY,tp.shortM)}/年）｜賭下次身價`,
      f:()=>onPick(tp.shortY,tp.shortM)});
  } else { /* 年齡大或成績不佳:只能短約(不出現長約) */
    opts.push({t:`短約（${tp.shortY} 年）`,main:true,s:`年限短、年薪係數 ×${tp.shortM}（估 ${est(tp.shortY,tp.shortM)}/年）｜以你目前的年齡與成績，球團只願提供短約`,
      f:()=>onPick(tp.shortY,tp.shortM)});
  }
  if(onReject)opts.push({t:'拒絕，維持現狀',s:'不接受這份合約',f:onReject});
  choose(baseTitle,opts);
}
/* 母隊延長續約:提前綁約 */
function extensionOffer(o){
  const d=S.lastD||0;
  termChoice(o,d,`母隊提前延長續約 · ${S.teamName()}（合約剩 1 年）`,(y,m)=>{
    S.ct={yrs:S.ct.yrs+y,mult:m,extOffered:true};
    card('gold','延長續約',`與 <b class="hl">${S.teamName()}</b> 達成延長協議，追加 <b class="hl">${y} 年</b>（年薪係數 ×${m.toFixed(2)}）。`); board(1);
    crossOffers(o);
  }, ()=>{ /* 拒絕延長:維持原合約繼續跑 */
    card('info','婉拒延長',`你婉拒了母隊的提前延長，選擇打完現有合約再說。`);
    crossOffers(o);
  });
}
/* ---------- FA 自由球員 ---------- */
function faFlow(o){
  const d=S.lastD||0;
  const cap=S.pos==='P'?7:15; /* 投手上限7、野手上限15 */
  let stayY=faYears(d,cap);
  let stayM=d>=3?1.2:d>=0?1:0.8;
  const injHist=(S.bigInj||0)+(S.tjCount||0);
  if(injHist>=2&&stayY<=3)stayM+=0.15; /* 傷病史多但短約:補高薪 */
  if(S.traits.franchise)stayM=Math.max(stayM,1.2); /* 神主牌 */
  if(S.tradeRefuse>0)stayM*=0.85; /* 否決交易:下約 -15%(成本已降) */
  if(S.traits.cancer){ stayM=Math.min(stayM,0.95); /* 毒瘤:續約惡化 */
    if(!S.traits.franchise&&chance(45)){
      card('bad','球團冷處理','母球團明確表示無意續約——你的新聞比你的成績更出名。');
      faMarket(o,d); return; } }
  const faOpts=[
    {t:`與 ${S.teamName()} 續約`,main:true,s:'接著選擇長約或短約',
     f:()=>termChoice(o,d,`與 ${S.teamName()} 續約 · 選擇合約類型`,(y,m)=>{
       S.ct={yrs:y,mult:m,extOffered:false};
       card('info','續約',`與 <b class="hl">${S.teamName()}</b> 完成 <b class="hl">${y} 年</b>續約（年薪係數 ×${m.toFixed(2)}）。`); advance(); })},
    {t:'跳出合約，測試自由市場',warn:true,s:'成績不佳可能乏人問津，只能回原隊減薪',f:()=>faMarket(o,d)}];
  /* 5a 旅外球員合約到期:多一個返台加盟中職的選項(落葉歸根) */
  if(S.org!=='CPBL'&&o>=LV.CPBL1.min){
    faOpts.push({t:'返台加盟中職一軍',s:'落葉歸根，回到熟悉的主場',
      f:()=>{ signTo('CPBL','CPBL1'); card('good','返鄉',`結束海外的挑戰，你選擇回到 <b class="hl">${S.teamName()}</b>，在家鄉球迷面前繼續揮灑。`); advance(); }});
  }
  choose(`合約到期 · 取得自由球員（FA）資格（球隊奪冠率 ${teamChampRate(S.orgTeam)}%）`,faOpts);
}
function faMarket(o,d){
  const org=S.org, lv=S.lv, offers=[];
  let n=d>=3?ri(2,4):d>=1?ri(1,3):d>=-1?(chance(60)?ri(1,2):0):(chance(30)?1:0);
  if(S.traits.cancer)n=Math.max(0,n-1); /* 毒瘤:報價變少 */
  const cap=S.pos==='P'?7:15;
  makeOffers(org,n,({CPBL1:200,NPB1:800,MLB:2000})[lv]||100,1,cap,lv,S.orgTeam)
    .forEach(of=>{of.yrs=faYears(d,cap); of.mult=+(1+Math.max(0,d)*0.05+R()*0.12).toFixed(2);
      if(((S.bigInj||0)+(S.tjCount||0))>=2&&of.yrs<=3)of.mult+=0.15; offers.push({...of,org});});
  if(lv==='CPBL1'&&o>=53)makeOffers('NPB',1,1000,2,3,o>=51?'NPB1':'NPB2',null)
    .forEach(of=>offers.push({...of,org:'NPB',mult:1}));
  if(usPathOpen()&&lv==='NPB1'&&o>=60){
    /* 滿 7 年 → 海外 FA(免入札,直接跳美);未滿則走入札(有年齡把關) */
    const freeAgent=(S.npbYears||0)>=7;
    if(freeAgent || chance(Math.round(50*ageGateUSA(o,60)))){
      makeOffers('MiLB', freeAgent?ri(1,2):1, 3000, 3,5,'MLB',null)
        .forEach(of=>offers.push({...of,org:'MiLB',mult:1,posting:!freeAgent})); /* posting=true 表示走入札 */
    }
  }
  if(!offers.length){
    card('bad','自由市場',`電話一直沒有響。經紀人聳聳肩——市場對你的評價比想像中冷。`);
    choose('沒有球隊開價',[
      {t:`回 ${S.teamName()} 減薪簽約`,main:true,s:'1 年｜年薪係數 ×0.70',
       f:()=>{ S.ct={yrs:1,mult:0.7}; card('bad','減薪合約',`低著頭回到 <b class="hl">${S.teamName()}</b>，年薪打七折。`); advance(); }},
      {t:'就此引退',warn:true,f:()=>endGame('FA 市場乏人問津，'+S.year+' 年黯然引退。')}]);
    return;
  }
  const est=of=>fmtMoney(Math.round(salaryFor(of.lv,d)*(of.mult||1)));
  const estL=(of)=>{ const tp=termParams(d,of.lv); return tp.longEligible?`長 ${tp.longY}年×${(tp.longM*(of.mult||1)).toFixed(2)} / 短 ${tp.shortY}年×${(tp.shortM*(of.mult||1)).toFixed(2)}`:`僅短約 ${tp.shortY}年×${(tp.shortM*(of.mult||1)).toFixed(2)}`; };
  const cty=og=>({CPBL:'🇹🇼 台灣',NPB:'🇯🇵 日本',MiLB:'🇺🇸 美國',MLB:'🇺🇸 美國'})[og]||'';
  const ctyOrder={CPBL:0,NPB:1,MiLB:2,MLB:2};
  offers.sort((a,b)=>(ctyOrder[a.org]??9)-(ctyOrder[b.org]??9)); /* 依國家排序:台→日→美 */
  choose('自由市場報價一覽（依國家分列 · 每隊列出 長約 / 短約 方案）',[...offers.map(of=>({
    t:`${cty(of.org)}｜${of.team}（${LV[of.lv].n}）`,
    s:`簽約金 ${fmtMoney(of.bonus)}｜奪冠率 ${teamChampRate(of.team)}%｜長/短：${estL(of)}${of.posting?'｜入札':''}`,
    f:()=>{ S.salary+=of.bonus; const savedLv=S.lv; S.lv=of.lv;
      termChoice(o,d,`${of.team} · 選擇合約類型`,(y,m)=>{ S.lv=savedLv;
        signTo(of.org,of.lv,of.team,y,+(m*(of.mult||1)).toFixed(2)); advance(); },
        ()=>{ S.lv=savedLv; S.salary-=of.bonus; faMarket(o,d); }); }})),
    {t:`回原隊（${S.teamName()}）1 年約`,s:'年薪係數 ×0.90',
     f:()=>{ S.ct={yrs:1,mult:0.9}; card('info','回歸',`重回 <b class="hl">${S.teamName()}</b>。`); advance(); }}]);
}
function ageGateUSA(o,minReq){ /* 旅美/日職跳大聯盟:年齡越大越難,28 歲後幾乎關窗 */
  const age=S.age;
  if(age<=22)return 1.0;
  if(age<=24)return 0.75;
  if(age<=26)return 0.5;
  if(age<=27)return 0.3;
  if(age<=28)return 0.15;
  /* 28 歲以後:只有能力遠超門檻(+5)的怪物即戰力還有微弱機會 */
  return o>=minReq+5 ? 0.08 : 0;
}
function ageGateJP(){ /* 旅日:窗口寬,31 歲(衰退前)都還有機會 */
  const age=S.age;
  if(age<=26)return 1.0;
  if(age<=28)return 0.7;
  if(age<=30)return 0.45;
  if(age<=31)return 0.25;
  return 0; /* 32 歲起(進入衰退)關窗 */
}
function crossOffers(o){
  const fin=()=>advance();
  if(S.lv==='CPBL1'&&o>=53&&(S.lastD||0)>=1&&chance(Math.round(35*ageGateJP()))){
    const jl=o>=51?'NPB1':'NPB2';
    const bids=makeOffers('NPB',2,1200,2,3,jl,null);
    choose('日職球團開出旅外合約',[...bids.map(of=>({
      t:of.team+`（${LV[jl].n}）`,s:`簽約金 ${fmtMoney(of.bonus)}｜${of.yrs} 年約`,
      f:()=>{S.salary+=of.bonus;signTo('NPB',jl,of.team,of.yrs,1);fin();}})),
      {t:'留在中職',main:true,f:fin}]); return; }
  if(usPathOpen()&&S.lv==='CPBL1'&&o>=57&&(S.lastD||0)>=2&&chance(Math.round(30*ageGateUSA(o,57)))){
    const ml=o>=60?'MLB':'A3';
    const bids=makeOffers('MiLB',2,2000,2,4,ml,null);
    choose('大聯盟球探遞出合約',[...bids.map(of=>({
      t:of.team+`（${LV[ml].n}）`,s:`簽約金 ${fmtMoney(of.bonus)}｜${of.yrs} 年約`,
      f:()=>{S.salary+=of.bonus;signTo('MiLB',ml,of.team,of.yrs,1);fin();}})),
      {t:'留在中職',main:true,f:fin}]); return; }
  if(usPathOpen()&&S.lv==='NPB1'&&o>=60&&(S.lastD||0)>=2&&chance(Math.round(30*ageGateUSA(o,60)))){
    const bids=makeOffers('MiLB',ri(2,3),Math.round(3000+(S.lastD||0)*800),3,6,'MLB',null);
    choose('入札制度：大聯盟多隊競標你的合約',[...bids.map(of=>({
      t:of.team,s:`入札總額 ${fmtMoney(of.bonus*4)}｜簽約金 ${fmtMoney(of.bonus)}｜${of.yrs} 年約`,
      f:()=>{ S.salary+=of.bonus; signTo('MiLB','MLB',of.team,of.yrs,1); fin(); }})),
      {t:'留在日職',main:true,f:fin}]); return; }
  fin();
}
/* ---------- 選秀與生涯路口 ---------- */
function runDraft(fromSchool,cb){
  const o=ovr(); const score=o+Math.max(0,22-S.age)*2+ri(-4,4);
  const rd=score>=56?1:score>=49?2:score>=43?ri(3,4):score>=37?ri(5,7):score>=30?ri(8,10):0;
  if(rd===0){
    card('bad','選秀落榜',`唱名一輪又一輪，始終沒有你的名字。（綜合 ${o}｜年齡加權後評價 ${score}）`);
    if(fromSchool){ card('info','','回到校隊，明年再來。'); cb(); }
    else cb('fail');
    return;
  }
  const bonus=[0,1000,600,350,350,150,150,150,50,50,50][rd]||50;
  const lv=(rd===1&&o>=50)?'CPBL1':'CPBL2';
  const team=pick(cpblTeamsForYear(S.year===1999?2000:S.year));
  const accept=()=>{
    S.stage='PRO'; S.team=''; S.salary+=bonus; S.svc=0; S.faElig=false;
    signTo('CPBL',lv,team,ri(2,3),1); /* 菜鳥分段短約(2~3年) */
    card('gold','中華職棒選秀會',`第 <b class="hl">${rd}</b> 輪獲 <b class="hl">${team}</b> 指名！簽約金依順位為 <b class="hl">${fmtMoney(bonus)}</b>。${lv==='CPBL1'?'即戰力評價，直接放入一軍名單。':'先從二軍出發。'}`);
    tlNote(4,'選秀第'+rd+'輪');
    board(0); cb();
  };
  /* 輪次不滿意(第 3 輪以後)可選擇重返業餘再拚一年;年齡太大(24+)則不給這選項,避免拖太久 */
  if(rd>=3 && S.age<24){
    choose(`中華職棒選秀會 · 第 ${rd} 輪獲 ${team} 指名`,[
      {t:'接受指名，加盟球隊',main:true,s:`簽約金 ${fmtMoney(bonus)}｜${lv==='CPBL1'?'一軍':'二軍'}出發`,f:accept},
      {t: (S.stage==='HS'||(S.stage==='U'&&S.stageYr<4))?'重返校園，再拚一年':'重返業餘，再拚一年',warn:true,s:'放棄本次指名，明年重新參加選秀',f:()=>{
        const goUni = (S.stage==='HS')||(S.stage==='U'&&S.stageYr<4);
        const fresh = (S.stage==='HS');
        card('info', goUni?'重返校園':'重返業餘', `看到被選到的輪次，雙眼發黑，原本以為會在前段輪次被選中，卻落到了後段的輪次。你握緊了拳頭，決定${goUni?(fresh?'進入大學繼續深造':'留在校隊繼續磨練'):'重返業餘'}，這一次，你一定要上台戴上所屬球隊的帽子。`);
        if(fresh){ S.stage='U'; S.stageYr=0; S.team=pick(['文化大學','輔仁大學','國立體大','台灣體大','開南大學']); }
        else if(!goUni){ S.stage='AMA'; S.team=pick(['合電','台庫','安妞先物','美麗珊瑚']); }
        if(fromSchool) cb(); else advance();
      }}]);
    return;
  }
  accept();
}
function pathChoiceHS(){
  const o=ovr();
  const opts=[{t:'就讀大學（延長養成）',s:'一年僅 2 場大賽加點｜大二起每年可投入選秀',f:()=>{
      S.stage='U'; S.stageYr=0; S.team=pick(['文化大學','輔仁大學','國立體大','台灣體大','開南大學']);
      card('info','升學',`進入 <b class="hl">${S.team}</b> 棒球隊。`); advance(); }},
    {t:'投入中華職棒選秀',s:'目前綜合 '+o,f:()=>runDraft(false,r=>{
      if(r==='fail')choose('落榜之後',[
        {t:'改就讀大學',main:true,f:()=>{S.stage='U';S.stageYr=0;S.team=pick(['文化大學','輔仁大學','國立體大','台灣體大']);advance();}},
        {t:'加入業餘成棒隊',f:()=>{S.stage='AMA';S.team=pick(['合電','台庫','安妞先物','美麗珊瑚']);advance();}}]);
      else advance(); })}];
  if(o>=44)opts.push({t:'洽談旅日合約',s:'從日職二軍（支配下）出發｜滿 8 年視同本土',f:()=>{
    S.stage='PRO';
    pickOfferUI('日職球團的育成報價','NPB',makeOffers('NPB',ri(2,3),800,3,3,'NPB2',null),()=>{
      card('gold','旅日','目標：一軍初登場。'); advance(); }); }});
  if(usPathOpen()&&o>=50)opts.push({t:'洽談旅美合約',main:true,s:`從${o>=54?' 1A ':'新人聯盟'}出發，逐級挑戰大聯盟`,f:()=>{
    S.stage='PRO';
    pickOfferUI('大聯盟球團的國際簽約報價','MiLB',makeOffers('MiLB',ri(2,3),1500,3,4,o>=54?'A1':'R',null),()=>{
      card('gold','旅美','美國的紅土，等著你去征服。'); advance(); }); }});
  choose(`高中畢業 · 綜合能力 ${o} · 人生的第一個路口`,opts);
}
function pathChoiceU4(){
  const o=ovr();
  const opts=[{t:'投入中華職棒選秀',main:true,s:'綜合 '+o+'｜大學畢業年齡加權下降',f:()=>runDraft(false,r=>{
    if(r==='fail')choose('落榜之後',[
      {t:'加入業餘成棒隊',f:()=>{S.stage='AMA';S.team=pick(['合電','台庫','安妞先物']);advance();}},
      {t:'高掛球鞋',warn:true,f:()=>endGame('大學畢業選秀落榜，決定告別球場。')}]);
    else advance(); })}];

  /* 大四畢業 (約22歲)，套用最大年齡懲罰 (Senior Sign) */
  const agePenalty = Math.max(0, S.age - 18);
  const reqNPB = 44 + Math.floor(agePenalty / 2);
  const reqMiLB = 50 + Math.floor(agePenalty / 2);
  const bonusNPB = Math.max(100, 800 - agePenalty * 180);
  const bonusMiLB = Math.max(150, 1500 - agePenalty * 350);
  if(o>=reqNPB)opts.push({t:'洽談旅日合約',s:'大齡新秀，簽約行情極低',f:()=>{S.stage='PRO';
    pickOfferUI('日職球團報價','NPB',makeOffers('NPB',2,bonusNPB,2,3,'NPB2',null),advance);}});
  if(usPathOpen()&&o>=reqMiLB)opts.push({t:'洽談旅美合約',s:'大齡底薪簽約 (Senior Sign)',f:()=>{S.stage='PRO';
    pickOfferUI('大聯盟球團報價','MiLB',makeOffers('MiLB',2,bonusMiLB,3,4,o>=55?'A1':'R',null),advance);}});
  choose(`大學畢業 · 綜合能力 ${o}`,opts);
}
if(typeof document!=='undefined'&&document.getElementById('btn-menu')){
  document.getElementById('btn-menu').onclick=menuModal;
}
function advance(){
  S.age++; S.year++; S.stageYr++; startYear();
}
/* ================= 生涯終章 ================= */
const TIER_TH={CPBL:[12000,7000,4300,2100],NPB:[8500,6200,3000,1900],MLB:[7500,6200,3500,1900]}; /* M2:五帶金字塔校準(擬真玩家尺)——成功稀有化、浮沉為大宗、失敗有感 */
const LG_N={CPBL:'中職',NPB:'日職',MLB:'大聯盟',MINOR:'小聯盟／二軍'};
function careerScore(st){
  if(S.pos==='P')return st.W*13+st.SV*6+st.SO*0.9+st.IP*0.35;
  return st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3+Math.max(0,st.DEF||0)*6;
}
function roleName3(r){ return {SP:'先發投手',MR:'中繼投手',CL:'終結者'}[r]||'投手'; }
function primaryPos(){ /* 生涯主守位:過半→該位;無過半→工具人/搖擺人(年數降序) */
  if(S.pos==='P'){
    const ry=S.roleYears||{}; const tot=Object.values(ry).reduce((a,b)=>a+b,0);
    if(!tot)return roleName3(S.role);
    const es=Object.entries(ry).sort((a,b)=>b[1]-a[1]);
    if(es[0][1]>=tot/2)return roleName3(es[0][0]); /* 有過半 */
    /* 無過半:搖擺人(附主要兩種定位) */
    const list=es.map(e=>({SP:'先發',MR:'中繼',CL:'終結者'}[e[0]]||'')).filter(Boolean);
    return '搖擺人('+list.slice(0,2).join('、')+')';
  }
  const dy=S.dposYears||{}; const total=Object.values(dy).reduce((a,b)=>a+b,0);
  if(!total)return S.dpos?DPN[S.dpos]:POSN[S.pos];
  const entries=Object.entries(dy).sort((a,b)=>b[1]-a[1]);
  if(entries[0][1]>=total/2)return DPN[entries[0][0]]||entries[0][0]; /* 有過半 */
  const noDH=entries.filter(e=>e[0]!=='DH'&&e[0]!=='—').map(e=>DPN[e[0]]||e[0]);
  if(!noDH.length)return DPN['DH'];
  return '工具人('+noDH.join('、')+')';
}
function capTeam(bucket){ /* 該聯盟效力最久的球隊,作為名人堂帽徽 */
  const tb=(S.teamTally&&S.teamTally[bucket])||{}; let best=null,bn=-1;
  for(const k in tb)if(tb[k]>bn){bn=tb[k];best=k;}
  return best;
}
function defShare(bucket){ /* 守備貢獻占生涯總價值比重 0~1 */
  const st=S.stats[bucket]; if(!st||S.pos==='P')return 0;
  const off=st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3;
  const def=Math.max(0,st.DEF||0)*6;
  return (off+def)>0?def/(off+def):0;
}
function posLegendPhrase(bucket){ /* 依守備占比與獎項決定守位敘述 */
  const share=defShare(bucket), st=S.stats[bucket];
  const dp=S.dpos||(S.pos==='C'?'C':null);
  const hasGlove=S.honors.some(h=>h.includes('金手套')||h.includes('守備王'));
  if(S.pos==='P'||!dp||dp==='DH')return '';
  const posN=DPN[dp]||'';
  if(share>=0.34||(hasGlove&&share>=0.22))return `，以${{SS:'史上最偉大的游擊手之一',CF:'守備範圍撼動聯盟的中外野手',C:'蹲捕藝術的化身',_:'守備傳奇'}[dp]||('頂尖'+posN)}之姿`;
  if(hasGlove&&share>=0.12)return `，一位攻守俱佳的${posN}`;
  return '';
}
function honorScore(bucket){
  const lg={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];
  const champ={CPBL:'中職總冠軍',NPB:'日本一',MLB:'世界大賽冠軍'}[bucket];
  const ace='年度最佳投手';
  let sc=0,mvp=0,aceN=0,king=0;
  S.honors.forEach(h=>{
    if(h.includes(champ)){sc+=90;return;}
    if(h.includes(ace)){sc+=460;aceN++;return;}
    if(!h.includes(lg))return;
    if(h.includes('年度MVP')){sc+=420;mvp++;}
    else if(h.includes('新人王'))sc+=140;
    else if(h.includes('金手套')){sc+=300;king++;}
    else if(h.includes('守備王')){sc+=220;king++;}
    else if(h.includes('王')){sc+=160;king++;}
    else if(h.includes('明星賽'))sc+=(S.pos==='P'?70:40);
  });
  sc+=achievementScore(bucket);
  if(S.traits.franchise)sc+=200; /* 神主牌:忠誠加成 */
  return {sc,mvp,aceN,king};
}
function tierOf(bucket){
  const st=S.stats[bucket]; if(!st)return null;
  const hs=honorScore(bucket);
  const sc=careerScore(st)+hs.sc,th=TIER_TH[bucket];
  let i=sc>=th[0]?0:sc>=th[1]?1:sc>=th[2]?2:sc>=th[3]?3:4;
  /* 獎項保底:MVP/最高投手獎至少明星球員;單項王至少每日球員 */
  if(hs.mvp||hs.aceN)i=Math.min(i,1);
  else if(hs.king)i=Math.min(i,2);
  return {i,sc:Math.round(sc),name:LG_N[bucket]+['名人堂','明星球員','每日球員','邊緣球員','一頁過客'][i]};
}
function statTable(bucket){
  const st=S.stats[bucket]; if(!st)return '';
  let rows;
  if(S.pos==='P'){
    const era=st.IP>0?(st.ER*9/st.IP).toFixed(2):'-';
    const whip=st.IP>0?((st.H+st.BB)/st.IP).toFixed(2):'-';
    rows=`<tr><th>Yrs</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${fmtIP(st.IP)}</td><td>${st.W}</td><td>${st.L}</td><td>${st.SV||0}</td><td>${st.HLD||0}</td><td>${st.SO}</td><td>${st.BB||0}</td><td>${era}</td><td>${whip}</td></tr>`;
  }else{
    const obpN = st.PA>0 ? (st.H+st.BB)/st.PA : 0;
    const slgN = slgOf(st);
    const avg = st.AB>0 ? (st.H/st.AB).toFixed(3).replace(/^0/,'') : '-';
    const obp = st.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
    const slg = st.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
    const ops = st.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
    rows=`<tr><th>Yrs</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>SB</th><th>DEF</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${st.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${st.H}</td><td>${st.HR}</td><td>${st.RBI}</td><td>${st.SB}</td><td>${st.DEF>0?'+':''}${st.DEF||0}</td></tr>`;
  }
  const asN=st.AS||0;
  return `<p style="margin-top:8px"><b>${LG_N[bucket]}</b>${asN?` · 明星賽 ${asN} 度入選`:''}</p><table class="fin">${rows}</table>`;
}
const FAN={
 0:['{n}退休了……我的青春也跟著結束了 QQ','以後帶小孩進場，我會指著引退背號說：爸爸看過{n}打球。','外電已經在算名人堂得票率了，根本沒有懸念','謝謝你把台灣棒球帶到世界的舞台上','這種等級的選手，一個世代只會出現一個','引退試合門票秒殺，黃牛價已經翻五倍了'],
 1:['{n}確定引退，推文區已經滿滿的 QQ','明星賽常客就這樣說再見了，唉','生涯數據攤開來還是很漂亮，值得一面背號布幕','謝謝你每一次的全力奔跑，辛苦了','小時候牆上貼的海報就是他，時代的眼淚'],
 2:['稱不上超級巨星，但每天打開轉播都看得到他，這樣就夠了','默默扛了這麼多年，辛苦了','這種工兵型選手才是一支球隊真正的骨幹','數據不會說謊，穩定就是他最大的天賦'],
 3:['板凳暖了這麼多年，也是一種浪漫啦','至少他真的站上過職棒舞台，比鍵盤上的我們都強','代打人生，謝謝那幾支關鍵安打','二軍發電機引退，只有鐵粉會記得，但我們記得'],
 4:['欸這誰？……查了一下，原來真的打過職業喔','棒球真的好難，祝福第二人生順利','又一個被現實打敗的追夢人，唏噓','看板留言只有三則，其中一則還是他本人回的'],
};
function retireScene(tiers){
  /* tiers: {CPBL:{i,sc},NPB:...,MLB:...} 有出賽才有 */
  /* 生涯代表聯盟＝出賽最久的頂級聯盟;分級取生涯最佳(i 最小) */
  let lg=bucketOf(S.lv), bestI=4;
  const order=['MLB','NPB','CPBL'];
  order.forEach(b=>{ if(tiers[b]&&tiers[b].i<bestI){ bestI=tiers[b].i; } });
  /* 代表聯盟:在最佳分級的聯盟中,取出賽年資最多者 */
  let repYr=-1;
  order.forEach(b=>{ if(tiers[b]&&tiers[b].i===bestI){ const yy=S.stats[b]?S.stats[b].yr:0; if(yy>repYr){repYr=yy;lg=b;} } });
  const t=tiers[lg], i=t?t.i:4, yr=S.year;
  let txt='';
  if(lg==='CPBL'){
    if(i===0)txt=`引退戰選在<b class="hl">臺北大巨蛋</b>。四萬人把巨蛋塞得水洩不通，外野看板掛滿你生涯每一年的照片。九局下最後一個打席結束，全場燈光暗下，只剩一道追光打在你身上——隊友哭成一團，對手全員列隊脫帽，天團在二壘後方唱起你的應援曲改編的慢版。你繞場一周，把手套輕輕放在本壘板上。轉播單位說，這是中職史上收視最高的一場例行賽。`;
    else if(i===1)txt=`球團為你舉辦了引退儀式。主場滿場，大螢幕播放生涯回顧影片，從高中甲子園夢碎到${S.pos==='P'?'職棒初登板':'職棒初安打'}，一幕一幕。老隊友從各地回來替你獻花，總教練在致詞時哽咽到說不下去。最後你脫下球帽向四個方向的看板深深鞠躬，應援團的鼓聲直到你走進休息室都沒有停。`;
    else if(i===2)txt=`${S.pos==='P'?'球季最後一個主場日，球團安排你先發登板。投完第一局後被換下場，全場觀眾起立鼓掌，隊友在休息室門口排成兩排跟你擊掌。沒有煙火，沒有演唱會，但看台上有人拉起手寫布條：「謝謝你投出的每一顆全力的球」。':'球季最後一個主場日，球團安排你先發打第一棒。第一個打席結束後被換下場，全場觀眾起立鼓掌，隊友在休息室門口排成兩排跟你擊掌。沒有煙火，沒有演唱會，但看台上有人拉起手寫布條：「謝謝你的每一次全力奔跑」。'}`;
    else txt=`你在球團官網的一則新聞稿裡宣布引退。發文的那個晚上，還是有幾十個老球迷湧進你的社群留言：「辛苦了」。職業棒球就是這樣——不是每個人都有儀式，但每個認真打過球的人，都有人記得。`;
  }else if(lg==='NPB'){
    if(i<=1)txt=`球團為你安排了<b class="hl">引退試合</b>。最後一個守備半局結束，你被單獨留在場上，兩軍球員沿著邊線列隊。花束贈呈、監督擁抱、隊友把你高高拋起——三次、四次、五次的<b class="hl">胴上げ</b>。你抱著花束繞場一周，看台上的日本球迷舉著用中文寫的「謝謝」毛巾。引退記者會上你說：「能在這裡打球，是我人生最驕傲的事。」隔天所有體育報頭版都是你被拋在空中的那張照片。`;
    else if(i===2)txt=`最終戰賽後，球團在場邊為你舉行了簡短的引退セレモニー：花束、紀念框裱的球衣、與監督的合影。廣播念出你的生涯成績時，客場球迷也起立鼓掌。記者會上有記者用不太標準的中文問你「還會回來嗎」，你笑著點頭。`;
    else txt=`你透過球團發表引退聲明。整理置物櫃的那天，翻譯陪你走完最後一段球員通道，警衛伯伯跟你深深鞠了一躬。異鄉打拚的日子結束了，行李箱裡裝著幾件捨不得丟的練習衫。`;
  }else if(lg==='MLB'){
    if(i<=1)txt=`主場最終戰，你最後一個打席前，全場觀眾起立鼓掌長達三分鐘，主審退到一旁靜靜等待。打席結束，你被換下場，隊友全部走出休息室與你擁抱，大螢幕播放致敬影片——<b class="hl">Curtain Call</b>，你走出休息室向全場揮帽致意兩次。賽後記者會擠滿各國媒體，台灣的轉播單位做了整夜特別節目。`;
    else if(i===2)txt=`球隊在你生涯最後一個系列賽前於場邊舉行了簡單儀式：致贈裱框球衣與紀念浮雕，隊友列隊擊掌。當地報紙寫道：「他不是超級巨星，但他是每個總教練都想要的那種球員。」`;
    else txt=`你在社群媒體上發了一張空蕩球場的照片，配文只有一句英文：「Thank you, baseball.」按讚數在台灣時間的深夜默默破了十萬。`;
  }else{
    txt=`沒有鎂光燈。你把釘鞋擦乾淨放進袋子，跟隊友一一擁抱，走出球場時回頭看了記分板最後一眼。二軍球場的夕陽跟十年前一樣好看。`;
  }
  card('gold','引退之日',txt);
  /* 名人堂票選(可多聯盟並存) */
  const hofs=[]; let firstBallot=false; const hofLeagues=[];
  const HOF_CFG={CPBL:{n:'中華職棒名人堂',wait:5,total:132,lg:'中職'},NPB:{n:'日本野球殿堂',wait:5,total:326,lg:'日職'},MLB:{n:'美國棒球名人堂',wait:5,total:389,lg:'大聯盟'}};
  ['CPBL','NPB','MLB'].forEach(b=>{ const t=tiers[b]; if(!t)return;
    const cfg=HOF_CFG[b];
    if(t.i===0){
      /* 第一年當選門檻:評價分明顯超標(1.15×名人堂門檻)才 first-ballot,否則需等 N 年 */
      const th=TIER_TH[b][0];
      const fbMult={CPBL:1.12,NPB:1.12,MLB:1.2}[b]||1.2; /* 大聯盟最嚴,中職日職放寬 */
      const firstNow = t.sc>=th*fbMult;
      const ballotYr = firstNow?1:ri(2,6);
      if(firstNow){ firstBallot=true; }
      hofLeagues.push(cfg.lg);
      const pct=Math.min(99.1,75+ (t.sc-th)/th*40 + R()*6 - (ballotYr-1)*4);
      const votes=Math.round(cfg.total*Math.max(75,pct)/100);
      if(!S.hofInfo)S.hofInfo=[]; S.hofInfo.push({lg:cfg.lg,yr:ballotYr,pct:Math.max(75,pct).toFixed(1)}); /* 供結算圖 */
      const cap=capTeam(b), phr=posLegendPhrase(b);
      hofs.push(`引退 <b class="hl">${cfg.wait}</b> 年後（${yr+cfg.wait} 年）進入候選，於<b class="hl">第 ${ballotYr} 年投票</b>以 <b class="hl">${votes}</b> 票（得票率 ${Math.max(75,pct).toFixed(1)}%）榮登<b class="hl">${cfg.n}</b>——你以 <b class="hl">${cap||'—'}</b> 的代表球員身分${phr}留名。${ballotYr===1?'<b class="hl">一票入魂，首輪即殿堂。</b>':''}名匾上的隊徽，是 ${cap||'—'}。`);
    }else if(t.i===1){
      const pct=55+R()*17, tries=ri(3,9);
      hofs.push(`你連續 ${tries} 年入圍${cfg.n}票選，最高曾獲得 ${pct.toFixed(1)}% 得票率，可惜始終未能跨過 75% 門檻。`);
    } });
  if(firstBallot&&!S.traits.legend){ S.traits.legend=true;
    S.legendLeague=hofLeagues[0]||''; }
  if(hofs.length)card('gold','名人堂票選',hofs.join('<br><br>'));
  if(S.traits.legend){ card('gold','隱藏屬性解鎖：'+(S.legendLeague||'')+'歷史級球星',
    `第一年投票就披上名人堂金袍——你不只是進了殿堂，你<b class="hl">定義了一個時代</b>。這個名字，會被寫進${S.legendLeague||''}的歷史課本。`); }
}
function endGame(reason){
  S.done=true; actClear();
  divider('生涯終幕');
  card('info','引退',reason);
  tlNote(5,'引退'); careerTimelineCard();
  /* 各聯盟數據與評價 */
  let tables='',evals=[],best=99; const tiersByLg={};
  ['MLB','NPB','CPBL','MINOR'].forEach(b=>{ if(S.stats[b]){ tables+=statTable(b);
    if(b!=='MINOR'){ const t=tierOf(b); tiersByLg[b]=t; evals.push(`<span class="tag">${t.name}</span>（評價分 ${t.sc}）`); best=Math.min(best,t.i); } } });
  if(best===99)best=4;
  retireScene(tiersByLg);
  /* 成就門檻:中職名人堂 或 站上日職/大聯盟 */
  const reachedTop = (tiersByLg.CPBL&&tiersByLg.CPBL.i===0) || !!S.stats.NPB || !!S.stats.MLB;
  if(reachedTop){
    /* 小學校之光:T3 弱旅出身 */
    if(!S.traits.smallschool && S.hsTier===3){ S.traits.smallschool=true;
      card('gold','隱藏特性：小學校之光',`當年那所沒沒無聞的小學校，走出了一個站上頂級舞台的男人。你證明了：出身，從來不是天花板。`); }
    /* 努力仔:初始潛力總和偏低(投手≤237/野手≤469) */
    const grindTh = S.pos==='P'?237:469;
    if(!S.traits.grinder && (S.potSum0||999)<=grindTh){ S.traits.grinder=true;
      card('gold','隱藏特性：努力仔',`天賦平庸的球員千千萬萬，能走到這裡的卻寥寥無幾。你不是天選之人，你是把汗水熬成天賦的那種人。`); }
  }
  /* 25 歲前離開棒球:每個球員都有第二人生的好劇本 */
  if(S.age<25){
    const nm=S.name;
    const second=[
      `你加入了乙組業餘棒球隊。平日上班、週末穿上球衣，去年在協會盃敲出再見安打的影片被瘋傳，底下最熱門的留言是：「這揮棒不像業餘的。」——因為本來就不是。你比誰都清楚，愛棒球不一定要靠它吃飯。`,
      `你考到了不動產營業員執照。帶看時爬六樓透天面不改色，客戶都說你氣場不一樣——十六歲就在幾千人面前投球的人，還會怕開價嗎？三年後你成了店裡的銷售王，名片頭銜下面偷偷印了一行小字：「前職業棒球選手」。`,
      `你跟著舅舅去做板模。工地的日子曬得比春訓還黑，但你的核心力量和不服輸讓老師傅都點頭。五年後你自己出來帶班，薪水不比二軍差，而且——你笑著說——這裡沒有人會把你下放。`,
      `你穿上襯衫走進辦公室，同事只知道你「以前有在打球」。直到公司壘球隊比賽那天，你一棒把球送出圍牆，全場安靜三秒。後來每年比賽，對手公司都會先問一句：「那個人今年還在嗎？」`,
      `你頂下一間早餐店，招牌取名「滿壘」。店裡掛著你高中的球衣，蛋餅煎得跟你的守備一樣扎實。附近的少棒隊員放學都來報到，因為老闆會一邊煎蘿蔔糕一邊講解怎麼看投手的放球點——加蛋不加價。`,
      `你回到母校當教練，月薪不高，但你把自己沒走完的路畫成地圖交給學弟。第七年，你帶的投手在選秀會上被第一輪指名，電視轉播帶到你的時候，你哭得比他還慘。`,
      `你創了業，做棒球訓練科技——用手機慢動作幫素人抓揮棒軌跡。第一年差點倒閉，第三年被運動中心整批採購。募資簡報的第一頁只有一句話：「我沒能站上去的舞台，我想讓更多人站上去。」`,
      `你考上了消防員。體能測驗全項第一，教官問你以前練什麼的，你說棒球。第一次出勤救人那晚，你突然明白：肩膀不能再投一百五，但還能扛著人走出火場——這雙手還是有用的。`];
    card('gold','第二人生',second[Math.floor(R()*second.length)].replace(/{n}/g,nm)+`<br><br><span class="sub">離開球場的人生，也是人生。${nm}，辛苦了。</span>`);
  }
  /* 逐年成績年表 (分為業餘與職業) */
  if(S.log.length){
    const amaLogs = S.log.filter(r => !r.st);
    const proLogs = S.log.filter(r => r.st);
    if(amaLogs.length > 0){
      const amaRows = amaLogs.map(r=>`<tr><td style="white-space:nowrap">${r.y}</td><td style="white-space:nowrap">${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}</td><td style="text-align:left;font-size:11px;${r.inj?'color:var(--bad);font-weight:700;':''}">${r.line}</td></tr>`).join('');
      card('','生涯年表（業餘成績）',`<table class="fin"><tr><th>年度</th><th>齡</th><th style="text-align:left">球隊</th><th style="text-align:left">成績</th></tr>${amaRows}</table>`);
    }
    if(proLogs.length > 0){
      const isP = S.pos === 'P';
      const head = isP
        ? `<tr><th>年</th><th>齡</th><th style="text-align:left">球隊</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>`
        : `<tr><th>年</th><th>齡</th><th style="text-align:left">球隊</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>SB</th><th>DEF</th></tr>`;
      const rows = proLogs.map(r => {
        const cS = r.inj ? 'color:var(--bad);font-weight:700;' : '';
        const s = r.st || {G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0};
        if(isP){
          const era = s.IP>0 ? (s.ER*9/s.IP).toFixed(2) : '-';
          const whip = s.IP>0 ? ((s.H+s.BB)/s.IP).toFixed(2) : '-';
          return `<tr style="${cS}"><td>${r.y}</td><td>${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}</td><td>${s.G}</td><td>${fmtIP(s.IP)}</td><td>${s.W}</td><td>${s.L}</td><td>${s.SV||0}</td><td>${s.HLD||0}</td><td>${s.SO}</td><td>${s.BB||0}</td><td>${era}</td><td>${whip}</td></tr>`;
        } else {
          const obpN = s.PA>0 ? (s.H+s.BB)/s.PA : 0;
          const slgN = slgOf(s);
          const avg = s.AB>0 ? (s.H/s.AB).toFixed(3).replace(/^0/,'') : '-';
          const obp = s.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
          const slg = s.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
          const ops = s.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
          return `<tr style="${cS}"><td>${r.y}</td><td>${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}${r.p?"·"+r.p:""}</td><td>${s.G}</td><td>${s.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${s.H}</td><td>${s.HR}</td><td>${s.RBI}</td><td>${s.SB}</td><td>${s.DEF>0?'+':''}${s.DEF||0}</td></tr>`;
        }
      }).join('');
      card('','生涯年表（職業成績）',`<table class="fin">${head}${rows}</table>`);
    }
  }
  let intlTable='';
  if(S.intlCount>0){ const IS=S.intlStat;
    if(S.pos==='P'){ const era=IS.IP>0?(IS.ER*9/IS.IP).toFixed(2):'-';
      intlTable=`<h4 style="margin:12px 0 4px">國際賽生涯（中華隊 ${S.intlCount} 屆）</h4><table class="st"><tr><th>出賽</th><th>局數</th><th>勝</th><th>救援</th><th>三振</th><th>ERA</th></tr><tr><td>${IS.G}</td><td>${fmtIP(IS.IP)}</td><td>${IS.W}</td><td>${IS.SV}</td><td>${IS.SO}</td><td>${era}</td></tr></table>`;
    } else { const avg=IS.AB>0?(IS.H/IS.AB).toFixed(3).replace(/^0/,''):'-';
      intlTable=`<h4 style="margin:12px 0 4px">國際賽生涯（中華隊 ${S.intlCount} 屆）</h4><table class="st"><tr><th>出賽</th><th>打席</th><th>打擊率</th><th>安打</th><th>全壘打</th><th>打點</th></tr><tr><td>${IS.G}</td><td>${IS.PA}</td><td>${avg}</td><td>${IS.H}</td><td>${IS.HR}</td><td>${IS.RBI}</td></tr></table>`;
    }
  }
  card('','生涯累積數據',(tables||'<p>（無職業層級出賽紀錄）</p>')+intlTable);
  if(evals.length)card('gold','生涯評價',evals.join('<br>'));
  /* 獎項與大賽成績（群組化） */
  /* 獎項與大賽成績（群組化） */
  let honorsHTML = '（生涯未獲得任何獎項）';
  if(S.honors.length) {
    const awardMap = {};
    S.honors.forEach(h => {
       const parts = h.split(' ');
       if(parts.length >= 2) {
         const yr = parts[0]; const awd = parts.slice(1).join(' ');
         if(!awardMap[awd]) awardMap[awd] = []; awardMap[awd].push(yr);
       } else { if(!awardMap[h]) awardMap[h] = []; awardMap[h].push(''); }
    });
    const honorsList = [];
    for(const awd in awardMap) {
       const yrs = awardMap[awd];
       if(yrs[0] !== '') {
         let nums = yrs.map(Number).sort((a,b)=>a-b);
         let res=[], st=nums[0], ed=nums[0];
         for(let i=1; i<=nums.length; i++){
           if(i<nums.length && nums[i]===ed+1){ ed=nums[i]; }
           else {
             if(ed-st>=2) res.push(`${st}~${ed}`); // 三年或以上連號，用 ~
             else if(ed-st===1) res.push(`${st}、${ed}`); // 兩年連號，維持頓號
             else res.push(`${st}`); // 單一年份
             if(i<nums.length){ st=nums[i]; ed=nums[i]; }
           }
         }
         if(yrs.length > 1) honorsList.push(`· ${awd} *${yrs.length} (${res.join('、')})`);
         else honorsList.push(`· ${awd} (${res[0]})`);
       } else {
         honorsList.push(`· ${awd}`);
       }
    }
    honorsHTML = honorsList.join('<br>');
  }
  card(S.honors.length?'gold':'','獎項與大賽成績', honorsHTML);
  const achievementHTML=(S.achievements||[]).length?(S.achievements||[]).map(id=>{
    const a=ACHIEVEMENTS[id],m=(S.achievementLog||{})[id]||{}; if(!a)return '';
    const sign=a.pts>=0?`+${a.pts}`:String(a.pts);
    return `<div style="margin:0 0 10px"><b class="${a.bad?'dn':'hl'}">${a.bad?'▼':'◆'} ${a.name}</b> <span class="sub">${m.year||''}${m.standing?'｜'+m.standing:''}｜${sign}</span><br>${a.desc}</div>`;
  }).join(''):'（尚未解鎖年代成就）';
  card((S.achievements||[]).length?'gold':'','年代成就與生涯印記',achievementHTML);
  /* 特質與薪資 */
  const tr=[];
  [...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].forEach(k=>{ if(S.traits[k])tr.push(`<span class="tag" style="${traitTagStyle(k)}">${traitName(k)}</span>`); });
  (S.removed||[]).forEach(lbl=>tr.push(`<span class="tag" style="text-decoration:line-through;opacity:.4;color:#8a8a8a;border-color:#4a4a4a">${lbl}</span>`));
  const lv=S.love;
  const cur=lv.st==='married'?`老婆 ${lv.partner}（${lv.kids}）`:lv.st==='dating'?`交往中 ${lv.partner}（${lv.dyrs||0} 年）`:lv.st==='divorced'?'離婚':'未婚';
  const exStr=lv.exes.length?`｜前妻 ${lv.exes.map(e=>`${e.name}（${e.kids}）`).join('、')}`:'';
  const totKids=lv.kids+lv.exes.reduce((t,e)=>t+e.kids,0);
  const drugFile=S.overseasDark&&S.overseasDark.ped?'｜禁藥：仍在使用，未結案':S.overseasDark&&S.overseasDark.caught?'｜禁藥：遭查獲並處分':S.overseasDark&&S.overseasDark.disclosed?'｜禁藥：主動交代並停用':'';
  card('','生涯檔案',`隱藏素質：${tr.join(' ')||'（無）'}<br>家庭：${cur}${exStr}｜子女共 ${totKids} 人${lv.affairs?`｜外遇 ${lv.affairs}(${lv.caught})`:''}<br>國際賽出賽：${S.intlCount} 次｜生涯大傷：${S.bigInj} 次${S.pos==='P'?`｜Tommy John 手術：${S.tjCount} 次`:''}${drugFile}<br>生涯總薪資：<b class="hl" style="font-size:18px">${fmtMoney(Math.round(S.salary))}</b> 台幣`);
  /* 球迷留言 */
  const pool=FAN[best].slice(); const picks=[];
  while(picks.length<3&&pool.length)picks.push(pool.splice(Math.floor(R()*pool.length),1)[0]);
  /* 盤子留言:低聯盟明星以上,旅外到更高聯盟卻淪替補/邊緣 */
  { const LGR={CPBL:0,NPB:1,MLB:2}, CTY={CPBL:'台灣',NPB:'日本',MLB:'美國'};
    ['CPBL','NPB','MLB'].forEach(low=>{ ['CPBL','NPB','MLB'].forEach(high=>{
      if(LGR[high]>LGR[low] && tiersByLg[low] && tiersByLg[high] && tiersByLg[low].i<=1 && tiersByLg[high].i>=3){
        picks.push(`在${CTY[low]}是${LG_N[low]}的招牌，到了${CTY[high]}的${LG_N[high]}卻完全打不出來——「這人是誰？」當地球迷一臉問號，簽他的球團真是盤子`);
      }
    }); });
  }
  if(S.traits.glass)picks.push('如果沒有那些傷，他的生涯會是什麼樣子……不敢想');
  if(S.traits.iron)picks.push('鐵人謝幕。那個連續出賽紀錄，大概很久都不會被打破了');
  if(S.traits.genius&&best<=1)picks.push('高中就被叫做天才的男人，真的把天賦兌現了');
  if(S.honors.some(h=>h.includes('經典賽冠軍')))picks.push('經典賽奪冠那一夜，全台灣都沒睡。謝謝你');
  if(S.love.caught)picks.push('球技沒話說，私生活就……唉，不說了');
  if(S.traits.scum)picks.push('引退串裡不准提那些事，今天只談棒球。……好啦還是很氣');
  if(S.traits.franchise)picks.push('一隊一人，退休號碼準備掛上去了。謝謝你留下來');
  if(S.traits.legend)picks.push('這輩子能看到你打球，是我們這代球迷的福氣。歷史級的');
  if(S.traits.intlace)picks.push('穿上國家隊球衣的那個男人，永遠的國家英雄');
  if(S.traits.taiwan)picks.push('六度披上國家隊戰袍，從不推辭。他比劃胸口的那一幕，我手機桌布放到現在');
  if(S.traits.disc)picks.push('自律到可怕，凌晨四點的球場都認得他');
  if((S.achievements||[]).includes('jp_union'))picks.push('他那年站在罷賽隊伍裡，不是因為最大咖，是因為知道少一隊就少很多人的明天。');
  if((S.achievements||[]).includes('us_clean'))picks.push('那個年代每個數字都會被懷疑；至少他的球衣，最後能攤在陽光下。');
  if((S.achievements||[]).includes('us_community'))picks.push('我最記得的不是那季幾支安打，是城市最難的時候，他真的有來。');
  if((S.achievements||[]).includes('beef_noodle_return'))picks.push('別再問是哪一家牛肉麵了，退役投手排隊排到美國；重點可能不是湯，是老闆自己先喝完那一碗。');
  if((S.achievements||[]).includes('world_headline'))picks.push('台灣、日本、美國都有人為他提早進場。不是旅外，是三次把異鄉打成主場。');
  if(S.traits.cancer)picks.push('球是打得好啦，但那個態度……更衣室少了他反而清靜');
  if(S.traits.thief)picks.push('當年拒絕下放又打不出來，薪水小倫這名號是自己掙來的');
  if(S.traits.mrteam)picks.push('十五年只為一隊，'+(teamNick(S.mrTeamName||'')||'')+'先生這個稱號，他當之無愧');
  if(S.traits.confidante)picks.push('場上叱吒風雲，感情路上卻總是差一步，唉');
  if(S.traits.smallschool)picks.push('從那種小學校打到職業，這故事夠拍一部電影了');
  if(S.traits.grinder)picks.push('沒什麼天分卻拼到這種成就，這種球員最讓人尊敬');
  if(S.traits.goldcloth)picks.push('我愛兄弟巨象，不離不棄');
  if(S.traits.phoenix)picks.push('從手術台爬回來還能拿獎，這種心臟是鈦合金做的吧');
  if(S.traits.onetool&&S.toolRole)picks.push(`那招${S.toolRole}真的無解，關鍵時刻換他上場就對了`);
  if(S.traits.clutch)picks.push('大場面先生，越關鍵的時刻越信任他');
  if(S.love.st==='married'&&S.love.kids>=2)picks.push('引退後好好陪家人吧，孩子們等你很久了');
  card('info','球迷看板・引退串',picks.map(p=>'「'+p.replace(/{n}/g,S.name)+'」').join('<br>'));
  /* 一鍵分享 */
  const sh=document.createElement('div'); sh.className='card';
  sh.innerHTML=`<div class="title">分享這段生涯</div>
    <div class="row2" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn main" id="sh-img" style="flex:1">📸 產生結算圖</button>
      <button class="btn" id="sh-url" style="flex:1">🔗 複製重播連結</button>
    </div><div id="sh-out" style="margin-top:8px"></div>`;
  $('log').appendChild(sh);
  sh.querySelector('#sh-img').onclick=()=>shareImage(evals,sh.querySelector('#sh-out'));
  sh.querySelector('#sh-url').onclick=e=>{
    const url=location.origin.startsWith('http')?location.origin+location.pathname+'?seed='+SEED:location.href.split('?')[0]+'?seed='+SEED;
    const okmsg=()=>{e.target.textContent='✅ 已複製';setTimeout(()=>e.target.textContent='🔗 複製重播連結',1600);};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(okmsg,()=>prompt('手動複製連結：',url));
    else prompt('手動複製連結：',url);
  };
  choose('',[
    {t:'⚾ 開啟新的人生（新種子）',main:true,f:()=>{location.href=location.pathname;}},
    {t:'用同一個種子重來',s:'seed: '+SEED,f:()=>{location.href=location.pathname+'?seed='+SEED;}}]);
  /* 結算定錨:蓋過預設的捲到底,改捲到「生涯終幕」開頭,玩家從結算第一行開始看 */
  setTimeout(()=>{ try{
    const heads=document.querySelectorAll('.yr-head');
    for(const h of heads){ if(h.textContent==='生涯終幕'){ h.scrollIntoView({behavior:'auto',block:'start'}); break; } }
  }catch(e){} }, 250);
}
/* 結算圖（Canvas 產生 PNG，可長按儲存或自動下載） */
function shareImage(evals,out){
  const isP=S.pos==='P';
  const tiers=evals.map(t=>t.replace(/<[^>]+>/g,''));
  /* 特性(保留 + 刪除線標記) */
  const keepTr=[...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].filter(k=>S.traits[k]).map(k=>({label:traitName(k),key:k,neg:TRAIT_KEYS.neg.includes(k)}));
  const remTr=(S.removed||[]).map(l=>({label:l,key:'',neg:false,rem:true}));
  /* 生涯數據列(每聯盟一列) */
  const leagues=['MLB','NPB','CPBL'].filter(b=>S.stats[b]);
  /* 生涯里程碑 + 名人堂資訊(加在榮譽最前面) */
  const milestones = [];
  const isPit = S.pos==='P';
  /* 名人堂入選資訊 */
  if(S.hofInfo&&S.hofInfo.length){ S.hofInfo.forEach(h=>{
    milestones.push(`${h.lg}名人堂 · 第${h.yr}年入選 ${h.pct}%`); }); }
  /* 跨聯盟生涯合計里程碑 */
  { let tG=0,tH=0,tHR=0,tRBI=0,tSB=0,tW=0,tSV=0,tHLD=0,tSO=0,tIP=0;
    ['CPBL','NPB','MLB'].forEach(b=>{ const st=S.stats[b]; if(!st)return;
      tH+=st.H||0;tHR+=st.HR||0;tRBI+=st.RBI||0;tSB+=st.SB||0;
      tW+=st.W||0;tSV+=st.SV||0;tHLD+=st.HLD||0;tSO+=st.SO||0;tIP+=st.IP||0; });
    if(isPit){
      if(tW>0||tSO>0)milestones.push(`跨聯盟生涯 ${tW}勝 ${tSO}K ${tSV}救援 ${tHLD}中繼`);
    }else{
      if(tH>0)milestones.push(`跨聯盟生涯 ${tHR}轟 ${tH}安 ${tSB}盜`);
    }
  }
  /* 榮譽群組化(依年份) */
  const honors = milestones.slice();
  const aMap = {};
  S.honors.forEach(h => {
     const parts = h.split(' ');
     if(parts.length >= 2) { const yr = parts[0]; const awd = parts.slice(1).join(' ');
       if(!aMap[awd]) aMap[awd] = []; aMap[awd].push(yr);
     } else { if(!aMap[h]) aMap[h] = []; aMap[h].push(''); }
  });
  for(const awd in aMap) {
     const yrs = aMap[awd];
     if(yrs[0] !== '') {
       let nums = yrs.map(Number).sort((a,b)=>a-b);
       let res=[], st=nums[0], ed=nums[0];
       for(let i=1; i<=nums.length; i++){
         if(i<nums.length && nums[i]===ed+1){ ed=nums[i]; }
         else {
           if(ed-st>=2) res.push(`${st}~${ed}`);
           else if(ed-st===1) res.push(`${st}、${ed}`);
           else res.push(`${st}`);
           if(i<nums.length){ st=nums[i]; ed=nums[i]; }
         }
       }
       if(yrs.length > 1) honors.push(`${awd} *${yrs.length} (${res.join('、')})`);
       else honors.push(`${awd} (${res[0]})`);
     } else {
       honors.push(`${awd}`);
     }
  }
  (S.achievements||[]).forEach(id=>{const a=ACHIEVEMENTS[id];if(a)honors.push(`${a.bad?'生涯印記':'年代成就'} · ${a.name} (${a.pts>=0?'+':''}${a.pts})`);});
  /* 歷年成績 */
  const hist=S.log.slice();

  const W=920, PAD=34, scale=2;

  /* 為了計算換行，先建立 Canvas 與 Context 來測量字體寬度 */
  const cv=document.createElement('canvas');
  const c=cv.getContext('2d');
  c.font='13px sans-serif';
  /* Canvas colors follow the active theme tokens (read from computed style) */
  const _css=getComputedStyle(document.body), _tk=(n,fb)=>((_css.getPropertyValue(n)||'').trim()||fb);
  const C_BG=_tk('--bg','#0b1a12'), C_EDGE=_tk('--edge','#2b4a38'), C_DIM=_tk('--dim','#8fae9c'),
        C_ACC=_tk('--accent','#ffc95c'), C_TX=_tk('--text','#e8efe9'), C_GOOD=_tk('--good','#9fd8a8'),
        C_BAD=_tk('--bad','#ff8b7a'), C_P2=_tk('--panel2','#173524');

  /* 處理榮譽雙欄換行 */
  const colW=(W-PAD*2)/2, maxTextW=colW-20;
  const honorBlocks = honors.map(h => {
    let text = '· ' + h;
    let lines = []; let curr = '';
    for(let i=0; i<text.length; i++) {
      let test = curr + text[i];
      if(c.measureText(test).width > maxTextW && curr.length > 0) {
        lines.push(curr);
        curr = '  ' + text[i];
      } else { curr = test; }
    }
    if(curr) lines.push(curr);
    return lines;
  });
  const rows2=Math.ceil(honorBlocks.length/2);
  let leftH=0, rightH=0;
  honorBlocks.slice(0, rows2).forEach(b => leftH += b.length * 23);
  honorBlocks.slice(rows2).forEach(b => rightH += b.length * 23);
  const honorsTotalHeight = Math.max(leftH, rightH);
  /* 預估總高度 */
  let H=150; // header
  H+=30+tiers.length*24+14; // 評價
  if(keepTr.length||remTr.length)H+=54;
  H+=34+(leagues.length+1)*26+16; // 生涯數據表
  if(S.intlCount>0)H+=30+24+28+12; // 國際賽區塊
  H+=30+honorsTotalHeight+16; // 榮譽(雙欄換行後的高度)

  const amaLogs = hist.filter(r => !r.st);
  const proLogs = hist.filter(r => r.st);
  if(amaLogs.length > 0) H += 34 + amaLogs.length * 20 + 24;
  if(proLogs.length > 0) H += 34 + proLogs.length * 20 + 24;

  H+=70;
  cv.width=W*scale; cv.height=H*scale;
  c.scale(scale,scale);
  c.fillStyle=C_BG; c.fillRect(0,0,W,H);
  c.strokeStyle=C_EDGE; c.lineWidth=3; c.strokeRect(10,10,W-20,H-20);
  c.textBaseline='top';
  const posN={P:roleN(S.role)+'投手',C:'捕手',IF:'內野手',OF:'外野手'}[S.pos];

  // Header
  c.fillStyle=C_DIM; c.font='13px sans-serif'; c.fillText('Y a K y o L i f e ・ 引 退 紀 念',PAD,30);
  c.fillStyle=C_ACC; c.font='bold 36px sans-serif'; c.fillText(S.name,PAD,52);
  c.fillStyle=C_TX; c.font='15px sans-serif';
  c.fillText(`${primaryPos()}｜${playerType()}｜${hist.length?hist[0].y:'?'}–${S.year}｜引退時 ${S.age} 歲${S.pos==='P'&&S.tjCount?`｜TJ×${S.tjCount}`:''}`,PAD,98);
  // 特性列(header 右方)
  let y=126;
  function tagColor(o){
    if(o.rem)return {bg:'#242424',bd:'#4a4a4a',fg:'#8a8a8a'};
    if(o.key==='legend'||o.key==='taiwan')return {bg:'#3a2c05',bd:'#ffc95c',fg:'#ffe08a'}; /* 金(歷史級/Team Taiwan) */
    if(o.key==='goldcloth')return {bg:'#3a3505',bd:'#e8d43a',fg:'#fff35a'}; /* 黃 */
    if(o.key==='mrteam')return teamChip(TEAM_COLOR[S.mrTeamName]||'#ffc95c');
    if(o.key==='genius')return {bg:'#232733',bd:'#c8d0e0',fg:'#e8eef7'}; /* 銀 */
    if(o.neg)return {bg:'#2a0f0f',bd:'#c0392b',fg:'#ff8b7a'};             /* 紅 */
    return {bg:C_P2,bd:C_EDGE,fg:C_GOOD};                                 /* 主題色 */
  }
  function drawTags(items){ items.forEach(function(o){ const t=o.label, col=tagColor(o);
    c.font='12px sans-serif'; const w=c.measureText(t).width+16;
    c.fillStyle=col.bg; c.strokeStyle=col.bd; c.lineWidth=1;
    c.fillRect(tagx,y,w,20); c.strokeRect(tagx,y,w,20);
    c.fillStyle=col.fg; c.fillText(t,tagx+8,y+3);
    if(o.rem){ c.strokeStyle='#8a8a8a'; c.beginPath(); c.moveTo(tagx+4,y+10); c.lineTo(tagx+w-4,y+10); c.stroke(); }
    tagx+=w+8; if(tagx>W-160){tagx=PAD;y+=26;}
  }); }
  var tagx=PAD;
  if(keepTr.length||remTr.length){ drawTags(keepTr.concat(remTr)); y+=30; }

  function hr(){ c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath(); c.moveTo(PAD,y); c.lineTo(W-PAD,y); c.stroke(); y+=12; }
  function sectionTitle(t){ c.fillStyle=C_DIM; c.font='bold 13px sans-serif'; c.fillText(t,PAD,y); y+=22; }

  // 評價
  hr(); sectionTitle('生涯評價');
  c.font='bold 16px sans-serif'; c.fillStyle=C_ACC;
  tiers.forEach(function(t){ c.fillText('★ '+t,PAD,y); y+=24; }); y+=6;

  // 生涯數據表
  hr(); sectionTitle('生涯累積數據');
  const cols=isP?[['League',90],['Yrs',36],['G',48],['IP',54],['W',36],['L',36],['SV',48],['HLD',48],['SO',52],['BB',48],['ERA',52],['WHIP',54]]
                :[['League',80],['Yrs',34],['G',40],['PA',46],['AVG',48],['OBP',48],['SLG',48],['OPS',48],['H',44],['HR',38],['RBI',44],['SB',40],['DEF',40]];
  function row(cells,head){ let x=PAD; c.font=(head?'bold ':'')+'13px monospace'; c.fillStyle=head?C_DIM:C_TX;
    cells.forEach(function(cell,i){ c.fillText(String(cell),x,y); x+=cols[i][1]; }); y+=head?24:26; }
  row(cols.map(cc=>cc[0]),true);
  leagues.forEach(function(b){ const st=S.stats[b];
    if(isP){ const era=st.IP>0?(st.ER*9/st.IP).toFixed(2):'-'; const whip=st.IP>0?((st.H+st.BB)/st.IP).toFixed(2):'-';
      row([LG_N[b],st.yr,st.G,fmtIP(st.IP),st.W,st.L,st.SV||0,st.HLD||0,st.SO,st.BB||0,era,whip]); }
    else{
      const obpN = st.PA>0 ? (st.H+st.BB)/st.PA : 0;
      const slgN = slgOf(st);
      const avg = st.AB>0 ? (st.H/st.AB).toFixed(3).replace(/^0/,'') : '-';
      const obp = st.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
      const slg = st.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
      const ops = st.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
      row([LG_N[b],st.yr,st.G,st.PA,avg,obp,slg,ops,st.H,st.HR,st.RBI,st.SB,(st.DEF>0?'+':'')+(st.DEF||0)]); } });
  y+=6;

  // 國際賽生涯成績
  if(S.intlCount>0){ const IS=S.intlStat;
    hr(); sectionTitle('國際賽生涯（中華隊 '+S.intlCount+' 屆）');
    const rowIntl=(cells,head)=>{ let x=PAD; c.font=(head?'bold ':'')+'13px monospace'; c.fillStyle=head?C_DIM:C_TX;
      cells.forEach(function(cell,i){ c.fillText(String(cell),x,y); x+=ic[i][1]; }); y+=head?24:28; };
    var ic;
    if(isP){ const era=IS.IP>0?(IS.ER*9/IS.IP).toFixed(2):'-';
      ic=[['',110],['G',80],['IP',86],['W',60],['SV',72],['SO',80],['ERA',80]];
      rowIntl(['', 'G', 'IP', 'W', 'SV', 'SO', 'ERA'], true);
      rowIntl(['',IS.G,fmtIP(IS.IP),IS.W,IS.SV,IS.SO,era],false);
    } else { const avg=IS.AB>0?(IS.H/IS.AB).toFixed(3).replace(/^0/,''):'-';
      ic=[['',110],['G',76],['PA',76],['AVG',76],['H',72],['HR',60],['RBI',72]];
      rowIntl(['', 'G', 'PA', 'AVG', 'H', 'HR', 'RBI'], true);
      rowIntl(['',IS.G,IS.PA,avg,IS.H,IS.HR,IS.RBI],false);
    }
    y+=6;
  }

  // 榮譽(雙欄橫式,過長自動換行)
  hr(); sectionTitle('生涯榮譽（'+honors.length+' 項）');
  c.font='13px sans-serif'; c.fillStyle=C_GOOD;
  let startY = y;
  let currY = startY;
  honorBlocks.forEach(function(b, i){
    const isRightCol = i >= rows2;
    if(i === rows2) currY = startY;
    const hx = PAD + (isRightCol ? colW : 0);
    b.forEach(line => { c.fillText(line, hx, currY); currY += 23; });
  });
  y += honorsTotalHeight + 8;

  // 年表(分為業餘與職業表格)
  if(amaLogs.length > 0){
    hr(); sectionTitle('生涯年表（業餘成績）');
    const hc=[['年',48],['齡',40],['球隊',150],['成績',W-PAD*2-238]];
    let x=PAD; c.font='bold 12px monospace'; c.fillStyle=C_DIM;
    hc.forEach(function(h){ c.fillText(h[0],x,y); x+=h[1]; }); y+=20;
    c.font='11px monospace';
    amaLogs.forEach(function(r){ x=PAD; c.fillStyle=r.inj?C_BAD:C_TX;
      const cells=[String(r.y),String(r.age),r.tm,r.line];
      cells.forEach(function(cell,i){
        let t=String(cell); const maxw=hc[i][1]-8;
        while(c.measureText(t).width>maxw&&t.length>1)t=t.slice(0,-1);
        c.fillText(t,x,y); x+=hc[i][1]; }); y+=20; });
    y+=4;
  }
  if(proLogs.length > 0){
    hr(); sectionTitle('生涯年表（職業成績）');
    const hc = isP
      ? [['年',46],['齡',36],['球隊',124],['G',45],['IP',55],['W',36],['L',36],['SV',42],['HLD',42],['SO',46],['BB',46],['ERA',52],['WHIP',54]]
      : [['年',46],['齡',34],['球隊',120],['G',36],['PA',42],['AVG',46],['OBP',46],['SLG',46],['OPS',46],['H',40],['HR',36],['RBI',40],['SB',36],['DEF',40]];
    let x=PAD; c.font='bold 12px monospace'; c.fillStyle=C_DIM;
    hc.forEach(function(h){ c.fillText(h[0],x,y); x+=h[1]; }); y+=20;
    c.font='12px monospace';
    proLogs.forEach(function(r){ x=PAD; c.fillStyle=r.inj?C_BAD:C_TX;
      const tmS=r.tm;
      const s = r.st || {G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0};
      let cells = [];
      if(isP){
        const era = s.IP>0 ? (s.ER*9/s.IP).toFixed(2) : '-';
        const whip = s.IP>0 ? ((s.H+s.BB)/s.IP).toFixed(2) : '-';
        cells=[String(r.y), String(r.age), tmS, String(s.G), fmtIP(s.IP), String(s.W), String(s.L), String(s.SV||0), String(s.HLD||0), String(s.SO), String(s.BB||0), era, whip];
      } else {
        const obpN = s.PA>0 ? (s.H+s.BB)/s.PA : 0;
        const slgN = slgOf(s);
        const avg = s.AB>0 ? (s.H/s.AB).toFixed(3).replace(/^0/,'') : '-';
        const obp = s.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
        const slg = s.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
        const ops = s.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
        cells=[String(r.y), String(r.age), tmS+(r.p?'·'+r.p:''), String(s.G), String(s.PA), avg, obp, slg, ops, String(s.H), String(s.HR), String(s.RBI), String(s.SB), String(s.DEF>0?'+'+s.DEF:s.DEF||0)];
      }
      cells.forEach(function(cell,i){
        let t=String(cell); const maxw=hc[i][1]-8;
        while(c.measureText(t).width>maxw&&t.length>1)t=t.slice(0,-1);
        c.fillText(t,x,y); x+=hc[i][1]; });
      y+=20;
    });
    y+=4;
  }

  c.fillStyle=C_ACC; c.font='bold 16px sans-serif';
  c.fillText('生涯總薪資 '+fmtMoney(Math.round(S.salary))+' 台幣',PAD,y); y+=26;
  c.fillStyle=C_DIM; c.font='11px monospace'; c.fillText('seed: '+SEED,PAD,H-40);
  c.textAlign='right'; c.fillText(APP_VER,W-PAD,H-40); c.textAlign='left';

  const url=cv.toDataURL('image/png');
  const fileName='棒球生涯結算_'+S.name+'.png';
  out.innerHTML=`<img src="${url}" style="width:100%;border-radius:8px" alt="結算圖">
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn main" id="sh-save" style="flex:1">💾 儲存 / 分享圖片</button>
      <button class="btn" id="sh-dl" style="flex:1">下載到裝置</button>
    </div>
    <div class="statline" style="margin-top:6px">若按鈕無效，長按上方圖片也可儲存</div>`;
  /* 下載連結(桌機/備援) */
  out.querySelector('#sh-dl').onclick=()=>{ const a=document.createElement('a'); a.href=url; a.download=fileName;
    document.body.appendChild(a); a.click(); a.remove(); };
  /* 分享:優先 Web Share(可存相簿),不支援則退回下載 */
  out.querySelector('#sh-save').onclick=async ()=>{
    try{
      const blob=await (await fetch(url)).blob();
      const file=new File([blob],fileName,{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:'棒球生涯結算',text:S.name+' 的棒球人生'});
        return;
      }
    }catch(e){ if(e&&e.name==='AbortError')return; /* 使用者取消,不用退回 */ }
    /* 不支援 Web Share → 退回下載 */
    const a=document.createElement('a'); a.href=url; a.download=fileName;
    document.body.appendChild(a); a.click(); a.remove();
  };
}
/* ================= 開場設定 ================= */
(function(){ const t=document.getElementById('act-toggle');
  if(t)t.onclick=()=>{ document.getElementById('act').classList.toggle('collapsed');
    t.textContent=document.getElementById('act').classList.contains('collapsed')?'⌃ 展開選項':'⌄ 收合選項'; };
})();
(function(){ /* theme init + timeline click delegation */
  try{ applyMobileUI(localStorage.getItem('yakyu-mobile-ui')==='1'); }catch(e){}
  document.querySelectorAll('#seg-ui button').forEach(b=>b.onclick=()=>applyMobileUI(b.dataset.u==='1'));
  try{ applyBigText(localStorage.getItem(BIG_KEY)==='1'); }catch(e){}
  document.querySelectorAll('#seg-big button').forEach(b=>b.onclick=()=>applyBigText(b.dataset.b==='1'));
  const afc=$('af-close'); if(afc)afc.onclick=allocFullClose;
  /* the layout entry appears and disappears at the breakpoint, so the summary re-syncs on resize */
  window.addEventListener('resize',updDispSum);
  /* Slide the panel open and shut. ::details-content only interpolates with
     interpolate-size, which is Chromium-only, so Firefox and Safari saw it snap; the Web
     Animations API works everywhere. While collapsing, `open` has to stay set until the
     animation ends or the content would vanish on the first frame. Reduced motion is
     checked here because the global *{transition:none} rule cannot match a pseudo-element. */
  (function(){ const det=document.getElementById('fld-display'); if(!det)return;
    const body=document.getElementById('disp-body'), sum=det.querySelector('summary');
    if(!body||!sum)return; let anim=null;
    sum.addEventListener('click',ev=>{
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      ev.preventDefault();
      if(anim){ anim.cancel(); anim=null; }
      const opening=!det.open;
      if(opening)det.open=true;
      const h=body.getBoundingClientRect().height;
      body.style.overflow='hidden';
      anim=body.animate({height:opening?['0px',h+'px']:[h+'px','0px'],
        opacity:opening?[0,1]:[1,0]},{duration:280,easing:'ease'});
      anim.onfinish=()=>{ body.style.overflow=''; anim=null; if(!opening)det.open=false; };
    }); })();
  let t='a'; try{t=localStorage.getItem(THEME_KEY)||'a';}catch(e){}
  document.querySelectorAll('#seg-theme button').forEach(b=>b.onclick=()=>applyTheme(b.dataset.t));
  applyTheme(t);
  ['tl-list','tl-strip'].forEach(id=>{ const el=$(id);
    if(el)el.onclick=ev=>{ const n=ev.target.closest('[data-i]'); if(n)tlScrollTo(TL[+n.dataset.i]); }; });
  const md=$('modal'); if(md)md.onclick=ev=>{ if(ev.target===md)modalClose(); };
  document.addEventListener('keydown',ev=>{ if(ev.key==='Escape'){ modalClose(); allocFullClose(); } });
})();
let selPos='P';
$('seed-show').value=SEED;
$('seed-re').onclick=e=>{e.preventDefault();SEED=Math.random().toString(36).slice(2,10);$('seed-show').value=SEED;};
document.querySelectorAll('#seg-pos button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#seg-pos button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); selPos=b.dataset.v;
});
$('btn-start').onclick=()=>{
  const defName=(selPos==='P')?'有有子':(selPos==='IF')?'抹茶多':(['黃鎖頭','藥帝士'][Math.floor(Math.random()*2)]); /* 依守位預設名(外野/捕手隨機) */
  const nm=$('in-name').value.trim()||defName;
  const sv=$('seed-show').value.trim(); if(sv)SEED=sv; /* 玩家可直接輸入流水碼 */
  history.replaceState(null,'','?seed='+encodeURIComponent(SEED));
  seedInit(SEED);
  S=newState(nm,selPos,null);
  S.teamName=function(){
    if(!this.orgTeam)return '';
    if(this.lv==='MLB')return this.orgTeam;
    if(LV[this.lv].org==='MiLB')return this.orgTeam+({R:'新人聯盟',A1:'1A',A2:'2A',A3:'3A'}[this.lv]);
    if(this.lv==='CPBL1'||this.lv==='NPB1')return this.orgTeam;
    return this.orgTeam+(this.lv==='CPBL2'&&this.year<2006?'預備隊':'二軍');
  };
  $('start').style.display='none';
  $('board').style.display=''; $('act').style.display='';
  TL=[]; renderTimeline();
  const ts=$('tl-seed'); if(ts)ts.textContent=SEED;
  card('info','球員誕生',`${S.year} 年春天，${POSN[S.pos]} <b class="hl">${S.name}</b> 加入 <b class="hl">${S.team}</b> 棒球隊。三年後的路，要自己選。<br><span style="color:var(--dim);font-size:12px">提示：22 歲前累積擲出 5 次「6」可覺醒隱藏素質。</span>`);
  startYear();
};
/* ================= PWA installability(單檔限制:manifest 於執行期以 Blob 產生) ================= */
const PWA_ICON_192='data:image/png;base64,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';
const PWA_ICON_512='data:image/png;base64,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';
(function(){
  if(!/^https?:$/.test(location.protocol))return; /* keep file:// double-click usage untouched */
  try{
    const dir=location.origin+location.pathname.replace(/[^/]*$/,'');
    const mf={id:dir,name:document.title||'YaKyoLife - 棒球人生模擬器',short_name:'YaKyoLife',
      description:'從高中三大賽到名人堂，一場種子化的台灣棒球員生涯模擬。',
      lang:'zh-Hant',start_url:dir,scope:dir,display:'standalone',
      background_color:'#081510',theme_color:'#081510',
      icons:[{src:PWA_ICON_192,sizes:'192x192',type:'image/png',purpose:'any'},
        {src:PWA_ICON_512,sizes:'512x512',type:'image/png',purpose:'any'},
        {src:PWA_ICON_512,sizes:'512x512',type:'image/png',purpose:'maskable'}]};
    const l=document.createElement('link'); l.rel='manifest';
    l.href=URL.createObjectURL(new Blob([JSON.stringify(mf)],{type:'application/manifest+json'}));
    document.head.appendChild(l);
  }catch(e){}
})();
(function(){ const vb=document.getElementById('ver-badge'); if(vb)vb.textContent=APP_VER;
  const tv=document.getElementById('tl-ver'); if(tv)tv.textContent=APP_VER; })();
/* touch has no hover: tap the salary cell to reveal the full amount, tap again to close.
   Never dismisses on a timer — the user decides when it goes away. */
(function(){ const cell=document.getElementById('bd-sal-cell'); if(!cell)return;
  cell.addEventListener('click',()=>cell.classList.toggle('show'));
  /* on pointer devices :hover already governs the tip; make sure a stray click cannot
     leave it pinned open after the cursor has left the cell */
  if(window.matchMedia('(hover:hover)').matches)
    cell.addEventListener('mouseleave',()=>cell.classList.remove('show')); })();
