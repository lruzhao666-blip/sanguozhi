/**
 * parser.js — 三国志文字版 · AI内容解析器 v13
 * v17 (#sanguo-npc-inherit-parser-v1): 支持 [NPC] 同上 简写,输出 npcCitiesInherit 标记
 * v16 (2026-XX-XX): 对齐 GM 规则书 v3.40 — [调度] 段状态白名单收窄至 4 种
 *                   (剩N/攻城中/交战中/客驻),旧词归一化兼容;
 *                   [世界] 段状态收窄至 2 种(被俘/在野),「客途」归一化为「在野」;
 *                   密令选项序号 ⑤⑥ → ④⑤;
 *                   匹配失败的 [调度]/[世界] 行打 console.warn。
 * v13 (变更): [在途] 标签更名为 [调度],双名兼容;_parseTransit 输出新增 slot 字段(0/1/2|null)
 * v14 (变更): _parseBattles 输出新增 attackerSlot/defenderSlot/
 *             attackerFaction/defenderFaction,供军报方案二徽章渲染
 *
 * 规则基准：《三国志文字版》核心引擎 v3.20.1
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
  //  主入口：格式探针 → 路由到对应解析器
  // ─────────────────────────────────────────
  function parse(rawText) {
    if (!rawText || !rawText.trim()) return _empty();

    // ── 格式 B：简化新格式 v3（含【结构化数据】或 △| 管道行）──
    if (/【结构化数据】/.test(rawText) || /[△▽]\|/.test(rawText)) {
      return _parseSimplified(rawText);
    }

    // ── 格式 A / C：提取代码块 ──
    const codeM = rawText.match(/```[\w]*\n?([\s\S]*?)```/);
    const codeBlock = codeM ? codeM[1] : rawText;

    // 按 36 个 = 切分
    const sepIdx = codeBlock.indexOf(SEP);
    let storyZone, dataZone;
    if (sepIdx !== -1) {
      storyZone = codeBlock.slice(0, sepIdx).trim();
      dataZone  = codeBlock.slice(sepIdx + SEP.length).trim();
    } else {
      storyZone = codeBlock.trim();
      dataZone  = '';
    }

    const result = _empty();
    result.rawDigest = storyZone;

    // 先解析密报标签:从 storyZone 切出 [[密|X]]...[[/密]] 块,
    // 写入 result.secrets,并从 storyZone 中移除密报块(防泄露)。
    storyZone = _parseSecrets(storyZone, result);
    result.rawDigest = storyZone;

    if (dataZone) {
      _parseDataZone(dataZone, result);
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
      battleSummary: '',      // 新增
      transit:       [],      // 新增
      changes:       [],      // [{slot,resources,breakdown,treasury,garrisonOps,troopOps,quarterly,…}]
      garrison:      [],
      cityOwnership: {},
      roundInfo:     {},
      npcStatus:     [],      // [{city,desc}]  ← 新增
      wildEvents:    [],      // [{desc}]        ← 新增
      events:        [],      // v3 格式事件
      errors:        [],      // v3 格式错误
      secrets:       [],      // [{slots:['甲'], title:'细作回报', body:'...'}] 密报阁条目
      world:         [],      // [{name,status,location,remaining,raw}] 世界段武将
      worldInherit:  false,   // #sanguo-inherit-batch2-v1 [世界] 同上
      npcCitiesInherit: false,  // #sanguo-npc-inherit-parser-v1
      // #sanguo-inherit-batch2-v1 玩家段 城池/武将 继承标记,
      // 由 _parsePlayerBlock 写入 player 对象内部,_empty 无需占位
    };
  }

  // ─────────────────────────────────────────
  //  密报标签解析(M-39 信息可见性契约)
  //  输入:剧情区原文(含 [[密|X]]...[[/密]] 标签)
  //  输出:返回剥除密报块后的剧情区文本;
  //       result.secrets 写入密报条目数组
  //
  //  密报块结构:
  //    [[密|甲]] 或 [[密|甲,丙]]
  //    🔒 四字小标题
  //    正文内容(可多行)
  //
  //    🔒 另一条小标题
  //    正文内容
  //    [[/密]]
  //
  //  小标题特例:🔒 密令选项
  //    每行格式: ⑤ 四字行动名 —— 注解
  //    解析时拆为 { isCmd: true, num: '⑤', name: '四字行动名', note: '注解' }
  //
  //  返回的 secrets 数组元素:
  //    普通密报: { slots:['甲'], title:'细作回报', body:'…', isCmd:false }
  //    密令选项: { slots:['甲'], title:'密令选项', isCmd:true,
  //                items:[{num:'⑤', name:'…', note:'…'}, ...] }
  // ─────────────────────────────────────────
  function _parseSecrets(text, result) {
    if (!text) return text;
    const RE = /\[\[密\|([甲乙丙,]+)\]\]([\s\S]*?)\[\[\/密\]\]/g;

    let m;
    while ((m = RE.exec(text)) !== null) {
      const slotsRaw = m[1].trim();
      const slots = slotsRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (!slots.length) continue;

      // 按 🔒 小标题切分一个密报块内的多条密报
      const inner = m[2].trim();
      const blocks = _splitSecretBlocks(inner);
      blocks.forEach(b => {
        if (b.isCmd) {
          result.secrets.push({
            slots,
            title: '密令选项',
            isCmd: true,
            items: b.items,
          });
        } else {
          result.secrets.push({
            slots,
            title: b.title,
            body:  b.body,
            isCmd: false,
          });
        }
      });
    }

    // 从原文中剥除所有密报块,防止泄露到 rawDigest
    return text.replace(RE, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ─────────────────────────────────────────
  //  辅助:将一个密报块(标签内文本)按 🔒 小标题切分
  //  返回 [{ title, body, isCmd, items? }, ...]
  // ─────────────────────────────────────────
  function _splitSecretBlocks(text) {
    if (!text) return [];
    // 按行扫描,🔒 开头视为新条目
    const lines = text.split('\n');
    const out = [];
    let cur = null;

    const flushCur = () => {
      if (!cur) return;
      if (cur.isCmd) {
        // 密令选项:解析每行为 { num, name, note }
        cur.items = _parseCmdItems(cur.bodyLines.join('\n'));
        delete cur.bodyLines;
      } else {
        cur.body = cur.bodyLines.join('\n').trim();
        delete cur.bodyLines;
      }
      out.push(cur);
      cur = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();
      // 🔒 开头(允许前导空格)= 新条目标题
      const headM = t.match(/^🔒\uFE0F?\s*(.+)$/);
      if (headM) {
        flushCur();
        const title = headM[1].trim();
        const isCmd = /密令选项/.test(title);
        cur = { title, isCmd, bodyLines: [] };
        continue;
      }
      if (cur) cur.bodyLines.push(line);
    }
    flushCur();
    return out;
  }

  // ─────────────────────────────────────────
  //  辅助:解析"密令选项"块的多行
  //  每行格式:⑤ 四字行动名 —— 注解
  //          或 ⑥ ...
  //  破折号支持 —— / -- / —— / 全角 / 半角组合
  // ─────────────────────────────────────────
  function _parseCmdItems(text) {
    const items = [];
    if (!text) return items;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    // v16 (2026-XX): 对齐 GM 规则书 v3.40,密令选项序号从 ⑤⑥ 改为 ④⑤,
    // 旧存档兼容 ⑤⑥⑦⑧⑨⑩。
    const numRe = /^([④⑤⑥⑦⑧⑨⑩])\s*(.+)$/;
    for (const line of lines) {
      const m = line.match(numRe);
      if (!m) continue;
      const rest = m[2].trim();
      // 拆破折号
      const dashIdx = rest.search(/——|──|\s[-—]{2}\s/);
      let name = rest, note = '';
      if (dashIdx > 0) {
        name = rest.slice(0, dashIdx).trim();
        note = rest.slice(dashIdx).replace(/^[——──\s\-—]+/, '').trim();
      }
      items.push({ num: m[1], name, note });
    }
    return items;
  }

  // ─────────────────────────────────────────
  //  数据区总调度
  // ─────────────────────────────────────────
  function _parseDataZone(text, result) {
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

    // [NPC] — #sanguo-npc-inherit-parser-v1
    // 支持 "[NPC] 同上" 简写:置 npcCitiesInherit 标记,
    // 由 main.js 在 rowToRound / rebuildPlayers 阶段从上回合继承
    const npcRaw = blocks['NPC'] || blocks['npc'] || '';
    if (npcRaw) {
      const npcRawTrim = npcRaw.trim();
      if (/^同上\s*$/.test(npcRawTrim)) {
        result.npcCitiesInherit = true;
        // npcCities 留空数组,等 main.js 继承
      } else {
        result.npcCities = _parseNpcBlock(npcRaw);
      }
    }

    // [战报]
    if (blocks['战报']) {
      result.battles = _parseBattles(blocks['战报']);
    }

    // [军报摘要]
    if (blocks['军报摘要']) {
      result.battleSummary = blocks['军报摘要'].trim();
    }

    // [调度](v3.23 契约升级,原 [在途] 同义);双名兼容,优先 [调度]
    if (blocks['调度']) {
      result.transit = _parseTransit(blocks['调度']);
    } else if (blocks['在途']) {
      result.transit = _parseTransit(blocks['在途']);
    }

    // [世界](v3.39 M-31 新增):被俘/在野/客途三态武将
    // #sanguo-inherit-batch2-v1 支持"同上"
    if (blocks['世界']) {
      const worldRawTrim = blocks['世界'].trim();
      if (/^同上\s*$/.test(worldRawTrim)) {
        result.worldInherit = true;
        // world 留空,等 main.js 继承并自动减 1
      } else {
        result.world = _parseWorld(blocks['世界']);
      }
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

  }

  // ─────────────────────────────────────────
  //  按方括号标签切块
  // ─────────────────────────────────────────
  function _splitBlocks(text) {
    const KNOWN = new Set(['回合','速递','甲','乙','丙','NPC','npc','战报','军报摘要','在途','调度','世界','变动','驻城']);
    const lines  = text.split('\n');
    const blocks = {};
    let curKey = null, curBuf = [];

    for (const line of lines) {
      const m = line.match(/^[\[【]([^\]】\n]{1,10})[\]】]/);
      if (m) {
        const key = m[1].trim();
        if (KNOWN.has(key)) {
          if (curKey !== null) blocks[curKey] = curBuf.join('\n');
          curKey = key;
          const rest = line.replace(/^[\[【][^\]】\n]{1,10}[\]】]\s*/, '').trim();
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
      // #sanguo-inherit-batch2-v1
      citiesInherit:    false,
      generalsInherit:  false,
    };

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      // 名号
      if (/^名号[:：]/.test(line)) {
        p.name = line.replace(/^名号[:：]\s*/, '').trim();
        continue;
      }
      // 资源行：金:54 粮:281 兵:680 民心:65 城:2
      const resM = line.match(/金[:：](\d+)\s+粮[:：](\d+)\s+兵[:：](\d+)\s+民心[:：](\d+)\s+城[:：](\d+)/);
      if (resM) {
        p.gold   = parseInt(resM[1]);
        p.food   = parseInt(resM[2]);
        p.troop  = parseInt(resM[3]);
        p.morale = parseInt(resM[4]);
        p.cities = parseInt(resM[5]);
        continue;
      }
      // 城池行 — #sanguo-inherit-batch2-v1 支持"同上"
      if (/^城池[:：]/.test(line)) {
        const cityRaw = line.replace(/^城池[:：]\s*/, '').trim();
        if (/^同上\s*$/.test(cityRaw)) {
          p.citiesInherit = true;
          // cities_list / ownedCities 留空,等 main.js 继承
        } else {
          p.cities_list = _parseCityList(cityRaw);
          p.ownedCities = p.cities_list.map(c => c.name);
          if (p.cities_list.length) p.city = p.cities_list[0].name;
        }
        continue;
      }
      // 武将行 — #sanguo-inherit-batch2-v1 支持"同上"
      if (/^武将[:：]/.test(line)) {
        const genRaw = line.replace(/^武将[:：]\s*/, '').trim();
        if (/^同上\s*$/.test(genRaw)) {
          p.generalsInherit = true;
        } else {
          p.generals = _parseGeneralList(genRaw);
        }
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
    if (/[（）]/.test(raw)) {
      console.warn('[SGParser] 城池行含全角括号: ' + raw.slice(0, 60));
    }
    const result = [];
    // 匹配 城名(内容)，内容可含嵌套括号（不含顶层括号）
    const re = /([^,，、\[(（\s]+)(?:\[([^\]]+)\])?[（(]([^）)]*)[）)]/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const name  = m[1].trim();
      const faction = m[2] ? m[2].trim() : null;
      const inner = m[3].trim();
      if (!name) continue;

      const pipeIdx = inner.indexOf('|');
      let holderRaw, troopsRaw;
      if (pipeIdx !== -1) {
        holderRaw = inner.slice(0, pipeIdx).trim();
        troopsRaw = inner.slice(pipeIdx + 1).trim();
      } else {
        holderRaw = inner;
        troopsRaw = null;
      }

      const EMPTY_HOLDER_TOKENS = new Set(['', '无', '空', '空缺', '待补', '待派', '—', '-']);
      const _trimmed = (holderRaw || '').trim();
      const holderEmpty = EMPTY_HOLDER_TOKENS.has(_trimmed);
      const holders = holderEmpty ? [] : _trimmed.split('/').map(s => s.trim()).filter(Boolean);
      result.push({
        name,
        faction,
        holder:  holderEmpty ? '无' : (holders.join('/') || '无'),
        holders,
        holderEmpty,
        troops:  _parseTroops(troopsRaw),
      });
    }

    // 兼容无括号纯城名
    if (!result.length) {
      raw.split(/[,，、\s]+/).forEach(s => {
        const n = s.trim();
        if (n) result.push({ name: n, faction: null, holder: '无', holders: [], holderEmpty: true, troops: {} });
      });
    }
    return result;
  }

  // ─────────────────────────────────────────
  //  解析 [NPC] 块
  //  城池:许昌(夏侯惇/张辽),邺城(袁绍),合肥(乐进)
  // ─────────────────────────────────────────
  function _parseNpcBlock(raw) {
    const cityRaw = raw.replace(/^城池[:：]?\s*/i, '').trim();
    const list = _parseCityList(cityRaw);
    return list.map(c => ({
      name:    c.name,
      faction: c.faction,
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
    raw.split(',').forEach(seg => {
      const m = seg.trim().match(/^([步弓骑水蛮])[:：](\d+)$/);
      if (m) result[m[1]] = parseInt(m[2]);
    });
    return result;
  }

  // ─────────────────────────────────────────
  //  解析武将列表：马超(健康),庞德(疲劳)
  //  支持全角括号：马超（健康）
  //  状态白名单：健康/疲劳/受伤/患病/阵亡（规则v2.7.9 §武将状态）
  // ─────────────────────────────────────────
  function _parseGeneralList(raw) {
    if (!raw || !raw.trim()) return [];
    const result = [];
    // 同时匹配半角 () 和全角（）括号 — BUG#4 修复
    const re = /([^,，、(（\s]+)[（(]([^）)]*)[）)]/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const name   = m[1].trim();
      // 状态字段去除括号内多余空格，再查白名单
      let   status = m[2].trim();
      // #sanguo-parser-empty-status-fix-v1
      // 规则书 M-29 红线六:空括号 = 健康,不打警告
      if (!status) {
        status = '健康';
      } else if (!VALID_STATUS.includes(status)) {
        // 白名单外的非空状态：记录警告但不丢失武将，默认健康
        console.warn(`[SGParser] 武将"${name}"状态"${status}"不在白名单，视为健康`);
        status = '健康';
      }
      // 武将名：2-8 汉字（过滤拼音、英文、残余标点）
      if (name && name.length >= 2 && name.length <= 8 && /[\u4e00-\u9fa5]/.test(name)) {
        result.push({ name, status });
      }
    }
    // 兜底：无括号格式（如 "马超,庞德"）
    if (!result.length) {
      raw.split(/[,，、\s]+/).forEach(s => {
        const n = s.trim();
        if (n && n.length >= 2 && n.length <= 8 && /[\u4e00-\u9fa5]/.test(n)) {
          result.push({ name: n, status: '健康' });
        }
      });
    }
    return result;
  }

  // ─────────────────────────────────────────
  //  解析战报
  //  格式：攻方→守方 | 胜/平/负 | 伤亡:攻X守Y
  // ─────────────────────────────────────────
  function _parseBattles(raw) {
    if (!raw || !raw.trim()) return [];
    const battles = [];
    const re = /^(.+?)[→\->＞]\s*(.+?)\s*[|｜]\s*(胜|平|负)\s*[|｜]\s*伤亡[:：]攻(\d+)守(\d+)/;
    // 从一段名字字面值推断 slot / faction
    // 规则:开头是"甲/乙/丙" → slot=0/1/2;否则视为 NPC 阵营名(faction)
    // 兼容写法:"甲→宛城NPC"、"甲 关羽 → 曹操 夏侯惇" 等
    const _inferSide = (txt) => {
      const t = (txt || '').trim();
      if (!t) return { slot: null, faction: null };
      const first = t.charAt(0);
      if (first === '甲') return { slot: 0, faction: null };
      if (first === '乙') return { slot: 1, faction: null };
      if (first === '丙') return { slot: 2, faction: null };
      // NPC:取首段非空白非分隔为阵营名,长度 1-6 字
      const m = t.match(/^([^\s\/|,，、(()）]{1,6})/);
      return { slot: null, faction: m ? m[1] : null };
    };
    for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^本回合无战事/.test(line)) continue;
      const m = line.match(re);
      if (m) {
        const atkSide = _inferSide(m[1]);
        const defSide = _inferSide(m[2]);
        battles.push({
          attacker:      m[1].trim(),
          defender:      m[2].trim(),
          result:        m[3],
          attacker_loss: parseInt(m[4]),
          defender_loss: parseInt(m[5]),
          success:       m[3] === '胜',
          attackerSlot:    atkSide.slot,
          attackerFaction: atkSide.faction,
          defenderSlot:    defSide.slot,
          defenderFaction: defSide.faction,
        });
      }
    }
    return battles;
  }

  function _parseTransit(raw) {
    if (!raw || !raw.trim()) return [];
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 1 && /无在途|无调度|本回合无调度部队/.test(lines[0])) return [];
    const result = [];
    // v16 (2026-XX): 对齐 GM 规则书 v3.40 M-29 红线九,
    // 状态白名单收窄至 4 种(剩N/攻城中/交战中/客驻),
    // 旧词归一化保留兼容(围攻中/对峙中/撤退中/驻屯中)。
    const re = /^([甲乙丙]|\S{1,6})\s+(\S+)\s+(\S+?)→(\S+?)\s+([步弓骑水蛮]):(\d+)\s+(剩\d+|攻城中|交战中|客驻|对峙中|撤退中|驻屯中|围攻中)(?:\s+(.+))?\s*$/;

    // 状态归一化映射:旧词 → 新白名单
    const STATUS_NORMALIZE = {
      '围攻中': '攻城中',
      '对峙中': '交战中',
      '驻屯中': '交战中',
      // '撤退中' 单独处理(归一化为 剩N,见下方)
    };

    for (const line of lines) {
      const m = line.match(re);
      if (!m) {
        // 容错日志:让玩家在 F12 控制台能看到 GM 写错的行
        console.warn('[SGParser] [调度] 段行格式不符 v3.40 契约,跳过:', line);
        continue;
      }
      const factionRaw = m[1];
      const slot = factionRaw === '甲' ? 0 :
                   factionRaw === '乙' ? 1 :
                   factionRaw === '丙' ? 2 : null;

      // 状态归一化
      let status = m[7];
      if (status === '撤退中') {
        // 旧词「撤退中」归一化为「剩1」(GM 没给具体剩余回合,默认 1)
        status = '剩1';
        console.warn('[SGParser] [调度] 段旧词「撤退中」归一化为「剩1」:', line);
      } else if (STATUS_NORMALIZE[status]) {
        const newStatus = STATUS_NORMALIZE[status];
        console.warn('[SGParser] [调度] 段旧词「' + status + '」归一化为「' + newStatus + '」:', line);
        status = newStatus;
      }

      result.push({
        faction: factionRaw,
        slot,
        general: m[2],
        from: m[3],
        to: m[4],
        troopType: m[5],
        troopCount: parseInt(m[6]),
        status,
        note: m[8] ? m[8].trim() : '',
      });
    }
    return result;
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
  //  解析 [世界] 段(M-31 / M-39 v3.39 新增)
  //  格式:武将名|状态|位置|剩N回合
  //  状态白名单:被俘 / 在野 / 客途
  //  剩余回合:数字或 ∞
  //  示例:
  //    审配|被俘|甲方下邳|剩∞回合
  //    颜良|在野|河北一带|剩2回合
  //    张辽|客途|许昌→宛城|剩3回合
  //  无内容时 GM 写:本回合世界无事
  // ─────────────────────────────────────────
  function _parseWorld(raw) {
    if (!raw || !raw.trim()) return [];
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 1 && /本回合世界无事/.test(lines[0])) return [];

    // v16 (2026-XX): 对齐 GM 规则书 v3.40 M-29 红线十一,
    // [世界] 段状态白名单收窄至 2 种(被俘/在野),旧词「客途」归一化为「在野」。
    const VALID_STATUS_W = ['被俘', '在野'];
    // 正则保留「客途」识别,内部归一化为「在野」
    const re = /^(\S+?)\|(被俘|在野|客途)\|(\S+?)\|剩(\d+|∞)回合$/;
    const result = [];

    for (const line of lines) {
      const m = line.match(re);
      if (!m) {
        console.warn('[SGParser] [世界] 段行格式不符 v3.40 契约,跳过:', line);
        continue;
      }
      const name      = m[1].trim();
      let status      = m[2];
      const location  = m[3].trim();
      const remRaw    = m[4];
      const remaining = remRaw === '∞' ? Infinity : parseInt(remRaw, 10);

      // 旧词「客途」归一化为「在野」
      if (status === '客途') {
        console.warn('[SGParser] [世界] 段旧词「客途」归一化为「在野」:', line);
        status = '在野';
      }

      if (!VALID_STATUS_W.includes(status)) {
        console.warn('[SGParser] [世界] 武将"' + name + '"状态"' + status + '"不在白名单,跳过');
        continue;
      }

      result.push({
        name,
        status,
        location,
        remaining,
        raw: line,
      });
    }
    return result;
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
      const totalMatches = [...line.matchAll(/(金|粮|兵|民心|城)△([+-]?\d+)/g)];
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
// v3.18.1 任事行:甲 产出△ 城名:🌾 武将名 动作短语
// 单一格式,无 /剩余回合,无到期标记,无旧格式兼容
if (/^产出△/.test(line)) {
  anchor = null;
  const m = line.match(/^产出△\s*([^:：]+)[:：]\s*(🌾|💰|🤝|⚔️|🔨)\uFE0F?\s*([\u4e00-\u9fa5]{2,8})\s+(.+?)\s*$/);
  if (m) {
    const EMOJI_MAP = { '🌾':'屯田', '💰':'开市', '🤝':'招贤', '⚔️':'军训', '🔨':'工造' };
    const emoji = m[2];
    const type  = EMOJI_MAP[emoji];
    if (!change.productionOps) change.productionOps = [];
    change.productionOps.push({
      city:  m[1].trim(),
      buffs: [{ type, emoji, general: m[3], action: m[4].trim() }]
    });
  } else {
    console.warn('[SGParser] 产出△ 行不符 v3.18.1 格式:' + line);
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
          const catM = line.match(/^(金|粮|兵|民心)[：:,，\s]+(.*)/);
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
    // 数据校验功能已移除（保留空函数以兼容调用方）
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
          faction:    c.faction || null,
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
      // #sanguo-inherit-batch2-v1
      const genStr = p.generalsInherit
        ? '<span class="pp-ok">继承上回合</span>'
        : (p.generals.map(g => {
            const s = g.status !== '健康' ? `(${g.status[0]})` : '';
            return g.name + s;
          }).join('、') || '无');
      const cityStr = p.citiesInherit
        ? '<span class="pp-ok">继承上回合</span>'
        : ((p.cities_list || []).map(c => {
            let s = c.name;
            if (c.holder && c.holder !== '无') s += `[${c.holder}]`;
            const tf = formatTroops(c.troops);
            if (tf) s += `{${tf}}`;
            return s;
          }).join('、') || '—');
      lines.push(
        `&nbsp;&nbsp;[${p.slot || '?'}] <strong>${esc(p.name)}</strong>` +
        ` &nbsp;${res.join(' ') || '<span class="pp-nil">未识别资源</span>'}` +
        ` &nbsp;⚔️ ${esc(genStr)}` +
        ` &nbsp;🏯 ${esc(cityStr)}`
      );
    });

    if (parsed.npcCitiesInherit) {
      // #sanguo-npc-inherit-parser-v1
      lines.push(`<strong>🏯 NPC城池:</strong><span class="pp-ok">继承上回合(同上)</span>`);
    } else if (parsed.npcCities && parsed.npcCities.length) {
      const npcStr = parsed.npcCities.slice(0, 6).map(c =>
        c.name + (c.holder && c.holder !== '无' ? `[${c.holder}]` : '')
      ).join('、') + (parsed.npcCities.length > 6 ? `…等${parsed.npcCities.length}城` : '');
      lines.push(`<strong>🏯 NPC城池:</strong><span class="pp-ok">${esc(npcStr)}</span>`);
    }

    // #sanguo-inherit-batch2-v1 世界段摘要
    if (parsed.worldInherit) {
      lines.push(`<strong>🌐 [世界] 段:</strong><span class="pp-ok">继承上回合(同上,剩余回合自动 -1)</span>`);
    } else if (parsed.world && parsed.world.length) {
      lines.push(`<strong>🌐 [世界] 段:</strong><span class="pp-ok">${parsed.world.length} 名武将</span>`);
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
