/**
 * achievements.js — 三国志文字版 · 成就系统 v1
 * v1 (2026-XX-XX 工单#ach-skeleton-A): 模块骨架 + 50 条成就定义 + 检测引擎
 *
 * 设计要点:
 *  - 纯派生:不持久化,每次 detect() 重算
 *  - 三玩家独立判定
 *  - 仅基于前端已有字段判定,GM 不参与
 *
 * 公开 API:
 *  SGAch.detect(rounds)         -> [{slot,unlocked:[{id,round}], all:[...]}, x3]
 *  SGAch.getMostRare(slot)      -> {id,name,rarity,round} | null
 *  SGAch.getCounts(slot)        -> {unlocked,total}
 *  SGAch.getAll()               -> 50 条原始定义
 *  SGAch.getRarityRank(rarity)  -> 0-4 数字(legendary=4)
 *  SGAch.open(slot)             -> 占位,工单 B 实装
 *  SGAch.close()                -> 占位,工单 B 实装
 *
 * 内部缓存最近一次 detect 结果,供 getMostRare/getCounts 同步读取。
 */
window.SGAch = (function () {
  'use strict';

  // ─────────────────────────────────────────
  //  常量表
  // ─────────────────────────────────────────

  // 城等查表(对齐 map.js 的 CITY_TIER_MAP)
  const CITY_TIER = {
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

  // 险关地利标签(用于 take_fortress)
  const FORTRESS_CITIES = new Set([
    '上党','弘农','虎牢关','潼关','街亭',
    '汉中','上庸','梓潼','永安','剑阁','葭萌关','阳平关',
  ]);

  // 六大强力势力大本营(锁定)
  const STRONGHOLD_CITIES = new Set(['邺城','许昌','长安','洛阳','建业','成都']);

  // 传奇级武将白名单
  const LEGENDARY_GENERALS = new Set([
    '关羽','张飞','赵云','诸葛亮','周瑜','司马懿','张辽','郭嘉','陆逊',
    '黄忠','马超','典韦','许褚','夏侯惇','夏侯渊','太史慈','甘宁','姜维',
    '庞统','法正','荀彧','贾诩','邓艾','陆抗',
  ]);

  // 五虎将
  const FIVE_TIGERS = new Set(['关羽','张飞','赵云','马超','黄忠']);
  // 五子良将
  const FIVE_GOOD = new Set(['张辽','乐进','于禁','张郃','徐晃']);
  // 江东十二虎臣
  const JIANGDONG_TIGERS = new Set([
    '程普','黄盖','韩当','蒋钦','周泰','陈武','董袭','甘宁','凌统','徐盛','潘璋','丁奉',
  ]);

  // 父子组合(6 对)
  const FATHER_SON_PAIRS = [
    ['孙坚','孙策'],['孙坚','孙权'],['马腾','马超'],
    ['关羽','关平'],['关羽','关兴'],['张飞','张苞'],
  ];

  // 稀有度排序(数值越大越稀有)
  const RARITY_RANK = { bronze:0, common:1, rare:2, epic:3, legendary:4 };
  const RARITY_LABEL = { bronze:'青铜', common:'普通', rare:'稀有', epic:'史诗', legendary:'传说' };

  // ─────────────────────────────────────────
  //  50 条成就定义
  //  trigger(ctx) -> boolean,unlock 判定纯函数
  //  ctx = { self, rounds, currentRound, history }
  //    self: 0/1/2
  //    rounds: 全部历史回合数组(按时间顺序)
  //    currentRound: 最后一回合
  //    history: 预计算的辅助数据(见 buildHistory)
  // ─────────────────────────────────────────
  const ACHIEVEMENTS = [
    {id:'first_recruit',name:'招贤纳士',rarity:'bronze',category:'开局',
      desc:'麾下首次新增一员武将。乱世立身,先在得人,一旅之始,始于一人。',
      trigger:(ctx)=>{
        const me = ctx.currentRound.parsed.players.find(p=>p.slot===['甲','乙','丙'][ctx.self]);
        if (!me) return false;
        const baseline = ctx.history.firstGenCount[ctx.self];
        return (me.generals?.length || 0) > baseline;
      }},
    {id:'first_sortie',name:'首度出征',rarity:'bronze',category:'开局',
      desc:'麾下兵马首次离开本城。旌旗一动,天下侧目,自此与乱世共呼吸。',
      trigger:(ctx)=>ctx.history.everTransited[ctx.self]},
    {id:'first_blood',name:'初阵告捷',rarity:'bronze',category:'开局',
      desc:'首场战斗便奏凯歌。沙场无侥幸,一鼓作气见真章。',
      trigger:(ctx)=>ctx.history.firstWinRound[ctx.self] != null},
    {id:'first_city',name:'破城而入',rarity:'bronze',category:'开局',
      desc:'首次将一座城纳入治下。鼓角声中城头易帜,自此名实皆为主公。',
      trigger:(ctx)=>ctx.history.maxCities[ctx.self] >= 2},
    {id:'first_county',name:'得一郡城',rarity:'bronze',category:'开局',
      desc:'麾下首次拥有一座郡城。州郡之要,户口辐辏,自此方有钱粮供养精兵。',
      trigger:(ctx)=>ctx.history.ownedTiers[ctx.self].has('郡城')},
    {id:'first_general_fall',name:'马革裹尸',rarity:'bronze',category:'开局',
      desc:'首位麾下武将沙场殒命。乱世为将,生死有命,姓名留于碑石,魂魄归于山河。',
      trigger:(ctx)=>ctx.history.everSawStatus[ctx.self].has('阵亡')},
    {id:'three_cities',name:'鼎足初成',rarity:'bronze',category:'扩张',
      desc:'治下城池达三座。三足而立,基业雏成,自此可与诸侯论短长。',
      trigger:(ctx)=>ctx.history.maxCities[ctx.self] >= 3},
    {id:'five_cities',name:'五城连袂',rarity:'bronze',category:'扩张',
      desc:'治下城池达五座。烽燧相望,旌节相接,已成一方气候。',
      trigger:(ctx)=>ctx.history.maxCities[ctx.self] >= 5},
    {id:'ten_cities',name:'十城连横',rarity:'common',category:'扩张',
      desc:'治下城池达十座。一州之地半在掌中,关山虽远,马首所向皆为疆土。',
      trigger:(ctx)=>ctx.history.maxCities[ctx.self] >= 10},
    {id:'fifteen_cities',name:'十五连城',rarity:'rare',category:'扩张',
      desc:'治下城池达十五座。烽火台连绵不绝,粮道纵横如织,霸业之相已显。',
      trigger:(ctx)=>ctx.history.maxCities[ctx.self] >= 15},
    {id:'take_state_capital',name:'据有州治',rarity:'common',category:'扩张',
      desc:'首次攻下一座州治。坐拥州治,可号令一方,文武百官皆望风而拜。',
      trigger:(ctx)=>ctx.history.conqueredTiers[ctx.self].has('州治')},
    {id:'take_metropolis',name:'雄都易主',rarity:'rare',category:'扩张',
      desc:'首次将一座雄都纳入治下。洛许邺业,长安成建,得其一便可窥天下。',
      trigger:(ctx)=>ctx.history.conqueredTiers[ctx.self].has('雄都')},
    {id:'take_fortress',name:'险关在握',rarity:'common',category:'扩张',
      desc:'首次攻下一座带险关标签的城池。一夫当关,万夫莫开,自此进可攻退可守。',
      trigger:(ctx)=>{
        for (const c of ctx.history.conqueredCities[ctx.self]) {
          if (FORTRESS_CITIES.has(c)) return true;
        }
        return false;
      }},
    {id:'three_in_row',name:'连下三城',rarity:'rare',category:'扩张',
      desc:'三回合内连续攻下三座城池。兵贵神速,势如破竹,敌方未及合纵已先溃。',
      trigger:(ctx)=>{
        const arr = ctx.history.conquestByRound[ctx.self]; // [{round,count}]
        for (let i=0;i<arr.length;i++){
          let sum = 0;
          for (let j=i;j<arr.length && arr[j].round <= arr[i].round+2;j++) sum += arr[j].count;
          if (sum >= 3) return true;
        }
        return false;
      }},
    {id:'take_three_metropolis',name:'三都归心',rarity:'legendary',category:'扩张',
      desc:'单局之内攻下三座雄都。洛邑长安、邺城建业、许成之属,得其三者,天下已半。',
      trigger:(ctx)=>{
        let n=0;
        for (const c of ctx.history.conqueredCities[ctx.self]) {
          if (CITY_TIER[c] === '雄都') n++;
        }
        return n >= 3;
      }},
    {id:'twenty_cities',name:'二十连城',rarity:'legendary',category:'扩张',
      desc:'治下城池达二十座,达成胜利之基。山河半属一人,天下侧目而望。',
      trigger:(ctx)=>ctx.history.maxCities[ctx.self] >= 20},
    {id:'field_victory',name:'野战奏凯',rarity:'bronze',category:'战斗',
      desc:'首次在野外击败敌军。山林为阵,溪水为壕,胜负不系于城池高低。',
      trigger:(ctx)=>{
        for (const rd of ctx.rounds){
          for (const b of (rd.parsed.battles||[])){
            if (b.attackerSlot===ctx.self && b.result==='胜' && (!b.city || b.city==='')) return true;
          }
        }
        return false;
      }},
    {id:'siege_master',name:'攻城拔寨',rarity:'common',category:'战斗',
      desc:'累计攻下五座城池。云梯叠云,鼓声如雷,城头一面又一面易帜。',
      trigger:(ctx)=>ctx.history.conqueredCities[ctx.self].size >= 5},
    {id:'outnumbered_win',name:'以寡敌众',rarity:'rare',category:'战斗',
      desc:'以明显劣势兵力赢得一战。败势之中现奇兵,寡可胜众,势可逆转。',
      trigger:(ctx)=>{
        for (const rd of ctx.rounds){
          for (const b of (rd.parsed.battles||[])){
            if (b.attackerSlot===ctx.self && b.result==='胜' &&
                b.defender_loss >= b.attacker_loss * 2.5 && b.attacker_loss > 0) return true;
          }
        }
        return false;
      }},
    {id:'low_casualty_win',name:'兵不血刃',rarity:'rare',category:'战斗',
      desc:'一场胜战中己方伤亡不足守军伤亡三分之一。运筹于幄,克敌于阵,锋刃未沾血而功成。',
      trigger:(ctx)=>{
        for (const rd of ctx.rounds){
          for (const b of (rd.parsed.battles||[])){
            if (b.attackerSlot===ctx.self && b.result==='胜' &&
                b.defender_loss >= b.attacker_loss * 3 && b.attacker_loss > 0) return true;
          }
        }
        return false;
      }},
    {id:'defend_capital',name:'孤城死守',rarity:'common',category:'战斗',
      desc:'作为守方击退一次敌军进攻。城在人在,一夫立于雉堞之上,千军止于护城之外。',
      trigger:(ctx)=>{
        for (const rd of ctx.rounds){
          for (const b of (rd.parsed.battles||[])){
            if (b.defenderSlot===ctx.self && b.result==='负') return true;
          }
        }
        return false;
      }},
    {id:'win_streak_five',name:'五战连捷',rarity:'rare',category:'战斗',
      desc:'累计五场战斗连续告捷。鼓未停而捷报又至,士气如沸,旌旗所指无不破。',
      trigger:(ctx)=>{
        let streak = 0;
        for (const rd of ctx.rounds){
          for (const b of (rd.parsed.battles||[])){
            if (b.attackerSlot===ctx.self){
              if (b.result==='胜'){ streak++; if (streak >= 5) return true; }
              else streak = 0;
            }
          }
        }
        return false;
      }},
    {id:'slay_named_general',name:'阵斩敌将',rarity:'common',category:'战斗',
      desc:'首次于战中斩杀一员敌将。一骑当先,长戈过处,敌阵中一名将名归青史。',
      trigger:(ctx)=>ctx.history.slainEnemies[ctx.self] >= 1},
    {id:'slay_three_generals',name:'三将授首',rarity:'rare',category:'战斗',
      desc:'累计在战斗中导致三员敌将阵亡。沙场点将名册愈薄,刀光过处皆为绝响。',
      trigger:(ctx)=>ctx.history.slainEnemies[ctx.self] >= 3},
    {id:'epic_battle',name:'尸横遍野',rarity:'epic',category:'战斗',
      desc:'单场战斗双方伤亡总和过万。血流漂橹,白骨蔽野,自此一战写入史册。',
      trigger:(ctx)=>{
        for (const rd of ctx.rounds){
          for (const b of (rd.parsed.battles||[])){
            if ((b.attackerSlot===ctx.self || b.defenderSlot===ctx.self) &&
                (b.attacker_loss + b.defender_loss) >= 10000) return true;
          }
        }
        return false;
      }},
    {id:'take_stronghold',name:'拔其根本',rarity:'epic',category:'战斗',
      desc:'攻下一座强力势力大本营。一城既破,一姓已亡,中原震动,诸侯失色。',
      trigger:(ctx)=>{
        for (const c of ctx.history.conqueredCities[ctx.self]){
          if (STRONGHOLD_CITIES.has(c)) return true;
        }
        return false;
      }},
    {id:'raze_faction',name:'覆其宗庙',rarity:'epic',category:'战斗',
      desc:'亲手令一个 NPC 阵营彻底覆灭。山河变色,旧主成尘,昔日割据自此归于一统。',
      trigger:(ctx)=>ctx.history.razedFactions[ctx.self] >= 1},
    {id:'kill_two_birds',name:'一鼓双城',rarity:'rare',category:'战斗',
      desc:'同一回合内攻下两座城池。鼓声两起,旌旗双立,势如双刃同剖一囊。',
      trigger:(ctx)=>{
        for (const item of ctx.history.conquestByRound[ctx.self]){
          if (item.count >= 2) return true;
        }
        return false;
      }},
    {id:'rich_man',name:'府库充盈',rarity:'bronze',category:'内政',
      desc:'金币首次累积至 1500。仓廪既实而后知礼节,钱粮足而后兵戈精。',
      trigger:(ctx)=>ctx.history.maxGold[ctx.self] >= 1500},
    {id:'grain_mountain',name:'积粟如山',rarity:'common',category:'内政',
      desc:'粮草首次累积至 15000。屯田之利,日久方见,囷仓相望,十年之储。',
      trigger:(ctx)=>ctx.history.maxFood[ctx.self] >= 15000},
    {id:'great_army',name:'带甲十万',rarity:'rare',category:'内政',
      desc:'麾下兵力首次突破一万。旌旗蔽日,甲胄连营,自此可与中原诸侯并论。',
      trigger:(ctx)=>ctx.history.maxTroop[ctx.self] >= 10000},
    {id:'popular_lord',name:'民心所向',rarity:'common',category:'内政',
      desc:'民心首次达到 90 及以上。箪食壶浆,父老相迎,主公之名已传于阡陌。',
      trigger:(ctx)=>ctx.history.maxMorale[ctx.self] >= 90},
    {id:'morale_full',name:'万民归心',rarity:'rare',category:'内政',
      desc:'民心达到满值 100。野无饿殍,路不拾遗,治世之象初现于乱世。',
      trigger:(ctx)=>ctx.history.maxMorale[ctx.self] >= 100},
    {id:'stable_rule',name:'长治久安',rarity:'rare',category:'内政',
      desc:'连续五回合民心保持 85 以上。岁稔时和,百姓乐业,主公之德渐入人心。',
      trigger:(ctx)=>ctx.history.moraleStreak85[ctx.self] >= 5},
    {id:'ten_cities_held',name:'坐拥十城',rarity:'common',category:'内政',
      desc:'稳守十座城池满三回合,内政有方。十城之地,户口殷实,赋税岁入,可养精兵数万。',
      trigger:(ctx)=>ctx.history.cities10Streak[ctx.self] >= 3},
    {id:'recruit_legendary',name:'贤臣来归',rarity:'epic',category:'武将',
      desc:'麾下首次入一员传奇级名将。良禽择木,贤臣择主,自此可与天下英才论高下。',
      trigger:(ctx)=>{
        for (const name of ctx.history.everGenerals[ctx.self]){
          if (LEGENDARY_GENERALS.has(name)) return true;
        }
        return false;
      }},
    {id:'five_generals',name:'五将齐聚',rarity:'common',category:'武将',
      desc:'麾下同时拥有五员武将。五人之众,可分守五方,亦可合击一处。',
      trigger:(ctx)=>ctx.history.maxGenerals[ctx.self] >= 5},
    {id:'ten_generals',name:'群英荟萃',rarity:'rare',category:'武将',
      desc:'麾下武将达十人之众。文有谋臣,武有勇将,坐而论道,起而执戈。',
      trigger:(ctx)=>ctx.history.maxGenerals[ctx.self] >= 10},
    {id:'five_tigers',name:'五虎入帐',rarity:'epic',category:'武将',
      desc:'麾下同时拥有五虎将中任意三人。关张赵马黄,得其半亦可横扫西州。',
      trigger:(ctx)=>checkAliveSetMaxOverlap(ctx, FIVE_TIGERS) >= 3},
    {id:'five_good',name:'五子在列',rarity:'epic',category:'武将',
      desc:'麾下同时拥有五子良将中任意三人。张乐于张徐,皆魏之爪牙,得三可比方面之任。',
      trigger:(ctx)=>checkAliveSetMaxOverlap(ctx, FIVE_GOOD) >= 3},
    {id:'jiangdong_tigers',name:'江东虎臣',rarity:'epic',category:'武将',
      desc:'麾下同时拥有江东十二虎臣中任意三人。程黄韩蒋周陈董甘凌徐潘丁,各领一州亦无愧。',
      trigger:(ctx)=>checkAliveSetMaxOverlap(ctx, JIANGDONG_TIGERS) >= 3},
    {id:'wolong_fengchu',name:'卧龙凤雏',rarity:'legendary',category:'武将',
      desc:'同时收得诸葛亮与庞统。卧龙凤雏,得一可安天下,二者并立,神鬼当避。',
      trigger:(ctx)=>{
        for (const rd of ctx.rounds){
          const me = rd.parsed.players.find(p=>p.slot===['甲','乙','丙'][ctx.self]);
          if (!me) continue;
          const alive = (me.generals||[]).filter(g=>g.status!=='阵亡').map(g=>g.name);
          if (alive.includes('诸葛亮') && alive.includes('庞统')) return true;
        }
        return false;
      }},
    {id:'father_son',name:'父子同营',rarity:'rare',category:'武将',
      desc:'麾下同时拥有一对三国父子名将。家学相传,血脉相承,父执戈而子持戟。',
      trigger:(ctx)=>{
        for (const rd of ctx.rounds){
          const me = rd.parsed.players.find(p=>p.slot===['甲','乙','丙'][ctx.self]);
          if (!me) continue;
          const alive = new Set((me.generals||[]).filter(g=>g.status!=='阵亡').map(g=>g.name));
          for (const [a,b] of FATHER_SON_PAIRS){
            if (alive.has(a) && alive.has(b)) return true;
          }
        }
        return false;
      }},
    {id:'long_serve',name:'肱股之臣',rarity:'common',category:'武将',
      desc:'有一员武将随主公征战二十回合以上。共历风霜,同饮兵血,主臣之分自此牢不可破。',
      trigger:(ctx)=>ctx.history.maxGenServeRounds[ctx.self] >= 20},
    {id:'faction_pressure',name:'削藩有功',rarity:'common',category:'暗战',
      desc:'令一个 NPC 阵营丢失三座以上城池。其势既衰,其威自损,墙倒众人推之时也。',
      trigger:(ctx)=>{
        const lost = ctx.history.factionCityLoss; // {faction: {lost,bySelf:[0/1/2 sets]}}
        for (const f in lost){
          if (lost[f].lost >= 3 && lost[f].bySelf[ctx.self] > 0) return true;
        }
        return false;
      }},
    {id:'besieged',name:'四面楚歌',rarity:'rare',category:'悲情',
      desc:'本玩家所有持城同时被敌方阵营城池围绕,绝境之中犹存战意。山河四塞,一灯独明,主臣相顾而不言。',
      trigger:(ctx)=>ctx.history.besiegedEver[ctx.self]},
    {id:'no_war_five',name:'韬光养晦',rarity:'rare',category:'暗战',
      desc:'连续五回合无任何涉己战斗,默默经营。藏锋于鞘,蓄势于野,一朝出鞘必雷霆万钧。',
      trigger:(ctx)=>ctx.history.noWarStreak[ctx.self] >= 5},
    {id:'lord_wounded',name:'折翼归阵',rarity:'rare',category:'悲情',
      desc:'麾下大将曾陷入受伤而后归队。九死一生,血染征袍,归来不忘旧时盟。',
      trigger:(ctx)=>ctx.history.woundedRecovered[ctx.self]},
    {id:'rise_from_exile',name:'流亡归位',rarity:'epic',category:'悲情',
      desc:'曾失去所有城池而后再度夺得城池。山穷水尽之时未折,绝处逢生之地复起。',
      trigger:(ctx)=>ctx.history.exileRecovered[ctx.self]},
    {id:'fallen_hero',name:'良将折戟',rarity:'bronze',category:'悲情',
      desc:'麾下一员武将于战中重伤未愈。一臂之伤,半年不能执戈,沙场之险,人各有时。',
      trigger:(ctx)=>ctx.history.everSawStatus[ctx.self].has('受伤')},
    {id:'plague_survive',name:'瘟疫不侵',rarity:'common',category:'悲情',
      desc:'麾下武将曾患病而后痊愈。瘴疠之地,药石难求,得归者皆为天幸。',
      trigger:(ctx)=>ctx.history.illRecovered[ctx.self]},
  ];

  // ─────────────────────────────────────────
  //  辅助:检查同一回合内,某玩家健康武将与给定集合的最大重叠数
  // ─────────────────────────────────────────
  function checkAliveSetMaxOverlap(ctx, set){
    let maxOverlap = 0;
    for (const rd of ctx.rounds){
      const me = rd.parsed.players.find(p=>p.slot===['甲','乙','丙'][ctx.self]);
      if (!me) continue;
      let n = 0;
      for (const g of (me.generals||[])){
        if (g.status !== '阵亡' && set.has(g.name)) n++;
      }
      if (n > maxOverlap) maxOverlap = n;
    }
    return maxOverlap;
  }

  // ─────────────────────────────────────────
  //  预计算历史辅助数据(只跑一次,供 trigger 复用)
  // ─────────────────────────────────────────
  function buildHistory(rounds){
    const h = {
      firstGenCount: [0,0,0],
      everTransited: [false,false,false],
      firstWinRound: [null,null,null],
      maxCities:    [0,0,0],
      ownedTiers:   [new Set(),new Set(),new Set()],
      everSawStatus:[new Set(),new Set(),new Set()],
      conqueredCities:[new Set(),new Set(),new Set()],
      conqueredTiers: [new Set(),new Set(),new Set()],
      conquestByRound:[[],[],[]],
      slainEnemies: [0,0,0],
      maxGold:[0,0,0], maxFood:[0,0,0], maxTroop:[0,0,0], maxMorale:[0,0,0],
      maxGenerals:[0,0,0],
      moraleStreak85:[0,0,0],
      cities10Streak:[0,0,0],
      everGenerals:[new Set(),new Set(),new Set()],
      maxGenServeRounds:[0,0,0],
      factionCityLoss: {}, // {factionName: {lost, bySelf:[0,0,0]}}
      besiegedEver: [false,false,false],
      noWarStreak: [0,0,0],
      woundedRecovered:[false,false,false],
      exileRecovered:[false,false,false],
      illRecovered:[false,false,false],
      razedFactions:[0,0,0],
    };

    const slotChar = ['甲','乙','丙'];
    const moraleStreak = [0,0,0];
    const cities10Streak = [0,0,0];
    const noWarStreak = [0,0,0];
    const genFirstRound = [{},{},{}]; // {name: round}
    const genLastRound  = [{},{},{}]; // {name: round}
    const prevOwnership = {}; // {city: faction} 前一回合所有权快照
    const woundedSeen   = [{},{},{}];
    const illSeen       = [{},{},{}];
    const startCities   = [null,null,null]; // 开局持城数
    const exileEver     = [false,false,false];

    rounds.forEach((rd, idx) => {
      const players = rd.parsed.players || [];
      const battles = rd.parsed.battles || [];
      const transit = rd.parsed.transit || [];
      const ownership = rd.parsed.cityOwnership || {};

      // 初始化首回合武将基线
      if (idx === 0){
        for (let s=0; s<3; s++){
          const me = players.find(p=>p.slot===slotChar[s]);
          h.firstGenCount[s] = me?.generals?.length || 0;
          startCities[s] = me?.cities || 0;
        }
      }

      // 三玩家循环
      for (let s=0; s<3; s++){
        const me = players.find(p=>p.slot===slotChar[s]);
        if (!me) continue;

        // 资源最大值
        if (me.gold!=null && me.gold > h.maxGold[s])   h.maxGold[s]   = me.gold;
        if (me.food!=null && me.food > h.maxFood[s])   h.maxFood[s]   = me.food;
        if (me.troop!=null && me.troop > h.maxTroop[s]) h.maxTroop[s] = me.troop;
        if (me.morale!=null && me.morale > h.maxMorale[s]) h.maxMorale[s] = me.morale;
        if (me.cities!=null && me.cities > h.maxCities[s]) h.maxCities[s] = me.cities;

        // 武将数最大值
        const gc = (me.generals||[]).length;
        if (gc > h.maxGenerals[s]) h.maxGenerals[s] = gc;

        // 民心连续 ≥ 85
        if ((me.morale||0) >= 85){ moraleStreak[s]++; if (moraleStreak[s] > h.moraleStreak85[s]) h.moraleStreak85[s] = moraleStreak[s]; }
        else moraleStreak[s] = 0;

        // 城 ≥ 10 连续
        if ((me.cities||0) >= 10){ cities10Streak[s]++; if (cities10Streak[s] > h.cities10Streak[s]) h.cities10Streak[s] = cities10Streak[s]; }
        else cities10Streak[s] = 0;

        // 持有城等
        (me.cities_list||[]).forEach(c=>{
          const tier = CITY_TIER[c.name];
          if (tier) h.ownedTiers[s].add(tier);
        });

        // 武将名 + 状态
        (me.generals||[]).forEach(g=>{
          h.everGenerals[s].add(g.name);
          if (g.status) h.everSawStatus[s].add(g.status);
          // 受伤/患病恢复追踪
          if (g.status === '受伤') woundedSeen[s][g.name] = true;
          else if (g.status === '健康' && woundedSeen[s][g.name]) h.woundedRecovered[s] = true;
          if (g.status === '患病') illSeen[s][g.name] = true;
          else if (g.status === '健康' && illSeen[s][g.name]) h.illRecovered[s] = true;
          // 在职回合追踪
          if (genFirstRound[s][g.name] == null) genFirstRound[s][g.name] = rd.round;
          genLastRound[s][g.name] = rd.round;
        });

        // 流亡:cities==0 过后再 >=1
        if (me.cities === 0) exileEver[s] = true;
        else if (exileEver[s] && me.cities >= 1) h.exileRecovered[s] = true;

        // 调度记录
        transit.forEach(t=>{ if (t.slot === s) h.everTransited[s] = true; });

        // 首胜
        if (h.firstWinRound[s] == null){
          for (const b of battles){
            if (b.attackerSlot === s && b.result === '胜'){ h.firstWinRound[s] = rd.round; break; }
          }
        }
      }

      // 城池易主追踪(基于 cityOwnership)
      const thisRoundConquest = [{},{},{}]; // {round: 攻下城数}
      for (const city in ownership){
        const cur = ownership[city];
        const prev = prevOwnership[city];
        const curOwner = cur?.faction || cur?.holder || '';
        const prevOwner = prev?.faction || prev?.holder || '';
        // 城归属变化
        if (prev && prevOwner && curOwner && prevOwner !== curOwner){
          // 是否归属为某玩家?判断玩家段是否含此城
          for (let s=0; s<3; s++){
            const me = players.find(p=>p.slot===slotChar[s]);
            const hasCity = (me?.cities_list||[]).some(c=>c.name === city);
            if (hasCity){
              h.conqueredCities[s].add(city);
              const tier = CITY_TIER[city];
              if (tier) h.conqueredTiers[s].add(tier);
              thisRoundConquest[s][rd.round] = (thisRoundConquest[s][rd.round]||0) + 1;
            }
          }
          // NPC 阵营失城统计
          if (prevOwner && prevOwner !== '空'){
            if (!h.factionCityLoss[prevOwner]) h.factionCityLoss[prevOwner] = {lost:0,bySelf:[0,0,0]};
            h.factionCityLoss[prevOwner].lost++;
            for (let s=0; s<3; s++){
              const me = players.find(p=>p.slot===slotChar[s]);
              const hasCity = (me?.cities_list||[]).some(c=>c.name === city);
              if (hasCity) h.factionCityLoss[prevOwner].bySelf[s]++;
            }
          }
        }
      }
      // 把本回合攻下数推入 conquestByRound
      for (let s=0; s<3; s++){
        for (const r in thisRoundConquest[s]){
          h.conquestByRound[s].push({round:parseInt(r), count:thisRoundConquest[s][r]});
        }
      }

      // 涉己战斗 → 重置无战斗连续
      for (let s=0; s<3; s++){
        const hasMine = battles.some(b => b.attackerSlot===s || b.defenderSlot===s);
        if (hasMine) noWarStreak[s] = 0;
        else { noWarStreak[s]++; if (noWarStreak[s] > h.noWarStreak[s]) h.noWarStreak[s] = noWarStreak[s]; }
      }

      // 阵斩敌将统计:本回合胜战的 defender,在下回合所有守将列表中消失
      if (idx + 1 < rounds.length){
        const nextRd = rounds[idx+1];
        const nextHolders = new Set();
        (nextRd.parsed.players||[]).forEach(p=>{
          (p.cities_list||[]).forEach(c=>{
            (c.holders||[]).forEach(h=>nextHolders.add(h));
          });
        });
        // NPC 城守将也算
        const nextOwnership = nextRd.parsed.cityOwnership || {};
        for (const cName in nextOwnership){
          const o = nextOwnership[cName];
          if (o.holder) nextHolders.add(o.holder);
          (o.holders||[]).forEach(hh=>nextHolders.add(hh));
        }
        battles.forEach(b=>{
          if (b.result === '胜' && (b.attackerSlot===0 || b.attackerSlot===1 || b.attackerSlot===2)){
            const def = String(b.defender||'').replace(/^[甲乙丙]\s*/,'').trim();
            if (def && !nextHolders.has(def)){
              h.slainEnemies[b.attackerSlot]++;
            }
          }
        });
      }

      // 用 prevOwnership 镜像更新
      for (const city in ownership) prevOwnership[city] = ownership[city];
    });

    // 武将在职回合数
    for (let s=0; s<3; s++){
      for (const name in genFirstRound[s]){
        const serve = genLastRound[s][name] - genFirstRound[s][name];
        if (serve > h.maxGenServeRounds[s]) h.maxGenServeRounds[s] = serve;
      }
    }

    // 阵营覆灭:某阵营在最后一回合 cityOwnership 中已不存在,
    // 且其最后一城被某玩家攻下
    if (rounds.length){
      const lastOwnership = rounds[rounds.length-1].parsed.cityOwnership || {};
      const lastFactions = new Set();
      for (const c in lastOwnership){
        const f = lastOwnership[c]?.faction;
        if (f) lastFactions.add(f);
      }
      // 倒推:遍历每个曾经存在的阵营,看是否消失
      const everFactions = new Set();
      rounds.forEach(rd=>{
        const o = rd.parsed.cityOwnership || {};
        for (const c in o){
          const f = o[c]?.faction;
          if (f) everFactions.add(f);
        }
      });
      everFactions.forEach(f=>{
        if (!lastFactions.has(f)){
          // 该阵营已覆灭。找其消失的最后一回合,最后一城由谁夺
          for (let i=rounds.length-1; i>=0; i--){
            const o = rounds[i].parsed.cityOwnership || {};
            const cities = Object.keys(o).filter(c=>o[c]?.faction===f);
            if (cities.length === 0) continue;
            // 这一回合 f 还有城,下一回合开始没有。看下一回合这些城归谁
            if (i+1 < rounds.length){
              const players = rounds[i+1].parsed.players || [];
              cities.forEach(cName=>{
                for (let s=0; s<3; s++){
                  const me = players.find(p=>p.slot===slotChar[s]);
                  if ((me?.cities_list||[]).some(c=>c.name===cName)){
                    h.razedFactions[s]++;
                    break;
                  }
                }
              });
            }
            break;
          }
        }
      });
    }

    // 四面楚歌:遍历每回合,任一回合三玩家中某玩家持城≥2 且其 cities_list 中
    // 城池在地图上无相邻己方城。复用 SGMap 的城坐标(若不可用则跳过)
    rounds.forEach(rd=>{
      if (!window.SGMap || !window.SGMap.getCityCoord) return;
      for (let s=0; s<3; s++){
        const me = (rd.parsed.players||[]).find(p=>p.slot===slotChar[s]);
        if (!me || (me.cities||0) < 2) continue;
        const myList = (me.cities_list||[]).map(c=>c.name);
        if (myList.length < 2) continue;
        let allIsolated = true;
        for (const cName of myList){
          const co = window.SGMap.getCityCoord(cName);
          if (!co){ allIsolated = false; break; }
          // 六边形 flat-top 6 邻居
          const neighbors = [
            {hx:co.hx, hy:co.hy-1},{hx:co.hx, hy:co.hy+1},
            {hx:co.hx-1, hy:co.hy + (co.hx%2 ? 0 : -1)},
            {hx:co.hx-1, hy:co.hy + (co.hx%2 ? 1 : 0)},
            {hx:co.hx+1, hy:co.hy + (co.hx%2 ? 0 : -1)},
            {hx:co.hx+1, hy:co.hy + (co.hx%2 ? 1 : 0)},
          ];
          // 看相邻 6 格中是否有另一座己方城
          const hasFriend = myList.some(n=>{
            if (n === cName) return false;
            const c2 = window.SGMap.getCityCoord(n);
            if (!c2) return false;
            return neighbors.some(nb=>nb.hx===c2.hx && nb.hy===c2.hy);
          });
          if (hasFriend){ allIsolated = false; break; }
        }
        if (allIsolated) h.besiegedEver[s] = true;
      }
    });

    return h;
  }

  // ─────────────────────────────────────────
  //  主检测函数
  // ─────────────────────────────────────────
  let _lastResult = null;

  function detect(rounds){
    if (!rounds || !rounds.length){
      _lastResult = [{slot:0,unlocked:[]},{slot:1,unlocked:[]},{slot:2,unlocked:[]}];
      return _lastResult;
    }
    const history = buildHistory(rounds);
    const currentRound = rounds[rounds.length-1];

    const result = [0,1,2].map(self=>{
      const ctx = { self, rounds, currentRound, history };
      const unlocked = [];
      for (const a of ACHIEVEMENTS){
        try {
          if (a.trigger(ctx)){
            // 找首次解锁回合(向前回放,二分粗略可省略,目前 O(N*M) 可接受)
            let firstRound = currentRound.round;
            for (let i=0; i<rounds.length; i++){
              const sliced = rounds.slice(0, i+1);
              const subHistory = buildHistory(sliced);
              const subCtx = { self, rounds:sliced, currentRound:sliced[i], history:subHistory };
              if (a.trigger(subCtx)){ firstRound = sliced[i].round; break; }
            }
            unlocked.push({id:a.id, name:a.name, rarity:a.rarity, category:a.category, round:firstRound});
          }
        } catch (e){ /* 单条 trigger 抛错不影响整体 */ console.warn('[SGAch]',a.id,e); }
      }
      return { slot:self, unlocked };
    });

    _lastResult = result;
    return result;
  }

  // ─────────────────────────────────────────
  //  辅助 API
  // ─────────────────────────────────────────
  function getMostRare(slot){
    if (!_lastResult) return null;
    const u = _lastResult[slot]?.unlocked || [];
    if (!u.length) return null;
    // 按稀有度降序、回合降序排
    const sorted = u.slice().sort((a,b)=>{
      const ra = RARITY_RANK[a.rarity], rb = RARITY_RANK[b.rarity];
      if (rb !== ra) return rb - ra;
      return b.round - a.round;
    });
    return sorted[0];
  }

  function getCounts(slot){
    const u = _lastResult?.[slot]?.unlocked || [];
    return { unlocked: u.length, total: ACHIEVEMENTS.length };
  }

  function getAll(){ return ACHIEVEMENTS.slice(); }
  function getRarityRank(rarity){ return RARITY_RANK[rarity] ?? -1; }
  function getRarityLabel(rarity){ return RARITY_LABEL[rarity] || rarity; }

  // ─────────────────────────────────────────
  //  渲染:玩家卡头部成就槽 + toast
  // ─────────────────────────────────────────
  // 记录上次每玩家已解锁的 id Set,用于 toast 差量推送
  const _lastUnlockedIds = [new Set(),new Set(),new Set()];
  let _firstRun = true;

  function renderSlots(){
    if (!_lastResult) return;
    for (let s=0; s<3; s++){
      const el = document.getElementById(`pc-ach-slot-${s}`);
      if (!el) continue;
      const top = getMostRare(s);
      const cnt = getCounts(s);
      el.classList.remove('rar-bronze','rar-common','rar-rare','rar-epic','rar-legendary','rar-none');
      if (top){
        el.classList.add('rar-'+top.rarity);
        el.innerHTML = `<span class="ach-title">${esc(top.name)}</span><span class="ach-count">${cnt.unlocked}/${cnt.total}</span>`;
      } else {
        el.classList.add('rar-none');
        el.innerHTML = `<span class="ach-title">尚无功业</span><span class="ach-count">0/${cnt.total}</span>`;
      }
    }
  }

  function pushUnlockToasts(){
    if (!_lastResult) return;
    // 首次加载不弹 toast,只记录基线
    if (_firstRun){
      for (let s=0; s<3; s++) _lastUnlockedIds[s] = new Set((_lastResult[s].unlocked||[]).map(x=>x.id));
      _firstRun = false;
      return;
    }
    const queue = [];
    for (let s=0; s<3; s++){
      const curSet = new Set((_lastResult[s].unlocked||[]).map(x=>x.id));
      const prevSet = _lastUnlockedIds[s];
      for (const ach of (_lastResult[s].unlocked||[])){
        if (!prevSet.has(ach.id)) queue.push({slot:s, ach});
      }
      _lastUnlockedIds[s] = curSet;
    }
    if (queue.length) queueToasts(queue);
  }

  function queueToasts(queue){
    let i = 0;
    const step = () => {
      if (i >= queue.length) return;
      showAchToast(queue[i].ach);
      i++;
      setTimeout(step, 3200);
    };
    step();
  }

  function showAchToast(ach){
    let el = document.getElementById('ach-toast');
    if (!el){
      el = document.createElement('div');
      el.id = 'ach-toast';
      el.className = 'ach-toast';
      el.innerHTML = `<div class="ach-toast-icon">★</div><div class="ach-toast-body"><div class="ach-toast-label">已解锁成就</div><div class="ach-toast-name"></div></div>`;
      document.body.appendChild(el);
    }
    el.style.setProperty('--rar-color', `var(--rar-${ach.rarity})`);
    el.querySelector('.ach-toast-name').textContent = ach.name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(()=>el.classList.remove('show'), 2800);
  }

  function refresh(rounds){
    detect(rounds);
    renderSlots();
    pushUnlockToasts();
  }

  function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  return {
    detect, refresh, getMostRare, getCounts, getAll,
    getRarityRank, getRarityLabel,
    renderSlots, pushUnlockToasts,
    open: function(slot){ console.log('[SGAch] open() 占位,等待工单 B 实装,slot=',slot); },
    close: function(){ console.log('[SGAch] close() 占位'); },
  };
})();