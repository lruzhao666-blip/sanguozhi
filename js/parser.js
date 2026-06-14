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
  //  剧情区结构化拆分
  //  按固定标记顺序拆出五段：
  //    1. 回合标题（第 N 回合 · 标题）
  //    2. 📢 旁白
  //    3. 🌍 局势
  //    4. 🔥 风云段
  //    5. 🎯 行动令
  //  不在这五段里的文本归入 extra
  // ─────────────────────────────────────────
  function _parseStoryZone(text) {
    const result = {
      title: '',
      narrator: '',
      situation: '',
      events: '',
      actionOrder: '',
      extra: '',
    };
    if (!text) return result;

    // 提取回合标题（第一行匹配 "第 N 回合"）
    const titleM = text.match(/^(第\s*\d+\s*回合[^\n]*)/m);
    if (titleM) result.title = titleM[1].trim();

    // 按 emoji 标记切段
    const MARKERS = [
      { key: 'narrator',    re: /📢\s*旁白\s*\n?/ },
      { key: 'situation',   re: /🌍\s*局势\s*\n?/ },
      { key: 'events',      re: /🔥\s*风云段\s*\n?/ },
      { key: 'actionOrder', re: /🎯\s*行动令\s*\n?/ },
    ];

    // 找各段起始位置
    const positions = [];
    MARKERS.forEach(mk => {
      const m = text.match(mk.re);
      if (m) {
        positions.push({
          key: mk.key,
          start: m.index + m[0].length,
          markerStart: m.index,
        });
      }
    });

    // 按位置排序
    positions.sort((a, b) => a.markerStart - b.markerStart);

    // 切段：每段内容 = 从本段 start 到下一段 markerStart
    for (let i = 0; i < positions.length; i++) {
      const cur = positions[i];
      const end = (i + 1 < positions.length) ? positions[i + 1].markerStart : text.length;
      result[cur.key] = text.slice(cur.start, end).trim();
    }

    return result;
  }

  // ─────────────────────────────────────────
  //  解析行动令段（M-30 规则书格式）
  // ─────────────────────────────────────────
  function _parseActionsBlock(text) {
    const result = {
      firstMove: null,
      opportunities: [],
      playerActions: {}
    };

    if (!text) return result;

    // Step 1: 提取 🎯 行动令段
    // 结束符放宽：═══(三个或更多全角=) / ════(任意长全角=横线) / 36 个半角= / 📋 / 文末
    const actionsMatch = text.match(/🎯\s*行动令([\s\S]*?)(?=={20,}|📋|$)/);
    if (!actionsMatch) return result;

    const actionsText = actionsMatch[1];

    // Step 2: 提取先手权（玩家名号或单字甲/乙/丙，括号说明可选）
    // 改动：允许玩家名号(2-8 汉字) + 可选括号说明
    const firstMoveMatch = actionsText.match(/本回合先手[:：]\s*([\u4e00-\u9fa5]{1,8})(?:[（(][^）)]*[）)])?/);
    if (firstMoveMatch) {
      result.firstMove = firstMoveMatch[1].trim();
    }

    // Step 3: 提取公共机遇
    // 结束符放宽：═══ / 36 个 = / 📋 / 文末
    const oppMatch = actionsText.match(/⚔\s*公共机遇[\s\S]*?(?=═{3,}|={20,}|^[^\s]*\s*\[([甲乙丙])\]|$)/m);
    if (oppMatch) {
      const oppText = oppMatch[0];
      // 匹配每条机遇：机遇N · 标题 — 描述(⚔争夺·预估+N威望) 或 (🤝协力·预估+N威望)
      // 改动：emoji 后允许紧跟"争夺/协力"二字
      const oppRe = /机遇(\d+)\s*·\s*([^—]+?)\s*—\s*([^(（]+?)\s*[（(](🏆|⚔|🤝|🎲)(?:史诗|争夺|协力|赌博)?\s*·\s*(?:预估)?\s*\+?(\d+)\s*威望[）)]/g;
      let m;
      while ((m = oppRe.exec(oppText)) !== null) {
        result.opportunities.push({
          id: parseInt(m[1]),
          title: m[2].trim(),
          desc: m[3].trim(),
          emoji: m[4],
          type: (m[4] === '🏆' ? 'epic' : (m[4] === '⚔' ? 'compete' : (m[4] === '🤝' ? 'cooperate' : 'gamble'))),
          prestige: parseInt(m[5])
        });
      }
    }

    // Step 4: 提取每个玩家的三令选项
    // 改动核心：玩家段标识改为 "玩家名号 [甲]:" 格式
    // 用 --- 分隔玩家段，但要先把行动令段开头到第一个 [甲]/[乙]/[丙] 之前的内容剥掉
    const playerSections = actionsText.split(/^[-—]{3,}\s*$/m);
    playerSections.forEach(section => {
      // 匹配玩家槽位：玩家名号 [甲]:(威望:N) 或 玩家名号[甲]:(威望:N)
      // 改动：从 "城主([甲乙丙])" 改为 "\[([甲乙丙])\]" 抓方括号槽位
      const playerMatch = section.match(/\[([甲乙丙])\]\s*[:：]/);
      if (!playerMatch) return;

      const slot = playerMatch[1];
      result.playerActions[slot] = { wu: {}, wen: {}, ce: {} };

      // 匹配三令：武令|A.行动名:描述(风险·+N威望) 或 (风险·+N~M威望)
      // 改动：威望段允许 +N 或 +N~M 单符号写法
      const actionRe = /(主令|副令|应变令|武令|文令|策令)\s*[|｜]\s*([ABC])\s*[.．、]\s*([^:：]+?)\s*[:：]\s*([^(（]+?)\s*[（(]([^·]+?)\s*·\s*(?:预估)?\s*\+?([\d~～\-+]+?)\s*威望[）)]/g;
      let m;
      while ((m = actionRe.exec(section)) !== null) {
        const lingType = (m[1] === '主令' || m[1] === '武令') ? 'wu' : (m[1] === '副令' || m[1] === '文令') ? 'wen' : 'ce';
        const option = m[2].toLowerCase(); // 'a' | 'b'
        result.playerActions[slot][lingType][option] = {
          name: m[3].trim(),
          desc: m[4].trim(),
          risk: m[5].trim(),
          prestige: m[6].trim()
        };
      }
    });

    return result;
  }

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

    // 剧情区结构化拆分
    result.storyParts = _parseStoryZone(storyZone);

    if (dataZone) {
      _parseDataZone(dataZone, result);
    } else {
      _parseLegacy(storyZone, result);
    }

    // ── 新增：解析行动令段 ──
    const actionsBlock = _parseActionsBlock(storyZone);
    result.firstMove = actionsBlock.firstMove;
    result.opportunities = actionsBlock.opportunities;
    result.playerActions = actionsBlock.playerActions;

    // ── 校验 warnings ──
    if (!result.warnings) result.warnings = [];
    if (dataZone) {
      if (!result.round) result.warnings.push({ line: 0, message: '数据区缺少 [回合] 段或回合号解析失败' });
      if (!result.prestige) result.warnings.push({ line: 0, message: '数据区缺少 [威望] 段' });
      if (result.players.length === 0) result.warnings.push({ line: 0, message: '数据区缺少 [甲][乙][丙] 任何玩家段' });
    }
    if (storyZone && result.storyParts) {
      if (!result.storyParts.title) result.warnings.push({ line: 0, message: '剧情区缺少回合标题行' });
      if (!result.storyParts.narrator) result.warnings.push({ line: 0, message: '剧情区缺少 📢 旁白 段' });
      if (!result.storyParts.actionOrder) result.warnings.push({ line: 0, message: '剧情区缺少 🎯 行动令 段' });
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
      // #sanguo-inherit-batch2-v1 玩家段 城池/武将 继承标记,
      // 由 _parsePlayerBlock 写入 player 对象内部,_empty 无需占位
      // ── 新增字段 ──
      prestige:      null,   // { players:[{slot,征伐,治政,人才,目标,total}], npcHighest:{name,score} }
      worldStatus:   null,   // { level, name, endgame }
      storyParts:    null,   // { title, narrator, situation, events, actionOrder }
      warnings:      [],     // [{ line, message }]
      firstMove: null,           // 先手权
      opportunities: [],         // 公共机遇
      playerActions: {}          // 三令选项 { '甲': { wu: {a,b}, wen: {a,b}, ce: {a,b} } }
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
    // #storm-intel-v1: 保留密报块原文，交由 main.js highlightRaw 按身份过滤渲染
    return text;
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
  /* [legacy v1]
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
  */

  function _parseCmdItems(text) {
    const items = [];
    if (!text) return items;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    // v2: 支持 A/B/C 分支行预读
    const numRe = /^([④⑤⑥⑦⑧⑨⑩])\s*(.+)$/;
    const branchRe = /^\s*[A-Ca-c](?:[.．、]|[：:]|\s)\s*.+/;
    const branchLetter = l => l.trim().slice(0, 1).toUpperCase();
    const branchText = l => l.trim().replace(/^[A-Ca-c](?:[.．、]|[：:]|\s)\s*/, '');

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(numRe);
      if (!m) { i++; continue; }
      const rest = m[2].trim();
      // 拆破折号
      const dashIdx = rest.search(/——|──|\s[-—]{2}\s/);
      let name = rest, note = '';
      if (dashIdx > 0) {
        name = rest.slice(0, dashIdx).trim();
        note = rest.slice(dashIdx).replace(/^[——──\s\-—]+/, '').trim();
      }
      // 向前预读 A/B/C 分支行
      const branches = [];
      i++;
      while (i < lines.length) {
        if (branchRe.test(lines[i])) {
          branches.push({ key: branchLetter(lines[i]), text: branchText(lines[i]) });
          i++;
        } else {
          break;
        }
      }
      items.push({ num: m[1], name, note, branches });
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

    // [NPC]
    const npcRaw = blocks['NPC'] || blocks['npc'] || '';
    if (npcRaw) {
      result.npcCities = _parseNpcBlock(npcRaw);
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

    // [威望]
    if (blocks['威望']) {
      result.prestige = _parsePrestige(blocks['威望']);
    }

    // [世界状态]
    if (blocks['世界状态']) {
      result.worldStatus = _parseWorldStatus(blocks['世界状态']);
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
    const KNOWN = new Set(['回合','速递','甲','乙','丙','NPC','npc','战报','军报摘要','在途','调度','变动','驻城','威望','世界状态']);
    const lines  = text.split('\n');
    const blocks = {};
    let curKey = null, curBuf = [];

    /* [legacy v1]
    for (const line of lines) {
      const m = line.match(/^[\[【]([^\]】\n]{1,10})[\]】]/);
      if (m) {
        const key = m[1].trim();
        if (KNOWN.has(key)) {
          if (curKey !== null) blocks[curKey] = curBuf.join('\n');
          curKey = key;
          // const rest = line.replace(/^[\[【][^\]】\n]{1,10}[\]】]\s*\//, '').trim();
          const rest = line.replace(/^[\[【][^\]】\n]{1,10}[\]】]\s* /, '').trim();
          curBuf = rest ? [rest] : [];
          continue;
        }
      }
      if (curKey !== null) curBuf.push(line);
    }
    */

    /* [legacy v1]
    // #battle-splitblock-fix-v1: 当前在 [战报] 或 [调度] 块内时，
    // 行首的 [甲]/[乙]/[丙] 是数据内容而非新块标签，不切换。
    const CONTENT_KEYS_IN_BATTLE = new Set(['甲', '乙', '丙']);
    const NO_SWITCH_BLOCKS       = new Set(['战报', '调度', '在途']);

    for (const line of lines) {
      const m = line.match(/^[\[【]([^\]】\n]{1,10})[\]】]/);
      if (m) {
        const key = m[1].trim();
        if (KNOWN.has(key)) {
          // 守卫：在战报/调度块内，[甲][乙][丙] 是内容行，不切块
          if (NO_SWITCH_BLOCKS.has(curKey) && CONTENT_KEYS_IN_BATTLE.has(key)) {
            if (curKey !== null) curBuf.push(line);
            continue;
          }
          if (curKey !== null) blocks[curKey] = curBuf.join('\n');
          curKey = key;
          const rest = line.replace(/^[\[【][^\]】\n]{1,10}[\]】]\s* /, '').trim();
          curBuf = rest ? [rest] : [];
          continue;
        }
      }
      if (curKey !== null) curBuf.push(line);
    }
    */

    // #battle-splitblock-fix-v3: 战报/调度块内 [甲][乙][丙] 是内容不是标签
    const CONTENT_KEYS_IN_BATTLE = new Set(['甲', '乙', '丙']);
    const NO_SWITCH_BLOCKS       = new Set(['战报', '调度', '在途']);

    for (const line of lines) {
      const m = line.match(/^[\[【]([^\]】\n]{1,10})[\]】]/);
      if (m) {
        const key = m[1].trim();
        if (KNOWN.has(key)) {
          // #battle-splitblock-fix-v3: 守卫——在战报/调度块内，[甲][乙][丙] 是内容行，不切块
          if (NO_SWITCH_BLOCKS.has(curKey) && CONTENT_KEYS_IN_BATTLE.has(key)) {
            if (curKey !== null) curBuf.push(line);
            continue;
          }
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
      /* #parser-silence-warns-v1 silenced */
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
        /* #parser-silence-warns-v1 silenced */
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

    // v2: 对齐 GM 规则书 v3.42 M-29 红线七
    // 新格式: [攻方阵营]攻方将领(城名) → [守方阵营]守方将领(城名) | 档位 | 伤亡:攻X守Y
    const re = /^\[([^\]]{1,6})\]([^\s(（]+)(?:[（(]([^\)）]+)[）)])?\s*→\s*(?:\[([^\]]{1,6})\])?\s*([^\s(（|]+)(?:[（(]([^\)）]+)[）)])?\s*[|｜]\s*(惨胜|小胜|大胜|平局|小负|大败|胜|平|负)\s*[|｜]\s*伤亡[:：]攻(\d+)守(\d+)/;

    const RESULT_SUCCESS = {
      '惨胜': true, '小胜': true, '大胜': true, '胜': true,
      '平局': false, '平': false,
      '小负': false, '大败': false, '负': false,
    };

    const _slotFromFaction = (f) => {
      if (f === '甲') return { slot: 0, faction: null };
      if (f === '乙') return { slot: 1, faction: null };
      if (f === '丙') return { slot: 2, faction: null };
      return { slot: null, faction: f || null };
    };

    for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
      if (/^本回合无战事/.test(line)) continue;
      const m = line.match(re);
      if (!m) continue;

      const atkFactionRaw = m[1];
      const atkGeneral    = m[2];
      const atkCity       = m[3] || null;
      const defFactionRaw = m[4] || null;
      const defGeneral    = m[5];
      const defCity       = m[6] || null;
      const result        = m[7];
      const atkLoss       = parseInt(m[8], 10);
      const defLoss       = parseInt(m[9], 10);

      const atkSide = _slotFromFaction(atkFactionRaw);
      const defSide = _slotFromFaction(defFactionRaw);
      const city = defCity || atkCity || null;

      battles.push({
        attacker:        line.split('→')[0].trim(),
        defender:        line.split('→')[1].split(/[|｜]/)[0].trim(),
        result:          result,
        attacker_loss:   atkLoss,
        defender_loss:   defLoss,
        success:         !!RESULT_SUCCESS[result],
        city:            city,
        attackerSlot:    atkSide.slot,
        attackerFaction: atkSide.faction,
        defenderSlot:    defSide.slot,
        defenderFaction: defSide.faction,
        attackerGeneral: atkGeneral,
        defenderGeneral: defGeneral,
        attackerCity:    atkCity,
        defenderCity:    defCity,
        attackerFactionRaw: atkFactionRaw,
        defenderFactionRaw: defFactionRaw,
      });
    }
    return battles;
  }

  // v18 (#parser-transit-multitroop-v1):
  //   对齐 GM 规则书 v3.41 M-29 红线九 — [调度] 段支持多兵种同行,
  //   兵种段语法 兵种:数量(,兵种:数量)*;输出新增 troops 对象,
  //   保留旧 troopType/troopCount 字段做向后兼容(取第一个兵种回填)。
  function _parseTransit(raw) {
    if (!raw || !raw.trim()) return [];
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 1 && /无在途|无调度|本回合无调度部队/.test(lines[0])) return [];
    const result = [];
    // v18 (#parser-transit-multitroop-v1):
    //   兵种段从单兵种放宽到多兵种同行,语法 兵种:数量(,兵种:数量)*
    //   状态白名单维持 4 种(剩N/攻城中/交战中/客驻),
    //   旧词归一化保留兼容(围攻中/对峙中/撤退中/驻屯中)。
    const re = /^([甲乙丙]|\S{1,6})\s+(\S+)\s+(\S+?)→(\S+?)\s+([步弓骑水蛮]:\d+(?:,[步弓骑水蛮]:\d+)*)\s+(\S+)(?:\s+(.+))?\s*$/;

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
        /* #parser-silence-warns-v1 silenced */
        continue;
      }
      const factionRaw = m[1];
      const slot = factionRaw === '甲' ? 0 :
                   factionRaw === '乙' ? 1 :
                   factionRaw === '丙' ? 2 : null;
      // 注:status 归一化与 troops 解析已合并到下方 result.push 块前,
      //    捕获组编号因兵种段合并已前移(m[6]=status, m[7]=note)。

      // 兵种段解析:m[5] 形如 "步:3550,骑:50"
      const troopsStr = m[5];
      const troops = {};
      const troopEntries = [];
      troopsStr.split(',').forEach(seg => {
        const tm = seg.match(/^([步弓骑水蛮]):(\d+)$/);
        if (tm) {
          const t = tm[1];
          const n = parseInt(tm[2], 10);
          troops[t] = n;
          troopEntries.push({ type: t, count: n });
        }
      });
      // 向后兼容:troopType/troopCount 取第一个兵种回填,
      // 让 main.js renderPlayerTransit / renderJunbao / _renderWorldMil
      // 等旧渲染路径零修改即可继续工作。
      const firstEntry = troopEntries[0] || { type: '', count: 0 };

      // m[7] 现在是状态(原来是 m[7]),m[8] 现在是 note(原来也是 m[8]),
      // 因为兵种段从两个捕获组合并为一个,后续捕获组编号相应前移。
      let status = m[6];
      // v20260609-fengyan: 保留旧词归一化兼容，新词直接透传
      if (status === '撤退中') {
        status = '剩1';
      } else if (STATUS_NORMALIZE[status]) {
        status = STATUS_NORMALIZE[status];
      }
      // 其他任意状态文本直接透传，不过滤

      result.push({
        faction: factionRaw,
        slot,
        general: m[2],
        from: m[3],
        to: m[4],
        troops,                          // #parser-transit-multitroop-v1 新增
        troopEntries,                    // #parser-transit-multitroop-v1 新增,保序数组形式
        troopType: firstEntry.type,      // 向后兼容:取第一个兵种
        troopCount: firstEntry.count,    // 向后兼容:取第一个兵种数量
        status,
        note: m[7] ? m[7].trim() : '',
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
  //  解析 [威望] 段
  //  格式：
  //    甲 征伐:12 治政:8 人才:5 目标:3 合计:28
  //    乙 征伐:10 治政:6 人才:4 目标:2 合计:22
  //    丙 征伐:8 治政:9 人才:6 目标:1 合计:24
  //    NPC最高:袁绍:30
  // ─────────────────────────────────────────
  function _parsePrestige(raw) {
    const result = { players: [], npcHighest: { name: '', score: 0 } };
    if (!raw) return result;
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const SLOTS = ['甲', '乙', '丙'];

    for (const line of lines) {
      // 玩家威望行
      const playerM = line.match(/^([甲乙丙])\s+征伐[:：](\d+)\s+治政[:：](\d+)\s+人才[:：](\d+)\s+目标[:：](\d+)\s+合计[:：](\d+)/);
      if (playerM) {
        result.players.push({
          slot: playerM[1],
          征伐: parseInt(playerM[2]),
          治政: parseInt(playerM[3]),
          人才: parseInt(playerM[4]),
          目标: parseInt(playerM[5]),
          total: parseInt(playerM[6]),
        });
        continue;
      }
      // NPC最高行
      const npcM = line.match(/NPC最高[:：]([^:：]+)[:：](\d+)/);
      if (npcM) {
        result.npcHighest = { name: npcM[1].trim(), score: parseInt(npcM[2]) };
      }
    }
    return result;
  }

  // ─────────────────────────────────────────
  //  解析 [世界状态] 段
  //  格式：Lv2-群雄割据 | 距终局:未触发
  //        Lv3-诸侯争霸 | 距终局:还剩5回合
  // ─────────────────────────────────────────
  function _parseWorldStatus(raw) {
    if (!raw) return null;
    const line = raw.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
    const m = line.match(/Lv(\d+)-([^\s|]+)\s*\|\s*距终局[:：]\s*(.+)/);
    if (!m) return { level: null, name: '', endgame: line.trim(), raw: line };
    return {
      level: parseInt(m[1]),
      name: m[2].trim(),
      endgame: m[3].trim(),
      raw: line,
    };
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
    // v20260609-fengyan: 武将动态已下线，直接返回空数组
    return [];
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
    /* #parser-silence-warns-v1 silenced */
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
            /* [legacy v1] 原版只抓 label+val,丢弃数字后的括号注解
            const catM = line.match(/^(金|粮|兵|民心)[：:,，\s]+(.*)/);
            if (catM) {
              const cat  = catM[1];
              const rest = catM[2];
              const items = [];
              const restNoTotal = rest.replace(/合计[+-]?\d+,?/g, '');
              const itemRe = /([^\s,，+\-\d·|][^,，·+\-\d]*?)([+-]\d+)/g;
              let im;
              while ((im = itemRe.exec(restNoTotal)) !== null) {
                let lbl = im[1].replace(/[→:：]/g, '').trim();
                if (lbl === '暗账') lbl = '府库';
                if (lbl && lbl !== '合计' && lbl !== '合' && lbl !== '计' && lbl.length >= 2) {
                  items.push({ label: lbl, val: parseInt(im[2]) });
                }
              }
              const totalM = rest.match(/合计([+-]?\d+)/);
              const total  = totalM ? parseInt(totalM[1]) : null;
              change.breakdown[cat] = { items, total };
              continue;
            }
            */

            /* #changes-note-expose-v1: 抓"数字后紧跟的括号注解"写入 item.note。
               宽松规则:紧跟在 [+-]数字 之后(中间允许 0 个空格)的第一个括号
                       (半角 () 或全角 ()),整段当 note。括号内允许任意字符。
               GM 写错(漏右括号/写错符号)时,note 取空字符串,不影响 label/val 解析。 */
            const catM = line.match(/^(金|粮|兵|民心)[：:,，\s]+(.*)/);
            if (catM) {
              const cat  = catM[1];
              const rest = catM[2];
              const items = [];
              /* 先摘除"合计±N"(也含其后可能跟的括号),避免干扰主匹配 */
              const restNoTotal = rest
                .replace(/合计[+-]?\d+(?:[\(（][^\)）]*[\)）])?,?/g, '');
              /* #changes-note-fix-B1:
                 alternation 两分支正则,主分支强制吞括号注解,
                 副分支兜底无注解明细。label 字符类排除括号字符,
                 防止"行动 (注解) -2500"这类空格变体污染 label。
                 捕获组:
                   主分支 m[1]=label, m[2]=val, m[3]=note
                   副分支 m[4]=label, m[5]=val
                 取值时用 m[1]||m[4] / m[2]||m[5] 兼容两条路径。 */
              const itemRe =
                /([^\s,，+\-\d·|\(\)（）][^,，·+\-\d\(\)（）]*?)([+-]\d+)[\(（]([^\)）]*)[\)）]|([^\s,，+\-\d·|\(\)（）][^,，·+\-\d\(\)（）]*?)([+-]\d+)/g;
              let im;
              while ((im = itemRe.exec(restNoTotal)) !== null) {
                const rawLbl = im[1] || im[4] || '';
                const rawVal = im[2] || im[5] || '';
                let lbl = rawLbl.replace(/[→:：]/g, '').trim();
                if (lbl === '暗账') lbl = '府库';
                if (lbl && lbl !== '合计' && lbl !== '合' && lbl !== '计' && lbl.length >= 2) {
                  const note = im[3] ? im[3].trim() : '';
                  items.push({ label: lbl, val: parseInt(rawVal), note });
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

    if (parsed.npcCities && parsed.npcCities.length) {
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

  /**
   * v20260610a 工单#decision-ref-v1
   * 解析威望段 [威望]
   * 返回 { players: [{conquest, govern, talent, goal, total}], npcHighest: {name, score} }
   */
  function parsePrestige(text) {
    const result = {
      players: [
        {conquest: 0, govern: 0, talent: 0, goal: 0, total: 0},
        {conquest: 0, govern: 0, talent: 0, goal: 0, total: 0},
        {conquest: 0, govern: 0, talent: 0, goal: 0, total: 0}
      ],
      npcHighest: {name: '', score: 0}
    };

    const lines = text.split('\n');
    let inPrestigeBlock = false;

    for (let line of lines) {
      line = line.trim();

      if (line === '[威望]') {
        inPrestigeBlock = true;
        continue;
      }

      if (inPrestigeBlock) {
        // 匹配玩家行：甲 征伐:20 治政:12 人才:8 目标:5 合计:45
        const playerMatch = line.match(/^([甲乙丙])\s+征伐:(\d+)\s+治政:(\d+)\s+人才:(\d+)\s+目标:(\d+)\s+合计:(\d+)/);
        if (playerMatch) {
          const slot = {'甲': 0, '乙': 1, '丙': 2}[playerMatch[1]];
          if (slot !== undefined) {
            result.players[slot] = {
              conquest: parseInt(playerMatch[2]),
              govern: parseInt(playerMatch[3]),
              talent: parseInt(playerMatch[4]),
              goal: parseInt(playerMatch[5]),
              total: parseInt(playerMatch[6])
            };
          }
          continue;
        }

        // 匹配NPC最高：NPC最高:{名}:{分数}
        const npcMatch = line.match(/^NPC最高:([^:]+):(\d+)/);
        if (npcMatch) {
          result.npcHighest = {
            name: npcMatch[1].trim(),
            score: parseInt(npcMatch[2])
          };
          continue;
        }

        // 遇到下一个方括号块，退出
        if (line.startsWith('[') && line !== '[威望]') {
          break;
        }
      }
    }

    return result;
  }

  /**
   * v20260610a 工单#decision-ref-v1
   * 解析先手权：本回合先手:{玩家名}
   */
  function parseFirstMover(text) {
    const match = text.match(/本回合先手[:：]\s*([^\s\n]+)/);
    return match ? match[1].trim() : '';
  }

  /**
   * v20260610b 工单#opportunities-panel-v1
   * 解析公共机遇
   * 格式：机遇1 · {标题} — {描述}(⚔争夺/🤝协力·预估+{N}威望)
   * 返回 [{id, title, desc, type, prestige}]
   */
  function parseOpportunities(text) {
    const result = [];
    const lines = text.split('\n');

    for (let line of lines) {
      line = line.trim();

      // 匹配：⚔ 公共机遇(选则占用策令):
      if (line.includes('公共机遇')) {
        continue;
      }

      // 匹配机遇行：机遇1 · 招降张郃 — 描述内容(⚔争夺·预估+6威望)
      const oppMatch = line.match(/机遇(\d+)\s*[·•]\s*([^—]+)\s*—\s*([^(]+)\(([⚔🤝])(争夺|协力)[·•]预估\+(\d+)威望\)/);

      if (oppMatch) {
        const id = parseInt(oppMatch[1]);
        const title = oppMatch[2].trim();
        const desc = oppMatch[3].trim();
        const typeIcon = oppMatch[4];
        const typeText = oppMatch[5];
        const prestige = parseInt(oppMatch[6]);

        result.push({
          id: id,
          title: title,
          desc: desc,
          type: typeText === '争夺' ? 'compete' : 'cooperate',
          prestige: prestige
        });
      }
    }

    return result;
  }

  /**
   * v20260610c 工单#sanling-options-v1
   * 解析三令选项
   * 格式：武令|A.强攻合肥:集结主力猛攻...(险·+5威望)
   * 返回 { wu: [{label, name, desc, risk, prestige}], wen: [...], ce: [...] }
   */
  function parseActionOptions(text) {
    const result = {
      wu: [],
      wen: [],
      ce: []
    };

    const lines = text.split('\n');
    let currentPlayer = null;

    for (let line of lines) {
      line = line.trim();

      // 检测玩家名号行：玩家名号 [甲]:(威望:N) 或 玩家名号[甲]:(威望:N)
      // 改动：要求方括号槽位标记
      if (line.match(/\[([甲乙丙])\]\s*[:：]\s*[（(]威望[:：]\d+[）)]/)) {
        currentPlayer = line;
        continue;
      }

      // 如果没有进入玩家区域，跳过
      if (!currentPlayer) continue;

      // 匹配武令|A.标题:描述(风险·+N威望) 或 (风险·+N~M威望)
      // 改动：威望区间用 [\d~～\-+] 字符类，兼容 +2 / +2~3 / +2-3
      const wuMatch = line.match(/^武令\s*[|｜]\s*([AB])\s*[.．、]\s*([^:：]+?)\s*[:：]\s*([^(（]+?)\s*[（(]([^·]+?)\s*·\s*(?:预估)?\s*\+?([\d~～\-+]+?)\s*威望[）)]/);
      if (wuMatch) {
        result.wu.push({
          label: wuMatch[1],
          name: wuMatch[2].trim(),
          desc: wuMatch[3].trim(),
          risk: wuMatch[4].trim(),
          prestige: wuMatch[5].trim()
        });
        continue;
      }

      const wenMatch = line.match(/^文令\s*[|｜]\s*([AB])\s*[.．、]\s*([^:：]+?)\s*[:：]\s*([^(（]+?)\s*[（(]([^·]+?)\s*·\s*(?:预估)?\s*\+?([\d~～\-+]+?)\s*威望[）)]/);
      if (wenMatch) {
        result.wen.push({
          label: wenMatch[1],
          name: wenMatch[2].trim(),
          desc: wenMatch[3].trim(),
          risk: wenMatch[4].trim(),
          prestige: wenMatch[5].trim()
        });
        continue;
      }

      const ceMatch = line.match(/^策令\s*[|｜]\s*([AB])\s*[.．、]\s*([^:：]+?)\s*[:：]\s*([^(（]+?)\s*[（(]([^·]+?)\s*·\s*(?:预估)?\s*\+?([\d~～\-+]+?)\s*威望[）)]/);
      if (ceMatch) {
        result.ce.push({
          label: ceMatch[1],
          name: ceMatch[2].trim(),
          desc: ceMatch[3].trim(),
          risk: ceMatch[4].trim(),
          prestige: ceMatch[5].trim()
        });
        continue;
      }

      // 遇到玩家分隔线，重置当前玩家（半角 --- 或全角 ═══）
      if (/^[-—]{3,}$/.test(line) || /^═{3,}$/.test(line)) {
        currentPlayer = null;
        continue;
      }
    }

    return result;
  }

  // 暴露给全局
  window.SGParser = window.SGParser || {};
  window.SGParser.parsePrestige = parsePrestige;
  window.SGParser.parseFirstMover = parseFirstMover;
  window.SGParser.parseOpportunities = parseOpportunities;
  window.SGParser.parseActionOptions = parseActionOptions;

    // ── #parser-expose-fix-v1 START ──
    // 修复:原 return 语句会覆盖 window.SGParser,把上面 4 个挂载抹掉。
    // 新策略:把 4 个函数纳入 return 对象,让 IIFE 返回值同时包含它们。
    return {
      parse, summarize, formatTroops, TROOP_TYPES,
      parsePrestige,
      parseFirstMover,
      parseOpportunities,
      parseActionOptions,
    };
    // ── END #parser-expose-fix-v1 ──
})();

// ═══════════════════════════════════════════════════════════
// #action-panel-step1 行动板块数据解析
// ═══════════════════════════════════════════════════════════

/**
 * 解析上回合结算段
 * 格式示例：
 * 📋 结算
 * 甲:主令(选A·攻城南皮·+12威望) 副令(选A·招贤·+1威望) 应变令(选机遇1·+10威望)
 * 乙:主令(选B·募兵·+0威望) 副令(选A·互市·+0威望) 应变令(放弃·+0威望)
 * 丙:主令(选C·自拟援救徐州·+2威望) 副令(选B·自拟·+1威望) 应变令(选机遇2·流拍)
 * 机遇1·关羽归附:甲得(距离最近)
 * 机遇2·夺取庐江:流拍(无人选)
 */
function parseSettlement(text) {
  var settlement = {
    players: { 0: null, 1: null, 2: null },
    opportunities: []
  };

  if (!text) return settlement;

  var lines = text.split('\n');
  var slotMap = { '甲': 0, '乙': 1, '丙': 2 };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // 解析玩家结算
    var playerMatch = line.match(/^([甲乙丙]):(.+)$/);
    if (playerMatch) {
      var slot = slotMap[playerMatch[1]];
      var content = playerMatch[2];

      var mainMatch = content.match(/主令\(([^)]+)\)/);
      var subMatch = content.match(/副令\(([^)]+)\)/);
      var reactMatch = content.match(/应变令\(([^)]+)\)/);

      settlement.players[slot] = {
        main: mainMatch ? mainMatch[1] : '',
        sub: subMatch ? subMatch[1] : '',
        react: reactMatch ? reactMatch[1] : ''
      };
    }

    // 解析机遇结算
    var oppMatch = line.match(/^机遇(\d+)·([^:]+):(.+)$/);
    if (oppMatch) {
      settlement.opportunities.push({
        id: parseInt(oppMatch[1]),
        title: oppMatch[2],
        result: oppMatch[3]
      });
    }
  }

  return settlement;
}

/**
 * 解析公共机遇池
 * 格式示例：
 * 公共机遇池(选则占用应变令):
 * 机遇1 · 招降关羽 · 🏆 — 关云长困下邳,需魅≥8武将+声望≥中,可说降(预估+12威望)
 * 机遇2 · 夺取庐江 · ⚔️ — 庐江太守战败出逃,距最近者零损接管(预估+5威望)
 * 机遇3 · 联合讨董 · 🤝 — 董卓暴政,需≥2家共同出兵讨伐(预估每人+5威望)
 */
function parseOpportunities(text) {
  var opportunities = [];
  if (!text) return opportunities;

  var lines = text.split('\n');
  var emojiMap = { '🏆': 'epic', '⚔️': 'compete', '🤝': 'coop', '🎲': 'gamble' };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.indexOf('机遇') !== 0) continue;

    var match = line.match(/^机遇(\d+)\s*·\s*([^·]+)\s*·\s*([🏆⚔️🤝🎲])\s*—\s*(.+)\(预估\+?(\d+)威望\)$/);
    if (match) {
      opportunities.push({
        id: parseInt(match[1]),
        title: match[2].trim(),
        type: emojiMap[match[3]] || 'compete',
        emoji: match[3],
        desc: match[4].trim(),
        prestige: parseInt(match[5])
      });
    }
  }

  return opportunities;
}

/**
 * 解析行动令选项
 * 格式示例：
 * {玩家名号} [甲]:(威望:{N})
 *
 * 主令|A.攻城南皮:{≤35字}(稳·预估+6威望)
 * 主令|B.募兵强军:{≤35字}(稳·预估+0威望)
 * 主令|C.自拟行动:{≤35字}(中·预估+N威望)
 *
 * 副令|A.招贤访士:{≤30字}(中·预估+1威望)
 * 副令|B.自拟行动:{≤30字}
 *
 * 应变令|A.选机遇1:{≤30字}(险·预估+12威望)
 * 应变令|B.自拟策略:{≤30字}
 */
function parseActionOptions(text) {
  var actions = {
    0: { name: '', prestige: 0, main: [], sub: [], react: [] },
    1: { name: '', prestige: 0, main: [], sub: [], react: [] },
    2: { name: '', prestige: 0, main: [], sub: [], react: [] }
  };

  if (!text) return actions;

  var lines = text.split('\n');
  var currentSlot = -1;
  var slotMap = { '[甲]': 0, '[乙]': 1, '[丙]': 2 };

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // 检测玩家槽位头
    for (var key in slotMap) {
      if (line.indexOf(key) !== -1) {
        currentSlot = slotMap[key];
        var nameMatch = line.match(/^([^\[]+)\s*\[/);
        if (nameMatch) {
          actions[currentSlot].name = nameMatch[1].trim();
        }
        var prestigeMatch = line.match(/威望:(\d+)/);
        if (prestigeMatch) {
          actions[currentSlot].prestige = parseInt(prestigeMatch[1]);
        }
        break;
      }
    }

    if (currentSlot === -1) continue;

    // 解析选项：主令|A.标题:描述(风险·预估+N威望)
    var optMatch = line.match(/^(主令|副令|应变令)\|([A-C])\.(([^:]+)):([^(]+)(?:\(([^·)]+)·预估\+(\d+)威望\))?/);
    if (optMatch) {
      var lingType = optMatch[1];
      var option = {
        label: optMatch[2],
        title: optMatch[3].trim(),
        desc: optMatch[5].trim(),
        risk: optMatch[6] ? optMatch[6].trim() : '稳',
        prestige: optMatch[7] ? parseInt(optMatch[7]) : 0,
        isCustom: optMatch[3].indexOf('自拟') !== -1
      };

      if (lingType === '主令') {
        actions[currentSlot].main.push(option);
      } else if (lingType === '副令') {
        actions[currentSlot].sub.push(option);
      } else if (lingType === '应变令') {
        actions[currentSlot].react.push(option);
      }
    }
  }

  return actions;
}

/**
 * 解析先手权
 * 格式：本回合先手:{威望最低玩家名}
 */
function parseFirstMover(text) {
  if (!text) return null;
  var match = text.match(/本回合先手:([^\s]+)/);
  return match ? match[1].trim() : null;
}

// 导出函数（挂载到全局）
// ── #parser-expose-fix-v1-step2 START ──
// 上轮把 4 个函数挂在 window.SGAction,但 main.js 末尾的
// window.SGAction = { renderSettlement, ... } 是整体赋值覆盖,
// 会把这里的 4 个 parse 函数抹掉。改挂到独立命名空间 SGParseV2,
// 该名字未被任何文件占用,安全。
if (typeof window !== 'undefined') {
  window.SGParseV2 = window.SGParseV2 || {};
  window.SGParseV2.parseSettlement       = parseSettlement;
  window.SGParseV2.parseOpportunitiesV2  = parseOpportunities;
  window.SGParseV2.parseActionOptionsV2  = parseActionOptions;
  window.SGParseV2.parseFirstMoverV2     = parseFirstMover;
}
// ── END #parser-expose-fix-v1-step2 ──
