/**
 * parser.js — 三国志文字版 · AI内容解析器 v13
 * v17 (#sanguo-npc-inherit-parser-v1): 支持 [NPC] 同上 简写,输出 npcCitiesInherit 标记
 * v18 (2026-06-30): [调度] 段升级到七槽格式 — 起点/终点拆分为独立槽位，
 *                   废除箭头→分隔符；驻屯时终点槽为"—"；不兼容旧六槽格式。
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

  // ── 工具函数：标准化威望格式 ──
  function _normalizePrestige(raw) {
    if (!raw) return raw;

    // 移除多余的加号：++8 → +8, +++10 → +10
    let normalized = raw.replace(/^\+{2,}/, '+');

  // 处理范围中的多余加号：+8~++10 → +8~+10 或 ~++10 → ~+10
  normalized = normalized.replace(/~\+{2,}/g, '~+');

    return normalized;
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
    const actionsMatch = text.match(/🎯\s*行动令([\s\S]*)$/);
    if (!actionsMatch) return result;

    const actionsText = actionsMatch[1];

    // Step 2: 提取先手权
    const firstMoveMatch = actionsText.match(/本回合先手[:：]\s*([\u4e00-\u9fa5]{1,8})(?:[（(][^）)]*[）)])?/);
    if (firstMoveMatch) {
      result.firstMove = firstMoveMatch[1].trim();
    }

    // Step 3: 提取公共机遇（含多行详情）
    const oppBlockMatch = actionsText.match(/公共机遇[池]?[^:：]*[:：]?\s*\n([\s\S]*?)(?=\n\s*={3}\s*\n|\n\s*[\u4e00-\u9fa5]+\s*\[[甲乙丙]\]|\n\s*$)/);
    if (oppBlockMatch) {
      const oppText = oppBlockMatch[1] || oppBlockMatch[0];
      const EMOJI_TYPE_MAP = {
        '🎭': 'encounter', '🏮': 'bond',
        '🎲': 'gamble', '🐴': 'recruit'
      };
      const KEYWORD_TYPE_MAP = {
        '奇遇': 'encounter', '交谊': 'bond',
        '赌局': 'gamble', '访贤': 'recruit', '投奔': 'recruit'
      };

      // 按机遇头行切分块
      const oppLines = oppText.split('\n');
      const OPP_HEAD_RE = /^机遇(\d+)\s*·\s*([^·\n]+?)\s*·\s*([🎭🏮🎲🐴]\uFE0F?)\s*(\[限[甲乙丙]\])?/u;
      let currentOpp = null;
      const flushOpp = () => {
        if (currentOpp) {
          result.opportunities.push(currentOpp);
          currentOpp = null;
        }
      };

      for (let oi = 0; oi < oppLines.length; oi++) {
        const t = oppLines[oi].trim();
        if (!t) {
          // 空行：如果当前有 opp 且已有 detail 行，继续收集
          if (currentOpp && currentOpp.detail) currentOpp.detail += '\n';
          continue;
        }
        const m = t.match(OPP_HEAD_RE);
        if (m) {
          flushOpp();
          const oppId = parseInt(m[1]);
          const title = m[2].trim();
          // 去掉变体选择符 \uFE0F 后再查表，避免 '🏮\uFE0F' 查不到 fallback 成奇遇
          const emoji = (m[3] || '').replace(/\uFE0F/g, '');
          const restrict = m[4] ? m[4].replace(/[\[\]]/g, '').replace('限', '') : ''; // 提取甲乙丙

          // 根据emoji确定类型
          let type = EMOJI_TYPE_MAP[emoji] || 'encounter';

          currentOpp = {
            id: oppId,
            title: title,
            desc: '',
            emoji: emoji,
            type: type,
            prestige: '',
            detail: '',
            restrict: restrict,
            conditions: [],
            options: []
          };
        } else if (currentOpp) {
          // 选项行 ①②③④⑤⑥ → options 数组
          var _optM = t.match(/^([①②③④⑤⑥])\s*([^:：]+)[:：]?\s*(.*)$/);
          if (_optM) {
            currentOpp.options.push({
              num: _optM[1],
              name: _optM[2].trim(),
              desc: (_optM[3] || '').trim()
            });
            continue;
          }
          // 跳过分隔符
          if (/^[-—]{3,}$/.test(t) || /^═{3,}$/.test(t)) {
            continue;
          }
          // 条件行（以 ▸ 开头）：原 detail 收集 + 新增按 | 切 conditions
          if (t.startsWith('▸')) {
            currentOpp.detail = currentOpp.detail
              ? currentOpp.detail + '\n' + t
              : t;
            var _condBody = t.replace(/^▸\s*/, '').trim();
            if (_condBody) {
              _condBody.split('|').forEach(function (seg) {
                var s = seg.trim();
                if (s) currentOpp.conditions.push(s);
              });
            }
          }
          // 预告段（普通文本）
          else {
            if (!currentOpp.desc) {
              currentOpp.desc = t;
            } else {
              currentOpp.detail = currentOpp.detail
                ? currentOpp.detail + '\n' + t
                : t;
            }
          }
        }
      }
      flushOpp();

      // 清理 detail 首尾空白
      result.opportunities.forEach(function(o) {
        if (o.detail) o.detail = o.detail.trim();
      });
    }

    // Step 4: v6.2 格式 — 按 --- 分隔玩家段，解析 ①②③ + A/B/C 分支
    // 先找到 === 分隔线之后的内容（玩家段在 === 之后）
    const tripleEqIdx = actionsText.search(/\n\s*={3}\s*\n/);
    const playerZone = tripleEqIdx !== -1
      ? actionsText.slice(tripleEqIdx)
      : actionsText;

    const playerSections = playerZone.split(/^[-—]{3,}\s*$/m);

    // 建议编号 regex: ① ② ③ ④ ⑤ ⑥
    const LING_NUM_RE = /^([①②③④⑤⑥])\s*(.+)/;
    // 一级分支: "  A. 强攻宛城(险·+12): 描述" 或 "  A. 名称：描述"
    // 捕获组1=字母, 2=名称(不含括号/冒号), 3=括号内容(可选), 4=冒号后描述(可选)
    const BRANCH_RE = /^[ \t]{0,6}([A-Ca-c])\s*[.．、]\s*([^：:（(]+?)(?:[（(]([^）)]+)[）)])?\s*(?:[：:](.*))?$/;
    // 二级分支: "    A1. 正面强攻(中·+4): 描述" — 更多缩进，字母+数字
    // 捕获组1=标签, 2=名称, 3=括号内容(可选), 4=冒号后描述(可选)
    const SUB_RE    = /^[ \t]{2,8}([A-Ca-c][1-9])\s*[.．、]\s*([^：:（(]+?)(?:[（(]([^）)]+)[）)])?\s*(?:[：:](.*))?$/;
    // 尾部括号（备用，用于从描述末尾提取）
    const OPT_TAIL_RE = /[（(]([^）)]+)[）)]$/;
    const PLAYER_HEAD_RE = /\[([甲乙丙])\]\s*[：:]/;
    const LING_NUMS_ORDER = ['①', '②', '③', '④', '⑤', '⑥'];

    for (const section of playerSections) {
      const playerMatch = section.match(PLAYER_HEAD_RE);
      if (!playerMatch) continue;

      const slot = playerMatch[1]; // 甲/乙/丙
      const items = [];
      const lines = section.split('\n');
      let currentItem = null;
      let currentOpt  = null; // 当前正在处理的一级分支（用于挂载二级）

      for (let li = 0; li < lines.length; li++) {
        const raw = lines[li];
        const t = raw.trimEnd();

        // 建议行: ① 军事扩张(中·预估+8威望): 关羽「...」
        //   或旧格式: ① 南下援汝南：「...」（中·预估+3威望）
        const lingM = t.match(LING_NUM_RE);
        if (lingM) {
          // 保存上一个 item
          if (currentItem) items.push(currentItem);

          const num = lingM[1];
          const rest = lingM[2].trim();

          // 解析标题、引言、风险、威望
          // 新格式: 标题(风险·预估+N威望): 武将「谏言」
          // 旧格式: 标题：「引言」（风险·预估+N威望）
          let title = '', quote = '', note = '', risk = '', prestige = '';

          // 尝试1：尾部括号（旧格式）
          const tailM = rest.match(/[（(]([^）)]+)[）)]$/);
          let body;
          let bracketContent = '';

          if (tailM) {
            bracketContent = tailM[1];
            body = rest.slice(0, rest.length - tailM[0].length).trim();
          } else {
            // 尝试2：新格式 — 括号在标题后、冒号前
            // 匹配: 标题(内容): 后续  →  提取标题前的括号
            const headBracketM = rest.match(/^([^（(:：]+)[（(]([^）)]+)[）)]\s*[:：](.*)$/);
            if (headBracketM) {
              // headBracketM[1]=标题部分, [2]=括号内, [3]=冒号后
              bracketContent = headBracketM[2];
              body = headBracketM[1].trim() + ': ' + headBracketM[3].trim();
            } else {
              body = rest;
            }
          }

          if (bracketContent) {
            const riskM = bracketContent.match(/^(稳|中|险)\s*[·]/);
            if (riskM) risk = riskM[1];
            const presM = bracketContent.match(/预估\s*\+?\s*([\d~～\-+]+)\s*威望/);
            if (presM) prestige = presM[1];
            // 短格式: ·+N
            if (!prestige) {
              const pMb = bracketContent.match(/[··]\s*([+-]?\d+)/);
              if (pMb) prestige = pMb[1].replace(/^\+/, '');
            }
          }

          // 从 body 提取标题和引言
          const colonIdx = body.search(/[：:]/);
          if (colonIdx > 0) {
            title = body.slice(0, colonIdx).trim();
            quote = body.slice(colonIdx + 1).trim();
          } else {
            title = body;
          }

          currentItem = {
            num: num,
            idx: LING_NUMS_ORDER.indexOf(num),
            title: title,
            quote: quote,
            note: note,
            risk: risk,
            prestige: prestige,
            options: []
          };
          continue;
        }

        // 一级分支行: "   A. 强攻宛城：描述"
        // 先尝试二级（更具体的 regex），失败再试一级
        const subM = t.match(SUB_RE);
        if (subM && currentItem && currentOpt) {
          // 新 SUB_RE: 捕获组1=标签, 2=名称, 3=括号内容(可选), 4=冒号后描述(可选)
          const subLabel = subM[1].toUpperCase();
          const subName  = subM[2].trim();
          const inlineBracketSub = subM[3] ? subM[3].trim() : '';
          let subDesc = subM[4] ? subM[4].trim() : '';
          let subRisk = '', subPres = '', subCond = '';

          // 优先从行内括号解析
          if (inlineBracketSub) {
            const rM = inlineBracketSub.match(/^(稳|中|险)/); if (rM) subRisk = rM[1];
            const pMa = inlineBracketSub.match(/预估\s*\+?([\d~～\-+]+)\s*威望/); if (pMa) subPres = pMa[1];
            if (!subPres) { const pMb = inlineBracketSub.match(/[··]\s*([+-]?\d+)/); if (pMb) subPres = pMb[1].replace(/^\+/, ''); }
            const cM = inlineBracketSub.match(/(?:条件[:：]\s*需?|需[:：])\s*([^·\d+\-\s][^·]+?)(?:\s*[·]|$)/);
            if (cM) { subCond = cM[1].trim(); }
            else { const cM2 = inlineBracketSub.match(/^需([^·\d+\-\s][^·]*?)(?:\s*[·]|$)/); if (cM2) subCond = cM2[1].trim(); }
          }

          // 若行内括号未解析成功，从描述末尾尝试
          if (!subRisk && subDesc) {
            const dm = subDesc.match(OPT_TAIL_RE);
            if (dm) {
              const inner = dm[1];
              const rM2 = inner.match(/^(稳|中|险)/); if (rM2) subRisk = rM2[1];
              const pM2a = inner.match(/预估\s*\+?([\d~～\-+]+)\s*威望/); if (pM2a) subPres = pM2a[1];
              if (!subPres) { const pM2b = inner.match(/[··]\s*([+-]?\d+)/); if (pM2b) subPres = pM2b[1].replace(/^\+/, ''); }
              const cM2 = inner.match(/需[:：](.+)/); if (cM2) subCond = cM2[1].trim();
              subDesc = subDesc.slice(0, subDesc.length - dm[0].length).trim();
            }
          }

          if (!currentOpt.sub) currentOpt.sub = [];
          currentOpt.sub.push({ label: subLabel, name: subName, desc: subDesc, risk: subRisk, prestige: subPres, cond: subCond });
          continue;
        }

        const branchM = t.match(BRANCH_RE);
        if (branchM && currentItem) {
          const optLabel = branchM[1].toUpperCase();
          let   optName  = branchM[2].trim();
          // 新 BRANCH_RE: 捕获组3=括号内容, 4=冒号后描述
          const inlineBracket = branchM[3] ? branchM[3].trim() : '';
          let   optDesc  = branchM[4] ? branchM[4].trim() : '';
          let   optRisk  = '', optPres = '', optCond = '';

          // 从行内括号 (险·+12) 或 (中·预估+8威望) 或 (条件:需XXX·+N) 解析
          if (inlineBracket) {
            const rM3 = inlineBracket.match(/^(稳|中|险)/); if (rM3) optRisk = rM3[1];
            // 格式1: 预估+N威望
            const pM3a = inlineBracket.match(/预估\s*\+?([\d~～\-+]+)\s*威望/); if (pM3a) optPres = pM3a[1];
            // 格式2: ·+N 简短格式
            if (!optPres) {
              const pM3b = inlineBracket.match(/[··]\s*([+-]?\d+)/); if (pM3b) optPres = pM3b[1].replace(/^\+/, '');
            }
            // 条件解析：支持「条件:需XXX」「需:XXX」「需XXX」三种写法
            const cM = inlineBracket.match(/(?:条件[:：]\s*需?|需[:：])\s*([^·\d+\-\s][^·]+?)(?:\s*[·]|$)/);
            if (cM) { optCond = cM[1].trim(); }
            else {
              // 无冒号写法: 需XXX·+N
              const cM2 = inlineBracket.match(/^需([^·\d+\-\s][^·]*?)(?:\s*[·]|$)/);
              if (cM2) optCond = cM2[1].trim();
            }
          }

          // 若行内括号未解析成功，尝试从描述末尾提取
          if (!optRisk && !optPres) {
            const tailM2 = (optDesc || optName).match(OPT_TAIL_RE);
            if (tailM2) {
              const inner = tailM2[1];
              const rM3 = inner.match(/^(稳|中|险)/); if (rM3) optRisk = rM3[1];
              const pM3a = inner.match(/预估\s*\+?([\d~～\-+]+)\s*威望/); if (pM3a) optPres = pM3a[1];
              if (!optPres) { const pM3b = inner.match(/[··]\s*([+-]?\d+)/); if (pM3b) optPres = pM3b[1].replace(/^\+/, ''); }
              if (optDesc) optDesc = optDesc.slice(0, optDesc.length - tailM2[0].length).trim();
              else optName = optName.slice(0, optName.length - tailM2[0].length).trim();
            }
          }

          const newOpt = { label: optLabel, name: optName, desc: optDesc, risk: optRisk, prestige: optPres, cond: optCond, sub: [] };
          currentItem.options.push(newOpt);
          currentOpt = newOpt;
          continue;
        }
        // 非分支行：重置 currentOpt（下一行的二级不会错挂）
        if (t.trim()) currentOpt = null;
      }
      // 保存最后一个 item
      if (currentItem) items.push(currentItem);

      // 写入 playerActions — 新结构 items 数组
      result.playerActions[slot] = { items: items };

      // 同时填充旧 wu/wen/ce 空壳，防止旧代码读取时报错
      if (!result.playerActions[slot].wu) result.playerActions[slot].wu = {};
      if (!result.playerActions[slot].wen) result.playerActions[slot].wen = {};
      if (!result.playerActions[slot].ce) result.playerActions[slot].ce = {};
    }

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
  //  解析 [结算] 段
  // ─────────────────────────────────────────
  function parseSettlement(text) {
    var settlement = {
      players: [
        { slot: '甲', actions: [] },
        { slot: '乙', actions: [] },
        { slot: '丙', actions: [] }
      ]
    };

    if (!text) return settlement;

    var lines = text.split('\n');
    var slotMap = { '甲': 0, '乙': 1, '丙': 2 };
    var currentSlot = null; // 记录当前所属玩家（用于混合格式）

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      // ═══ 格式1：标准格式 ═══
      // 甲:行动名:结果描述 | +N威望
      var standardMatch = line.match(/^([甲乙丙]):([^:]+):(.+)\s*\|\s*(.+)$/);
      if (standardMatch) {
        var slotName = standardMatch[1];
        var action = standardMatch[2].trim();
        var result = standardMatch[3].trim();
        var prestige = standardMatch[4].trim();

        var slotIdx = slotMap[slotName];
        if (slotIdx !== undefined) {
          settlement.players[slotIdx].actions.push({
            action: action,
            result: result,
            prestige: prestige
          });
        }
        continue;
      }

      // ═══ 格式2：混合格式 — 玩家标记行 ═══
      // 甲:
      var slotHeaderMatch = line.match(/^([甲乙丙]):\s*$/);
      if (slotHeaderMatch) {
        currentSlot = slotMap[slotHeaderMatch[1]];
        continue;
      }

      // ═══ 格式2：混合格式 — 行动条目行 ═══
      // - 行动名:结果描述 | +N威望
      var itemMatch = line.match(/^-\s*([^:]+):(.+)\s*\|\s*(.+)$/);
      if (itemMatch && currentSlot !== null) {
        var action = itemMatch[1].trim();
        var result = itemMatch[2].trim();
        var prestige = itemMatch[3].trim();

        settlement.players[currentSlot].actions.push({
          action: action,
          result: result,
          prestige: prestige
        });
        continue;
      }

      // ═══ NPC 行（忽略） ═══
      if (line.indexOf('NPC:') === 0 || line.indexOf('- 曹操') === 0 || line.indexOf('- 吕布') === 0) {
        continue;
      }
    }

    return settlement;
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

    // [结算]
    if (blocks['结算']) {
      result.settlement = parseSettlement(blocks['结算']);
    }

    // [世界状态]
    // [世界状态]（v6.0 已废弃，遇到时静默解析，不报错）
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
    const KNOWN = new Set(['回合','速递','甲','乙','丙','NPC','npc','战报','军报摘要','在途','调度','变动','驻城','威望','世界状态','结算']);
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
      const resM = line.match(/金[:：](-?\d+)\s+粮[:：](-?\d+)\s+兵[:：](-?\d+)\s+民心[:：](-?\d+)\s+城[:：](-?\d+)/);
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
      // 设施行 — 格式：设施:城名[工程,工程],城名[工程]
      if (/^设施[:：]/.test(line)) {
        const facilityRaw = line.replace(/^设施[:：]\s*/, '').trim();
        if (facilityRaw && !p.citiesInherit) {
          _parseFacilityLine(facilityRaw, p.cities_list);
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

      // 先提取 产:xxx/xxx 部分
      let prodRaw = null;
      let innerWithoutProd = inner;
      const prodMatch = inner.match(/\|产[:：](\d+)\/(\d+)/);
      if (prodMatch) {
        prodRaw = prodMatch[0]; // 保存 |产:170/300
        innerWithoutProd = inner.replace(prodMatch[0], ''); // 移除产出部分
      }

      const pipeIdx = innerWithoutProd.indexOf('|');
      let holderRaw, troopsRaw;
      if (pipeIdx !== -1) {
        holderRaw = innerWithoutProd.slice(0, pipeIdx).trim();
        troopsRaw = innerWithoutProd.slice(pipeIdx + 1).trim();
      } else {
        holderRaw = innerWithoutProd;
        troopsRaw = null;
      }

      const EMPTY_HOLDER_TOKENS = new Set(['', '无', '空', '空缺', '待补', '待派', '—', '-']);
      const _trimmed = (holderRaw || '').trim();
      const holderEmpty = EMPTY_HOLDER_TOKENS.has(_trimmed);
      const holders = holderEmpty ? [] : _trimmed.split('/').map(s => s.trim()).filter(Boolean);
      // 解析产出数据
      let prodGold = null, prodFood = null;
      if (prodRaw) {
        const pm = prodRaw.match(/产[:：](\d+)\/(\d+)/);
        if (pm) {
          prodGold = parseInt(pm[1]);
          prodFood = parseInt(pm[2]);
        }
      }

      result.push({
        name,
        faction,
        holder:  holderEmpty ? '无' : (holders.join('/') || '无'),
        holders,
        holderEmpty,
        troops:  _parseTroops(troopsRaw),
        facilities: [],
        prodGold,
        prodFood,
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
  //  解析设施行：设施:上党[屯田,市集,城墙],洛阳[水车,箭楼]
  //  将设施写入已有的 cities_list 对象的 facilities 字段
  // ─────────────────────────────────────────
  function _parseFacilityLine(raw, cities_list) {
    if (!raw || !cities_list) return;
    // 匹配 城名[设施1,设施2,...]
    const re = /([^\[,，\s]+)\[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const cityName = m[1].trim();
      const facilitiesStr = m[2].trim();
      // 在 cities_list 中找到对应城池
      const city = cities_list.find(c => c.name === cityName);
      if (city) {
        city.facilities = _parseFacilities(facilitiesStr);
      }
    }
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
  //  解析设施字符串
  //  输入：屯田,市集,城墙
  //  输出：['屯田', '市集', '城墙']
  //  17种合法设施（M-20规则书）：
  //  屯田/水车/粮仓/市集/矿场/商会/义仓/书院/医馆/
  //  校场/城墙/箭楼/驿站/马场/水寨/弩坊/蛮营
  // ─────────────────────────────────────────
  function _parseFacilities(raw) {
    if (!raw || !raw.trim()) return [];
    const VALID_FACILITIES = new Set([
      '屯田', '水车', '粮仓', '市集', '矿场', '商会',
      '义仓', '书院', '医馆', '校场', '城墙', '箭楼',
      '驿站', '马场', '水寨', '弩坊', '蛮营', '码头'
    ]);
    const result = [];
    // 提取中文逗号或半角逗号分隔的设施名
    const parts = raw.split(/[,，]/);
    parts.forEach(part => {
      const name = part.trim();
      if (VALID_FACILITIES.has(name)) {
        result.push(name);
      }
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

    // 第一步：用逗号、顿号或空格分割各个武将
    const agParts = raw.split(/[,，、\s]+/);

    agParts.forEach(function(part) {
      part = part.trim();
      if (!part) return;

      // 匹配：武将名(状态) 支持全角/半角
      const m = part.match(/^([^()（）]+)(?:[(（]([^)）]*)[)）])?$/);
      if (m) {
        const name = m[1].trim();
        const statusText = m[2] ? m[2].trim() : '';

        let status = null;
        if (statusText === '受伤') status = 'injured';
        else if (statusText === '疲劳') status = 'tired';
        else if (statusText === '患病' || statusText === '生病') status = 'sick';
        else if (statusText === '阵亡') status = 'dead';

        // 如果是有效武将名
        if (name && name.length >= 2 && name.length <= 8 && /[\u4e00-\u9fa5]/.test(name)) {
          result.push({ name: name, status: status });
        }
      } else {
        // 没有括号或者其他格式，默认健康
        if (part && part.length >= 2 && part.length <= 8 && /[\u4e00-\u9fa5]/.test(part)) {
          result.push({ name: part, status: null });
        }
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

  // ═══════════════════════════════════════════════════════
  // #transit-rewrite-pipe-v1:
  // 重写 _parseTransit — 双模式：新竖线六槽格式 + 旧空格格式兼容
  // 新格式：{阵营} | {武将} | {位置} | {兵种:数} | {态} | {备注}
  // 旧格式：空格分隔自由槽（fallback，兼容已发布回合）
  // ═══════════════════════════════════════════════════════
  function _parseTransit(raw) {
    if (!raw || !raw.trim()) return [];

    const rawLines = raw.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());

    // 空段判定
    if (rawLines.length === 1 &&
        /无在途|无调度|本回合无调度部队/.test(rawLines[0])) {
      return [];
    }

    const FACTION_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
    const TROOP_ALIAS = {
      '步': '步', '步卒': '步', '步兵': '步',
      '弓': '弓', '弓手': '弓', '弓兵': '弓',
      '骑': '骑', '骑兵': '骑',
      '水': '水', '水军': '水',
      '蛮': '蛮', '蛮兵': '蛮',
    };

    const result = [];

    rawLines.forEach((origLine, i) => {
      const lineNo = i + 1;
      // 归一化全角竖线→半角
      const normLine = origLine.replace(/｜/g, '|');

      // 双模式分流：含 | 走新路径，否则走旧路径
      if (normLine.indexOf('|') !== -1) {
        const parsed = _parseTransitPipeLine(normLine, origLine, lineNo, FACTION_SLOT, TROOP_ALIAS);
        if (parsed) result.push(parsed);
      } else {
        const parsed = _parseTransitLegacyLine(origLine, lineNo, FACTION_SLOT, TROOP_ALIAS);
        if (parsed) result.push(parsed);
      }
    });

    return result;
  }

  // ── 新格式：竖线七槽解析 ──
  function _parseTransitPipeLine(normLine, origLine, lineNo, FACTION_SLOT, TROOP_ALIAS) {
    const warnings = [];
    let level = null;
    const _info = (m) => { warnings.push(m); if (level !== 'WARN') level = 'INFO'; };
    const _warn = (m) => { warnings.push(m); level = 'WARN'; };

    // 跳过空段占位行
    if (/无在途|无调度|本回合无调度部队/.test(normLine)) return null;

    let parts = normLine.split('|').map(s => s.trim());

    // 容错：多于7段 → 第7段及之后重新拼回备注
    if (parts.length > 7) {
      const extra = parts.slice(6).join('|');
      parts = parts.slice(0, 6).concat([extra]);
      _info('竖线超过6个，第7槽及之后已合并为备注');
    }
    // 容错：少于7段 → 补空槽
    if (parts.length < 7) {
      _warn('竖线不足6个（仅' + parts.length + '段），缺失槽置空');
      while (parts.length < 7) parts.push('');
    }

    const [factionRaw, generalRaw, fromRaw, toRaw, troopRaw, stateRaw, noteRaw] = parts;

    // 槽1 阵营
    if (!factionRaw) {
      _warn('阵营槽为空');
    }
    const slot = FACTION_SLOT.hasOwnProperty(factionRaw) ? FACTION_SLOT[factionRaw] : null;

    // 槽2 武将
    const generals = generalRaw ? generalRaw.split('/').map(s => s.trim()).filter(Boolean) : [];

    // 槽6 态：只认 "在途" 或 "驻屯"
    const isEnroute = (stateRaw === '在途');
    const isStationed = (stateRaw === '驻屯');
    if (!isEnroute && !isStationed && stateRaw) {
      _warn("态槽值'" + stateRaw + "'不在白名单(在途/驻屯)，按驻屯处理");
    }
    const moveType = isEnroute ? 'enroute' : 'stationed';

    // 槽3 起点、槽4 终点
    let from = fromRaw.trim();
    let to = '';
    let location = '';

    if (moveType === 'enroute') {
      // 在途：槽4是终点地名
      to = toRaw.trim();
      if (!to) _warn('在途部队终点槽为空');
    } else {
      // 驻屯：槽4应为"—"（或其他占位符），表示原地
      const dashTokens = ['—', '-', '－', '', '无'];
      if (!dashTokens.includes(toRaw.trim())) {
        _info("驻屯部队终点槽应为'—'，实际为'" + toRaw + "'");
      }
      location = from; // 驻屯位置就是起点
      to = location; // 兼容旧渲染
    }

    // 槽5 兵种解析
    const troops = {};
    const troopEntries = [];
    if (troopRaw) {
      troopRaw.split(',').forEach(piece => {
        const p = piece.trim();
        if (!p) return;
        const kvM = p.match(/^([^:：]+)[:：]\s*(\d+)$/);
        if (!kvM) {
          _info("无法识别的兵种片段'" + p + "'");
          return;
        }
        const key = kvM[1].trim();
        const num = parseInt(kvM[2], 10);
        const mapped = TROOP_ALIAS[key];
        if (!mapped) {
          _info("未知兵种'" + key + "'已忽略");
          return;
        }
        troops[mapped] = (troops[mapped] || 0) + num;
        troopEntries.push({ type: mapped, count: num });
      });
    }

    // 槽7 备注 → 提取 remain（在途时）
    let remainTurns = null;
    let arrived = false;
    let status = '';

    if (moveType === 'enroute') {
      // 从备注提取"剩N"或"剩0到"
      const remM = (noteRaw || '').match(/剩\s*(\d+)/);
      if (remM) {
        remainTurns = parseInt(remM[1], 10);
      }
      if (/剩\s*0/.test(noteRaw || '') && /到/.test(noteRaw || '')) {
        arrived = true;
        if (remainTurns === null) remainTurns = 0;
      }
      // status 显示用：在途时显示"剩N"
      if (remainTurns !== null) {
        status = arrived ? '本回合抵达' : ('剩' + remainTurns);
      } else {
        status = noteRaw || '';
      }
    } else {
      // 驻屯：备注原样作为 status 显示
      status = noteRaw || '';
    }

    // 兼容旧字段
    const firstEntry = troopEntries[0] || { type: '', count: 0 };

    return {
      faction: factionRaw,
      slot,
      general: generalRaw,
      from,
      to,
      troops,
      troopEntries,
      troopType: firstEntry.type,
      troopCount: firstEntry.count,
      status,
      note: noteRaw || '',
      isStationary: (moveType === 'stationed'),
      generals,
      moveType,
      location: (moveType === 'stationed') ? location : null,
      remainTurns: (moveType === 'enroute') ? remainTurns : null,
      arrived,
      raw: origLine,
      warnings,
      warnLevel: level,
    };
  }

  // ── 旧格式：空格分隔兼容（保留原逻辑精简版）──
  function _parseTransitLegacyLine(origLine, lineNo, FACTION_SLOT, TROOP_ALIAS) {
    const _normSpace = (s) => String(s == null ? '' : s)
      .replace(/\u3000/g, ' ').replace(/[ \t]+/g, ' ').trim();
    const line = _normSpace(origLine);
    const warnings = [];
    let level = null;
    const _info = (m) => { warnings.push(m); if (level !== 'WARN') level = 'INFO'; };
    const _warn = (m) => { warnings.push(m); level = 'WARN'; };

    if (/无在途|无调度|本回合无调度部队/.test(line)) return null;

    const hasRemain = /剩\s*\d+\s*回合/.test(line);
    const hasArrived = /本回合抵达/.test(line);
    const hasArrow = line.indexOf('→') !== -1;
    let moveType;
    if (hasRemain || hasArrived) {
      moveType = 'enroute';
    } else if (hasArrow) {
      moveType = 'enroute';
    } else {
      moveType = 'stationed';
    }

    const slots = line.split(' ').filter(Boolean);
    const factionRaw = slots[0] || '';
    if (!factionRaw) return null;
    const slot = FACTION_SLOT.hasOwnProperty(factionRaw) ? FACTION_SLOT[factionRaw] : null;
    const generalRaw = slots[1] || '';
    const generals = generalRaw ? generalRaw.split('/').map(s => s.trim()).filter(Boolean) : [];

    // 找兵种槽
    const _looksTroop = (s) => /[:：]\s*-?\d+/.test(s.replace(/[（(][^）)]*[）)]/g, ''));
    let troopIdx = -1;
    for (let k = 2; k < slots.length; k++) {
      if (_looksTroop(slots[k])) { troopIdx = k; break; }
    }

    let troops = {}, troopEntries = [];
    if (troopIdx !== -1) {
      slots[troopIdx].split(/[,，]/).forEach(piece => {
        const p = piece.trim().replace(/[（(][^）)]*[）)]/g, '');
        const kvM = p.match(/^([^:：]+)[:：]\s*(-?\d+)$/);
        if (!kvM) return;
        const mapped = TROOP_ALIAS[kvM[1].trim()];
        if (!mapped) return;
        const num = parseInt(kvM[2], 10);
        troops[mapped] = (troops[mapped] || 0) + num;
        troopEntries.push({ type: mapped, count: num });
      });
    }

    const midEnd = troopIdx !== -1 ? troopIdx : slots.length;
    const midText = slots.slice(2, midEnd).join(' ');

    let from = '', to = '', location = '';
    if (moveType === 'enroute') {
      const arrowM = midText.match(/(\S+?)→(\S+)/);
      if (arrowM) { from = arrowM[1].trim(); to = arrowM[2].trim(); }
      else { to = midText.trim(); }
    } else {
      location = midText.trim();
      to = location;
    }

    let remainTurns = null;
    let arrived = false;
    const remM = line.match(/剩\s*(\d+)\s*回合/);
    if (remM) {
      remainTurns = parseInt(remM[1], 10);
      if (remainTurns === 0) arrived = true;
    }
    if (hasArrived) { arrived = true; if (remainTurns === null) remainTurns = 0; }

    // 状态槽
    let statusSrc = '';
    if (troopIdx !== -1) {
      statusSrc = slots.slice(troopIdx + 1).join(' ');
    }
    statusSrc = statusSrc
      .replace(/剩\s*\d+\s*回合/g, '')
      .replace(/本回合抵达[^\s]*/g, '').trim();
    let status = statusSrc;

    // 兜底：行军态状态为空时回填
    if (moveType === 'enroute' && !status && remainTurns != null) {
      status = arrived ? '本回合抵达' : ('剩' + remainTurns);
    }

    const firstEntry = troopEntries[0] || { type: '', count: 0 };

    return {
      faction: factionRaw,
      slot,
      general: generalRaw,
      from,
      to,
      troops,
      troopEntries,
      troopType: firstEntry.type,
      troopCount: firstEntry.count,
      status,
      note: '',
      isStationary: (moveType === 'stationed'),
      generals,
      moveType,
      location: (moveType === 'stationed') ? location : null,
      remainTurns: (moveType === 'enroute') ? remainTurns : null,
      arrived,
      raw: origLine,
      warnings,
      warnLevel: level,
    };
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
    const result = { entries: [], players: [], npcHighest: { name: '', score: 0 } };
    if (!raw) return result;
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      // v6.0 新格式：{名字} 威望:{N}
      const m = line.match(/^(\S+)\s+威望[:：](\d+)/);
      if (m) {
        const name = m[1];
        const score = parseInt(m[2]);
        const isPlayer = ['甲','乙','丙'].includes(name);
        result.entries.push({ name, score, isPlayer });
        continue;
      }
      // v5.x 旧格式兼容：甲 征伐:{N} 治政:{N} 人才:{N} 目标:{N} 合计:{N}
      const oldM = line.match(/^([甲乙丙])\s+征伐[:：](\d+)\s+治政[:：](\d+)\s+人才[:：](\d+)\s+目标[:：](\d+)\s+合计[:：](\d+)/);
      if (oldM) {
        const name = oldM[1];
        const score = parseInt(oldM[6]);
        result.entries.push({ name, score, isPlayer: true });
        // 兼容旧 players 数组
        result.players.push({
          slot: name,
          征伐: parseInt(oldM[2]), 治政: parseInt(oldM[3]),
          人才: parseInt(oldM[4]), 目标: parseInt(oldM[5]),
          total: score,
        });
        continue;
      }
      // v5.x 旧格式：NPC最高:{名}:{N}
      const npcOldM = line.match(/NPC最高[:：]([^:：]+)[:：](\d+)/);
      if (npcOldM) {
        const name = npcOldM[1].trim();
        const score = parseInt(npcOldM[2]);
        result.entries.push({ name, score, isPlayer: false });
        result.npcHighest = { name, score };
      }
    }

    // 降序排列
    result.entries.sort((a, b) => b.score - a.score);

    // 兼容旧 players 数组（如果新格式没填 players）
    if (!result.players.length) {
      result.entries.filter(e => e.isPlayer).forEach(e => {
        result.players.push({ slot: e.name, total: e.score });
      });
    }
    // 兼容旧 npcHighest（如果新格式没填）
    if (!result.npcHighest.name) {
      const topNpc = result.entries.find(e => !e.isPlayer);
      if (topNpc) result.npcHighest = { name: topNpc.name, score: topNpc.score };
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
          facilities: c.facilities || [],
          prodGold:   c.prodGold != null ? c.prodGold : null,
          prodFood:   c.prodFood != null ? c.prodFood : null,
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
          facilities: c.facilities || [],
          prodGold:   c.prodGold != null ? c.prodGold : null,
          prodFood:   c.prodFood != null ? c.prodFood : null,
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

    // ── #parser-expose-fix-v1 START ──
    // 修复:原 return 语句会覆盖 window.SGParser,把上面 4 个挂载抹掉。
    // 新策略:把 4 个函数纳入 return 对象,让 IIFE 返回值同时包含它们。
    return { parse, summarize, formatTroops, TROOP_TYPES };
    // ── END #parser-expose-fix-v1 ──
})();

