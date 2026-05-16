/**
 * parser.js — 三国志文字版 · AI内容解析器 v13
 *
 * 规则基准：《三国志文字版 AI主持人系统提示词》v2.7.9
 *
 * 支持三种格式：
 *  A. 新版 GM 双段格式 v4（当前规范）：
 *     ``` 剧情区 \n====×36\n 数据区 ```
 *     数据区字段白名单（顺序固定）：
 *       [回合] [速递] [甲] [乙] [丙] [NPC] [战报] [变动]
 *
 *     [变动] 内双层结构：
 *       总变化行   甲 金△-126 粮△+138 兵△X 民心△X 城△+1(攻下XX)
 *       收支△块   甲 收支△                    <- 开启明细块
 *                   金:产出+X,维护-X,合计+-X  <- 资源明细行（冒号或空格分隔）
 *                   粮:... 兵:... 民心:...
 *       专项锚点   甲 府库△事由:金+-X,粮+-X
 *                  甲 驻军△城名:+武将/-武将
 *                  甲 兵种△城名:骑+500,步-300 | 步:2000,弓:1000
 *                  甲 季度△金-X,粮-X          <- 每城-40金-60粮，每5回合触发
 *       全局锚点   NPC状态△城名:动态           <- 冒号分隔或空格分隔均支持
 *                  野外△:动态
 *
 *     [甲/乙/丙] 城池格式：城名(守将1/守将2|骑:3000,步:2000)
 *     武将状态白名单（5种固定值）：健康/疲劳/受伤/患病/阵亡
 *
 *  B. 简化新格式 v3（旧规范）：
 *     文本中含【结构化数据】区，每行用 △|字段=值|字段=值 管道格式
 *
 *  C. 降级：最旧格式（👤[...] emoji块）
 *
 * ── 扩展预留位 ──
 *   新增[变动]锚点类型：在 _parseOneChange() Step2 专项锚点区追加 if(/^新锚点△/) 分支
 *   新增全局锚点：在 _parseChangesBlock() 全局锚点区追加匹配逻辑
 *   新增资源类型：扩展 _parseSeasonalLine / _validateBreakdown 的资源列表
 *   新增数据区字段块：在 _splitBlocks() 的 KNOWN Set 中追加标签名
 *   前端无需同步修改：anchorGroups 数据驱动，自动适应新锚点渲染
 */

