/**
 * map.js — 三国志文字版 · 势力地图 v15
 *
 * ✦ 60 座城池，十二大州区
 * ✦ flat-top 六边形，整个矩形网格完整铺满（无空白）
 * ✦ 空地按地形显示淡色底色，城池格在地形底色上叠加主体
 * ✦ 城池格：玩家彩色渐变 / NPC 金棕 / 空城半透暗色
 * ✦ 固定布局，不可拖拽缩放
 * ✦ 弹窗：驻将 + 兵力（含兵种）
 */
window.SGMap = (function () {
  'use strict';

  /* ─────────────────────────────────
     六边形参数（flat-top 横尖）
     横版长方形布局：hx 3-19 × hy 0-14
     HEX_R=28，格子放大，手机端完整显示
  ───────────────────────────────── */
  const HEX_R    = 28;
  const HEX_W    = HEX_R * 2;
  const HEX_H    = Math.sqrt(3) * HEX_R;
  const COL_STEP = HEX_R * 1.5;
  const ROW_STEP = HEX_H;

  /* 网格范围：西平(hx:3) → 襄平(hx:19)，北(hy:0) → 南(hy:14) */
  const GRID_COL_START = 3;
  const GRID_COL_END   = 19;
  const GRID_ROW_START = 0;
  const GRID_ROW_END   = 14;
  const GRID_COLS      = GRID_COL_END - GRID_COL_START + 1;
  const GRID_ROWS      = GRID_ROW_END - GRID_ROW_START + 1;

  /* ─────────────────────────────────
     地形色板 v2 — 强化识别度 + SVG纹理辅助
     · fill：提升至 0.13~0.20，让地形底色可见
     · stroke：各地形独立描边色，不再全用暗金统一
     · pattern：各地形有专属纹理（见 _defs）
     · patternId：对应 SVG <pattern> id
  ───────────────────────────────── */
  const TERRAIN = {
    '平原': { fill:'rgba(195,178,125,0.13)', stroke:'rgba(188,162,88,0.22)',  patternId:null },
    '山地': { fill:'rgba(108,100, 88,0.16)', stroke:'rgba(148,130,100,0.30)', patternId:null },
    '水域': { fill:'rgba( 22, 72,138,0.20)', stroke:'rgba( 50,118,195,0.35)', patternId:null },
    '森林': { fill:'rgba( 42, 88, 50,0.16)', stroke:'rgba( 68,128, 72,0.30)', patternId:null },
    '关隘': { fill:'rgba(135, 95, 42,0.18)', stroke:'rgba(195,155, 58,0.36)', patternId:null },
    '苦寒': { fill:'rgba(118,148,192,0.16)', stroke:'rgba(150,178,220,0.30)', patternId:null },
    '瘴林': { fill:'rgba( 38, 80, 50,0.17)', stroke:'rgba( 58,118, 68,0.30)', patternId:null },
    _default:{ fill:'rgba(100,100,100,0.05)', stroke:'rgba(160,135,75,0.12)', patternId:null },
  };

  /* ─────────────────────────────────
     每格对应地形（以 "col,row" 为键）
     未在此 Map 中的格子用 _emptyTerrain() 函数判断
  ───────────────────────────────── */

  /* ─────────────────────────────────
     势力色 — 半透明薄膜风格
     fill  : 深底色（内缩格主体背景）
     film  : 半透明薄膜叠色（势力感知层）
     stroke: 描边色（也用于 hover 光环）
     glow  : 发光色 / 文字高亮色
     text  : 城名文字色
  ───────────────────────────────── */
  const P_COLOR = [
    { fill:'rgba(80,10, 8,0.82)',  film:'rgba(210,55,40,0.20)',  stroke:'rgba(225,85,65,0.75)',  glow:'#ec7a62', text:'#fdeae6' },  // 赤
    { fill:'rgba( 8,55,22,0.82)',  film:'rgba(40,185,85,0.18)',  stroke:'rgba(55,200,100,0.70)', glow:'#52d478', text:'#e2f8ec' },  // 翠
    { fill:'rgba( 8,40,90,0.82)',  film:'rgba(40,125,220,0.20)', stroke:'rgba(65,150,240,0.70)', glow:'#60aef0', text:'#daeeff' },  // 青
  ];
  const NPC_C   = { fill:'rgba(25,18, 4,0.78)',  film:'rgba(125, 95,30,0.16)', stroke:'rgba(155,120,45,0.55)', glow:'#9c7c34', text:'#d8c890' };
// NPC 阵营专属配色（≥3 城时启用），仿照 NPC_C 结构
const NPC_FACTION_COLORS = [
  // 索引 0 — 玄青（袁绍）H:185°
  { fill:'rgba(15,72,82,0.82)',   film:'rgba(55,160,180,0.22)',  stroke:'rgba(90,185,200,0.75)',  glow:'#5fb8c8', text:'#d8eef2' },
  // 索引 1 — 玄铁青（曹魏）H:220° 冷峻铁器质感
  { fill:'rgba(20,32,52,0.82)', film:'rgba(70,95,135,0.22)', stroke:'rgba(95,120,160,0.75)', glow:'#3a5878', text:'#ccd6e4' },
  // 索引 2 — 赭石（刘表）H:25°
  { fill:'rgba(98,55,18,0.82)',   film:'rgba(200,128,55,0.22)',  stroke:'rgba(220,150,82,0.75)',  glow:'#cf9560', text:'#f2e0c8' },
  // 索引 3 — 赭褐红（孙吴）H:350°
  { fill:'rgba(72,28,32,0.82)',   film:'rgba(145,65,78,0.22)',   stroke:'rgba(170,90,100,0.75)',  glow:'#6e2838', text:'#e8c8ce' },
  // 索引 4 — 青松墨（蜀汉）H:165°
  { fill:'rgba(15,55,45,0.82)',   film:'rgba(55,120,102,0.22)',  stroke:'rgba(80,145,128,0.75)',  glow:'#2d6858', text:'#c8e0d8' },
  // 索引 5 — 沙金棕（马腾/韩遂）H:35°
  { fill:'rgba(92,62,25,0.82)',   film:'rgba(195,150,75,0.22)',  stroke:'rgba(220,175,108,0.75)', glow:'#c89860', text:'#f0e0c8' },
];

// 历史势力→颜色槽位硬绑映射（不在此表的势力走"先到先得"）
// 别名共享同一槽位（孙策=孙权、马腾=韩遂等兄弟/继承关系）
const FACTION_FIXED_SLOTS = {
  '袁绍': 0,
  '曹操': 1,
  '刘表': 2,
  '孙策': 3, '孙权': 3,
  '刘备': 4,
  '马腾': 5, '韩遂': 5,
};

// 阵营→槽位的稳定映射（模块级缓存）
let _npcFactionSlots = {};
  const EMPTY_C = { fill:'rgba(10,11,16,0.55)',  film:'rgba(40, 45,55,0.12)',  stroke:'rgba(175,148,82,0.16)', glow:'#887760', text:'rgba(185,158,100,0.32)' };

  /* 奖励图标（加 \uFE0F 变体选择符，强制彩色 emoji 渲染） */
  const BONUS_ICON = {
    '防御+':'\uD83D\uDEE1\uFE0F',  // 🛡️
    '进攻+':'\u2694\uFE0F',         // ⚔️
    '粮丰':'\uD83C\uDF3E',          // 🌾
    '金丰':'\uD83D\uDCB0',          // 💰
    '骑兵强':'\uD83D\uDC34',        // 🐴
    '水战强':'\u2693\uFE0F',        // ⚓️
    '谋略+':'\uD83D\uDCD6',         // 📖
    '民心+':'\uD83D\uDC65',         // 👥
    '险关':'\u26F0\uFE0F',          // ⛰️
    '蛮兵强':'\uD83C\uDFF9',        // 🏹
    '瘴气':'\uD83C\uDF2B\uFE0F',   // 🌫️
    '苦寒减产':'\u2744\uFE0F',      // ❄️
    '偏远':'\uD83D\uDDFA\uFE0F',      // 🗺️
  };

  /* 兵种显示顺序 */
  const TROOP_TYPES = ['步','弓','骑','水','蛮'];

  /* ─────────────────────────────────
     60 城数据  hx=列 hy=行（flat-top 偏移坐标）
     地图布局（西→东，北→南）：
       列  0- 3 ：西域/雍凉西段
       列  4- 9 ：益州 / 汉中走廊
       列 10-13 ：司隶 / 兖豫 / 并冀
       列 14-16 ：冀州 / 徐州 / 扬州北
       列 17-19 ：幽州 / 扬州东
  ───────────────────────────────── */
// v15 城池→城等映射
const CITY_TIER_MAP = {
  '襄平':'郡城','北平':'郡城','蓟县':'州治',
  '南皮':'郡城','平原':'郡城','邺城':'雄都',
  '晋阳':'州治','上党':'郡城',
  '北海':'郡城','济南':'郡城',
  '洛阳':'雄都','弘农':'郡城','河内':'郡城','虎牢关':'县城','潼关':'县城',
  '长安':'雄都','天水':'郡城','安定':'郡城','武威':'郡城','西平':'县城','街亭':'县城',
  '濮阳':'郡城','陈留':'州治','许昌':'雄都','汝南':'郡城','谯郡':'郡城',
  '下邳':'州治','小沛':'县城','广陵':'郡城',
  '宛城':'郡城','新野':'县城','襄阳':'雄都','江夏':'州治','江陵':'郡城',
  '武陵':'县城','长沙':'郡城','桂阳':'县城','零陵':'县城',
  '寿春':'州治','合肥':'郡城','庐江':'郡城','建业':'雄都','吴郡':'州治',
  '会稽':'郡城','柴桑':'郡城','庐陵':'县城',
  '汉中':'州治','上庸':'郡城','梓潼':'郡城','成都':'雄都','永安':'郡城',
  '江州':'郡城','武都':'县城','剑阁':'县城','葭萌关':'县城','阳平关':'县城',
  '建宁':'郡城','云南':'县城','永昌':'县城','交趾':'郡城',
};

// v15 城等基础产出
const CITY_TIER_BASE = {
  '雄都': { gold: 300, food: 600 },
  '州治': { gold: 200, food: 400 },
  '郡城': { gold: 120, food: 250 },
  '县城': { gold: 60,  food: 120 },
};

// v15 地利百分比乘算
const BONUS_MULT = {
  '粮丰':     { food: 1.5  },
  '金丰':     { gold: 1.5  },
  '进攻+':    { gold: 1.2  },
  '谋略+':    { gold: 1.1  },
  '水战强':   { food: 1.15 },
  '苦寒减产': { gold: 0.8, food: 0.8 },
  '瘴气':     { food: 0.75 },
  '偏远':     { gold: 0.9, food: 0.9 },
};

  const CITIES = [
    /* ══ 幽州 ══ */
    { id:'xiangping', name:'襄平',  region:'幽州', hx:19, hy:0,  tier:2, bonusKey:'骑兵强', bonusKeys:['骑兵强','苦寒减产'],  terrain:'山地', npcGuard:'公孙度', terrainDesc:'辽东孤城，北接鲜卑，骑兵之利冠绝北疆。' },
    { id:'beiping',   name:'北平',  region:'幽州', hx:17, hy:1,  tier:2, bonusKey:'骑兵强', bonusKeys:['骑兵强','防御+'],   terrain:'山地', npcGuard:'公孙瓒', terrainDesc:'燕山脚下雄关，白马义从所出之地。' },
    { id:'ji',        name:'蓟县',  region:'幽州', hx:15, hy:1,  tier:1, bonusKey:'粮丰', bonusKeys:['粮丰','苦寒减产'],terrain:'苦寒', npcGuard:'刘虞',   terrainDesc:'幽州治所，渔阳沃野，百姓殷实。' },

    /* ══ 冀州 ══ */
    { id:'nanpi',     name:'南皮',  region:'冀州', hx:16, hy:2,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','水战强'],    terrain:'平原', npcGuard:'袁谭',   terrainDesc:'渤海郡治，水陆码头，袁氏起家之所。' },
    { id:'pingyuan',  name:'平原',  region:'冀州', hx:15, hy:3,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','进攻+'],    terrain:'平原', npcGuard:'管亥',   terrainDesc:'黄河故道，一马平川，刘备曾在此为相。' },
    { id:'ye',        name:'邺城',  region:'冀州', hx:14, hy:2,  tier:1, bonusKey:'金丰', bonusKeys:['金丰','防御+'],   terrain:'平原', npcGuard:'袁尚',   terrainDesc:'冀州治所，河北第一坚城。' },

    /* ══ 并州 ══ */
    { id:'jinyang',   name:'晋阳',  region:'并州', hx:12, hy:2,  tier:2, bonusKey:'骑兵强', bonusKeys:['骑兵强','谋略+'],  terrain:'山地', npcGuard:'高干',   terrainDesc:'太原郡治，并州铁骑出没之地。' },
    { id:'shangdang', name:'上党',  region:'并州', hx:13, hy:3,  tier:2, bonusKey:'骑兵强', bonusKeys:['骑兵强','险关'],   terrain:'山地', npcGuard:'郭援',   terrainDesc:'天下之脊，群山环抱，兵家必争之地。' },

    /* ══ 青州 ══ */
    { id:'beihai',    name:'北海',  region:'青州', hx:17, hy:3,  tier:2, bonusKey:'水战强', bonusKeys:['水战强','粮丰'],  terrain:'水域', npcGuard:'孔融',   terrainDesc:'青州治所，东临大海，渔盐之利甲于天下。' },
    { id:'jinan',     name:'济南',  region:'青州', hx:16, hy:4,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰'],    terrain:'平原', npcGuard:'田楷',   terrainDesc:'泰山之北，济水之南，土地肥沃。' },

    /* ══ 司隶 ══ */
    { id:'henei',     name:'河内',  region:'司隶', hx:13, hy:4,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','进攻+'],    terrain:'平原', npcGuard:'张杨',   terrainDesc:'黄河北岸，沃野千里，洛阳屏障。' },
    { id:'luoyang',   name:'洛阳',  region:'司隶', hx:12, hy:5,  tier:1, bonusKey:'金丰', bonusKeys:['金丰','谋略+'],   terrain:'平原', npcGuard:'华雄',   terrainDesc:'九朝古都，八关锁钥，虎牢函谷拱卫。' },
    { id:'hongnong',  name:'弘农',  region:'司隶', hx:11, hy:5,  tier:2, bonusKey:'险关', bonusKeys:['险关'],    terrain:'关隘', npcGuard:'段煨',   terrainDesc:'函谷关下，西通关中，东接洛阳。' },
    { id:'huguan',    name:'虎牢关',region:'司隶', hx:13, hy:5,  tier:3, bonusKey:'险关', bonusKeys:['险关','防御+'],    terrain:'关隘', npcGuard:'华雄',   terrainDesc:'天下第一雄关，扼守洛阳东大门。' },
    { id:'tongguan',  name:'潼关',  region:'司隶', hx:11, hy:6,  tier:3, bonusKey:'险关', bonusKeys:['险关','防御+'],    terrain:'关隘', npcGuard:'李蒙',   terrainDesc:'关中东大门，崤函险道之锁钥。' },

    /* ══ 雍凉 ══ */
    { id:'changan',   name:'长安',  region:'雍凉', hx:10, hy:6,  tier:1, bonusKey:'金丰', bonusKeys:['金丰','骑兵强'],  terrain:'平原', npcGuard:'李傕',   terrainDesc:'前汉旧都，关中沃野，八百里秦川。' },
    { id:'anding',    name:'安定',  region:'雍凉', hx:9,  hy:5,  tier:2, bonusKey:'骑兵强', bonusKeys:['骑兵强'],  terrain:'山地', npcGuard:'梁兴',   terrainDesc:'泾水之畔，黄土高原，胡笳声不绝。' },
    { id:'jietingx',  name:'街亭',  region:'雍凉', hx:8,  hy:5,  tier:3, bonusKey:'险关', bonusKeys:['险关'],    terrain:'关隘', npcGuard:'马遵',   terrainDesc:'陇右门户，失此则陇道断绝。' },
    { id:'tianshui',  name:'天水',  region:'雍凉', hx:8,  hy:6,  tier:2, bonusKey:'骑兵强', bonusKeys:['骑兵强','防御+'],   terrain:'山地', npcGuard:'姜冏',   terrainDesc:'陇右重镇，胡汉杂居，出名马良将。' },
    { id:'wuwei',     name:'武威',  region:'雍凉', hx:5,  hy:5,  tier:2, bonusKey:'骑兵强', bonusKeys:['骑兵强','苦寒减产'],  terrain:'平原', npcGuard:'韩遂',   terrainDesc:'河西走廊咽喉，大漠孤烟，长河落日。' },
    { id:'xiping',    name:'西平',  region:'雍凉', hx:3,  hy:6,  tier:3, bonusKey:'苦寒减产', bonusKeys:['苦寒减产','险关'],terrain:'苦寒', npcGuard:'麴演',   terrainDesc:'湟水之滨，羌氐聚居，雪山在望。' },

    /* ══ 兖豫 ══ */
    { id:'puyang',    name:'濮阳',  region:'兖豫', hx:14, hy:4,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','防御+'],   terrain:'平原', npcGuard:'吕旷',   terrainDesc:'黄河南岸要冲，曹操与吕布鏖战之地。' },
    { id:'chenliu',   name:'陈留',  region:'兖豫', hx:14, hy:5,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','谋略+'],    terrain:'平原', npcGuard:'张邈',   terrainDesc:'曹操起兵之地，中原通衢。' },
    { id:'xuchang',   name:'许昌',  region:'兖豫', hx:13, hy:6,  tier:1, bonusKey:'金丰', bonusKeys:['金丰','谋略+'],   terrain:'平原', npcGuard:'夏侯惇', terrainDesc:'颍川之地，人才渊薮，天子所在。' },
    { id:'qiao',      name:'谯郡',  region:'兖豫', hx:14, hy:7,  tier:2, bonusKey:'进攻+', bonusKeys:['进攻+','粮丰'],   terrain:'平原', npcGuard:'夏侯渊', terrainDesc:'曹氏故乡，沛国精兵，民风彪悍。' },
    { id:'runan',     name:'汝南',  region:'兖豫', hx:13, hy:7,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰'],   terrain:'平原', npcGuard:'刘辟',   terrainDesc:'袁氏根基，门生故吏遍天下。' },

    /* ══ 徐州 ══ */
    { id:'xiaopei',   name:'小沛',  region:'徐州', hx:14, hy:6,  tier:3, bonusKey:'进攻+', bonusKeys:['进攻+'],   terrain:'平原', npcGuard:'陈宫',   terrainDesc:'沛县小城，刘备数度寄居，交通要冲。' },
    { id:'xiapi',     name:'下邳',  region:'徐州', hx:16, hy:5,  tier:1, bonusKey:'粮丰', bonusKeys:['粮丰','防御+'],   terrain:'平原', npcGuard:'臧霸',   terrainDesc:'徐州治所，泗水绕城，吕布殒命处。' },
    { id:'guangling', name:'广陵',  region:'徐州', hx:17, hy:5,  tier:2, bonusKey:'水战强', bonusKeys:['水战强','粮丰'],  terrain:'水域', npcGuard:'陈登',   terrainDesc:'长江北岸，与江东隔水相望。' },

    /* ══ 荆襄 ══ */
    { id:'wan',       name:'宛城',  region:'荆襄', hx:12, hy:7,  tier:2, bonusKey:'防御+', bonusKeys:['防御+','进攻+'],   terrain:'关隘', npcGuard:'张绣',   terrainDesc:'南阳郡治，北扼洛阳，南通襄阳。' },
    { id:'xinye',     name:'新野',  region:'荆襄', hx:12, hy:8,  tier:3, bonusKey:'进攻+', bonusKeys:['进攻+'],   terrain:'平原', npcGuard:'刘磐',   terrainDesc:'南阳南境小城，刘备屯兵之所。' },
    { id:'xiangyang', name:'襄阳',  region:'荆襄', hx:12, hy:9,  tier:1, bonusKey:'水战强', bonusKeys:['水战强','谋略+'],  terrain:'水域', npcGuard:'蔡瑁',   terrainDesc:'汉水之滨，荆州治所，水陆要冲。' },
    { id:'jiangxia',  name:'江夏',  region:'荆襄', hx:14, hy:9,  tier:2, bonusKey:'水战强', bonusKeys:['水战强','防御+'],  terrain:'水域', npcGuard:'黄祖',   terrainDesc:'长江汉水交汇，水军重镇。' },
    { id:'jiangling', name:'江陵',  region:'荆襄', hx:12, hy:10, tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','水战强'],    terrain:'平原', npcGuard:'文聘',   terrainDesc:'南郡治所，荆州粮仓军械所在。' },
    { id:'wuling',    name:'武陵',  region:'荆襄', hx:10, hy:11, tier:3, bonusKey:'蛮兵强', bonusKeys:['蛮兵强','瘴气'],  terrain:'瘴林', npcGuard:'金旋',   terrainDesc:'湘西群山，五溪蛮聚居，瘴气弥漫。' },
    { id:'changsha',  name:'长沙',  region:'荆襄', hx:13, hy:11, tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','进攻+'],   terrain:'森林', npcGuard:'韩玄',   terrainDesc:'湘江之滨，荆南重镇，黄忠坐镇。' },
    { id:'guiyang',   name:'桂阳',  region:'荆襄', hx:14, hy:12, tier:3, bonusKey:'金丰', bonusKeys:['金丰','偏远'],    terrain:'山地', npcGuard:'赵范',   terrainDesc:'湘南矿藏丰饶，金银铜铁皆出于此。' },
    { id:'lingling',  name:'零陵',  region:'荆襄', hx:11, hy:12, tier:3, bonusKey:'谋略+', bonusKeys:['谋略+','偏远'],   terrain:'森林', npcGuard:'刘度',   terrainDesc:'湘江上游，山林幽深，隐士辈出。' },

    /* ══ 扬州 ══ */
    { id:'shouchun',  name:'寿春',  region:'扬州', hx:15, hy:8,  tier:2, bonusKey:'粮丰', bonusKeys:['粮丰','进攻+'],    terrain:'平原', npcGuard:'纪灵',   terrainDesc:'淮南重镇，袁术僭号之地。' },
    { id:'hefei',     name:'合肥',  region:'扬州', hx:15, hy:9,  tier:2, bonusKey:'防御+', bonusKeys:['防御+','水战强'],   terrain:'水域', npcGuard:'刘馥',   terrainDesc:'淮南门户，东吴无数次北伐折戟之地。' },
    { id:'lujiang',   name:'庐江',  region:'扬州', hx:15, hy:10, tier:2, bonusKey:'水战强', bonusKeys:['水战强'],  terrain:'水域', npcGuard:'陆康',   terrainDesc:'大别山东麓，长江北岸，陆氏世居之地。' },
    { id:'jianye',    name:'建业',  region:'扬州', hx:16, hy:10, tier:1, bonusKey:'金丰', bonusKeys:['金丰','防御+'],   terrain:'水域', npcGuard:'凌操',   terrainDesc:'钟山龙蟠，石城虎踞，孙氏江东根基。' },
    { id:'wu',        name:'吴郡',  region:'扬州', hx:17, hy:10, tier:2, bonusKey:'金丰', bonusKeys:['金丰','水战强'],    terrain:'水域', npcGuard:'朱治',   terrainDesc:'太湖之滨，鱼米之乡，丝绸织造甲天下。' },
    { id:'chaisang',  name:'柴桑',  region:'扬州', hx:15, hy:11, tier:2, bonusKey:'水战强', bonusKeys:['水战强','谋略+'],  terrain:'水域', npcGuard:'太史慈', terrainDesc:'鄱阳湖口，周瑜操练水军之所。' },
    { id:'kuaiji',    name:'会稽',  region:'扬州', hx:18, hy:12, tier:2, bonusKey:'水战强', bonusKeys:['水战强','金丰'],  terrain:'水域', npcGuard:'王朗',   terrainDesc:'钱塘潮涌，稽山如黛，百越遗风犹存。' },
    { id:'luling',    name:'庐陵',  region:'扬州', hx:16, hy:12, tier:3, bonusKey:'蛮兵强', bonusKeys:['蛮兵强','偏远'],  terrain:'森林', npcGuard:'贺齐',   terrainDesc:'赣江之畔，山越聚居，山民骁勇。' },

    /* ══ 益州 ══ */
    { id:'wudu',      name:'武都',  region:'益州', hx:6,  hy:8,  tier:3, bonusKey:'险关', bonusKeys:['险关','苦寒减产'],    terrain:'山地', npcGuard:'杨秋',   terrainDesc:'陇南山地，氐羌杂居，雪山阻隔。' },
    { id:'yangpingg', name:'阳平关',region:'益州', hx:8,  hy:8,  tier:3, bonusKey:'险关', bonusKeys:['险关','防御+'],    terrain:'关隘', npcGuard:'杨任',   terrainDesc:'汉中西大门，扼守褒斜道入口。' },
    { id:'hanzhong',  name:'汉中',  region:'益州', hx:9,  hy:8,  tier:2, bonusKey:'险关', bonusKeys:['险关','谋略+'],    terrain:'关隘', npcGuard:'张鲁',   terrainDesc:'秦岭巴山之间，五斗米道圣地。' },
    { id:'shangyong', name:'上庸',  region:'益州', hx:11, hy:9,  tier:3, bonusKey:'防御+', bonusKeys:['防御+','险关'],   terrain:'山地', npcGuard:'申耽',   terrainDesc:'汉水中游，群山环抱。' },
    { id:'jiange',    name:'剑阁',  region:'益州', hx:6,  hy:9,  tier:3, bonusKey:'险关', bonusKeys:['险关','防御+'],    terrain:'关隘', npcGuard:'费诗',   terrainDesc:'剑门七十二峰，蜀道之天险。' },
    { id:'jiameng',   name:'葭萌关',region:'益州', hx:7,  hy:9,  tier:3, bonusKey:'险关', bonusKeys:['险关'],    terrain:'关隘', npcGuard:'孟达',   terrainDesc:'入蜀要冲，益州北大门。' },
    { id:'zitong',    name:'梓潼',  region:'益州', hx:7,  hy:10, tier:2, bonusKey:'险关', bonusKeys:['险关'],    terrain:'关隘', npcGuard:'刘璝',   terrainDesc:'剑阁之北，蜀道咽喉。' },
    { id:'chengdu',   name:'成都',  region:'益州', hx:6,  hy:11, tier:1, bonusKey:'粮丰', bonusKeys:['粮丰','金丰'],    terrain:'平原', npcGuard:'刘璋',   terrainDesc:'天府之国，锦江绕城，蜀锦甲天下。' },
    { id:'jiangzhou', name:'江州',  region:'益州', hx:8,  hy:11, tier:2, bonusKey:'水战强', bonusKeys:['水战强','粮丰'],  terrain:'水域', npcGuard:'费观',   terrainDesc:'嘉陵江与长江交汇，水路辐辏。' },
    { id:'yongan',    name:'永安',  region:'益州', hx:9,  hy:11, tier:2, bonusKey:'险关', bonusKeys:['险关','防御+'],    terrain:'关隘', npcGuard:'严颜',   terrainDesc:'三峡咽喉，白帝城高，益州东大门。' },

    /* ══ 南中 ══ */
    { id:'jianning',  name:'建宁',  region:'南中', hx:7,  hy:13, tier:2, bonusKey:'蛮兵强', bonusKeys:['蛮兵强','瘴气'],  terrain:'瘴林', npcGuard:'雍闿',   terrainDesc:'南中腹地，滇池之畔，瘴气弥漫。' },
    { id:'yunnan',    name:'云南',  region:'南中', hx:5,  hy:14, tier:3, bonusKey:'蛮兵强', bonusKeys:['蛮兵强','瘴气','偏远'],    terrain:'瘴林', npcGuard:'高定',   terrainDesc:'苍山洱海，瘴疠不绝，蛮兵以毒箭见长。' },
    { id:'yongchang', name:'永昌',  region:'南中', hx:3,  hy:14, tier:3, bonusKey:'金丰', bonusKeys:['金丰','偏远'],    terrain:'苦寒', npcGuard:'吕凯',   terrainDesc:'化外极西，产琥珀翡翠香料，路途艰险。' },
    { id:'jiaozhi',   name:'交趾',  region:'南中', hx:13, hy:14, tier:2, bonusKey:'水战强', bonusKeys:['水战强','偏远','蛮兵强'],  terrain:'水域', npcGuard:'士燮',   terrainDesc:'南海之滨，海舶云集，珠玳犀象堆积。' },
  ];

  /* ─────────────────────────────────
     道路连接
  ───────────────────────────────── */
  const ROADS = [
    ['xiangping','beiping'],['beiping','ji'],
    ['ji','nanpi'],['ji','ye'],['beiping','nanpi'],
    ['nanpi','pingyuan'],['nanpi','ye'],['ye','pingyuan'],
    ['ye','jinyang'],['ye','shangdang'],['jinyang','shangdang'],
    ['nanpi','beihai'],['pingyuan','beihai'],['pingyuan','jinan'],
    ['jinan','puyang'],['beihai','puyang'],
    ['ye','henei'],['jinyang','henei'],['shangdang','henei'],['shangdang','luoyang'],
    ['henei','luoyang'],['luoyang','hongnong'],['luoyang','huguan'],
    ['hongnong','tongguan'],['tongguan','changan'],
    ['changan','anding'],['changan','tianshui'],['anding','tianshui'],
    ['anding','wuwei'],['wuwei','xiping'],['tianshui','jietingx'],['jietingx','anding'],
    ['luoyang','xuchang'],['luoyang','puyang'],
    ['puyang','chenliu'],['puyang','xiaopei'],['chenliu','xuchang'],['xuchang','runan'],
    ['xuchang','qiao'],['qiao','runan'],
    ['qiao','xiaopei'],['xiaopei','xiapi'],['xiaopei','xuchang'],['xiapi','guangling'],
    ['luoyang','wan'],['runan','wan'],['runan','xinye'],
    ['wan','xinye'],['xinye','xiangyang'],['xiangyang','jiangling'],
    ['xiangyang','jiangxia'],['jiangling','jiangxia'],
    ['jiangling','wuling'],['jiangling','changsha'],
    ['changsha','lingling'],['changsha','guiyang'],['wuling','lingling'],
    ['guangling','shouchun'],['shouchun','hefei'],['hefei','lujiang'],
    ['lujiang','jianye'],['jianye','wu'],['jianye','chaisang'],
    ['wu','kuaiji'],['chaisang','luling'],['chaisang','lujiang'],
    ['jiangxia','hefei'],['jiangxia','jianye'],
    ['tongguan','hanzhong'],['tianshui','wudu'],['wudu','yangpingg'],['wudu','jiange'],
    ['hanzhong','yangpingg'],['yangpingg','jiange'],
    ['jiange','jiameng'],['jiameng','zitong'],['zitong','chengdu'],
    ['hanzhong','shangyong'],
    ['chengdu','jiangzhou'],['jiangzhou','yongan'],
    ['yongan','jiangling'],['yongan','chaisang'],['yongan','jiangxia'],
    ['shangyong','yongan'],['shangyong','xiangyang'],['shangyong','xinye'],
    ['chengdu','jianning'],['jiangzhou','jianning'],
    ['jianning','yunnan'],['yunnan','yongchang'],['jianning','jiaozhi'],
    ['guangling','jianye'],['guiyang','luling'],
  ];

  /* ─────────────────────────────────
     空地地形分区（按列row判断）
     规则：先判断边缘/特殊区，再按大区域
  ───────────────────────────────── */
  function _emptyTerrain(col, row) {
    // 极西苦寒（西域方向）
    if (col <= 2 && row <= 8) return '苦寒';
    if (col <= 1) return '苦寒';
    // 西平/永昌方向苦寒
    if (col <= 4 && row >= 12) return '苦寒';
    // 东北沿海（幽州/青州海域）
    if (col >= 18 && row >= 2) return '水域';
    if (col >= 19) return '水域';
    // 东南扬州水域
    if (col >= 16 && row >= 9) return '水域';
    if (col >= 17 && row >= 6) return '水域';
    // 北方苦寒（幽州北部）
    if (row <= 0 && col >= 12) return '苦寒';
    if (row <= 1 && col >= 15) return '苦寒';
    // 并州/雍凉山地
    if (col >= 9 && col <= 14 && row <= 3) return '山地';
    if (col >= 5 && col <= 9 && row <= 5) return '山地';
    // 益州山地（蜀道群山）
    if (col >= 4 && col <= 9 && row >= 7 && row <= 12) return '山地';
    // 南中瘴林
    if (col >= 4 && col <= 10 && row >= 12) return '瘴林';
    if (col <= 6 && row >= 10) return '瘴林';
    // 荆南森林
    if (col >= 10 && col <= 14 && row >= 11) return '森林';
    // 中原/平原（默认）
    return '平原';
  }

  /* 坐标转换：六边形网格 → SVG 像素（支持网格裁剪偏移） */
  function hexToXY(col, row) {
    const c = col - GRID_COL_START;
    const r = row - GRID_ROW_START;
    const x = HEX_R + 2 + c * COL_STEP;
    const y = HEX_H / 2 + 2 + r * ROW_STEP + (col % 2 === 1 ? HEX_H / 2 : 0);
    return { x, y };
  }

  /* flat-top 六边形顶点 */
  function _hexPoints(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  /* 计算网格的 viewBox（仅含显示范围内的格子） */
  function _calcViewBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let col = GRID_COL_START; col <= GRID_COL_END; col++) {
      for (let row = GRID_ROW_START; row <= GRID_ROW_END; row++) {
        const { x, y } = hexToXY(col, row);
        minX = Math.min(minX, x - HEX_R);
        minY = Math.min(minY, y - HEX_H / 2);
        maxX = Math.max(maxX, x + HEX_R);
        maxY = Math.max(maxY, y + HEX_H / 2);
      }
    }
    const pad = 8;
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }

  /* ─────────────────────────────────
     状态
  ───────────────────────────────── */
  let cityOwnership = {};
  let players = [];
  let _tooltip = null;

  function _esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ─────────────────────────────────
     公共接口
  ───────────────────────────────── */
  function init() {
    const c = document.getElementById('map-svg-container');
    if (!c) return;
    _build(c);
  }

  function _updateNpcFactionSlots() {
    // 1. 统计每个阵营的城池数
    const counts = {};
    for (const city of CITIES) {
      const ow = cityOwnership[city.name];
      if (ow && ow.owner === 'npc' && ow.faction) {
        counts[ow.faction] = (counts[ow.faction] || 0) + 1;
      }
    }

    const newSlots = {};
    const usedIdx = new Set();

    // 2. 优先分配硬绑阵营（≥3 城且在 FACTION_FIXED_SLOTS 里）
    for (const f in FACTION_FIXED_SLOTS) {
      if (counts[f] >= 3) {
        const slot = FACTION_FIXED_SLOTS[f];
        newSlots[f] = slot;
        usedIdx.add(slot);
      }
    }

    // 3. 保留仍 ≥3 城、非硬绑、且槽位未被硬绑挤占的旧映射
    for (const f in _npcFactionSlots) {
      if (counts[f] >= 3 && !(f in FACTION_FIXED_SLOTS) && newSlots[f] === undefined) {
        const oldSlot = _npcFactionSlots[f];
        if (!usedIdx.has(oldSlot)) {
          newSlots[f] = oldSlot;
          usedIdx.add(oldSlot);
        }
      }
    }

    // 4. 给新达到 ≥3 城、非硬绑、还没拿到槽的阵营分配下一个空槽
    for (const f in counts) {
      if (counts[f] >= 3 && !(f in FACTION_FIXED_SLOTS) && newSlots[f] === undefined) {
        for (let i = 0; i < NPC_FACTION_COLORS.length; i++) {
          if (!usedIdx.has(i)) {
            newSlots[f] = i;
            usedIdx.add(i);
            break;
          }
        }
      }
    }

    _npcFactionSlots = newSlots;
  }

  function _build(container) {
    _updateNpcFactionSlots();
    container.innerHTML = `
      <div class="sgmap-wrap" id="sgmap-wrap">
        ${_svg()}
      </div>`;
    let tp = document.getElementById('sgmap-tooltip');
    if (!tp) {
      tp = document.createElement('div');
      tp.id = 'sgmap-tooltip';
      tp.className = 'sgmap-tooltip';
      document.body.appendChild(tp);
    }
    _tooltip = tp;
    _bindEvents(container);

    /* 城名分级显示 */
    _updateCityLabelVisibility(container);
    const ro = new ResizeObserver(() => _updateCityLabelVisibility(container));
    ro.observe(container);
  }

  /* ─────────────────────────────────
     SVG 构建
  ───────────────────────────────── */
  function _svg() {
    const b = _calcViewBox();
    return `<svg xmlns="http://www.w3.org/2000/svg"
      id="sgmap-svg"
      viewBox="${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}"
      preserveAspectRatio="xMidYMid meet"
      style="display:block;width:100%;height:auto;">
      <defs>${_defs()}</defs>

      <!-- ── 最底层：水墨战略底图 ── -->
      <image href="images/map-bg2.jpg"
        x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}"
        width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}"
        preserveAspectRatio="xMidYMid slice"
        style="pointer-events:none;filter:saturate(0.55)"/>

      <!-- ── 暗化蒙版：压深底图，突出城池与网格 ── -->
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"
        fill="rgba(5,4,10,0.62)" style="pointer-events:none"/>

      ${_allHexes()}
    </svg>`;
  }

  /* ── 城名分级显示：容器宽 < 560px 时隐藏空城名字 ── */
  function _updateCityLabelVisibility(container) {
    const w = container.getBoundingClientRect().width;
    /* 网格 17 列，每列理论宽度对应 HEX_R*1.5 单位 */
    /* 缩放比 = 实际宽度 / 理论宽度(17列 * HEX_R*1.5*2) */
    const theoreticalW = GRID_COLS * COL_STEP * 2;
    const scale = w / theoreticalW;
    /* scale < 0.68 时只显玩家占有的城名，空城/NPC 隐藏 */
    container.querySelectorAll('.sgmap-city-label-empty').forEach(el => {
      el.style.display = scale < 0.68 ? 'none' : '';
    });
  }

  /* ─────────────────────────────────
     地形图例（右下角，SVG 坐标系内）
  ───────────────────────────────── */
  function _terrainLegend(b) {
    const items = [
      { key:'平原', label:'平原' },
      { key:'山地', label:'山地' },
      { key:'水域', label:'水域' },
      { key:'森林', label:'森林' },
      { key:'关隘', label:'关隘' },
      { key:'苦寒', label:'苦寒' },
      { key:'瘴林', label:'瘴林' },
    ];

    /* 小六边形尺寸 */
    const hr = 6.5;          // 六边形半径
    const rowH = 17;         // 每行高度
    const colW = 54;         // 每列宽度
    const cols = 4;          // 每行最多 4 个，2 行排列
    const panelW = cols * colW + 8;
    const panelH = Math.ceil(items.length / cols) * rowH + 22;

    /* 面板锚点：右下角，在四角装饰内侧 */
    const px = b.x + b.w - panelW - 16;
    const py = b.y + b.h - panelH - 16;

    /* 小六边形顶点（flat-top） */
    function miniHex(cx, cy) {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        pts.push(`${(cx + hr * Math.cos(a)).toFixed(2)},${(cy + hr * Math.sin(a)).toFixed(2)}`);
      }
      return pts.join(' ');
    }

    /* 面板背景 */
    let out = `
    <g class="sgmap-terrain-legend">
      <rect x="${px}" y="${py}" width="${panelW}" height="${panelH}"
        rx="4" fill="rgba(7,6,13,0.82)" stroke="rgba(200,155,50,0.22)" stroke-width="0.8"/>
      <text x="${px + panelW/2}" y="${py + 10}"
        font-family="'Noto Serif SC',serif" font-size="7.5" font-weight="700"
        fill="rgba(200,155,80,0.75)" text-anchor="middle" dominant-baseline="middle"
        letter-spacing="1.5">地形图例</text>`;

    items.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const ix = px + 8 + col * colW + hr;
      const iy = py + 22 + row * rowH + (rowH / 2) - 2;

      const tc = TERRAIN[item.key] || TERRAIN._default;
      /* 用稍亮一点的颜色让小图例更清晰 */
      const fillBright  = tc.fill.replace(/[\d.]+\)$/, m => (Math.min(parseFloat(m) * 2.8, 0.72)).toFixed(2) + ')');
      const strkBright  = tc.stroke.replace(/[\d.]+\)$/, m => (Math.min(parseFloat(m) * 2.2, 0.80)).toFixed(2) + ')');

      out += `
      <polygon points="${miniHex(ix, iy)}"
        fill="${fillBright}" stroke="${strkBright}" stroke-width="0.9"/>
      <text x="${ix + hr + 3}" y="${iy}"
        font-family="'Noto Serif SC',serif" font-size="7" font-weight="400"
        fill="rgba(210,190,148,0.80)" dominant-baseline="middle">${item.label}</text>`;
    });

    out += `</g>`;
    return out;
  }

  function _defs() {
    /* 落影滤镜（仅城池格使用） */
    const shadow = `
    <filter id="fshadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="#000" flood-opacity="0.75"/>
    </filter>`;
    /* 顶部高光渐变（白色系，玩家城） */
    const hlWhite = `
    <linearGradient id="hexHL" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#fff" stop-opacity="0.20"/>
      <stop offset="50%"  stop-color="#fff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>`;
    /* 顶部高光渐变（金色系，NPC城） */
    const hlGold = `
    <linearGradient id="hexHLGold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ffe8a0" stop-opacity="0.22"/>
      <stop offset="50%"  stop-color="#ffe8a0" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#ffe8a0" stop-opacity="0"/>
    </linearGradient>`;

    return `${shadow}${hlWhite}${hlGold}`;
  }

  /* ══════════════════════════════════════════════════════════════
     四层渲染拆分：
       Layer 1 — 地形底色层        _terrainLayer()
       Layer 2 — 中立地形格子网格  _neutralGridLayer()
       Layer 3 — 势力领土染色      （城池外圈已含，保留）
       Layer 4 — 城池主体层        _cityLayer()
     统一入口保持 _allHexes() 名称，内部按顺序拼接各层
  ══════════════════════════════════════════════════════════════ */

  /* ── Layer 1: 地形色调提示层（底图已有地形，此层仅做极淡色调强化）
     · fill alpha 降至原值 35%，stroke alpha 降至 45%
     · 底图水墨山川/河流纹理为主视觉，格子色彩仅辅助区域感知
  ── */
  function _terrainLayer() {
    const R = HEX_R; // 满半径，顶点精确对齐
    const parts = [];
    for (let col = GRID_COL_START; col <= GRID_COL_END; col++) {
      for (let row = GRID_ROW_START; row <= GRID_ROW_END; row++) {
        const { x, y } = hexToXY(col, row);
        parts.push(`<polygon points="${_hexPoints(x, y, R)}" fill="rgba(10,8,18,0.18)" stroke="none"/>`);
      }
    }
    return parts.join('\n');
  }

  /* ── Layer 2: 中立地形蜂巢网格（仅非城池格）
     · 半透明淡灰填充，让底图水墨透出
     · 暗金细边线，营造"中立地形"感
     · hover：灰色加深 + 暖橙金边高亮
     · pointer-events 只在格子本身，不干扰城池点击
  ── */
  function _neutralGridLayer() {
    const R = HEX_R; // 满半径，与相邻格子顶点精确重合
    const parts = [];
    for (let col = GRID_COL_START; col <= GRID_COL_END; col++) {
      for (let row = GRID_ROW_START; row <= GRID_ROW_END; row++) {
        if (_cityMap[`${col},${row}`]) continue;
        const { x, y } = hexToXY(col, row);
        const pts = _hexPoints(x, y, R);
        parts.push(
          `<polygon class="sgmap-neutral-hex" points="${pts}"` +
          ` fill="rgba(0,0,0,0.15)"` +
          ` stroke="rgba(180,150,90,0.35)" stroke-width="0.8"` +
          ` style="filter:blur(0.3px);pointer-events:none"/>`
        );
      }
    }
    return `<g class="sgmap-neutral-grid">\n${parts.join('\n')}\n</g>`;
  }

  /* ── Layer 4: 城池主体（有城格全部绘制） ── */
  function _cityLayer() {
    const R  = HEX_R;      // 满半径外边框，与中立格完全对齐
    const Ri = HEX_R - 5;  // 内圈缩进5px
    const parts = [];

    CITIES.forEach(city => {
      const { x, y } = hexToXY(city.hx, city.hy);
      const ow = cityOwnership[city.name];
      let isPlayer = false, pidx = -1, isNPC = false, color = EMPTY_C;

      if (!ow || ow.owner === '') {
        color = EMPTY_C;
      } else if (ow.owner === 'npc') {
        isNPC = true;
        const slotIdx = ow.faction != null ? _npcFactionSlots[ow.faction] : undefined;
        color = (slotIdx !== undefined) ? NPC_FACTION_COLORS[slotIdx] : NPC_C;
      } else {
        pidx = ow.playerIdx;
        color = P_COLOR[pidx] || EMPTY_C;
        isPlayer = true;
      }

      const tc         = TERRAIN[city.terrain || '平原'] || TERRAIN._default;
      const isCityOwned = isPlayer || isNPC;
      const hlGrad     = isNPC ? 'hexHLGold' : 'hexHL';
      const bonusIcon  = BONUS_ICON[city.bonusKey] || '';
      const fontSize   = 8.0;
      const fw         = 400;

      parts.push(`
      <g class="sgmap-city" data-id="${city.id}" data-name="${_esc(city.name)}" data-stroke="${color.stroke}" style="cursor:pointer">

        <!-- 外边框：满半径，与中立格对齐 -->
        <polygon points="${_hexPoints(x, y, R)}"
          fill="none" stroke="rgba(175,155,95,0.38)" stroke-width="0.8"
          style="pointer-events:none"/>

        ${isCityOwned ? `
        <!-- 城池主体（内缩） -->
        <polygon points="${_hexPoints(x, y, Ri)}"
          fill="${color.fill}"
          stroke="${color.stroke}" stroke-width="1.4"
          filter="url(#fshadow)"/>

        <!-- 势力色薄膜 -->
        <polygon points="${_hexPoints(x, y, Ri)}"
          fill="${color.film}" stroke="none"
          style="pointer-events:none"/>

        <!-- 顶部高光 -->
        <polygon points="${_hexPoints(x, y - 1, Ri * 0.86)}"
          fill="url(#${hlGrad})" stroke="none"
          style="pointer-events:none"/>

        <!-- hover 光环 -->
        <polygon class="sgmap-city-ring" points="${_hexPoints(x, y, Ri + 2)}"
          fill="none" stroke="${color.stroke}" stroke-width="2.5"
          style="opacity:0;pointer-events:none"/>

        <!-- 城名 -->
        <text x="${x}" y="${y - 1}"
          font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif"
          font-size="${fontSize}" font-weight="${fw}"
          fill="${color.text}" text-anchor="middle"
          dominant-baseline="middle"
          filter="url(#fshadow)">${_esc(city.name)}</text>

        <!-- 奖励图标 -->
        <text x="${x}" y="${y + fontSize * 0.85}"
          font-size="6.5" text-anchor="middle" dominant-baseline="middle" opacity="0.80"
          style="font-family:Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif"
          >${bonusIcon}</text>

        ` : `
        <!-- 空城内圈 -->
        <polygon points="${_hexPoints(x, y, Ri)}"
          fill="rgba(7,6,13,0.60)" stroke="rgba(180,148,72,0.13)" stroke-width="0.8"/>

        <!-- 空城城名 -->
        <text class="sgmap-city-label-empty" x="${x}" y="${y}"
          font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif"
          font-size="${fontSize}" font-weight="400"
          fill="rgba(195,162,95,0.28)"
          text-anchor="middle" dominant-baseline="middle">${_esc(city.name)}</text>
        `}
      </g>`);
    });

    return parts.join('\n');
  }

  /* ── 公共城池查找表（_terrainLayer / _neutralGridLayer 共用） ── */
  let _cityMap = {};

  /* ── 统一入口（保持旧名称，外部调用不变） ── */
  function _allHexes() {
    // 重建城池查找表
    _cityMap = {};
    CITIES.forEach(c => { _cityMap[`${c.hx},${c.hy}`] = c; });

    return (
      _terrainLayer()    + '\n' +   // L1: 水墨地形底色
      _neutralGridLayer()+ '\n' +   // L2: 中立蜂巢网格（灰色半透明）
      _cityLayer()                   // L4: 城池主体（含势力薄膜 + 高光 + 城名）
    );
  }

  /* ── 道路连线 ── */
  function _roadLines() {
    const drawn = new Set();
    return ROADS.map(([aid, bid]) => {
      const key = [aid, bid].sort().join('-');
      if (drawn.has(key)) return '';
      drawn.add(key);
      const ca = CITIES.find(c => c.id === aid);
      const cb = CITIES.find(c => c.id === bid);
      if (!ca || !cb) return '';
      const pa = hexToXY(ca.hx, ca.hy);
      const pb = hexToXY(cb.hx, cb.hy);
      const owA = cityOwnership[ca.name];
      const owB = cityOwnership[cb.name];
      const same = owA && owB
        && owA.owner !== '' && owA.owner !== 'npc'
        && owA.owner === owB.owner;
      if (same) {
        const pc = P_COLOR[owA.playerIdx] || NPC_C;
        return `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}"
          x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"
          stroke="${pc.glow}" stroke-width="1.5" stroke-opacity="0.4"
          stroke-dasharray="3.5,3" stroke-linecap="round"/>`;
      }
      return `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}"
        x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"
        stroke="rgba(255,255,255,0.04)" stroke-width="0.7"
        stroke-dasharray="2,5" stroke-linecap="round"/>`;
    }).join('');
  }

  /* ── 四角装饰 ── */
  function _borderDeco(b) {
    const cs = 12, m = b.x + 5, mt = b.y + 5;
    const mr = b.x + b.w - 5, mb = b.y + b.h - 5;
    const s = 'stroke="rgba(200,155,50,0.32)" stroke-width="1.3" stroke-linecap="square" fill="none"';
    return `
    <path d="M ${m},${mt+cs} L ${m},${mt} L ${m+cs},${mt}" ${s}/>
    <path d="M ${mr-cs},${mt} L ${mr},${mt} L ${mr},${mt+cs}" ${s}/>
    <path d="M ${m},${mb-cs} L ${m},${mb} L ${m+cs},${mb}" ${s}/>
    <path d="M ${mr-cs},${mb} L ${mr},${mb} L ${mr},${mb-cs}" ${s}/>`;
  }

  /* ─────────────────────────────────
     事件绑定
  ───────────────────────────────── */
  function _bindEvents(container) {
    container.querySelectorAll('.sgmap-city').forEach(g => {
      g.addEventListener('mouseenter', e => {
        _showTip(g, e);
        _activateRing(g);
      });
      g.addEventListener('mousemove',  e => _moveTip(e));
      g.addEventListener('mouseleave', () => {
        _hideTip();
        _deactivateRing(g);
      });
      g.addEventListener('touchstart', e => {
        const t = e.touches[0];
        _showTip(g, { clientX: t.clientX, clientY: t.clientY });
        _moveTip({ clientX: t.clientX, clientY: t.clientY });
        _activateRing(g);
        e.preventDefault();
      }, { passive: false });
    });
    document.addEventListener('touchstart', e => {
      if (!e.target.closest('.sgmap-city') && !e.target.closest('#sgmap-tooltip')) {
        _hideTip();
        container.querySelectorAll('.sgmap-city-ring').forEach(r => {
          r.style.opacity = '0';
          r.classList.remove('sgmap-ring-pulse');
        });
      }
    });
  }

  function _activateRing(g) {
    const ring = g.querySelector('.sgmap-city-ring');
    if (!ring) return;
    ring.style.opacity = '1';
    ring.classList.add('sgmap-ring-pulse');
  }

  function _deactivateRing(g) {
    const ring = g.querySelector('.sgmap-city-ring');
    if (!ring) return;
    ring.style.opacity = '0';
    ring.classList.remove('sgmap-ring-pulse');
  }

  /* ─────────────────────────────────
     平移 + 缩放（拖拽 / 滚轮 / 双指）
  ───────────────────────────────── */
  function _bindPanZoom(container) {
    const svg = document.getElementById('sgmap-svg');
    if (!svg) return;

    let scale = 1, tx = 0, ty = 0;
    let dragging = false, lastX = 0, lastY = 0;

    const MIN_SCALE = 1, MAX_SCALE = 4;

    function _apply() {
      svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
      svg.style.transformOrigin = '0 0';
    }

    function _clampTx(s) {
      const cw = container.clientWidth;
      const sw = cw * s;
      const maxTx = 0;
      const minTx = cw - sw;
      return Math.min(maxTx, Math.max(minTx, tx));
    }
    function _clampTy(s) {
      const ch = container.clientHeight;
      const sh = ch * s;
      const maxTy = 0;
      const minTy = ch - sh;
      return Math.min(maxTy, Math.max(minTy, ty));
    }

    /* 鼠标拖拽 */
    container.addEventListener('mousedown', e => {
      if (e.target.closest('.sgmap-city')) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      container.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      tx += e.clientX - lastX; ty += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      tx = _clampTx(scale); ty = _clampTy(scale);
      _apply();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      container.style.cursor = '';
    });

    /* 滚轮缩放 */
    container.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta));
      tx = ox - (ox - tx) * (ns / scale);
      ty = oy - (oy - ty) * (ns / scale);
      scale = ns;
      tx = _clampTx(scale); ty = _clampTy(scale);
      _apply();
    }, { passive: false });

    /* 双指捏合缩放 */
    let lastDist = 0;
    container.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    container.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        const rect = container.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const delta = dist / (lastDist || dist);
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * delta));
        tx = mx - (mx - tx) * (ns / scale);
        ty = my - (my - ty) * (ns / scale);
        scale = ns; lastDist = dist;
        tx = _clampTx(scale); ty = _clampTy(scale);
        _apply();
      }
    }, { passive: false });
  }

  /* ─────────────────────────────────
     Tooltip
  ───────────────────────────────── */
  function _calcProd(city, ow) {
    const tier = CITY_TIER_MAP[city.name] || '郡城';
    const base = CITY_TIER_BASE[tier];
    let gold = base.gold, food = base.food;
    const mults = [];
    (city.bonusKeys || [city.bonusKey] || []).forEach(k => {
      const m = BONUS_MULT[k]; if (!m) return;
      if (m.gold) { gold *= m.gold; mults.push({k, type:'gold', v:m.gold}); }
      if (m.food) { food *= m.food; mults.push({k, type:'food', v:m.food}); }
    });
    const isPlayer = ow && ow.owner && ow.owner !== 'npc' && ow.owner !== '';
    const chain = { base, tier, mults, policy: null };
    if (isPlayer) {
      const buffs = ow.productionBuffs ? Object.values(ow.productionBuffs) : [];
      const hasTun = buffs.some(b => b.emoji === '🌾');
      const hasShi = buffs.some(b => b.emoji === '💰');
      if (hasTun) { food *= 1.3; chain.policy = {type:'food', name:'屯田', v:1.3}; }
      if (hasShi) { gold *= 1.3; chain.policy = {type:'gold', name:'开市', v:1.3}; }

      if (chain.policy) {
        const mainBuff = buffs.find(b => b.general && b.action);
        if (mainBuff && mainBuff.general && window._generalsCache) {
          const genData = window._generalsCache[mainBuff.general];
          if (genData && genData.suitable_roles) {
            const policyName = chain.policy.name;
            if (genData.suitable_roles.includes('擅长' + policyName)) {
              if (chain.policy.type === 'gold') gold *= 1.2;
              else food *= 1.2;
              chain.adept = { general: mainBuff.general, policy: policyName };
            }
          }
        }
      }
    }
    return { gold: Math.round(gold), food: Math.round(food), chain, isPlayer };
  }

  function _showTip(g, e) {
    const name = g.dataset.name;
    const city = CITIES.find(c => c.name === name);
    if (!city || !_tooltip) return;

    const ow      = cityOwnership[name];
    const isNPC   = ow?.owner === 'npc';
    const isEmpty = !ow || ow.owner === '';
    const isPlayer= !isNPC && !isEmpty;

    // 阵营 chip
    let factionChip = '';
    if (isPlayer) {
      const p = players[ow.playerIdx];
      const pc = P_COLOR[ow.playerIdx] || EMPTY_C;
      factionChip = `<span class="sgt-faction-chip" style="background:${pc.film};border:1px solid ${pc.stroke};color:${pc.glow}">${_esc(p?.name || ow.playerName || '')}</span>`;
    } else if (isNPC && ow.faction) {
      const slotIdx = _npcFactionSlots[ow.faction];
      const c = (slotIdx !== undefined) ? NPC_FACTION_COLORS[slotIdx] : NPC_C;
      factionChip = `<span class="sgt-faction-chip" style="background:${c.film};border:1px solid ${c.stroke};color:${c.glow}">${_esc(ow.faction)}</span>`;
    } else if (isNPC) {
      factionChip = `<span class="sgt-faction-chip" style="background:${NPC_C.film};border:1px solid ${NPC_C.stroke};color:${NPC_C.glow}">群雄</span>`;
    }

    // 城等 badge
    const tier = CITY_TIER_MAP[city.name] || '郡城';
    const tierClass = tier === '雄都' ? 'tier-4' : tier === '州治' ? 'tier-3' : '';
    const tierBadge = `<span class="sgt-badge ${tierClass}">${tier}</span>`;
    const bonusBadges = (city.bonusKeys || [city.bonusKey] || [])
      .map(k => `<span class="sgt-badge">${_esc(k)}</span>`).join('');

    // 驻将
    const rawHolder = (ow?.holder || '').trim();
    const holderDisp = (rawHolder && rawHolder !== '无')
      ? rawHolder
      : (isNPC ? (city.npcGuard || '未知') : '暂无');

    // 兵力
    const troops = ow?.troops || {};
    const hasTroop = Object.keys(troops).some(k => (troops[k] || 0) > 0);
    let troopHtml = '';
    const _chips = (t) => TROOP_TYPES.filter(k => (t[k]||0) > 0)
      .map(k => `<span class="sgt-troop-chip"><b>${k}</b><span>${Number(t[k]).toLocaleString()}</span></span>`).join('');
    if (isPlayer) {
      troopHtml = hasTroop
        ? `<div class="sgt-row sgt-troops"><span class="sgt-lbl">兵力</span><span class="sgt-troop-list">${_chips(troops)}</span></div>`
        : `<div class="sgt-row sgt-troops"><span class="sgt-lbl">兵力</span><span class="sgt-dim">无兵</span></div>`;
    } else if (isNPC && hasTroop) {
      troopHtml = `<div class="sgt-row sgt-troops"><span class="sgt-lbl">兵力</span><span class="sgt-troop-list">${_chips(troops)}</span></div>`;
    }

    // 产出
    const prod = _calcProd(city, ow);
    const multStr = prod.chain.mults.map(m => {
      const icon = m.type === 'gold' ? '💰' : '🌾';
      return `${_esc(m.k)}(${icon}×${m.v})`;
    }).join(' · ');
    let chainHtml = `<span class="ch-step">基础 <b>${prod.chain.base.gold}金/${prod.chain.base.food}粮</b></span>`;
    if (multStr) chainHtml += `<span class="ch-arrow">›</span><span class="ch-step">${multStr}</span>`;
    if (prod.chain.policy) {
      const icon = prod.chain.policy.type === 'gold' ? '💰' : '🌾';
      chainHtml += `<span class="ch-arrow">›</span><span class="ch-policy">${icon} ${prod.chain.policy.name} ${icon}+30%</span>`;
    }
    if (prod.chain.adept) {
      chainHtml += `<span class="ch-arrow">›</span><span class="ch-adept">太守契合 +20%</span>`;
    }

    // 主政 badge
    let badgeRow = '';
    if (isPlayer) {
      const buffs = ow?.productionBuffs ? Object.values(ow.productionBuffs) : [];
      badgeRow = buffs.filter(b => b.general && b.action).map(b =>
        `<span class="sgt-prod-mini-badge policy">${_esc(b.emoji||'')} ${_esc(b.general)} · ${_esc(b.action)}</span>`
      ).join('');
    }

    const prodTitle = isPlayer ? '📊 预计本回合产出' : '📊 攻下后基础产出';
    const prodTag = isPlayer ? '含修正' : '仅基础+地利';

    _tooltip.innerHTML = `
      <div class="sgt-header">
        <div class="sgt-name">${_esc(city.name)}</div>
        ${factionChip}
        <div class="sgt-badges">${tierBadge}${bonusBadges}</div>
      </div>
      <div class="sgt-desc">${_esc(city.terrainDesc)}</div>
      <div class="sgt-info-block">
        <div class="sgt-row sgt-holder"><span class="sgt-lbl">驻将</span><b>${_esc(holderDisp)}</b></div>
        ${troopHtml}
      </div>
      ${isEmpty ? '' : `
      <div class="sgt-prod-block">
        <div class="sgt-prod-block-title">${prodTitle}<span class="pt-tag">${prodTag}</span></div>
        <div class="sgt-prod-main">
          <span class="sgt-prod-item"><span class="sgt-prod-emoji">💰</span><span class="sgt-prod-approx">约</span><span class="sgt-prod-num">${prod.gold}</span><span class="sgt-prod-unit">金</span></span>
          <span class="sgt-prod-item"><span class="sgt-prod-emoji">🌾</span><span class="sgt-prod-approx">约</span><span class="sgt-prod-num">${prod.food}</span><span class="sgt-prod-unit">粮</span></span>
        </div>
        <div class="sgt-prod-chain">${chainHtml}</div>
        ${badgeRow ? `<div class="sgt-prod-badge-row">${badgeRow}</div>` : ''}
      </div>`}`;
    _tooltip.classList.add('visible');
    _moveTip(e);
  }

  function _moveTip(e) {
    if (!_tooltip) return;
    const PAD = 10, tw = _tooltip.offsetWidth || 230, th = _tooltip.offsetHeight || 130;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (window.matchMedia('(pointer:coarse)').matches) {
      _tooltip.style.left   = PAD + 'px';
      _tooltip.style.right  = PAD + 'px';
      _tooltip.style.width  = 'auto';
      _tooltip.style.bottom = (PAD + 10) + 'px';
      _tooltip.style.top    = 'auto';
      return;
    }
    _tooltip.style.right = ''; _tooltip.style.bottom = ''; _tooltip.style.width = '';
    let lx = e.clientX + 14, ty = e.clientY + 14;
    if (lx + tw > vw - PAD) lx = e.clientX - tw - 14;
    if (ty + th > vh - PAD) ty = e.clientY - th - 14;
    if (lx < PAD) lx = PAD;
    if (ty < PAD) ty = PAD;
    _tooltip.style.left = lx + 'px';
    _tooltip.style.top  = ty + 'px';
  }

  function _hideTip() {
    if (_tooltip) _tooltip.classList.remove('visible');
  }

  /* ─────────────────────────────────
     图例
  ───────────────────────────────── */
  function _updateLegend() {
    setTimeout(() => {
      const el = document.getElementById('sgmap-legend');
      if (!el) return;
      const cnt = {};
      CITIES.forEach(c => {
        const ow = cityOwnership[c.name];
        if (!ow || ow.owner === '' || ow.owner === 'npc') return;
        cnt[ow.playerIdx] = (cnt[ow.playerIdx] || 0) + 1;
      });
      let html = players.map((p, i) => {
        const pc = P_COLOR[i]; if (!pc) return '';
        return `<span class="sgmap-legend-item">
          <span class="sgmap-legend-dot" style="background:${pc.stroke};box-shadow:0 0 5px ${pc.glow}"></span>
          <span style="color:${pc.glow};font-weight:700">${_esc(p.name || '城主' + '甲乙丙'[i])}</span>
          <span style="color:var(--text-dim);font-size:.65rem"> ${cnt[i] || 0}城</span>
        </span>`;
      }).join('');

      // 已上色的 NPC 阵营图例
      const factionList = Object.entries(_npcFactionSlots);
      for (const [faction, idx] of factionList) {
        const c = NPC_FACTION_COLORS[idx];
        const cnt = Object.values(cityOwnership).filter(o => o.owner === 'npc' && o.faction === faction).length;
        html += `<span class="sgmap-legend-item">
          <span class="sgmap-legend-dot" style="background:${c.stroke};box-shadow:0 0 5px ${c.glow}"></span>
          <span style="color:${c.glow};font-weight:700">${_esc(faction)}</span>
          <span style="color:var(--text-dim);font-size:.65rem"> ${cnt}城</span>
        </span>`;
      }

      const npcCnt = Object.values(cityOwnership).filter(o => o.owner === 'npc').length;
      html += `<span class="sgmap-legend-item">
        <span class="sgmap-legend-dot" style="background:${NPC_C.stroke}"></span>
        <span style="color:${NPC_C.glow};font-weight:700">NPC</span>
        <span style="color:var(--text-dim);font-size:.65rem"> ${npcCnt}城</span>
      </span>`;
      el.innerHTML = html;
    }, 0);
  }

  /* ─────────────────────────────────
     解析城池归属（旧格式降级）
  ───────────────────────────────── */
  function parseCityOwnership(ps, rawTexts) {
    const result = {};
    CITIES.forEach(c => {
      result[c.name] = {
        owner:'npc', playerIdx:-1, playerName:'',
        holder: c.npcGuard || '', troops:{}, isMulti:false,
      };
    });
    (ps || []).forEach((p, i) => {
      if (p.cities_list && p.cities_list.length) {
        p.cities_list.forEach((cl, ci) => {
          const found = CITIES.find(c => c.name === cl.name);
          if (found) result[found.name] = {
            owner:`p${i}`, playerIdx:i, playerName:p.name,
            holder:(cl.holder && cl.holder !== '无') ? cl.holder : '',
            troops: cl.troops || {}, isMulti: ci > 0,
          };
        });
      } else if (p.city?.trim() && p.city !== '——') {
        const found = CITIES.find(c => c.name === p.city.trim());
        if (found) result[found.name] = {
          owner:`p${i}`, playerIdx:i, playerName:p.name,
          holder:'', troops:{}, isMulti:false,
        };
      }
    });
    if (rawTexts) {
      const texts = Array.isArray(rawTexts) ? rawTexts : [rawTexts];
      texts.forEach(txt => {
        if (!txt) return;
        const re = /(?:攻占|占领|夺取|攻下|收复|拿下)\s*了?\s*([^\s，,。！]{2,5})/g;
        let m;
        while ((m = re.exec(txt)) !== null) {
          const cn = m[1].replace(/城$/, '').trim();
          const city = CITIES.find(c => c.name === cn);
          if (!city) continue;
          const before = txt.slice(Math.max(0, m.index - 150), m.index);
          for (let i = 0; i < (ps || []).length; i++) {
            if (ps[i]?.name && before.includes(ps[i].name)) {
              result[city.name] = {
                owner:`p${i}`, playerIdx:i, playerName:ps[i].name,
                holder:'', troops:{}, isMulti:true,
              };
              break;
            }
          }
        }
      });
    }
    return result;
  }

  /* ─────────────────────────────────
     公开 API
  ───────────────────────────────── */
  return {
    init,
    getCityMeta(name) {
      const c = CITIES.find(x => x.name === name);
      if (!c) return null;
      return { name: c.name, region: c.region, tier: c.tier, terrain: c.terrain, bonusKeys: c.bonusKeys || [c.bonusKey] };
    },
    update(newPlayers, cityMap) {
      players       = newPlayers || [];
      cityOwnership = cityMap    || {};
      const c = document.getElementById('map-svg-container');
      if (!c) return;
      _build(c);
      _updateLegend();
    },
    parseCityOwnership,
    CITIES,
    P_COLOR,
  };

})();