window.SGParser = (function () {
  'use strict';

  const SEP = '='.repeat(36);

  // 兵种顺序（显示用）
  const TROOP_TYPES = ['步', '弓', '骑', '水', '蛮'];

  // 武将合法状态
  const VALID_STATUS = ['健康', '疲劳', '受伤', '患病', '阵亡'];

  // ─────────────────────────────────────────
  //  文本预处理器
  // ─────────────────────────────────────────
  function _normalize(text) {
    var s = text;

    // ── 1. 代码块提取 ──
    var firstTick = s.indexOf('```');
    if (firstTick !== -1) {
      var lastTick = s.lastIndexOf('```');
      if (lastTick !== -1 && lastTick !== firstTick) {
        var startContent = s.indexOf('\n', firstTick);
        if (startContent !== -1 && startContent < lastTick) {
           s = s.slice(startContent + 1, lastTick);
        } else {
           // Fallback to match after ```xxx
           var tmp = s.slice(firstTick + 3, lastTick);
           s = tmp.replace(/^[\w]*\s*\n?/, '');
        }
      }
    }
    // Check inner Match
    var firstTickInner = s.indexOf('```');
    if (firstTickInner !== -1) {
      var lastTickInner = s.lastIndexOf('```');
      if (lastTickInner !== -1 && lastTickInner !== firstTickInner) {
        var startContentInner = s.indexOf('\n', firstTickInner);
        if (startContentInner !== -1 && startContentInner < lastTickInner) {
           s = s.slice(startContentInner + 1, lastTickInner);
        } else {
           var tmp2 = s.slice(firstTickInner + 3, lastTickInner);
           s = tmp2.replace(/^[\w]*\s*\n?/, '');
        }
      }
    }

    // ── 2. 全角→半角符号修正 ──
    s = s.replace(/（/g, '(');
    s = s.replace(/）/g, ')');
    s = s.replace(/，/g, ',');
    s = s.replace(/：/g, ':');

    // ── 3. Markdown 格式清理 ──
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/^#{1,6}\s+/gm, '');
    s = s.replace(/^>\s+/gm, '');
    s = s.replace(/^---+$/gm, '');
    s = s.replace(/^\|.*\|$/gm, '');
    s = s.replace(/^-\s+/gm, '');

    // ── 4. 分隔线标准化 ──
    s = s.replace(/^[\s]*={30,}[\s]*$/gm, '====================================');

    // ── 5. 字段标签标准化 ──
    s = s.replace(/[【\[]\s*(回合|节气|速递|甲|乙|丙|NPC|npc|战报|变动|驻城)\s*[】\]]\s*[:：]?\s*/gm,
      function (match, tag) {
        return '[' + tag + '] ';
      });

    // ── 6. 名号标签标准化 ──
    s = s.replace(/^名号\s*[:：]\s*/gm, '名号:');

    // ── 7. 资源行标准化 ──
    s = s.replace(/(金|粮|兵|民心|城)\s*:\s*/g, '$1:');

    // ── 9. 武将状态标准化 ──
    s = s.replace(/\(健康\)/g, '()');
    s = s.replace(/\(\s+/g, '(');
    s = s.replace(/\s+\)/g, ')');

    // ── 10. △符号标准化 ──
    s = s.replace(/[▲Δ▽]/g, '△');

    // ── 11. emoji 周围空格清理 ──
    s = s.replace(/([\u{1F300}-\u{1FAFF}])\s{2,}/gu, '$1 ');

    // ── 12. 空行清理 ──
    s = s.replace(/\n{4,}/g, '\n\n\n');

    // ── 13. 行首行尾空白清理 ──
    s = s.split('\n').map(function (line) {
      return line.trimRight();
    }).join('\n');

    return s;
  }


  // ─────────────────────────────────────────
  //  主入口：格式探针 → 路由到对应解析器
  // ─────────────────────────────────────────
  function parse(rawText) {
    if (!rawText || !rawText.trim()) return _empty();

    // ★ 新增: 预处理标准化
    var normalized = _normalize(rawText);

    // ── 格式 B：简化新格式 v3（含【结构化数据】或 △| 管道行）──
    if (/【结构化数据】/.test(normalized) || /[△▽]\|/.test(normalized)) {
      return _parseSimplified(normalized);
    }

    // 按 36 个 = 切分
    var sepIdx = normalized.indexOf(SEP);
    let storyZone, dataZone;
    const result = _empty();

    if (sepIdx !== -1) {
      // 从原文中找到大致相同位置的分隔线
      var origSepIdx = rawText.indexOf('='.repeat(30));
      if (origSepIdx === -1) origSepIdx = sepIdx;

      storyZone = normalized.slice(0, sepIdx).trim();
      result.rawDigest = rawText.slice(0, origSepIdx).trim();
      dataZone = normalized.slice(sepIdx + SEP.length).trim();
    } else {
      storyZone = normalized.trim();
      result.rawDigest = rawText.trim();
      dataZone = '';
    }

    if (dataZone) {
      // 传递 storyZone 供降级兜底使用
      _parseDataZone(dataZone, result, storyZone);
    } else {
      _parseLegacy(storyZone, result);
    }

    return result;
  }

  // ─────────────────────────────────────────
  //  空结果骨架
  // ─────────────────────────────────────────
  function _empty() {
    return {
      round:         null,
      digest:        '',
      rawDigest:     '',
      players:       [],      // [{slot,name,gold,food,troop,morale,cities,cities_list,generals}]
      npcCities:     [],      // [{name,holders:[],troops:{}}]
      battles:       [],      // [{attacker,defender,result,attacker_loss,defender_loss,success}]
      changes:       [],      // [{slot,resources,breakdown,treasury,garrisonOps,troopOps,quarterly,…}]
      garrison:      [],
      cityOwnership: {},
      roundInfo:     {},
      npcStatus:     [],      // [{city,desc}]  ← 新增
      wildEvents:    [],      // [{desc}]        ← 新增
      events:        [],      // v3 格式事件
      errors:        [],      // v3 格式错误
    };
  }

  // ─────────────────────────────────────────
  //  数据区总调度
  // ─────────────────────────────────────────
  function _parseDataZone(text, result, storyZone) {
    const blocks = _splitBlocks(text);

    // [回合]
    if (blocks['回合']) {
      const m = blocks['回合'].match(/第\s*(\d+)\s*回合/);
      if (m) result.round = parseInt(m[1]);
      // [速递] 可能紧跟在 [回合] 同块内
      const sdM = blocks['回合'].match(/\[速递\]\s*(.+)/);
      if (sdM) result.digest = sdM[1].trim();
    }

    // [速递]（单独块）
    if (blocks['速递']) {
      result.digest = blocks['速递'].trim();
    }

    // [甲][乙][丙]
    const SLOTS = ['甲', '乙', '丙'];
    SLOTS.forEach(slot => {
      if (blocks[slot]) {
        result.players.push(_parsePlayerBlock(slot, blocks[slot]));
      }
    });

    // [NPC]
    const npcRaw = blocks['NPC'] || blocks['npc'] || '';
    if (npcRaw) {
      result.npcCities = _parseNpcBlock(npcRaw);
    }

    // [战报]
    if (blocks['战报']) {
      result.battles = _parseBattles(blocks['战报']);
    }

    // [变动]
    if (blocks['变动']) {
      const { changes, npcStatus, wildEvents } = _parseChangesBlock(blocks['变动']);
      result.changes    = changes;
      result.npcStatus  = npcStatus;
      result.wildEvents = wildEvents;

      // __publicEvents 供 main.js 的 renderChangesDetail 读取（向后兼容）
      result.changes.__publicEvents = [
        ...npcStatus.map(s => ({ anchor: 'NPC状态', label: s.city, deltas: [], text: s.desc })),
        ...wildEvents.map(e => ({ anchor: '野外',   label: '',      deltas: [], text: e.desc })),
      ];
    }

    // 构建 cityOwnership
    result.cityOwnership = _buildCityOwnership(result.players, result.npcCities);

    // 应用 troopOps（兵种覆写/增减）到 cityOwnership
    result.changes.forEach(ch => {
      (ch.troopOps || []).forEach(op => {
        _applyOneTroopOp(op, result.cityOwnership);
      });
    });

    // 应用 productionOps（产出△ buff）到 cityOwnership
    result.changes.forEach(ch => {
      (ch.productionOps || []).forEach(op => {
        const entry = result.cityOwnership[op.city];
        if (!entry) return;
        if (!entry.productionBuffs) entry.productionBuffs = {};
        op.buffs.forEach(b => {
          if (b.expired) {
            // 到期：删除该 type 的 buff
            delete entry.productionBuffs[b.type];
          } else if (b.remain != null) {
            // 写入/覆盖
            entry.productionBuffs[b.type] = {
              type:     b.type,
              emoji:    b.emoji,
              general:  b.general,
              action:   b.action,
              remain:   b.remain,
              // 保留旧版字段
              value:    b.value,
              resource: b.resource,
            };
          }
        });
      });
    });

    // ★ 兜底: 如果玩家数据未解析到,尝试从全文暴力提取
    if (result.players.length === 0) {
      var fullText = storyZone + '\n' + text;
      // 找 "金:数字 粮:数字" 这样的行, 附近提取名号
      var lines = fullText.split('\n').map(function(l) { return l.trim(); });
      var p = null;
      var slotMap = ['甲', '乙', '丙'];
      var slotIdx = 0;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line) continue;

        var nameMatch = line.match(/^名号\s*[:：]\s*(.+)/);
        if (nameMatch && !p) {
          p = { slot: slotMap[slotIdx] || '未知', name: nameMatch[1].trim(), city: '', gold: null, food: null, troop: null, morale: null, cities: null, generals: [], cities_list: [], ownedCities: [], situation_note: '', suggestions: [] };
        }

        var goldM = line.match(/(?:^|\s)金\s*[:：]?\s*(-?\d+)/);
        var foodM = line.match(/(?:^|\s)粮\s*[:：]?\s*(-?\d+)/);
        if (goldM && foodM) {
          if (!p) {
             p = { slot: slotMap[slotIdx] || '未知', name: '未知', city: '', gold: null, food: null, troop: null, morale: null, cities: null, generals: [], cities_list: [], ownedCities: [], situation_note: '', suggestions: [] };
          }
          p.gold = parseInt(goldM[1]);
          p.food = parseInt(foodM[1]);
          var troopM = line.match(/(?:^|\s)兵\s*[:：]?\s*(-?\d+)/);
          if (troopM) p.troop = parseInt(troopM[1]);
          var moraleM = line.match(/(?:^|\s)民心\s*[:：]?\s*(-?\d+)/);
          if (moraleM) p.morale = parseInt(moraleM[1]);
          var cityM = line.match(/(?:^|\s)城\s*[:：]?\s*(\d+)/);
          if (cityM) p.cities = parseInt(cityM[1]);
        }

        if (line.match(/^城池\s*[:：]/) && p) {
           p.cities_list = _parseCityList(line.replace(/^城池\s*[:：]\s*/, ''));
        }

        if (line.match(/^武将\s*[:：]/) && p) {
           p.generals = _parseGeneralList(line.replace(/^武将\s*[:：]\s*/, ''));
           // End of player block
           result.players.push(p);
           p = null;
           slotIdx++;
        }
      }
      if (p && slotIdx < 3 && result.players.indexOf(p) === -1) {
         result.players.push(p);
      }
    }

    // ★ 兜底: 如果回合号未解析到,从剧情区标题提取
    if (!result.round) {
      var roundM = storyZone.match(/第\s*(\d+)\s*回合/);
      if (roundM) result.round = parseInt(roundM[1]);
    }

    // ★ 兜底: 如果 digest 为空,取剧情区前 100 字
    if (!result.digest && storyZone) {
      result.digest = storyZone.slice(0, 100).replace(/\n/g, ' ').trim() + '...';
    }
  }

  // ─────────────────────────────────────────
  //  按方括号标签切块
  // ─────────────────────────────────────────
  function _splitBlocks(text) {
    const KNOWN = new Set(['回合','速递','甲','乙','丙','NPC','npc','战报','变动','驻城']);
    // ★ 新增: 别名映射
    var ALIASES = {
      '甲方': '甲', '玩家甲': '甲', '城主甲': '甲',
      '乙方': '乙', '玩家乙': '乙', '城主乙': '乙',
      '丙方': '丙', '玩家丙': '丙', '城主丙': '丙',
      'NPC势力': 'NPC', 'NPC城池': 'NPC', 'npc': 'NPC',
      '战斗': '战报', '战况': '战报',
      '收支': '变动', '结算': '变动', '变化': '变动',
    };
    const lines  = text.split('\n');
    const blocks = {};
    let curKey = null, curBuf = [];

    for (const line of lines) {
      const m = line.match(/^[\[【]([^\]】\n]{1,16})[\]】]/); // 放宽到 16
      if (m) {
        const rawKey = m[1].trim();
        const key = ALIASES[rawKey] || rawKey;
        if (KNOWN.has(key)) {
          if (curKey !== null) blocks[curKey] = curBuf.join('\n');
          curKey = key;
          const rest = line.replace(/^[\[【][^\]】\n]{1,16}[\]】]\s*/, '').trim();
          curBuf = rest ? [rest] : [];
          continue;
        }
      }
      if (curKey !== null) curBuf.push(line);
    }
    if (curKey !== null) blocks[curKey] = curBuf.join('\n');
    return blocks;
  }

  // ─────────────────────────────────────────
  //  解析单个玩家块 [甲]/[乙]/[丙]
  // ─────────────────────────────────────────
  function _parsePlayerBlock(slot, raw) {
    const p = {
      slot,
      name:           '',
      city:           '',
      gold:           null,
      food:           null,
      troop:          null,
      morale:         null,
      cities:         null,
      generals:       [],
      cities_list:    [],
      ownedCities:    [],
      situation_note: '',
      suggestions:    [],
    };

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // 名号
      if (/^名号[:：]/.test(line)) {
        p.name = line.replace(/^名号[:：]\s*/, '').trim();
        continue;
      }
      // 资源行：金:54 粮:281 兵:680 民心:65 城:2
      const resM = line.match(/金[:：]?\s*(-?\d+)\s+粮[:：]?\s*(-?\d+)\s+兵[:：]?\s*(-?\d+)\s+民心[:：]?\s*(-?\d+)\s+城[:：]?\s*(\d+)/);
      if (resM) {
        p.gold   = parseInt(resM[1]);
        p.food   = parseInt(resM[2]);
        p.troop  = parseInt(resM[3]);
        p.morale = parseInt(resM[4]);
        p.cities = parseInt(resM[5]);
        continue;
      }

      // ★ 新增: 逐字段扫描(容错)
      var goldM = line.match(/(?:^|\s)金\s*[:：]?\s*(-?\d+)/);
      var foodM = line.match(/(?:^|\s)粮\s*[:：]?\s*(-?\d+)/);
      var troopM = line.match(/(?:^|\s)兵\s*[:：]?\s*(-?\d+)/);
      var moraleM = line.match(/(?:^|\s)民心\s*[:：]?\s*(-?\d+)/);
      var cityM = line.match(/(?:^|\s)城\s*[:：]?\s*(\d+)/);

      var matchCount = [goldM, foodM, troopM, moraleM, cityM].filter(Boolean).length;
      if (matchCount >= 2) {
        if (goldM) p.gold = parseInt(goldM[1]);
        if (foodM) p.food = parseInt(foodM[1]);
        if (troopM) p.troop = parseInt(troopM[1]);
        if (moraleM) p.morale = parseInt(moraleM[1]);
        if (cityM) p.cities = parseInt(cityM[1]);
        continue;
      }

      // ★ 新增: 跨行资源读取
      if (matchCount === 1) {
        if (goldM && p.gold === null) p.gold = parseInt(goldM[1]);
        if (foodM && p.food === null) p.food = parseInt(foodM[1]);
        if (troopM && p.troop === null) p.troop = parseInt(troopM[1]);
        if (moraleM && p.morale === null) p.morale = parseInt(moraleM[1]);
        if (cityM && p.cities === null) p.cities = parseInt(cityM[1]);
        continue;
      }
      // 城池行
      if (/^城池[:：]/.test(line)) {
        const cityRaw = line.replace(/^城池[:：]\s*/, '');
        p.cities_list = _parseCityList(cityRaw);
        p.ownedCities = p.cities_list.map(c => c.name);
        if (p.cities_list.length) p.city = p.cities_list[0].name;
        continue;
      }
      // 武将行
      if (/^武将[:：]/.test(line)) {
        p.generals = _parseGeneralList(line.replace(/^武将[:：]\s*/, ''));
        continue;
      }
    }
    return p;
  }

  // ─────────────────────────────────────────
  //  解析城池列表
  //  格式：城名(守将1/守将2|骑:3000,步:2000),城名(无|步:800)
  //        NPC用：城名(守将1/守将2)
  // ─────────────────────────────────────────
  function _parseCityList(raw) {
    if (!raw || !raw.trim()) return [];

    var s = raw;

    // 预处理: 顿号→逗号, 中文逗号→英文逗号(数据区专用)
    s = s.replace(/、/g, ',');
    s = s.replace(/，/g, ',');

    // 预处理: 武将分隔 顿号→斜杠
    s = s.replace(/\(([^)]*)\)/g, function (match, inner) {
      return '(' + inner.replace(/、/g, '/') + ')';
    });

    // 预处理: 兵种写法统一
    s = s.replace(/骑兵/g, '骑');
    s = s.replace(/步兵/g, '步');
    s = s.replace(/弓兵/g, '弓').replace(/弓箭兵/g, '弓');
    s = s.replace(/水军/g, '水').replace(/水兵/g, '水');
    s = s.replace(/蛮兵/g, '蛮').replace(/蛮族/g, '蛮');

    // 预处理: "骑2000" → "骑:2000" (缺少冒号)
    s = s.replace(/([步弓骑水蛮])\s*(\d+)/g, '$1:$2');

    // 预处理: 武将与兵种之间缺少 | 分隔符
    s = s.replace(/([^|,()]+\/[^|,()]*?)\s+([步弓骑水蛮]:)/g, '$1|$2');
    s = s.replace(/(\([\u4e00-\u9fff]{2,8})\s+([步弓骑水蛮]:)/g, '$1|$2');

    const result = [];
    // 匹配 城名(内容)
    const re = /([^,\s(]+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const name  = m[1].trim();
      const inner = m[2].trim();
      if (!name) continue;

      const pipeIdx = inner.indexOf('|');
      let holderRaw, troopsRaw;
      if (pipeIdx !== -1) {
        holderRaw = inner.slice(0, pipeIdx).trim();
        troopsRaw = inner.slice(pipeIdx + 1).trim();
      } else {
        if (/[步弓骑水蛮]:\d+/.test(inner)) {
          var troopStart = inner.search(/[步弓骑水蛮]:/);
          holderRaw = inner.slice(0, troopStart).trim().replace(/[\/／]\s*$/, '');
          troopsRaw = inner.slice(troopStart).trim();
        } else {
          holderRaw = inner;
          troopsRaw = null;
        }
      }

      const holders = (holderRaw === '无' || !holderRaw) ? [] : holderRaw.split(/[\/／]/).map(h => h.trim()).filter(Boolean);
      result.push({
        name,
        holder:  holders.join('/') || '无',
        holders,
        troops:  _parseTroops(troopsRaw),
      });
    }

    // ★ 降级: 如果正则一个都没匹配到,尝试按换行拆分
    if (result.length === 0) {
      var lines = s.split(/[,\n]/).map(function (l) {
        return l.trim();
      }).filter(Boolean);
      lines.forEach(function (line) {
        var lm = line.match(/([\u4e00-\u9fff]{2,6})\s*\(([^)]*)\)/);
        if (lm) {
          var lInner = lm[2].trim();
          var lHolders = lInner.split(/[\/／、]/).map(function (h) {
            return h.trim();
          }).filter(function (h) {
            return h && h !== '无' && !/[步弓骑水蛮]:/.test(h);
          });
          result.push({
            name: lm[1].trim(),
            holder: lHolders.join('/') || '无',
            holders: lHolders,
            troops:  _parseTroops(lInner),
          });
        } else {
          var cityOnly = line.match(/^([\u4e00-\u9fff]{2,6})$/);
          if (cityOnly) {
            result.push({
              name: cityOnly[1],
              holder: '无',
              holders: [],
              troops: {},
            });
          }
        }
      });
    }
    return result;
  }

  // ─────────────────────────────────────────
  //  解析 [NPC] 块
  //  城池:许昌(夏侯惇/张辽),邺城(袁绍),合肥(乐进)
  // ─────────────────────────────────────────
  function _parseNpcBlock(raw) {
    if (!raw || !raw.trim()) return [];
    var s = raw.replace(/^城池[:：]?\s*/i, '').trim();
    // 如果内容是多行格式(每行一座城),把换行转逗号
    if (s.indexOf('\n') !== -1 && s.indexOf(',') === -1) {
      s = s.split('\n').map(function (l) {
        return l.trim();
      }).filter(Boolean).join(',');
    }
    const list = _parseCityList(s);
    return list.map(c => ({
      name:    c.name,
      holders: c.holders || (c.holder && c.holder !== '无' ? c.holder.split('/') : []),
      holder:  c.holder,
      troops:  c.troops || {},
    }));
  }

  // ─────────────────────────────────────────
  //  解析兵力字符串
  //  输入：骑:3000,步:2000  /  无兵  /  null
  //  输出：{ 骑:3000, 步:2000 }
  // ─────────────────────────────────────────
  function _parseTroops(raw) {
    if (!raw || raw === '无兵' || !raw.trim()) return {};
    const result = {};
    const re = /([步弓骑水蛮])\s*[:：]?\s*(\d+)/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      result[m[1]] = parseInt(m[2], 10);
    }
    return result;
  }

  // ─────────────────────────────────────────
  //  解析武将列表：马超(健康),庞德(疲劳)
  //  支持全角括号：马超（健康）
  //  状态白名单：健康/疲劳/受伤/患病/阵亡（规则v2.7.9 §武将状态）
  // ─────────────────────────────────────────
  function _parseGeneralList(raw) {
    if (!raw || !raw.trim()) return [];
    var s = raw;
    s = s.replace(/、/g, ',');
    const result = [];
    const re = /([\u4e00-\u9fff]{2,8})\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      const name = m[1].trim();
      let status = m[2].trim();
      if (!name) continue;
      if (status && VALID_STATUS.indexOf(status) === -1) {
        status = '';
      }
      result.push({ name, status: status || '' });
    }

    if (result.length > 0) return result;

    var parts = s.split(/[,\s]+/).filter(Boolean);
    parts.forEach(function (part) {
      var nm = part.match(/([\u4e00-\u9fff]{2,8})/);
      if (nm) {
        var statusMatch = part.match(/(疲劳|受伤|患病|阵亡)/);
        result.push({
          name: nm[1],
          status: statusMatch ? statusMatch[1] : ''
        });
      }
    });

    return result;
  }

  // ─────────────────────────────────────────
  //  解析战报
  //  格式：攻方→守方 | 胜/平/负 | 伤亡:攻X守Y
  // ─────────────────────────────────────────
  function _parseBattles(raw) {
    if (!raw || !raw.trim()) return [];
    var lines = raw.split('\n').map(function (l) {
      return l.trim();
    }).filter(Boolean);

    var results = [];

    lines.forEach(function (line) {
      if (/无战事|无战斗|刀兵未动|太平无事/.test(line)) return;

      var s = line;
      s = s.replace(/->|=>|→|➜|➡/g, '→');

      var arrowM = s.match(/([^→|]+)→([^→|]+)/);
      if (!arrowM) return;

      var attacker = arrowM[1].trim();
      var rest = arrowM[2].trim() + ' ' + s.slice(arrowM.index + arrowM[0].length);

      var defM = rest.match(/^([^|/,]+)/);
      var defender = defM ? defM[1].trim() : '';

      var resultStr = '';
      if (/大胜|完胜/.test(s)) resultStr = '大胜';
      else if (/小胜/.test(s)) resultStr = '小胜';
      else if (/惨胜/.test(s)) resultStr = '惨胜';
      else if (/胜/.test(s)) resultStr = '胜';
      else if (/平|平手|僵持/.test(s)) resultStr = '平';
      else if (/败|负/.test(s)) resultStr = '负';

      var atkLoss = 0, defLoss = 0;
      var casM = s.match(/伤亡\s*[:：]\s*攻\s*(-?\d+)\s*守\s*(-?\d+)/);
      if (casM) {
        atkLoss = parseInt(casM[1]);
        defLoss = parseInt(casM[2]);
      } else {
        var atkM = s.match(/攻[方]?\s*[:：]?\s*[-损失]*\s*(\d+)/);
        var defM2 = s.match(/守[方]?\s*[:：]?\s*[-损失]*\s*(\d+)/);
        if (atkM) atkLoss = parseInt(atkM[1]);
        if (defM2) defLoss = parseInt(defM2[1]);
      }

      results.push({
        attacker: attacker,
        defender: defender,
        result: resultStr,
        attacker_loss: atkLoss,
        defender_loss: defLoss,
        success: resultStr && resultStr !== '负' && resultStr !== '平',
      });
    });

    return results;
  }

  // ═══════════════════════════════════════════════════════
  //  [变动] 块主解析器
  //  返回 { changes: [], npcStatus: [], wildEvents: [] }
  //
  //  支持结构：
  //  ┌ 总变化行    甲 金△-126 粮△+138 兵△-80 民心△+0 城△+1(攻下陈仓)
  //  ├ 收支△块    甲 收支△
  //  │              金:产出+30,维护-24,明账-10,府库-120,合计-124
  //  │              粮:产出+50,维护-107,府库+195,合计+138
  //  │              兵:战损-80,合计-80
  //  │              民心:合计+0
  //  ├ 专项锚点   甲 府库△事由:金-120,粮+195
  //  │            甲 驻军△长安:+赵云
  //  │            甲 兵种△长安:骑+500
  //  │            甲 季度△金-40,粮-60
  //  └ 全局锚点   NPC状态△虎牢关:吕布更换西门巡夜
  //               野外△:高定再送山盐但仍未归附
  // ═══════════════════════════════════════════════════════
  function _parseChangesBlock(raw) {
    const npcStatus  = [];
    const wildEvents = [];
    const changes    = [];

    // 按槽位切割内容
    const lines    = raw.split('\n');
    let curSlot    = null;
    let curLines   = [];

    const flush = () => {
      if (!curSlot) return;
      const ch = _parseOneChange(curSlot, curLines.join('\n'));
      if (ch) changes.push(ch);
    };

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;

      // ── 全局锚点：NPC状态△ / 野外△ ──
      // 格式A1（冒号分隔）：NPC状态△虎牢关:吕布更换西门巡夜
      // 格式A2（空格分隔）：NPC状态△虎牢关 吕布更换西门巡夜  — BUG#3 修复
      if (/^NPC状态△/.test(t)) {
        const body = t.replace(/^NPC状态△\s*/, '').trim();
        if (body) {
          // 优先冒号分隔
          const colonIdx = body.search(/[:：]/);
          if (colonIdx > 0) {
            const city = body.slice(0, colonIdx).trim();
            const desc = body.slice(colonIdx + 1).trim();
            if (city && desc) { npcStatus.push({ city, desc }); continue; }
          }
          // 降级空格分隔：第一个词为城名，其余为描述
          const spaceIdx = body.search(/[\s　]/);
          if (spaceIdx > 0) {
            const city = body.slice(0, spaceIdx).trim();
            const desc = body.slice(spaceIdx).trim();
            if (city && desc) { npcStatus.push({ city, desc }); continue; }
          }
          // 无分隔符：整体作为描述，城名留空
          npcStatus.push({ city: '', desc: body });
        }
        continue;
      }
      // 格式B（旧行格式）：NPC 城名状态△动态
      if (/^NPC[\s　]/.test(t)) {
        const evs = _parseNpcLegacyLine(t);
        evs.forEach(e => {
          if (e.type === 'npc')  npcStatus.push({ city: e.city, desc: e.desc });
          else                   wildEvents.push({ desc: e.desc });
        });
        continue;
      }
      // 野外△:<动态>  或  野外△<动态>
      const wildM = t.match(/^野外△[：:]?(.+)/);
      if (wildM) {
        wildEvents.push({ desc: wildM[1].trim() });
        continue;
      }

      // ── 玩家行 ──
      const slotM = t.match(/^([甲乙丙])\s*(.*)/);
      if (slotM && ['甲','乙','丙'].includes(slotM[1])) {
        const newSlot = slotM[1];
        const rest    = slotM[2].trim();
        if (newSlot === curSlot) {
          // 同槽续行
          if (rest) curLines.push(rest);
        } else {
          flush();
          curSlot  = newSlot;
          curLines = rest ? [rest] : [];
        }
      } else if (curSlot) {
        // 无前缀内容行 → 属于当前槽
        curLines.push(t);
      }
    }
    flush();

    return { changes, npcStatus, wildEvents };
  }

  // ─────────────────────────────────────────
  //  解析旧版 NPC 行（格式B）
  //  "NPC 虎牢关状态△吕布更换西门巡夜 野外△高定再送山盐"
  // ─────────────────────────────────────────
  function _parseNpcLegacyLine(line) {
    const events = [];
    const reCity = /([^\s△]+)状态△([^△]+?)(?=\s+[^\s△]+状态△|\s*野外△|\s*$)/g;
    const reWild = /野外△([^△]+?)(?=\s+野外△|\s*$)/g;
    let m;
    while ((m = reCity.exec(line)) !== null) {
      const city = m[1].trim();
      if (city === 'NPC' || city === 'NPC状态') continue;
      events.push({ type: 'npc', city, desc: m[2].trim() });
    }
    while ((m = reWild.exec(line)) !== null) {
      events.push({ type: 'wild', city: '野外', desc: m[1].trim() });
    }
    return events;
  }

  // ─────────────────────────────────────────
  //  解析单槽变动内容
  //  输入 raw 已剥去 "甲 " 前缀
  // ─────────────────────────────────────────
  function _parseOneChange(slot, raw) {
    const change = {
      slot,
      raw,
      resources:    {},   // 总变化  { 金:-126, 粮:+138, … }
      cities:       [],   // 城池得失 [{delta,action,cityName}]
      breakdown:    {},   // 收支明细 { 金:{items:[],total}, 粮:{…}, 兵:{…}, 民心:{…} }
      treasury:     [],   // 府库△   [{desc,entries:[{res,val}]}]
      garrisonOps:  [],   // 驻军△   [{cityName, ops:[{name,dir}]}]  dir: in|out|dead
      troopOps:     [],   // 兵种△   [{cityName, entries:[{type,val}], isDelta}]
      quarterly:    [],   // 季度△   [{res,val}]
      // 以下保留供旧渲染路径使用
      guards:       [],
      troopChanges: [],
      darkItems:    [],
      seasonal:     [],
      intel:        [],
      anchorGroups: {},
      warnings:     [],
    };

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    let anchor = null;  // 当前文本锚点：'breakdown' | null

    for (const line of lines) {

      // ══════════════════════════════════════
      //  Step 1：总变化行检测
      //  规则：总变化行含 ≥2 个「资源△数字」，如：
      //    甲 金△-126 粮△+138 兵△-80 民心△+0 城△+1(攻下陈仓)
      //  BUG#1 修复：单个「资源△数字」（如"兵△+0"单独成行）
      //    旧逻辑 ≥2 检测不通过 → 落入 Step4 被过滤丢弃
      //    新逻辑：≥1 即尝试匹配，但只有明确是总变化行（含已知资源名）才采纳
      //    判定规则：行内资源△数字数量 ≥1，且行首非锚点关键字
      // ══════════════════════════════════════
      // 尝试提取各资源变化
      // 模式1(标准): 金△+120
      // 模式2(宽松): 金△ +120 或 金:+120 或 金+120
      const totalMatches = [...line.matchAll(/(金|粮|兵|民心|城)\s*[△:]?\s*([+-]?\d+)/g)];
      if (totalMatches.length >= 1) {
        // 排除已在 Step2 处理的专项锚点行（这些行含 △ 但不是总变化行）
        const isSpecialAnchor = /^(收支|府库|暗账|驻军|兵种|季度|情报)△/.test(line);
        if (!isSpecialAnchor) {
          totalMatches.forEach(m => {
            change.resources[m[1]] = parseInt(m[2]);
          });
          // 城池得失注解：城△+1(攻下陈仓) / 城△-1(失去宛城)
          for (const m of line.matchAll(/城△([+-]\d+)[（(](攻下|失去)([^）)]+)[）)]/g)) {
            change.cities.push({ delta: parseInt(m[1]), action: m[2], cityName: m[3].trim() });
          }
          anchor = null;
          continue;
        }
      }

      // ══════════════════════════════════════
      //  Step 2：专项锚点识别
      // ══════════════════════════════════════

      // 收支△（开启明细块）
      if (/^收支△/.test(line)) {
        anchor = 'breakdown';
        continue;
      }

      // 府库△事由:金-120,粮+195
      if (/^府库△/.test(line)) {
        anchor = null;
        const rest = line.replace(/^府库△\s*/, '').trim();
        if (rest) {
          const item = _parseTreasuryLine(rest);
          change.treasury.push(item);
          // 兼容旧字段
          change.darkItems.push({ desc: item.desc, entries: item.entries });
          // 加入 anchorGroups.府库
          if (!change.anchorGroups['府库']) change.anchorGroups['府库'] = [];
          change.anchorGroups['府库'].push({
            label:  item.desc,
            deltas: item.entries.map(e => ({ res: e.res, val: e.val })),
            text:   line,
          });
        }
        continue;
      }

      // 暗账△（兼容旧名称，等同府库△）
      if (/^暗账△/.test(line)) {
        anchor = null;
        const rest = line.replace(/^暗账△\s*/, '').trim();
        if (rest) {
          const item = _parseTreasuryLine(rest);
          change.treasury.push(item);
          change.darkItems.push({ desc: item.desc, entries: item.entries });
          if (!change.anchorGroups['府库']) change.anchorGroups['府库'] = [];
          change.anchorGroups['府库'].push({
            label:  item.desc,
            deltas: item.entries.map(e => ({ res: e.res, val: e.val })),
            text:   line,
          });
        }
        continue;
      }

      // 驻军△城名:+赵云/-魏延/-文聘(阵亡)/无
      if (/^驻军△/.test(line)) {
        anchor = null;
        _parseGarrisonOp(line, change);
        continue;
      }

      // 兵种△城名:骑+500  或  兵种△城名:步:2000,弓:1000
      if (/^兵种△/.test(line)) {
        anchor = null;
        _parseTroopOp(line, change);
        continue;
      }

      // 季度△金-40,粮-60
      if (/^季度△/.test(line)) {
        anchor = null;
        const rest = line.replace(/^季度△\s*/, '').trim();
        // 先解析到临时数组，避免累积后 deltas 捕获到上一条的内容
        const newItems = [];
        _parseSeasonalLine(rest, newItems);
        newItems.forEach(item => {
          change.quarterly.push(item);
          // 注：不再写入 change.seasonal——seasonal 是旧版字段，
          // _migrateToAnchorGroups 会检测 anchorGroups['季度'] 已存在时跳过迁移，
          // 写入 seasonal 反而触发重复渲染。旧存档兼容由 main.js 侧保证。
        });
        // 加入 anchorGroups.季度（每条 季度△ 独立一项，label 注明结算周期）
        if (!change.anchorGroups['季度']) change.anchorGroups['季度'] = [];
        change.anchorGroups['季度'].push({
          label:  '季度结算',
          deltas: newItems.map(s => ({ res: s.res, val: s.val })),
          text:   line,
        });
        continue;
      }

      // 产出△城名:🌾 任峻 督民筑渠/4,🔨 韩浩 督造箭楼/3
      if (/^产出△/.test(line)) {
        anchor = null;
        const rest = line.replace(/^产出△\s*/, '').trim();
        const colonPos = rest.search(/[:：]/);
        if (colonPos > 0) {
          const cityName = rest.slice(0, colonPos).trim();
          const buffStr  = rest.slice(colonPos + 1).trim();
          const buffs = [];
          const EMOJI_MAP = {
            '🌾': '屯田', '💰': '开市', '🐫': '通商', '🤝': '人才', '🔨': '工造',
            '📚': '教化', '⚔️': '军训', '🕊️': '情报', '🎁': '特产'
          };
          buffStr.split(/[,，]/).forEach(seg => {
            seg = seg.trim().replace(/\uFE0F/g, '');
            if (!seg) return;

            // Emoji 匹配 (使用归一化进行匹配以兼容变体选择符)
            let emojiMatch = null;
            let matchLength = 0;
            for (const key in EMOJI_MAP) {
              const keyNorm = key.replace(/\uFE0F/g, '');
              if (seg.startsWith(keyNorm)) {
                emojiMatch = key;
                matchLength = keyNorm.length;
                break;
              }
            }

            if (emojiMatch) {
              let rest = seg.slice(matchLength).trim().replace(/^[\s\u3000]+/, '');

              // ★ 增强容错: emoji 可选, 剩余回合用 /数字 可选匹配
              // 1. & 2. 新格式 / 放宽的格式 (emoji 武将 动作/剩余)
              const slashIdx = rest.lastIndexOf('/');
              let remainStr = '0';
              let body = rest;
              if (slashIdx !== -1) {
                remainStr = rest.slice(slashIdx + 1).trim();
                body = rest.slice(0, slashIdx).trim().replace(/[\s\u3000]+$/, '');
              } else {
                // 如果没有/剩余回合,尝试提取结尾数字
                let endDigitMatch = rest.match(/([\s\u3000]+)(\d+)$/);
                if (endDigitMatch) {
                   remainStr = endDigitMatch[2];
                   body = rest.slice(0, endDigitMatch.index).trim().replace(/[\s\u3000]+$/, '');
                }
              }

              let name, action;
              let spaceMatch = body.match(/^([\u4e00-\u9fa5]{2,8})[\s\u3000]+(.+)$/);
              if (spaceMatch) {
                name = spaceMatch[1];
                action = spaceMatch[2];
              } else {
                const compoundSurnames = ['诸葛', '夏侯', '司马', '皇甫', '公孙', '慕容', '尉迟', '太史', '独孤', '令狐', '万俟', '宇文', '贺拔', '东门', '西门', '南门', '北门', '上官', '欧阳', '呼延'];
                let nameLen = 2;
                if (body.length >= 4 && compoundSurnames.includes(body.slice(0, 2))) {
                  nameLen = 3;
                }
                name = body.slice(0, nameLen);
                action = body.slice(nameLen);
              }

              buffs.push({
                type:    EMOJI_MAP[emojiMatch],
                emoji:   emojiMatch,
                general: name,
                action:  action,
                remain:  parseInt(remainStr, 10) || 0
              });
              return;

              // 3. 到期格式：emoji-到期
              if (rest === '-到期') {
                buffs.push({ type: EMOJI_MAP[emojiMatch], emoji: emojiMatch, expired: true });
                return;
              }
            }

            // 4. 旧格式兼容：屯田-到期
            const oldExpM = seg.match(/^([^+-]+)-到期$/);
            if (oldExpM) { buffs.push({ type: oldExpM[1].trim(), expired: true }); return; }

            // 5. 旧格式：屯田+45粮/5
            const oldBufM = seg.match(/^([^+\-]+)[+]([0-9]+)([^/]+)\/([0-9]+)$/);
            if (oldBufM) {
              buffs.push({
                type:     oldBufM[1].trim(),
                value:    parseInt(oldBufM[2]),
                resource: oldBufM[3].trim(),
                remain:   parseInt(oldBufM[4]),
              });
              return;
            }

            // 6. 兜底
            buffs.push({ type: seg, raw: seg });
          });
          if (!change.productionOps) change.productionOps = [];
          change.productionOps.push({ city: cityName, buffs });
        }
        continue;
      }

      // 情报△（旧格式兼容）
      if (/^情报△/.test(line)) {
        anchor = null;
        const rest = line.replace(/^情报△\s*/, '').trim();
        if (rest) {
          change.intel.push(rest);
          if (!change.anchorGroups['情报']) change.anchorGroups['情报'] = [];
          change.anchorGroups['情报'].push({ label: rest, deltas: [], text: rest });
        }
        continue;
      }

      // ══════════════════════════════════════
      //  Step 3：锚点内容行（收支△明细块）
      //  规则：收支△后跟资源明细行，每行格式：
      //    金:产出+30,维护-24,明账-10,府库-120,合计-124
      //    民心:赤字-5,合计-5
      //  BUG#2 修复：遇到新的专项锚点行时必须退出 breakdown 状态
      //    旧逻辑：非资源行只 continue 不重置 anchor，后续锚点行被误归入 breakdown
      //    新逻辑：明细块只接受「资源名:...」格式行；一旦遇到以下情况则退出 breakdown：
      //      a) 新专项锚点行（府库△/驻军△/兵种△/季度△/情报△/收支△）
      //      b) 空行（收支块已结束）
      //    退出后重新进入主循环 Step2 处理该行
      // ══════════════════════════════════════
      if (anchor === 'breakdown') {
        // 检查是否遇到了新锚点行 —— 若是，退出 breakdown，让该行在下方 Step2 重新处理
        // （收支△本身也算新块，虽然不常见但容错）
        if (/^(收支|府库|暗账|驻军|兵种|季度|情报|产出)△/.test(line)) {
          anchor = null;
          // 不 continue，让代码继续往下执行 Step2 处理本行
        } else {
          // 格式：金:产出+30,维护-24,明账-10,府库-120,合计-124
          //       民心:赤字-5,合计-5
          //       兵 战损-80,合计-80   （空格分隔也支持）
          const catM = line.match(/^(金|粮|兵|民心)[：:,，\s]*(.*)/);
          if (catM) {
            const cat  = catM[1];
            const rest = catM[2];
            const items = [];
            // 先摘除"合计±N"避免被误拆为 label="计" val=N
            const restNoTotal = rest.replace(/合计[+-]?\d+,?/g, '');
            // 匹配分项：中文标签 + 数值。排除纯数字、符号开头的残余
            const itemRe = /([^\s,，+\-\d·|][^,，·+\-\d]*?)([+-]\d+)/g;
            let im;
            while ((im = itemRe.exec(restNoTotal)) !== null) {
              let lbl = im[1].replace(/[→:：]/g, '').trim();
              if (lbl === '暗账') lbl = '府库';  // 字段别名统一
              // 过滤：空标签、完整"合计"词、单字残余"合"/"计"
              if (lbl && lbl !== '合计' && lbl !== '合' && lbl !== '计' && lbl.length >= 2) {
                items.push({ label: lbl, val: parseInt(im[2]) });
              }
            }
            const totalM = rest.match(/合计([+-]?\d+)/);
            const total  = totalM ? parseInt(totalM[1]) : null;
            change.breakdown[cat] = { items, total };
            continue;
          }
          // 非资源格式行且非新锚点：可能是收支块内的说明文字，直接跳过
          continue;
        }
        // 走到这里意味着 anchor 已被重置为 null，继续往下用 Step2 处理本行
      }

      // ══════════════════════════════════════
      //  Step 4：通用 fallback（未知 XX△ 模式）
      //  仅捕获 Step1/Step2 均未命中的行
      //  排除资源名前缀（金△/粮△/兵△/民心△/城△）——
      //    这些行在 Step1 处理（总变化行），不应在此二次处理
      //  排除已知专项锚点前缀——这些行在 Step2 处理
      // ══════════════════════════════════════
      const genericM = line.match(/^([^△\s]{1,10})△\s*(.*)/);
      if (genericM) {
        const key  = genericM[1].trim();
        const body = genericM[2].trim();
        // 已知锚点关键字：由 Step1/Step2 专门处理，此处跳过
        const KNOWN_ANCHORS = ['金','粮','兵','民心','城','收支','府库','暗账','驻军','兵种','季度','情报'];
        if (!KNOWN_ANCHORS.includes(key)) {
          anchor = null;
          const deltas = [];
          for (const dm of body.matchAll(/(金|粮|兵|民心|城)([+-]?\d+)/g)) {
            deltas.push({ res: dm[1], val: parseInt(dm[2]) });
          }
          const colonIdx = body.search(/[:：]/);
          const label    = colonIdx > 0 ? body.slice(0, colonIdx).trim()
            : body.replace(/(金|粮|兵|民心|城)[+-]?\d+[,，]?/g, '').trim();
          if (!change.anchorGroups[key]) change.anchorGroups[key] = [];
          change.anchorGroups[key].push({ label, deltas, text: line });
        }
        // 注：KNOWN_ANCHORS 中的资源名前缀行（金△+0 单独成行）已在 Step1 捕获
      }
    } // end for lines

    // ── 收支合计校验 ──
    _validateBreakdown(change, slot);

    // ── 兼容旧渲染路径：guards ← garrisonOps ──
    change.garrisonOps.forEach(op => {
      const existing = change.guards.find(g => g.cityName === op.cityName);
      const members  = op.ops.map(o => ({ name: o.name, dir: o.dir === 'dead' ? 'out' : o.dir }));
      if (existing) {
        existing.members.push(...members);
      } else {
        change.guards.push({ cityName: op.cityName, members });
      }
    });

    // ── 兼容旧渲染路径：troopChanges ← troopOps ──
    change.troopChanges = change.troopOps.map(op => ({
      cityName: op.cityName,
      spec:     op.entries.map(e => e.isDelta ? `${e.type}${e.val > 0 ? '+' : ''}${e.val}` : `${e.type}:${e.val}`).join(','),
      entries:  op.entries.map(e => ({ type: e.type, val: e.val })),
      isDelta:  op.isDelta,
    }));

    // ── 兼容旧渲染路径：anchorGroups.驻军 ← garrisonOps ──
    if (change.garrisonOps.length && !change.anchorGroups['驻军']) {
      change.anchorGroups['驻军'] = [];
      const cityMap = {};
      change.garrisonOps.forEach(op => {
        if (!cityMap[op.cityName]) cityMap[op.cityName] = { incoming: [], outgoing: [] };
        op.ops.forEach(o => {
          if (o.dir === 'in')  cityMap[op.cityName].incoming.push(o.name);
          else                 cityMap[op.cityName].outgoing.push(o.name);
        });
      });
      Object.entries(cityMap).forEach(([city, mv]) => {
        change.anchorGroups['驻军'].push({ cityName: city, incoming: mv.incoming, outgoing: mv.outgoing, label: city });
      });
    }

    // ── 兼容旧渲染路径：anchorGroups.兵种 ← troopOps ──
    if (change.troopOps.length && !change.anchorGroups['兵种']) {
      change.anchorGroups['兵种'] = [];
      change.troopOps.forEach(op => {
        change.anchorGroups['兵种'].push({
          label:  op.cityName,
          deltas: op.entries.map(e => ({ res: e.type, val: e.val })),
          text:   '',
          isTroop: true,
        });
      });
    }

    return change;
  }

  // ─────────────────────────────────────────
  //  解析府库/暗账行
  //  格式：陈留粮市:金-120,粮+195
  // ─────────────────────────────────────────
  function _parseTreasuryLine(line) {
    const colonIdx = line.search(/[:：]/);
    let desc, resRaw;
    if (colonIdx > 0) {
      desc   = line.slice(0, colonIdx).trim();
      resRaw = line.slice(colonIdx + 1).trim();
    } else {
      desc   = line;
      resRaw = '';
    }
    const entries = [];
    for (const m of resRaw.matchAll(/(金|粮|兵|民心)([+-]\d+)/g)) {
      entries.push({ res: m[1], val: parseInt(m[2]) });
    }
    return { desc, entries };
  }

  // ─────────────────────────────────────────
  //  解析驻军△
  //  格式A：驻军△长安:+赵云          （单人，有+/-）
  //  格式B：驻军△长安:+赵云,-魏延      （多人，逗号分隔）
  //  格式C：驻军△长安:-文聘(阵亡)      （阵亡标注）
  //  格式D：驻军△长安:赵云/马超        （无符号 = 覆写守将）
  //  格式E：驻军△长安:无              （清空守将）
  // ─────────────────────────────────────────
  function _parseGarrisonOp(line, change) {
    const re = /驻军△([^:：]+)[：:](.+)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const cityName = m[1].trim();
      const body     = m[2].trim();
      const ops      = [];

      if (body === '无') {
        // 清空守将
        ops.push({ name: '无', dir: 'clear' });
      } else {
        // 逐 token：+张飞 / -赵云 / -文聘(阵亡) / 赵云/马超（覆写）
        const tokenRe = /([+-]?)([^+\-,，\s(（]+)(?:[（(]([^）)]*)[）)])?/g;
        let tm;
        while ((tm = tokenRe.exec(body)) !== null) {
          const sign    = tm[1] || '';
          const name    = tm[2].trim();
          const annot   = tm[3] ? tm[3].trim() : '';
          if (!name) continue;

          // 斜线分隔守将视为 in
          if (name.includes('/')) {
            name.split('/').forEach(n => {
              if (n.trim()) ops.push({ name: n.trim(), dir: 'in' });
            });
            continue;
          }

          let dir;
          if (sign === '+') {
            dir = 'in';
          } else if (sign === '-') {
            dir = (annot === '阵亡') ? 'dead' : 'out';
          } else {
            // 无符号：视为入驻
            dir = 'in';
          }
          ops.push({ name, dir });
        }
      }

      if (!ops.length) continue;
      change.garrisonOps.push({ cityName, ops });
    }
  }

  // ─────────────────────────────────────────
  //  解析兵种△
  //  增减式：兵种△长安:骑+500,步-200   → isDelta=true
  //  覆写式：兵种△长安:步:2000,弓:1000  → isDelta=false
  // ─────────────────────────────────────────
  function _parseTroopOp(line, change) {
    const re = /兵种△([^:：]+)[：:]([^\n]+)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const cityName = m[1].trim();
      const spec     = m[2].trim();
      const deltaEntries = [];
      const absEntries   = [];

      for (const dm of spec.matchAll(/([步弓骑水蛮])([+-]\d+)/g)) {
        deltaEntries.push({ type: dm[1], val: parseInt(dm[2]) });
      }
      for (const am of spec.matchAll(/([步弓骑水蛮])[:：](\d+)/g)) {
        absEntries.push({ type: am[1], val: parseInt(am[2]) });
      }

      if (deltaEntries.length) {
        change.troopOps.push({ cityName, entries: deltaEntries, isDelta: true });
      } else if (absEntries.length) {
        change.troopOps.push({ cityName, entries: absEntries, isDelta: false });
      }
    }
  }

  // ─────────────────────────────────────────
  //  解析季度行：金-40,粮-60
  // ─────────────────────────────────────────
  function _parseSeasonalLine(line, arr) {
    if (!line) return;
    for (const m of line.matchAll(/(金|粮|兵|民心)([+-]\d+)/g)) {
      arr.push({ res: m[1], val: parseInt(m[2]) });
    }
  }

  // ─────────────────────────────────────────
  //  收支合计校验
  //  breakdown[res].total 应 == resources[res]
  // ─────────────────────────────────────────
  function _validateBreakdown(change, slot) {
    for (const res of ['金', '粮', '兵', '民心']) {
      const bd = change.breakdown[res];
      if (!bd || bd.total === null || bd.total === undefined) continue;
      const declared = change.resources[res];
      if (declared === undefined) continue;
      if (bd.total !== declared) {
        const msg = `${res}合计不符：收支明细合计${bd.total > 0 ? '+' : ''}${bd.total}，` +
                    `总变化${declared > 0 ? '+' : ''}${declared}`;
        change.warnings.push(msg);
        console.warn(`[SGParser] [变动][${slot}] ${msg}`);
      }
    }
  }

  // ─────────────────────────────────────────
  //  应用单条 troopOp 到 cityOwnership
  // ─────────────────────────────────────────
  function _applyOneTroopOp(op, cityOwnership) {
    const ow = cityOwnership[op.cityName];
    if (!ow) return;
    if (!ow.troops) ow.troops = {};
    if (op.isDelta) {
      op.entries.forEach(e => {
        ow.troops[e.type] = Math.max(0, (ow.troops[e.type] || 0) + e.val);
      });
    } else {
      // 覆写
      ow.troops = {};
      op.entries.forEach(e => { ow.troops[e.type] = e.val; });
    }
  }

  // ─────────────────────────────────────────
  //  构建 cityOwnership（地图用）
  // ─────────────────────────────────────────
  function _buildCityOwnership(players, npcCities) {
    const result = {};
    players.forEach((p, idx) => {
      const slotIdx = ['甲','乙','丙'].indexOf(p.slot);
      const pidx    = slotIdx >= 0 ? slotIdx : idx;
      (p.cities_list || []).forEach((c, ci) => {
        result[c.name] = {
          owner:      `p${pidx}`,
          playerIdx:  pidx,
          playerName: p.name || p.slot,
          holder:     c.holder || '无',
          troops:     c.troops || {},
          isMulti:    ci > 0,
        };
      });
    });
    (npcCities || []).forEach(c => {
      if (!result[c.name]) {
        result[c.name] = {
          owner:      'npc',
          playerIdx:  -1,
          playerName: '',
          holder:     c.holder || '无',
          troops:     c.troops || {},
          isMulti:    false,
        };
      }
    });
    return result;
  }

  // ═══════════════════════════════════════════════
  //  格式 B 解析器：简化新格式 v3（管道行）
  //  保持与旧版完全相同的逻辑，仅做整理
  // ═══════════════════════════════════════════════
  function _parseSimplified(rawText) {
    const result = _empty();

    const structM   = rawText.match(/【结构化数据】([\s\S]*?)(?=【[^】]+】|$)/);
    const structZone = structM ? structM[1] : rawText;
    result.rawDigest = structM
      ? rawText.slice(0, rawText.indexOf('【结构化数据】')).trim()
      : '';

    const lines = structZone.split('\n').map(l => l.trim()).filter(Boolean);
    const playerMap = {}, garrisonArr = [], changeMap = {}, eventArr = [], errorArr = [];

    for (const line of lines) {
      if (/^【/.test(line) || /^\/\//.test(line)) continue;
      const typeM = line.match(/^([^△\s]+)△\s*\|?(.*)/);
      if (!typeM) continue;
      const type   = typeM[1].trim();
      const fields = _parsePipeFields(typeM[2].trim());

      switch (type) {
        case '回合':
          result.round     = parseInt(fields['回合']) || result.round;
          result.roundInfo = {
            round:     parseInt(fields['回合'])     || null,
            phase:     fields['阶段']               || '',
            nextRound: parseInt(fields['下一回合']) || null,
          };
          break;
        case '主公': {
          const name = fields['名称'] || fields['主公'] || '';
          if (!name) break;
          if (!playerMap[name]) playerMap[name] = _emptyPlayer(name);
          const p = playerMap[name];
          if (fields['金']     != null) p.gold   = parseInt(fields['金'])   || 0;
          if (fields['粮']     != null) p.food   = parseInt(fields['粮'])   || 0;
          if (fields['兵']     != null) p.troop  = parseInt(fields['兵'])   || 0;
          if (fields['民心']   != null) p.morale = parseInt(fields['民心']) || 0;
          if (fields['城池数'] != null) p.cities = parseInt(fields['城池数']) || 0;
          break;
        }
        case '驻军': {
          const cityName  = fields['城名'] || '';
          const holderRaw = fields['武将'] || '无';
          const holders   = holderRaw === '无' ? [] : holderRaw.split(',').map(s => s.trim());
          garrisonArr.push({
            cityName,
            holder:   holders.join('/') || '无',
            gold:     parseInt(fields['金'])   || 0,
            food:     parseInt(fields['粮'])   || 0,
            troop:    parseInt(fields['兵'])   || 0,
            morale:   parseInt(fields['民心']) || 0,
            status:   fields['状态'] || '正常',
            generals: holders.map(h => ({ name: h, status: '健康' })),
          });
          break;
        }
        case '收支': {
          const lord = fields['主公'] || '';
          if (!changeMap[lord]) changeMap[lord] = _emptyChange(lord);
          const ch = changeMap[lord];
          if (fields['金']   != null) ch.resources['金']   = parseInt(fields['金'])   || 0;
          if (fields['粮']   != null) ch.resources['粮']   = parseInt(fields['粮'])   || 0;
          if (fields['兵']   != null) ch.resources['兵']   = parseInt(fields['兵'])   || 0;
          if (fields['民心'] != null) ch.resources['民心'] = parseInt(fields['民心']) || 0;
          if (fields['原因']) ch.intel.push(fields['原因']);
          break;
        }
        case '事件': {
          const lord = fields['主公'] || '';
          const content = fields['内容'] || '';
          if (content) {
            eventArr.push({ lord, place: fields['地点'] || '', content });
            if (lord) {
              if (!changeMap[lord]) changeMap[lord] = _emptyChange(lord);
              changeMap[lord].intel.push(content);
            }
          }
          break;
        }
        case '错误':
          errorArr.push({
            type:    fields['类型'] || '未知',
            raw:     fields['原文'] || '',
            problem: fields['问题'] || '',
            fix:     fields['修正'] || '',
          });
          break;
      }
    }

    // 后处理：players
    const slotNames = ['甲', '乙', '丙'];
    let slotIdx = 0;
    for (const [name, p] of Object.entries(playerMap)) {
      p.slot = slotNames[slotIdx] || `玩家${slotIdx + 1}`;
      slotIdx++;
      p.cities_list = [];
      p.ownedCities = [];
      if (p.cities_list.length) p.city = p.cities_list[0].name;
      result.players.push(p);
    }

    result.garrison = garrisonArr.map(g => ({ cityName: g.cityName, generals: g.generals }));

    result.changes = Object.entries(changeMap).map(([lord, ch]) => {
      const player = result.players.find(p => p.name === lord);
      ch.slot = player ? player.slot : lord;
      return ch;
    });

    result.events = eventArr;
    result.errors  = errorArr;
    result.cityOwnership = _buildCityOwnership(result.players, []);

    return result;
  }

  function _parsePipeFields(str) {
    const fields = {};
    if (!str) return fields;
    str.split('|').forEach(seg => {
      const eq = seg.indexOf('=');
      if (eq === -1) return;
      const key = seg.slice(0, eq).trim();
      const val = seg.slice(eq + 1).trim();
      if (key) fields[key] = val;
    });
    return fields;
  }

  function _emptyPlayer(name) {
    return {
      slot: '', name,
      city: '', gold: null, food: null, troop: null, morale: null, cities: null,
      generals: [], cities_list: [], ownedCities: [],
      situation_note: '', suggestions: [],
    };
  }

  function _emptyChange(lord) {
    return {
      slot: lord, raw: '',
      resources: {}, cities: [], guards: [], troopChanges: [],
      breakdown: {}, treasury: [], garrisonOps: [], troopOps: [], quarterly: [],
      darkItems: [], seasonal: [], intel: [], anchorGroups: {}, warnings: [],
    };
  }

  // ─────────────────────────────────────────
  //  格式 C：降级（旧 emoji 块格式）
  // ─────────────────────────────────────────
  function _parseLegacy(text, result) {
    const rnM = text.match(/第\s*(\d+)\s*回合/);
    if (rnM) result.round = parseInt(rnM[1]);

    const blockRe = /👤[【\[]([^】\]\n]+)[】\]]([\s\S]*?)(?=👤[【\[]|$)/g;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
      const p = _parseLegacyPlayer(m[1], m[2]);
      if (p.name) result.players.push(p);
    }
    result.cityOwnership = _buildCityOwnership(result.players, []);
  }

  function _parseLegacyPlayer(header, body) {
    const parts = header.split(/\s*[·•\-]\s*/);
    const p = {
      slot: '', name: parts[0].trim(), city: parts[1] ? parts[1].trim() : '',
      gold: null, food: null, troop: null, morale: null, cities: null,
      generals: [], cities_list: [], ownedCities: [], situation_note: '', suggestions: [],
    };
    if (p.city) {
      p.cities_list = [{ name: p.city, holder: '无', troops: {} }];
      p.ownedCities = [p.city];
    }
    const resMap = [
      { key:'gold',   re:/💰\s*金[钱]?\s*[：:\s]\s*(\d+)/            },
      { key:'food',   re:/🌾\s*粮[草食]?\s*[：:\s]\s*(\d+)/           },
      { key:'troop',  re:/(?:🛡|🛡️)\uFE0F?\s*兵[力]?\s*[：:\s]\s*(\d+)/  },
      { key:'morale', re:/(?:❤|❤️)\uFE0F?\s*民心\s*[：:\s]\s*(\d+)/   },
      { key:'cities', re:/🏯\s*城[池]?\s*[：:\s]\s*(\d+)/              },
    ];
    for (const { key, re } of resMap) {
      const rm = body.match(re);
      if (rm) p[key] = parseInt(rm[1]);
    }
    const genM = body.match(/(?:⚔️?)\s*(?:麾下)?武将[列表]*\s*[：:]\s*([\s\S]+?)(?=\n\s*\n|\n\s*[📍🎯❤💰🌾🛡🏯⚔]|$)/);
    if (genM) {
      genM[1].split(/[,，、\n]/).forEach(s => {
        const n   = s.trim().replace(/[（(][^）)]*[）)]/g, '').trim();
        const stM = s.match(/[（(](健康|疲劳|受伤|患病|阵亡)[）)]/);
        if (n && n.length >= 2 && n.length <= 8) p.generals.push({ name: n, status: stM ? stM[1] : '健康' });
      });
    }
    return p;
  }

  // ─────────────────────────────────────────
  //  兵力格式化（供弹窗显示用）
  // ─────────────────────────────────────────
  function formatTroops(troops) {
    if (!troops || typeof troops !== 'object') return '';
    const parts = TROOP_TYPES
      .filter(t => troops[t] != null && troops[t] > 0)
      .map(t => `${t} ${troops[t].toLocaleString()}`);
    return parts.join(' · ');
  }

  // ─────────────────────────────────────────
  //  GM 预览摘要
  // ─────────────────────────────────────────
  function summarize(parsed) {
    if (!parsed) return ['❌ 无法解析'];
    const lines = [];

    if (parsed.round) {
      lines.push(`<strong>🎴 回合：</strong><span class="pp-ok">第 ${parsed.round} 回合</span>`);
    }
    if (parsed.digest) {
      lines.push(`<strong>📡 速递：</strong><span class="pp-ok">${esc(parsed.digest)}</span>`);
    }

    lines.push(`<strong>👤 玩家识别：</strong><span class="${parsed.players.length ? 'pp-ok' : 'pp-nil'}">${parsed.players.length} 位</span>`);
    parsed.players.forEach(p => {
      const res = [];
      if (p.gold   != null) res.push(`💰${p.gold}`);
      if (p.food   != null) res.push(`🌾${p.food}`);
      if (p.troop  != null) res.push(`🛡️${p.troop}`);
      if (p.morale != null) res.push(`❤️${p.morale}`);
      if (p.cities != null) res.push(`🏯${p.cities}`);
      const genStr = p.generals.map(g => {
        const s = g.status !== '健康' ? `(${g.status[0]})` : '';
        return g.name + s;
      }).join('、') || '无';
      const cityStr = (p.cities_list || []).map(c => {
        let s = c.name;
        if (c.holder && c.holder !== '无') s += `[${c.holder}]`;
        const tf = formatTroops(c.troops);
        if (tf) s += `{${tf}}`;
        return s;
      }).join('、') || '—';
      lines.push(
        `&nbsp;&nbsp;[${p.slot || '?'}] <strong>${esc(p.name)}</strong>` +
        ` &nbsp;${res.join(' ') || '<span class="pp-nil">未识别资源</span>'}` +
        ` &nbsp;⚔️ ${esc(genStr)}` +
        ` &nbsp;🏯 ${esc(cityStr)}`
      );
    });

    if (parsed.npcCities && parsed.npcCities.length) {
      const npcStr = parsed.npcCities.slice(0, 6).map(c =>
        c.name + (c.holder && c.holder !== '无' ? `[${c.holder}]` : '')
      ).join('、') + (parsed.npcCities.length > 6 ? `…等${parsed.npcCities.length}城` : '');
      lines.push(`<strong>🏯 NPC城池：</strong><span class="pp-ok">${esc(npcStr)}</span>`);
    }

    const bLen = (parsed.battles || []).length;
    lines.push(`<strong>🔥 战报：</strong><span class="${bLen ? 'pp-ok' : 'pp-nil'}">${bLen ? bLen + ' 场' : '本回合无战事'}</span>`);
    (parsed.battles || []).forEach(b => {
      const icon = b.result === '胜' ? '✅' : b.result === '负' ? '❌' : '🔶';
      lines.push(`&nbsp;&nbsp;${icon} ${esc(b.attacker)}→${esc(b.defender)} ${b.result} 攻损${b.attacker_loss}守损${b.defender_loss}`);
    });

    // 变动摘要
    const chLen = (parsed.changes || []).filter(c => !c.__npc && typeof c === 'object').length;
    if (chLen) {
      lines.push(`<strong>📜 变动记录：</strong><span class="pp-ok">${chLen} 位玩家</span>`);
      (parsed.changes || []).forEach(ch => {
        if (!ch || typeof ch !== 'object' || !ch.slot || ch.slot.length > 1) return;
        const resStr = Object.entries(ch.resources || {})
          .map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ');
        const warns  = ch.warnings && ch.warnings.length
          ? ` <span style="color:#f07070">⚠ ${ch.warnings.length}项校验警告</span>` : '';
        lines.push(`&nbsp;&nbsp;[${ch.slot}] ${resStr || '无变化'}${warns}`);
        // 府库/驻军/兵种/季度锚点摘要
        if (ch.treasury && ch.treasury.length)
          lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;🏛️ 府库 ${ch.treasury.length} 笔`);
        if (ch.garrisonOps && ch.garrisonOps.length)
          lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;🛡️ 驻军调度 ${ch.garrisonOps.length} 城`);
        if (ch.troopOps && ch.troopOps.length)
          lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;⚔️ 兵种变动 ${ch.troopOps.length} 城`);
        if (ch.quarterly && ch.quarterly.length)
          lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;🗓️ 季度扣除`);
      });
    }

    // 天下动态
    const npcLen  = (parsed.npcStatus  || []).length;
    const wildLen = (parsed.wildEvents || []).length;
    if (npcLen || wildLen) {
      lines.push(`<strong>🎭 天下动态：</strong><span class="pp-ok">NPC ${npcLen} 条 · 野外 ${wildLen} 条</span>`);
      (parsed.npcStatus || []).forEach(s => {
        lines.push(`&nbsp;&nbsp;🏯 ${esc(s.city)}：${esc(s.desc)}`);
      });
      (parsed.wildEvents || []).forEach(e => {
        lines.push(`&nbsp;&nbsp;🌿 野外：${esc(e.desc)}`);
      });
    }

    const owned = Object.keys(parsed.cityOwnership || {});
    if (owned.length) {
      const pc = owned.filter(k => parsed.cityOwnership[k].owner !== 'npc').length;
      const nc = owned.filter(k => parsed.cityOwnership[k].owner === 'npc').length;
      lines.push(`<strong>🗺️ 城池归属：</strong><span class="pp-ok">玩家 ${pc} 城 · NPC ${nc} 城</span>`);
    }

    lines.push(`<strong>📋 剧情区：</strong><span class="pp-ok">${(parsed.rawDigest || '').length} 字符</span>`);
    return lines;
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { parse, summarize, formatTroops, TROOP_TYPES };
})();
