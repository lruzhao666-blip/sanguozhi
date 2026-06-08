/**
 * diagnostics.js — 三国志文字版 · 数据诊断器 v1
 * #diagnostics-engine-A1
 *
 * 职责：
 * - 监听 sg-rounds-updated 事件，扫描最新回合数据健康度
 * - 10 条规则（5 错误 + 5 警告），独立函数，方便增删改
 * - 右下角浮动徽章三态：错误胶囊 / 警告胶囊 / 通过缩点
 * - 点击展开右侧抽屉，按严重度分组列出 issue
 * - 每条 issue 支持"复制给 GM"和"忽略本条"
 * - localStorage 持久化忽略列表（指纹 = 规则ID + 回合号 + 关键参数）
 *
 * 对外 API：
 * - window.SGDiag.scan()        主动触发一次扫描
 * - window.SGDiag.open()        打开抽屉
 * - window.SGDiag.close()       关闭抽屉
 * - window.SGDiag.clearIgnored() 清空忽略列表
 * #diag-r3r4r5-fix-v1 (2026-06-04): 修复 R3/R4 .find() 误用 breakdown 过滤导致永远漏掉总账块,
 *                                    R5 不动（无此 bug）。
 * #diag-r1-r2-r11-fix-v1 (2026-06-04): R1 武将列表不参与跨源查重(改为列表内部自查),
 *                                       R2 includes 单字不抵消 + 加防御日志,R11 整条下线。
 * #diag-r2-currset-fix-v1 (2026-06-04): 修复 R2 collectFrom 闭包硬绑 prevSet 导致 currSet 永远为空。
 * #diag-r9-r10-remove-v1 (2026-06-04): R9 维护栏偏离 + R10 行动栏消耗偏低 整条下线。
 */

(function () {
  'use strict';

  const IGNORED_KEY = 'sg-diag-ignored';

  /* ═══════════════════════════════════════════
     工具函数
  ═══════════════════════════════════════════ */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function loadIgnored() {
    try {
      const raw = localStorage.getItem(IGNORED_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
  }
  function saveIgnored(set) {
    try { localStorage.setItem(IGNORED_KEY, JSON.stringify([...set])); }
    catch (e) {}
  }
  function showToast(msg) {
    const el = document.getElementById('diag-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._sgDiagTimer);
    el._sgDiagTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  /* 城等映射（用于战利品厚度与维护估算）*/
  const CITY_TIER = {
    '县城': { gold: -20, food: -200 },
    '郡城': { gold: -30, food: -350 },
    '州治': { gold: -40, food: -550 },
    '雄都': { gold: -50, food: -800 },
  };
  /* 65 城分档表（来自规则书 M-05）*/
  const CITY_LEVEL = {
    /* 雄都 */
    '邺城':'雄都','洛阳':'雄都','长安':'雄都','许昌':'雄都',
    '襄阳':'雄都','建业':'雄都','成都':'雄都',
    /* 州治 */
    '蓟县':'州治','晋阳':'州治','陈留':'州治','下邳':'州治',
    '江夏':'州治','寿春':'州治','吴郡':'州治','汉中':'州治',
    /* 县城 */
    '平阳':'县城','虎牢关':'县城','潼关':'县城','街亭':'县城',
    '西平':'县城','小沛':'县城','新野':'县城','武陵':'县城',
    '桂阳':'县城','零陵':'县城','巴丘':'县城','武都':'县城',
    '剑阁':'县城','葭萌关':'县城','阳平关':'县城','云南':'县城',
    '永昌':'县城','庐陵':'县城',
  };
  function getCityLevel(name) {
    return CITY_LEVEL[name] || '郡城'; /* 其余视为郡城 */
  }

  /* ═══════════════════════════════════════════
     规则定义
     每条规则：{ id, name, level, check(rounds, latest) → [issue,...] }
     issue: { id, ruleId, ruleName, level, body, copy }
     - id 为指纹（用于忽略），格式 `${ruleId}-r${round}-${key}`
     - body 是 HTML 字符串（已 escHtml 处理），允许 <b> <span class="diag-mark">
     - copy 是纯文本（一键复制给 GM 的话术）
  ═══════════════════════════════════════════ */
  const RULES = [

    /* ─────── R1 武将重名 ─────── */
    {
      id: 'R1', name: '武将重名', level: 'error', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const map = {}; /* name → [location,...] */
        const push = (name, loc) => {
          if (!name) return;
          (map[name] = map[name] || []).push(loc);
        };
        /* [legacy v1] 原版把武将列表与守将括号一起塞进 map,导致镜像列表必然误报
        (latest.parsed.players || []).forEach(p => {
          const slot = p.slot || '?';
          (p.generals || []).forEach(g => push(g.name, `${slot}方武将列表`));
          (p.cities_list || []).forEach(c => {
            (c.holders || []).forEach(h => push(h, `${slot}方${c.name}守将`));
          });
        });
        */
        /* #diag-r1-fix-v1: 武将列表是本方在册武将的镜像,按 M-31 必然与守将重复,
           不参与跨源查重;但列表内部仍需自查重以抓 GM 笔误。 */
        const _listDupExtras = [];  /* 收集列表内部自查重的多余条目 */
        (latest.parsed.players || []).forEach(p => {
          const slot = p.slot || '?';
          /* 列表内部自查重:同一武将列表出现两次同名即异常 */
          const seenInList = new Set();
          (p.generals || []).forEach(g => {
            if (!g.name) return;
            if (seenInList.has(g.name)) {
              _listDupExtras.push({ name: g.name, slot, loc: `${slot}方武将列表(出现2次以上)` });
            }
            seenInList.add(g.name);
          });
          /* 守将括号正常进 map 参与跨源查重 */
          (p.cities_list || []).forEach(c => {
            (c.holders || []).forEach(h => push(h, `${slot}方${c.name}守将`));
          });
        });
        (latest.parsed.npcCities || []).forEach(c => {
          (c.holders || []).forEach(h => push(h, `NPC ${c.name}守将`));
        });
        /* [legacy v1]
        (latest.parsed.transit || []).forEach(t => {
          if (t.general) push(t.general, `[调度]段(${t.from}→${t.to})`);
        });
        */
        /* #diag-r1-transit-split-v1: 多将共率按 "/" 拆分，逐人参与查重 */
        (latest.parsed.transit || []).forEach(t => {
          if (!t.general) return;
          const names = t.general.split('/').map(s => s.trim()).filter(Boolean);
          names.forEach(name => {
            push(name, `[调度]段(${t.from}→${t.to})`);
          });
        });
        (latest.parsed.world || []).forEach(w => {
          if (w.name) push(w.name, `[世界]段(${w.status})`);
        });
        const issues = [];
        Object.entries(map).forEach(([name, locs]) => {
          if (locs.length >= 2) {
            issues.push({
              id: `R1-r${round}-${name}`,
              ruleId: 'R1', ruleName: '武将重名', level: 'error',
              body: `数据区出现 <b>${locs.length} 个「${escHtml(name)}」</b>：${locs.map(escHtml).join('、')}。武将不可同时存在于两处。`,
              copy: `【第${round}回合数据核对】[R1·武将重名] 数据区出现 ${locs.length} 个"${name}"——${locs.join('、')}。请核对该武将真实归属，重发数据区。`,
            });
          }
        });
        /* #diag-r1-fix-v1: 武将列表内部自查重的笔误也要报 */
        _listDupExtras.forEach(d => {
          issues.push({
            id: `R1-r${round}-listdup-${d.slot}-${d.name}`,
            ruleId: 'R1', ruleName: '武将重名', level: 'error',
            body: `${d.slot}方武将列表中 <b>${escHtml(d.name)}</b> 出现两次以上(同列表内部重复)。`,
            copy: `【第${round}回合数据核对】[R1·武将重名] ${d.slot}方武将列表中"${d.name}"重复出现,请核对是否为笔误。`,
          });
        });
        return issues;
      },
    },

    /* ─────── R2 武将失踪 ─────── */
    {
      id: 'R2', name: '武将失踪', level: 'error', enabled: true,
      check(rounds, latest) {
        if (!latest || rounds.length < 2) return [];
        const round = latest.round || 0;
        const prev = rounds[rounds.length - 2];
        if (!prev || !prev.parsed) return [];

        /* [legacy v1] 原版 collectFrom 闭包硬绑 prevSet.add(),第二次调用时 currSet 永远为空,
           导致 prevSet 全部武将被误判失踪。
        const prevSet = new Set();
        const collectFrom = parsed => {
          (parsed.players || []).forEach(p => {
            (p.generals || []).forEach(g => prevSet.add(g.name));
            (p.cities_list || []).forEach(c => {
              (c.holders || []).forEach(h => prevSet.add(h));
            });
          });
          (parsed.npcCities || []).forEach(c => {
            (c.holders || []).forEach(h => prevSet.add(h));
          });
          (parsed.transit || []).forEach(t => { if (t.general) prevSet.add(t.general); });
          (parsed.world || []).forEach(w => { if (w.name) prevSet.add(w.name); });
        };
        collectFrom(prev.parsed);

        const currSet = new Set();
        collectFrom(latest.parsed);
        */
        /* #diag-r2-currset-fix-v1: collectFrom 改为接收目标 set 作为参数,避免闭包硬绑 */
        const collectFrom = (parsed, set) => {
          (parsed.players || []).forEach(p => {
            (p.generals || []).forEach(g => set.add(g.name));
            (p.cities_list || []).forEach(c => {
              (c.holders || []).forEach(h => set.add(h));
            });
          });
          (parsed.npcCities || []).forEach(c => {
            (c.holders || []).forEach(h => set.add(h));
          });
          (parsed.transit || []).forEach(t => { if (t.general) set.add(t.general); });
          (parsed.world || []).forEach(w => { if (w.name) set.add(w.name); });
        };
        /* 上回合在册武将集合(含玩家武将、守将、调度、世界、NPC 守将)*/
        const prevSet = new Set();
        collectFrom(prev.parsed, prevSet);
        /* [legacy v1]
        // 本回合在册集合
        const currSet = new Set();
        collectFrom(latest.parsed, currSet);
        */
        /* #diag-r2-reparse-fix-v1: 从 rawContent 重新解析，
           避免 players_json 缓存/继承时序导致 currSet 漏人 */
        const currSet = new Set();
        let _currParsed = latest.parsed;
        try {
          const _freshParsed = window.SGParser.parse(latest.rawContent || '');
          if (_freshParsed && ((_freshParsed.players && _freshParsed.players.length) ||
              (_freshParsed.npcCities && _freshParsed.npcCities.length))) {
            _currParsed = _freshParsed;
          }
        } catch (e) {
          /* 解析失败则降级用 latest.parsed */
        }
        collectFrom(_currParsed, currSet);

        /* 失踪 = 上回合在 & 本回合不在 & 剧情区也没提到 */
        const rawDigest = latest.parsed.rawDigest || latest.rawContent || '';
        const issues = [];
        /* #diag-r2-fix-v1: 防御性日志,便于复现时定位 currSet 收集情况 */
        try {
          console.debug('[SGDiag R2] currSet size=' + currSet.size,
            'prevSet size=' + prevSet.size,
            'round=' + round);
        } catch (e) {}
        prevSet.forEach(name => {
          if (!name || currSet.has(name)) return;
          /* [legacy v1] 原版 includes 单字也能抵消,误抵消率高
          if (rawDigest.includes(name)) return;
          */
          /* #diag-r2-fix-v1: 仅长度 ≥2 的名字才允许用 includes 抵消,避免"忠""统"这类单字误抵消 */
          if (name.length >= 2 && rawDigest.includes(name)) return;
          issues.push({
            id: `R2-r${round}-${name}`,
            ruleId: 'R2', ruleName: '武将失踪', level: 'error',
            body: `<b>${escHtml(name)}</b>上回合在册，本回合从所有数据区消失，剧情区也未提及。可能是数据遗漏。`,
            copy: `【第${round}回合数据核对】[R2·武将失踪] ${name}上回合在册，本回合所有数据区无此人，剧情区也未提及。请确认其当前位置或补充落点。`,
          });
        });

        /* #diag-r2-strict-v2: 本回合在册武将名含非法字符(符号/数字/标点)视为格式写错,等同失踪
           排除调度段来源:调度段多将共率/路线符号经 parser 拆分后可能残留碎片,不误报 */
        const ILLEGAL_NAME_RE = /[0-9\(\)（）\[\]【】\|｜:：,，\/\\;；\.\+\-\*=<>!！\?？@#$%^&_~`'"{}→←↔►▸▶]/;
        /* 收集调度段所有武将名,作为豁免白名单 */
        const _transitNames = new Set();
        (latest.parsed.transit || []).forEach(t => {
          if (t.general) _transitNames.add(t.general);
        });
        currSet.forEach(name => {
          if (!name || name.length < 1) return;
          if (_transitNames.has(name)) return;  /* 调度段来源不报 */
          if (ILLEGAL_NAME_RE.test(name)) {
            issues.push({
              id: `R2-r${round}-fmt-${name}`,
              ruleId: 'R2', ruleName: '武将失踪', level: 'error',
              body: `本回合数据区出现疑似格式错误的武将名 <b>「${escHtml(name)}」</b>(含数字或符号),大概率是主持人数据区格式写错,请核对该行。`,
              copy: `【第${round}回合数据核对】[R2·武将格式异常] 数据区出现武将名"${name}"(含数字或符号),疑似格式写错。请核对该行的括号/斜杠/冒号是否正确。`,
            });
          }
        });

        return issues;
      },
    },

    /* ─────── R3 资源连续性断裂 ─────── */
    {
      id: 'R3', name: '资源连续性断裂', level: 'error', enabled: true,
      check(rounds, latest) {
        if (!latest || rounds.length < 2) return [];
        const round = latest.round || 0;
        const prev = rounds[rounds.length - 2];
        if (!prev || !prev.parsed) return [];

        const SLOT_NAMES = { '甲': 0, '乙': 1, '丙': 2 };
        const RES_FIELDS = [
          { key: 'gold',   name: '金' },
          { key: 'food',   name: '粮' },
          { key: 'troop',  name: '兵' },
          { key: 'morale', name: '民心' },
          { key: 'cities', name: '城' },
        ];
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          const pPrev = (prev.parsed.players || []).find(p => p.slot === slot);
          const pCurr = (latest.parsed.players || []).find(p => p.slot === slot);
          if (!pPrev || !pCurr) return;

          /* [legacy v1] 原逻辑要求 breakdown 为空,但 v3.41 后明细与总账同块,find 永远返回 undefined
          const totalCh = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.resources && Object.keys(ch.resources).length > 0
                  && (!ch.breakdown || Object.keys(ch.breakdown).length === 0)
          );
          const delta = totalCh ? totalCh.resources : {};
          */
          /* #diag-r3r4r5-fix-v1: 该 slot 的任意 change 块都可能含 resources */
          const totalCh = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.resources && Object.keys(ch.resources).length > 0
          );
          const delta = totalCh ? totalCh.resources : {};

          RES_FIELDS.forEach(f => {
            const before = pPrev[f.key];
            const after  = pCurr[f.key];
            if (before == null || after == null) return;
            const d = Number(delta[f.name] || 0);
            const expected = before + d;
            /* #diag-r3r4-morale-cap-v2: 民心到顶(100)或触底(0)时不报,GM 截断正常 */
            if (f.key === 'morale' && after === 100 && expected > 100) return;
            if (f.key === 'morale' && after === 0 && expected < 0) return;
            if (expected !== after) {
              const diff = after - expected;
              issues.push({
                id: `R3-r${round}-${slot}-${f.name}`,
                ruleId: 'R3', ruleName: '资源连续性断裂', level: 'error',
                body: `${slot}方<b>${f.name}</b>不平：上回合 <span class="diag-mark">${before}</span> + 本回合△<span class="diag-mark">${d >= 0 ? '+' : ''}${d}</span> = <span class="diag-mark">${expected}</span>，但本回合面板显示 <span class="diag-mark">${after}</span>，差 <span class="diag-mark">${diff >= 0 ? '+' : ''}${diff}</span>。`,
                copy: `【第${round}回合数据核对】[R3·资源不平] ${slot}方${f.name}：上回合 ${before} + 本回合 △${d >= 0 ? '+' : ''}${d} 应=${expected}，但面板显示 ${after}，差 ${diff >= 0 ? '+' : ''}${diff}。请核对 [变动] 段是否有遗漏。`,
              });
            }
          });
        });
        return issues;
      },
    },

    /* ─────── R4 收支明细对不上总账 ─────── */
    {
      id: 'R4', name: '收支明细对不上总账', level: 'error', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          /* 详细块：breakdown 非空 */
          const detail = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.breakdown && Object.keys(ch.breakdown).length > 0
          );
          /* [legacy v1] 同 R3,要求 breakdown 空导致永远 find 不到
          const total = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.resources && Object.keys(ch.resources).length > 0
                  && (!ch.breakdown || Object.keys(ch.breakdown).length === 0)
          );
          */
          /* #diag-r3r4r5-fix-v1: 取该 slot 含 resources 的 change 块,detail 和 total 可能是同一对象 */
          const total = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.resources && Object.keys(ch.resources).length > 0
          );
          if (!detail || !total) return;

          ['金', '粮', '兵', '民心'].forEach(res => {
            const bd = detail.breakdown[res];
            const totalVal = Number(total.resources[res] || 0);
            if (!bd || typeof bd.total !== 'number') return;
            /* #diag-r3r4-morale-cap-v2: 民心差异由截断(0/100)引起时不报 */
            if (res === '民心') {
              const pCurr = (latest.parsed.players || []).find(p => p.slot === slot);
              const curMorale = pCurr ? Number(pCurr.morale) : null;
              if (curMorale === 100 || curMorale === 0) return;
            }
            if (bd.total !== totalVal) {
              const diff = totalVal - bd.total;
              issues.push({
                id: `R4-r${round}-${slot}-${res}`,
                ruleId: 'R4', ruleName: '收支明细对不上总账', level: 'error',
                body: `${slot}方<b>${res}</b>收支明细合计 <span class="diag-mark">${bd.total >= 0 ? '+' : ''}${bd.total}</span>，但总变化行写 <span class="diag-mark">${totalVal >= 0 ? '+' : ''}${totalVal}</span>，差 <span class="diag-mark">${diff >= 0 ? '+' : ''}${diff}</span>。`,
                copy: `【第${round}回合数据核对】[R4·收支不符] ${slot}方${res}收支△明细合计 ${bd.total >= 0 ? '+' : ''}${bd.total}，但总变化行写 ${totalVal >= 0 ? '+' : ''}${totalVal}，差 ${diff >= 0 ? '+' : ''}${diff}。请核对 [变动] 段。`,
              });
            }
          });
        });
        return issues;
      },
    },

    /* ─────── R5 城池数变化与战报不符 ─────── */
    {
      id: 'R5', name: '城池数变化与战报不符', level: 'error', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const SLOT_IDX = { '甲': 0, '乙': 1, '丙': 2 };
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          /* 取该 slot 的"详细块"（含 cities 数组）*/
          const detail = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && Array.isArray(ch.cities) && ch.cities.length > 0
          );
          if (!detail) return;

          const gainCities = detail.cities.filter(c => c.action === '攻下').length;
          const lossCities = detail.cities.filter(c => c.action === '失去').length;

          /* 战报中本 slot 作为攻方且 result=胜 + 有 city 的场数 */
          const slotIdx = SLOT_IDX[slot];
          const wonWithCity = (latest.parsed.battles || []).filter(
            b => b.attackerSlot === slotIdx && b.result === '胜' && b.city
          ).length;

          if (gainCities > 0 && wonWithCity < gainCities) {
            issues.push({
              id: `R5-r${round}-${slot}-gain`,
              ruleId: 'R5', ruleName: '城池数与战报不符', level: 'error',
              body: `${slot}方本回合<b>城△+${gainCities}</b>，但 [战报] 中仅 <span class="diag-mark">${wonWithCity}</span> 场胜战带城名。可能漏写攻城战报。`,
              copy: `【第${round}回合数据核对】[R5·城战不符] ${slot}方城△+${gainCities}，但 [战报] 中仅 ${wonWithCity} 场带城名的胜战。请补充攻城战报或修正城△。`,
            });
          }
        });
        return issues;
      },
    },

    /* ─────── R6 兵力不平(城池+调度 ≠ 玩家段总兵) ─────── */
    /* #diag-r6-troop-balance-v1 (2026-06-04):
       依据 M-21【兵种△ 强制原则】+【参战兵力默认满编】+【调兵·硬】,
       玩家段总兵必须 = Σ城池兵种 + Σ调度兵种(slot 归属本玩家)。
       容差 ±50 兵,吸收 GM 心算零头。
       仅检测玩家三家(甲/乙/丙),NPC 阵营无总兵概念,跳过。 */
    {
      id: 'R6', name: '兵力不平', level: 'error', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const TOLERANCE = 500; /* 兵力容差(单位:兵) — v2: 50→500,GM 兵种明细经常漏同步 */
        const SLOT_IDX = { '甲': 0, '乙': 1, '丙': 2 };
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          const slotIdx = SLOT_IDX[slot];
          const p = (latest.parsed.players || []).find(pp => pp.slot === slot);
          if (!p || p.troop == null) return;  /* 缺数据则跳过该 slot */

          /* 城池兵种和:遍历 cities_list[i].troops {步:N,弓:N,...} */
          let cityTroops = 0;
          (p.cities_list || []).forEach(c => {
            const troops = c.troops || {};
            Object.values(troops).forEach(n => {
              cityTroops += Number(n) || 0;
            });
          });

          /* 调度兵种和:transit[].slot===slotIdx 的所有兵种合计 */
          let transitTroops = 0;
          (latest.parsed.transit || []).forEach(t => {
            if (t.slot !== slotIdx) return;
            const troops = t.troops || {};
            if (Object.keys(troops).length) {
              /* v18 多兵种格式 */
              Object.values(troops).forEach(n => {
                transitTroops += Number(n) || 0;
              });
            } else if (t.troopCount != null) {
              /* 兜底:旧单兵种字段 */
              transitTroops += Number(t.troopCount) || 0;
            }
          });

          const expected = cityTroops + transitTroops;
          const actual = Number(p.troop) || 0;
          const diff = actual - expected;

          if (Math.abs(diff) <= TOLERANCE) return;  /* 容差内通过 */

          const diffSign = diff > 0 ? '+' : '';
          issues.push({
            id: `R6-r${round}-${slot}`,
            ruleId: 'R6', ruleName: '兵力不平', level: 'error',
            body: `${slot}方<b>兵力不平</b>:玩家段总兵 <span class="diag-mark">${actual}</span>,城池兵和 <span class="diag-mark">${cityTroops}</span> + 调度兵和 <span class="diag-mark">${transitTroops}</span> = <span class="diag-mark">${expected}</span>,差 <span class="diag-mark">${diffSign}${diff}</span>(容差 ±${TOLERANCE})。请核对城池括号或 [调度] 段是否有兵种漏写。`,
            copy: `【第${round}回合数据核对】[R6·兵力不平] ${slot}方总兵 ${actual},但城池兵和 ${cityTroops} + 调度兵和 ${transitTroops} = ${expected},差 ${diffSign}${diff}。请核对城池括号或 [调度] 段是否有兵种漏写。`,
          });
        });
        return issues;
      },
    },

    /* ─────── R7 攻城成功未落战利品 ─────── */
    {
      id: 'R7', name: '攻城成功未落战利品', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          const detail = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && Array.isArray(ch.cities)
          );
          if (!detail) return;
          const gains = detail.cities.filter(c => c.action === '攻下');
          if (!gains.length) return;

          /* 检查 breakdown 是否含"战利品"字样 */
          const bd = detail.breakdown || {};
          const hasSpoils = ['金', '粮'].some(res => {
            const items = (bd[res] && bd[res].items) || [];
            return items.some(it => /战利品|缴获|斩获/.test(it.label || ''));
          });
          if (hasSpoils) return;

          gains.forEach(city => {
            const lvl = getCityLevel(city.cityName);
            issues.push({
              id: `R7-r${round}-${slot}-${city.cityName}`,
              ruleId: 'R7', ruleName: '攻城成功未落战利品', level: 'warn',
              body: `${slot}方本回合<b>攻下${escHtml(city.cityName)}</b>，但收支△中无"战利品"字样的金/粮分项。${lvl}通常应有金粮缴获。`,
              copy: `【第${round}回合数据核对】[R7·战利品缺失] ${slot}方本回合攻下${city.cityName}（${lvl}），但收支△无战利品分项。请补充缴获金粮或确认是否空城。`,
            });
          });
        });
        return issues;
      },
    },

    /* ─────── R8 降兵未入伍 ─────── */
    {
      id: 'R8', name: '降兵未入伍', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const SLOT_IDX = { '甲': 0, '乙': 1, '丙': 2 };
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          const slotIdx = SLOT_IDX[slot];
          /* 找本玩家攻方的"大败级"战斗：胜 + 守方伤亡 >= 1500 + 有 city */
          const bigWins = (latest.parsed.battles || []).filter(
            b => b.attackerSlot === slotIdx && b.result === '胜'
                 && b.city && (b.defender_loss || 0) >= 1500
          );
          if (!bigWins.length) return;

          /* 检查 breakdown 是否含"降兵" */
          const detail = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.breakdown
          );
          const bd = (detail && detail.breakdown) || {};
          const bingItems = (bd['兵'] && bd['兵'].items) || [];
          const hasJiangBing = bingItems.some(it => /降兵|降卒|整编/.test(it.label || ''));
          if (hasJiangBing) return;

          /* 检查 troopOps 是否有该城兵种增量 */
          const hasTroopGain = (detail && detail.troopOps || []).some(op => {
            return bigWins.some(b => b.city === op.cityName)
                   && op.isDelta && op.entries.some(e => e.val > 0);
          });
          if (hasTroopGain) return;

          bigWins.forEach(b => {
            issues.push({
              id: `R8-r${round}-${slot}-${b.city}`,
              ruleId: 'R8', ruleName: '降兵未入伍', level: 'warn',
              body: `${slot}方攻下<b>${escHtml(b.city)}</b>，敌守军大败（伤亡 <span class="diag-mark">${b.defender_loss}</span>），但本回合无"降兵"分项也无兵种△增量。可能漏整编。`,
              copy: `【第${round}回合数据核对】[R8·降兵未入伍] ${slot}方攻下${b.city}，敌方伤亡${b.defender_loss}，但本回合无降兵分项也无兵种△增量。请确认是否漏整编降兵。`,
            });
          });
        });
        return issues;
      },
    },

    /* [legacy v1] R9 维护栏偏离持城规模 — 2026-06-04 下线
       经验值估算偏差大,警告参考价值低,长期产生噪音。规则定义保留在 git 历史中。
    */

    /* [legacy v1] R10 行动栏消耗偏低 — 2026-06-04 下线
       基于持城阶梯的消耗阈值过于机械,与玩家实际节奏脱节。规则定义保留在 git 历史中。
    */

    /* [legacy v1] R11 新登场武将未入数据区 — 启发式判定误报率过高,2026-06-04 下线
       (剧情中武将的字、人名后续句子残片、被截断的人名+动词都会被误判为新武将名)。
       规则定义保留在 git 历史中,需要时可恢复。
    */

    /* ─────── R12 民心越界(>100 或 <0) ─────── */
    /* #diag-r12-morale-cap-v1 (2026-06-04):
       依据 M-21【民心阶梯】"民心上限 100,下限 0",
       GM 漏截断时本规则报黄色警告。
       仅检测玩家三家(甲/乙/丙),NPC 无民心字段。 */
    {
      id: 'R12', name: '民心越界', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          const p = (latest.parsed.players || []).find(pp => pp.slot === slot);
          if (!p || p.morale == null) return;  /* 缺数据则跳过该 slot */
          const morale = Number(p.morale);
          if (!Number.isFinite(morale)) return;

          if (morale > 100) {
            const over = morale - 100;
            issues.push({
              id: `R12-r${round}-${slot}-over`,
              ruleId: 'R12', ruleName: '民心越界', level: 'warn',
              body: `${slot}方<b>民心越界</b>:当前 <span class="diag-mark">${morale}</span>,超出上限 <span class="diag-mark">100</span>(超 ${over})。M-21 规定民心上限 100、下限 0,请截断处理。`,
              copy: `【第${round}回合数据核对】[R12·民心越界] ${slot}方民心 ${morale},超出上限 100。M-21 规定民心上限 100、下限 0,请截断为 100。`,
            });
          } else if (morale < 0) {
            issues.push({
              id: `R12-r${round}-${slot}-under`,
              ruleId: 'R12', ruleName: '民心越界', level: 'warn',
              body: `${slot}方<b>民心越界</b>:当前 <span class="diag-mark">${morale}</span>,低于下限 <span class="diag-mark">0</span>。M-21 规定民心上限 100、下限 0,请截断处理(并注意 ≤20 可触发叛乱)。`,
              copy: `【第${round}回合数据核对】[R12·民心越界] ${slot}方民心 ${morale},低于下限 0。M-21 规定民心上限 100、下限 0,请截断为 0(并注意叛乱判定)。`,
            });
          }
        });
        return issues;
      },
    },

    /* [legacy] R13 同上简写提醒 — 2026-06-06 下线,噪音过大。规则定义保留在 git 历史中。 */

    /* ─────── R14 在野武将池停滞 ─────── */
    /* #diag-r14-wild-v2 (2026-06-06): 对齐新规则 M-25 —
       "二幕起每 6-10 回合 ≥1 位新野外角色登场,直至总数达上限(6 位)"
       "野外角色登场后落 [世界] 段标「在野」(默认剩 5 回合)"
       检测策略:
       - 连续 10 回合(取上界)无任何新"在野"武将出现在 [世界] 段
       - 仅在 round ≥ 19(二幕起)时触发
       - "新"的定义:本回合 [世界] 在野集合中出现了之前所有回合从未出现过的人名
       - 已达上限(累计曾有 ≥6 位独立在野武将出现过)则不再报
    */
    {
      id: 'R14', name: '在野武将池停滞', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest) return [];
        const round = latest.round || 0;
        if (round < 19) return [];  /* 一幕不检测 */

        const WINDOW = 10;  /* 新规则:6-10 回合,取上界 */
        const CAP = 6;      /* 每局上限 6 位野外角色 */

        if (rounds.length < WINDOW) return [];

        /* 统计历史上所有曾出现在 [世界] 段标"在野"的独立人名 */
        const everWild = new Set();
        rounds.forEach(rd => {
          ((rd.parsed && rd.parsed.world) || []).forEach(w => {
            if (w && w.status === '在野' && w.name) everWild.add(w.name);
          });
        });

        /* 已达上限则不报 */
        if (everWild.size >= CAP) return [];

        /* 检查最近 WINDOW 个回合是否有"新面孔"出现 */
        const recent = rounds.slice(-WINDOW);
        /* 之前所有回合(不含最近 WINDOW 个)曾出现过的在野人名 */
        const beforeRecent = new Set();
        const beforeIdx = rounds.length - WINDOW;
        for (let i = 0; i < beforeIdx; i++) {
          ((rounds[i].parsed && rounds[i].parsed.world) || []).forEach(w => {
            if (w && w.status === '在野' && w.name) beforeRecent.add(w.name);
          });
        }

        /* 最近 WINDOW 个回合中是否有新面孔(之前从未以"在野"出现过的) */
        let hasNewFace = false;
        for (const rd of recent) {
          const world = (rd.parsed && rd.parsed.world) || [];
          for (const w of world) {
            if (w && w.status === '在野' && w.name && !beforeRecent.has(w.name)) {
              hasNewFace = true;
              break;
            }
          }
          if (hasNewFace) break;
        }

        if (hasNewFace) return [];  /* 有新人,通过 */

        /* 无新人:触发警告 */
        const currentWild = [];
        const latestWorld = (latest.parsed && latest.parsed.world) || [];
        latestWorld.forEach(w => {
          if (w && w.status === '在野') currentWild.push(w.name || '?');
        });

        const bodyExtra = currentWild.length
          ? `当前在野:${currentWild.join('、')}。`
          : '当前 [世界] 段无任何在野武将。';

        return [{
          id: `R14-r${round}-stagnant`,
          ruleId: 'R14', ruleName: '在野武将池停滞', level: 'warn',
          body: `已连续 <span class="diag-mark">${WINDOW}</span> 回合无新野外角色登场(落 [世界] 段标「在野」)。${bodyExtra}按新规则 M-25,二幕起每 6-10 回合应有 ≥1 位新野外角色登场,累计上限 ${CAP} 位(当前已登场 ${everWild.size} 位)。建议主持人推进访贤事件或安排新野外角色。`,
          copy: `【第${round}回合数据核对】[R14·在野池停滞] 已连续 ${WINDOW} 回合无新野外角色登场。${bodyExtra}按 M-25 新规则,二幕起每 6-10 回合应有 ≥1 位新野外角色登场(累计上限 ${CAP} 位,当前已 ${everWild.size} 位)。请问本回合是否需要安排新野外角色登场?`,
        }];
      },
    },

    /* ─────── R16 治政工程未到期入账 ─────── */
    /* #diag-r16-project-closure-v1 (2026-XX-XX):
       依据 M-23【治政工程一次性入账】"投入回合即时扣资源,产出在到期回合一次性入账":
       - 小工程(投 ≤100 金 / ≤200 粮):3 回合后到期
       - 中工程(投 100-300 金 / 200-600 粮):5 回合后到期
       - 大工程(投 >300 金 / >600 粮):8 回合后到期

       检测策略(纯结构化闭环检测,不掺关键词扫描):
       - 扫所有历史回合 changes[].breakdown['金'/'粮'].items
       - 投入识别:label 含"兴"字 + "-城名"后缀(如"水利兴-成都")
       - 到期识别:label 含"成"字 + "-城名"后缀(如"水利成-成都")
       - 工程档位按投入金额套档(金>200>600 按粮档,二者择重)
       - 计算预计到期回合 = 投入回合 + 档位
       - 当前回合 = 预计到期回合 时,扫该回合是否有"工程名-城名"对应的"成"入账
       - 未找到 → warn(提醒主持人核对是否延期/中断)

       零误报原则:
       - 仅在"已到期"的回合触发(预计到期回合 = 当前回合时)
       - 若 GM 注解写法不规范(未带"兴"/"成"字或未带"-城名"后缀)
         本规则自动跳过,不误报。
       - 同一工程提示仅触发一次(按工程名+城名+投入回合做指纹) */
    {
      id: 'R16', name: '治政工程未到期入账', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || rounds.length < 2) return [];
        const round = latest.round || 0;
        const issues = [];

        /* 投入正则:匹配"行动"栏 items 中的"XX兴-城名"模式
           兼容:"水利兴-成都" / "屯田兴-江夏" / "招贤馆兴-许昌" 等
           label 形如:"水利兴-成都" 或 "水利兴" */
        const INVEST_RE = /^(.+?)兴(?:-(.+))?$/;
        /* 到期正则:"XX成-城名" */
        const COMPLETE_RE = /^(.+?)成(?:-(.+))?$/;

        /* 工程档位判定(按 M-23 阈值,金粮择重) */
        function getProjectTier(goldVal, foodVal) {
          const g = Math.abs(Number(goldVal) || 0);
          const f = Math.abs(Number(foodVal) || 0);
          /* 大工程:金>300 或 粮>600 */
          if (g > 300 || f > 600) return { tier: '大', wait: 8 };
          /* 中工程:金 100-300 或 粮 200-600 */
          if (g > 100 || f > 200) return { tier: '中', wait: 5 };
          /* 小工程:金 ≤100 且 粮 ≤200 */
          return { tier: '小', wait: 3 };
        }

        /* 扫描所有历史回合,提取所有"兴"投入记录 */
        /* invests[] = { roundNum, slot, projectName, cityName, goldVal, foodVal } */
        const invests = [];
        rounds.forEach(rd => {
          const rdRound = rd.round || 0;
          (rd.parsed.changes || []).forEach(ch => {
            if (!ch.slot || !ch.breakdown) return;
            /* 一个工程可能金粮分别落账,要按"工程名-城名"聚合 */
            const projMap = {};  /* key: projectName||cityName, val: { goldVal, foodVal } */

            ['金', '粮'].forEach(res => {
              const bd = ch.breakdown[res];
              if (!bd || !Array.isArray(bd.items)) return;
              bd.items.forEach(it => {
                if (!it.label) return;
                /* note 字段也可能含"兴-城名",优先 label */
                const lbl = String(it.label || '').trim();
                const m = lbl.match(INVEST_RE);
                if (!m) return;
                const projectName = m[1].trim();
                const cityName = (m[2] || '').trim();
                /* 排除明显不是工程的词(如"复兴""中兴")的兜底:
                   要求 projectName 长度 2-6 字且不含"复/中/振" */
                if (!projectName || projectName.length < 1 || projectName.length > 8) return;
                if (/^(复|中|振|重)$/.test(projectName)) return;

                const key = projectName + '|' + cityName;
                if (!projMap[key]) {
                  projMap[key] = { projectName, cityName, goldVal: 0, foodVal: 0 };
                }
                if (res === '金') projMap[key].goldVal = it.val;
                if (res === '粮') projMap[key].foodVal = it.val;
              });
            });

            Object.values(projMap).forEach(proj => {
              invests.push({
                roundNum: rdRound,
                slot: ch.slot,
                projectName: proj.projectName,
                cityName: proj.cityName,
                goldVal: proj.goldVal,
                foodVal: proj.foodVal,
              });
            });
          });
        });

        if (!invests.length) return [];

        /* 扫描所有历史回合,提取所有"成"到期记录 */
        /* completes 用 Set 存"roundNum|slot|projectName|cityName"指纹 */
        const completes = new Set();
        rounds.forEach(rd => {
          const rdRound = rd.round || 0;
          (rd.parsed.changes || []).forEach(ch => {
            if (!ch.slot || !ch.breakdown) return;
            ['金', '粮'].forEach(res => {
              const bd = ch.breakdown[res];
              if (!bd || !Array.isArray(bd.items)) return;
              bd.items.forEach(it => {
                if (!it.label) return;
                const lbl = String(it.label || '').trim();
                const m = lbl.match(COMPLETE_RE);
                if (!m) return;
                const projectName = m[1].trim();
                const cityName = (m[2] || '').trim();
                if (!projectName || projectName.length < 1 || projectName.length > 8) return;
                if (/^(达|功|完|建)$/.test(projectName)) return;  /* 排除"达成/功成"等 */
                completes.add(rdRound + '|' + ch.slot + '|' + projectName + '|' + cityName);
              });
            });
          });
        });

        /* 对每条投入,计算预计到期回合,检查是否已入账 */
        invests.forEach(inv => {
          const tierInfo = getProjectTier(inv.goldVal, inv.foodVal);
          const expectedRound = inv.roundNum + tierInfo.wait;

          /* 只在"已到期"的回合提示 */
          if (expectedRound !== round) return;

          /* 检查到期回合是否有对应"成"入账(允许 ±0,严格匹配) */
          const fingerprint = round + '|' + inv.slot + '|' + inv.projectName + '|' + inv.cityName;
          if (completes.has(fingerprint)) return;  /* 已入账,跳过 */

          /* 兜底:不带城名的投入,允许只按"工程名"匹配(忽略城名) */
          let alsoFound = false;
          if (!inv.cityName) {
            for (const fp of completes) {
              const parts = fp.split('|');
              if (parts[0] === String(round) && parts[1] === inv.slot && parts[2] === inv.projectName) {
                alsoFound = true;
                break;
              }
            }
          }
          if (alsoFound) return;

          const cityLabel = inv.cityName ? `<b>${inv.cityName}</b>` : '<i>(未注明城名)</i>';
          const cityLabelCopy = inv.cityName ? inv.cityName : '(未注明城名)';
          issues.push({
            id: `R16-r${round}-${inv.slot}-${inv.projectName}-${inv.cityName}-r${inv.roundNum}`,
            ruleId: 'R16', ruleName: '治政工程未到期入账', level: 'warn',
            body: `${inv.slot}方第 <span class="diag-mark">${inv.roundNum}</span> 回合在 ${cityLabel} 投入「<b>${inv.projectName}</b>」工程(${tierInfo.tier}工程 / ${tierInfo.wait} 回合到期),按 M-23 本回合应有「${inv.projectName}成-${inv.cityName || '城名'}」入账,但 收支△ 产出栏未找到对应记录。可能延期、被中断或主持人漏写。`,
            copy: `【第${round}回合数据核对】[R16·工程未入账] ${inv.slot}方第 ${inv.roundNum} 回合在 ${cityLabelCopy} 投入"${inv.projectName}"工程(${tierInfo.tier}工程/${tierInfo.wait}回合到期),按 M-23 本回合应有"${inv.projectName}成-${inv.cityName || '城名'}"入账,但产出栏未找到。请核对:是否延期/被中断,或是漏写?`,
          });
        });

        return issues;
      },
    },

    /* ─────── R15 空城未补人(连续 ≥3 回合 warn / ≥5 回合 error) ─────── */
    /* #diag-r15-empty-city-watch-v1 (2026-XX-XX):
       依据 M-21【无主之城】"无将时守将写「空」,产出 ×0.5,民心 -3。
       空置 ≥3 回合 GM 择一:豪强自立 / 邻势力吞并"。

       检测策略:
       - 扫描所有历史回合,对每座城(玩家+NPC)按"阵营+城名"建立连续空置计数
       - 阵营变更(易主)即清零重计
       - 同一城连续空置:≥3 回合 → warn,≥5 回合 → error(升级)
       - 每回合都报(玩家可"忽略本条"暂屏蔽)

       语气定位:这是提醒,不是错误,主持人保留裁量。 */
    {
      id: 'R15', name: '空城未补人', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed || !rounds.length) return [];
        const round = latest.round || 0;

        /* 工具:从一个 parsed 中提取本回合所有城的「阵营 + 城名 + 是否空」三元组
           阵营键说明:
             - 玩家城:'甲'/'乙'/'丙'
             - NPC 城有阵营标签:阵营主公名(如'袁绍')
             - NPC 散城:'__npc_unowned__'(统一归一,无阵营即视为同阵营)
           本回合该城不在数据里 → 不进 map(自动断链清零) */
        /* #diag-r15-align-frontend-v2: 对齐前端"空缺"显示逻辑 —
           守将文本为空/'空'/'空缺'/'无' 或 holders 数组为空/全空串 均视为空城 */
        function _isHolderBlank(c) {
          if (!c) return true;
          /* cities_list 格式(玩家城):有 holders 数组 */
          if (Array.isArray(c.holders)) {
            const valid = c.holders.filter(h => h && h.trim() && h.trim() !== '空' && h.trim() !== '空缺' && h.trim() !== '无');
            return valid.length === 0;
          }
          /* npcCities 格式:可能有 holder 字符串 */
          if (typeof c.holder === 'string') {
            const h = c.holder.trim();
            return !h || h === '空' || h === '空缺' || h === '无';
          }
          /* 兜底:无 holders 也无 holder 字段 */
          return true;
        }

        function snapshot(parsed) {
          const map = {};  /* key = `${faction}::${cityName}` → { faction, city, empty } */
          if (!parsed) return map;

          (parsed.players || []).forEach(p => {
            const slot = p.slot;
            if (!slot) return;
            (p.cities_list || []).forEach(c => {
              if (!c || !c.name) return;
              const key = slot + '::' + c.name;
              map[key] = {
                faction: slot,
                city: c.name,
                empty: !!(c.holderEmpty || _isHolderBlank(c)),
              };
            });
          });

          (parsed.npcCities || []).forEach(c => {
            if (!c || !c.name) return;
            const fac = c.faction || '__npc_unowned__';
            const key = fac + '::' + c.name;
            map[key] = {
              faction: fac,
              city: c.name,
              empty: !!(c.holderEmpty || _isHolderBlank(c)),
            };
          });

          return map;
        }

        /* 从最早回合开始,对每个 key 累计连续空置数
           - 空 → 计数 +1
           - 不空(有人驻守) → 计数清零
           - 城在本回合数据中不存在(易主/被吞) → 计数清零(下次再出现重新起算) */
        const counter = {};  /* key → 当前连续空置回合数 */
        const lastSeen = {}; /* key → 上次见到此 key 的回合号 */

        for (let i = 0; i < rounds.length; i++) {
          const rd = rounds[i];
          const snap = snapshot(rd.parsed);
          const seenThisRound = new Set();

          Object.keys(snap).forEach(key => {
            seenThisRound.add(key);
            const info = snap[key];
            if (info.empty) {
              counter[key] = (counter[key] || 0) + 1;
            } else {
              counter[key] = 0;
            }
            lastSeen[key] = rd.round || 0;
          });

          /* 本回合没出现的 key(城易主或被吞):清零计数 */
          Object.keys(counter).forEach(key => {
            if (!seenThisRound.has(key)) {
              counter[key] = 0;
            }
          });
        }

        /* 最终状态:对最新回合的所有城,counter[key] 即为连续空置回合数 */
        const latestSnap = snapshot(latest.parsed);
        const issues = [];

        Object.keys(latestSnap).forEach(key => {
          const info = latestSnap[key];
          if (!info.empty) return;
          const streak = counter[key] || 0;
          if (streak < 3) return;

          /* 阵营展示名 */
          let factionLabel;
          if (info.faction === '甲' || info.faction === '乙' || info.faction === '丙') {
            factionLabel = info.faction + '方';
          } else if (info.faction === '__npc_unowned__') {
            factionLabel = '散城';
          } else {
            factionLabel = info.faction + '势力';
          }

          /* 文案分级:≥5 升级为 error,提醒"豪强自立/邻势力吞并"风险 */
          if (streak >= 5) {
            issues.push({
              id: 'R15-r' + round + '-' + key + '-err',
              ruleId: 'R15', ruleName: '空城未补人', level: 'error',
              body: factionLabel + '<b>' + escHtml(info.city) + '</b>已连续空置 <span class="diag-mark">' + streak + '</span> 回合,远超 M-21 规定的 3 回合阈值。豪强自立或邻势力吞并的风险已然存在,建议尽快提醒主持人安排守将或推进事件。',
              copy: '【第' + round + '回合数据核对】[R15·空城未补人] ' + factionLabel + info.city + '已连续空置 ' + streak + ' 回合(M-21 规定 ≥3 回合 GM 应择一:豪强自立 / 邻势力吞并)。请问该城本回合是否需要安排守将,或触发对应事件?',
            });
          } else {
            issues.push({
              id: 'R15-r' + round + '-' + key + '-warn',
              ruleId: 'R15', ruleName: '空城未补人', level: 'warn',
              body: factionLabel + '<b>' + escHtml(info.city) + '</b>已连续空置 <span class="diag-mark">' + streak + '</span> 回合,达到 M-21【无主之城】3 回合阈值。可提醒主持人:本回合是否需要派将驻守,或推进"豪强自立 / 邻势力吞并"事件。',
              copy: '【第' + round + '回合数据核对】[R15·空城未补人] ' + factionLabel + info.city + '已连续空置 ' + streak + ' 回合,达到 M-21 的 3 回合阈值。请问本回合是否需要派将驻守,或考虑推进相应事件?',
            });
          }
        });

        return issues;
      },
    },

    /* ─────── R17 被俘/在野武将即将到期 ─────── */
    /* #diag-r17-world-expiry-v1 (2026-06-08):
       依据 M-31【[世界] 段填写规则·硬】:
       - 被俘:剩 1 时 GM 必须挂处置选项(斩首/释放/再劝降/囚禁续押+2)
       - 在野:剩 1 时 GM 必须安排归宿(投靠/隐居/病故/从数据移除并以事件交代)
       - 不得让武将到期后无落点消失

       检测策略:
       - 扫最新回合 world[] 中 status=被俘/在野 的条目
       - remaining=2 → warn(提醒 GM 下回合须安排)
       - remaining=1 → error(本回合必须处置)
       - remaining=0 或缺失 → 不报(parser 层或继承层已处理) */
    {
      id: 'R17', name: '武将即将到期', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const world = latest.parsed.world || [];
        if (!world.length) return [];

        const issues = [];

        world.forEach(function (w) {
          if (!w || !w.name) return;
          var status = String(w.status || '');
          if (status !== '被俘' && status !== '在野') return;

          var rem = w.remaining;
          if (rem === Infinity || rem === '∞') return;
          var n = Number(rem);
          if (!Number.isFinite(n)) return;

          var loc = w.location || '未知位置';
          var statusLabel = status === '被俘' ? '被俘' : '在野';

          if (n === 1) {
            /* 剩 1 → error：本回合必须处置 */
            var actionHint = status === '被俘'
              ? '按 M-31 须在行动建议中挂处置选项(斩首/释放/再劝降/囚禁续押)，否则 GM 将直觉裁定(释放/病故/自缢/越狱)。'
              : '按 M-31 须在本回合安排归宿(投靠某势力/隐居病故/从数据移除并以事件交代)，不得让武将无落点消失。';

            issues.push({
              id: 'R17-r' + round + '-' + w.name + '-1',
              ruleId: 'R17', ruleName: '武将即将到期', level: 'error',
              body: '<b>' + escHtml(w.name) + '</b>(' + escHtml(statusLabel) + '·' + escHtml(loc) + ')剩余 <span class="diag-mark">1 回合</span>，下回合将到期。' + actionHint,
              copy: '【第' + round + '回合数据核对】[R17·武将到期警告] ' + w.name + '(' + statusLabel + '·' + loc + ')剩余 1 回合，下回合到期。' + (status === '被俘'
                ? '请在本回合行动建议中挂处置选项(斩首/释放/再劝降/囚禁续押+2)，或主动安排该武将归宿。'
                : '请在本回合安排该武将归宿(投靠/隐居/病故等)，不得让武将到期后无落点消失。'),
            });
          } else if (n === 2) {
            /* 剩 2 → warn：提醒 GM 提前规划 */
            var planHint = status === '被俘'
              ? '建议主持人提前考虑处置方案(招降/释放/斩首/囚禁续押)，下回合将触发强制处置。'
              : '建议主持人提前规划归宿(来投事件/隐居/病故)，下回合将触发强制安排。';

            issues.push({
              id: 'R17-r' + round + '-' + w.name + '-2',
              ruleId: 'R17', ruleName: '武将即将到期', level: 'warn',
              body: '<b>' + escHtml(w.name) + '</b>(' + escHtml(statusLabel) + '·' + escHtml(loc) + ')剩余 <span class="diag-mark">2 回合</span>。' + planHint,
              copy: '【第' + round + '回合数据核对】[R17·武将到期提醒] ' + w.name + '(' + statusLabel + '·' + loc + ')剩余 2 回合。' + (status === '被俘'
                ? '建议提前考虑处置方案(招降/释放/斩首/囚禁续押)，下回合剩 1 时将触发强制处置。'
                : '建议提前规划归宿(来投/隐居/病故等)，下回合剩 1 时将触发强制安排。'),
            });
          }
        });

        return issues;
      },
    },

  ];

  /* ═══════════════════════════════════════════
     扫描入口
  ═══════════════════════════════════════════ */
  let lastScanResult = { issues: [], round: null };

  function scan() {
    const state = window.SGState;
    if (!state || !Array.isArray(state.rounds) || !state.rounds.length) {
      lastScanResult = { issues: [], round: null };
      renderBadge();
      return;
    }
    const rounds = state.rounds;
    const latest = rounds[rounds.length - 1];
    const round = latest.round || 0;

    const all = [];
    RULES.forEach(rule => {
      if (rule.enabled === false) return;
      try {
        const out = rule.check(rounds, latest) || [];
        out.forEach(it => all.push(it));
      } catch (e) {
        console.warn('[SGDiag] rule failed:', rule.id, e);
      }
    });

    lastScanResult = { issues: all, round };
    renderBadge();
    if (document.getElementById('diag-drawer')?.classList.contains('visible')) {
      renderDrawer();
    }
  }

  /* ═══════════════════════════════════════════
     徽章渲染（A 变体：错误/警告胶囊；通过缩点）
  ═══════════════════════════════════════════ */
  function renderBadge() {
    const $badge = document.getElementById('diag-badge');
    if (!$badge) return;
    const ignored = loadIgnored();
    const issues = lastScanResult.issues.filter(it => !ignored.has(it.id));
    const errors = issues.filter(it => it.level === 'error');
    const warns  = issues.filter(it => it.level === 'warn');

    $badge.classList.remove('state-ok', 'state-warn', 'state-error', 'is-dot');
    const $text = $badge.querySelector('.diag-badge-text');
    const $icon = $badge.querySelector('.diag-badge-icon');

    if (errors.length > 0) {
      $badge.classList.add('state-error');
      $icon.textContent = '⚠';
      $text.textContent = `${errors.length + warns.length} 项异常`;
    } else if (warns.length > 0) {
      $badge.classList.add('state-warn');
      $icon.textContent = '⚠';
      $text.textContent = `${warns.length} 项待核对`;
    } else {
      /* 通过态缩成小圆点（A 变体）*/
      $badge.classList.add('state-ok', 'is-dot');
      $icon.textContent = '✓';
      $text.textContent = '数据自检通过';
    }
    updateCopyAllBtn();
  }

  /* ════════ #diag-copyall-warn-include-v1 ════════ */
  /* 同步「一键复制全部异常」按钮的启用状态、计数徽章、tooltip。
     升级:错误 + 警告 一并计入,徽章格式 "错误数+警告数"。
     每次 renderBadge / renderDrawer 调用后顺带调用一次。 */
  function updateCopyAllBtn() {
    const $btn = document.getElementById('diag-copyall');
    if (!$btn) return;
    const $cnt = document.getElementById('diag-copyall-count');

    /* [legacy v1] 仅复制错误,警告不参与
    const ignored = loadIgnored();
    const errors = lastScanResult.issues.filter(
      it => it.level === 'error' && !ignored.has(it.id)
    );
    const n = errors.length;
    if (n > 0) {
      $btn.disabled = false;
      $btn.setAttribute('title', `一键复制本回合 ${n} 条错误的核对话术`);
      if ($cnt) { $cnt.textContent = String(n); $cnt.hidden = false; }
    } else {
      $btn.disabled = true;
      $btn.setAttribute('title', '无异常项可复制');
      if ($cnt) { $cnt.textContent = ''; $cnt.hidden = true; }
    }
    */

    /* #diag-copyall-warn-include-v1: 错误 + 警告 一并参与 */
    const ignored = loadIgnored();
    const active  = lastScanResult.issues.filter(it => !ignored.has(it.id));
    const errors  = active.filter(it => it.level === 'error');
    const warns   = active.filter(it => it.level === 'warn');
    const eN = errors.length;
    const wN = warns.length;
    const total = eN + wN;

    if (total > 0) {
      $btn.disabled = false;
      $btn.setAttribute(
        'title',
        `一键复制本回合 ${eN} 条错误 + ${wN} 条警告的核对话术`
      );
      if ($cnt) {
        /* 计数徽章格式:错误数+警告数(任一为 0 时退化为单数字) */
        if (eN > 0 && wN > 0) $cnt.textContent = `${eN}+${wN}`;
        else                  $cnt.textContent = String(total);
        $cnt.hidden = false;
      }
    } else {
      $btn.disabled = true;
      $btn.setAttribute('title', '无异常项可复制');
      if ($cnt) {
        $cnt.textContent = '';
        $cnt.hidden = true;
      }
    }
  }
  /* ════════ END #diag-copyall-warn-include-v1 ════════ */

  /* ═══════════════════════════════════════════
     抽屉渲染
  ═══════════════════════════════════════════ */
  function renderDrawer() {
    const $body = document.getElementById('diag-drawer-body');
    const $summary = document.getElementById('diag-summary');
    if (!$body || !$summary) return;

    const ignored = loadIgnored();
    const all = lastScanResult.issues;
    const round = lastScanResult.round;
    const active = all.filter(it => !ignored.has(it.id));
    const errors = active.filter(it => it.level === 'error');
    const warns  = active.filter(it => it.level === 'warn');
    const ignoredItems = all.filter(it => ignored.has(it.id));

    /* 摘要 */
    let summaryHtml = '';
    if (errors.length) summaryHtml += `<span class="diag-summary-item has-error">错误 <b>${errors.length}</b></span>`;
    if (warns.length)  summaryHtml += `<span class="diag-summary-item has-warn">警告 <b>${warns.length}</b></span>`;
    if (!errors.length && !warns.length) summaryHtml += `<span class="diag-summary-item has-ok">全部通过 <b>✓</b></span>`;
    if (ignoredItems.length) summaryHtml += `<span class="diag-summary-item">已忽略 <b>${ignoredItems.length}</b></span>`;
    const roundLabel = round ? `第 ${round} 回合` : '尚未发布';
    summaryHtml += `<span class="diag-summary-meta">${roundLabel} · 共扫 ${RULES.filter(r=>r.enabled!==false).length} 条规则</span>`;
    $summary.innerHTML = summaryHtml;

    /* 主体 */
    if (!active.length) {
      const sub = ignoredItems.length
        ? `${ignoredItems.length} 项已忽略<br>剩余项目已无异常`
        : `本回合 ${RULES.filter(r=>r.enabled!==false).length} 项规则全部通过<br>无需向 AI 主持人核对`;
      $body.innerHTML = `
        <div class="diag-empty">
          <div class="diag-empty-icon">✓</div>
          <div class="diag-empty-title">${ignoredItems.length ? '已全部处理' : '数据自检通过'}</div>
          <div class="diag-empty-sub">${sub}</div>
        </div>`;
      /* 已忽略组仍展示 */
      if (ignoredItems.length) {
        $body.innerHTML += renderGroup('已忽略', ignoredItems, false);
      }
      return;
    }

    let html = '';
    if (errors.length) html += renderGroup('错误', errors, true, 'is-error');
    if (warns.length)  html += renderGroup('警告', warns, true, 'is-warn');
    if (ignoredItems.length) html += renderGroup('已忽略', ignoredItems, false);
    $body.innerHTML = html;
    updateCopyAllBtn();
  }

  function renderGroup(label, items, withActions, extraCls) {
    extraCls = extraCls || '';
    return `<div class="diag-group ${extraCls}">
      <h4 class="diag-group-title">
        <span>${escHtml(label)}</span>
        <span class="diag-group-cnt"><b>${items.length}</b> 项</span>
      </h4>
      <div class="diag-list">${items.map(buildItem).join('')}</div>
    </div>`;
  }

  function buildItem(it) {
    const ignored = loadIgnored();
    const isIgnored = ignored.has(it.id);
    const levelLabel = it.level === 'error' ? '错误' : '警告';
    return `
      <div class="diag-item level-${it.level} ${isIgnored ? 'is-ignored' : ''}" data-id="${escHtml(it.id)}">
        <div class="diag-item-head">
          <span class="diag-item-tag">${levelLabel}</span>
          <span class="diag-item-title">${escHtml(it.ruleName)}</span>
          <span class="diag-item-rule-id">${escHtml(it.ruleId)}</span>
        </div>
        <div class="diag-item-body">${it.body}</div>
        <div class="diag-item-actions">
          <button class="diag-action-btn btn-copy" data-act="copy" data-id="${escHtml(it.id)}">📋 复制给 GM</button>
          <button class="diag-action-btn btn-ignore" data-act="ignore" data-id="${escHtml(it.id)}">${isIgnored ? '取消忽略' : '忽略本条'}</button>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════
     抽屉开关 + 事件绑定
  ═══════════════════════════════════════════ */
  function openDrawer() {
    const $d = document.getElementById('diag-drawer');
    const $o = document.getElementById('diag-drawer-overlay');
    if (!$d || !$o) return;
    renderDrawer();
    $d.classList.add('visible');
    $o.classList.add('visible');
    $d.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    const $d = document.getElementById('diag-drawer');
    const $o = document.getElementById('diag-drawer-overlay');
    if (!$d || !$o) return;
    $d.classList.remove('visible');
    $o.classList.remove('visible');
    $d.setAttribute('aria-hidden', 'true');
  }

  function bindEvents() {
    const $badge = document.getElementById('diag-badge');
    const $overlay = document.getElementById('diag-drawer-overlay');
    const $body = document.getElementById('diag-drawer-body');
    const $close = document.getElementById('diag-close');
    const $rescan = document.getElementById('diag-rescan');

    if ($badge) $badge.addEventListener('click', openDrawer);
    if ($overlay) $overlay.addEventListener('click', closeDrawer);
    if ($close) $close.addEventListener('click', closeDrawer);
    if ($rescan) $rescan.addEventListener('click', () => {
      scan();
      showToast('已重新检测');
    });

    /* ════════ #diag-copyall-warn-include-v1 ════════ */
    /* 升级:错误 + 警告 一并复制,分两段排列(错误在前,警告在后)。
       徽章标题包含错误数与警告数,toast 同步显示明细。 */
    const $copyAll = document.getElementById('diag-copyall');
    if ($copyAll) $copyAll.addEventListener('click', () => {
      if ($copyAll.disabled) return;

      /* [legacy v1] 仅复制错误
      const ignored = loadIgnored();
      const errors = lastScanResult.issues.filter(
        it => it.level === 'error' && !ignored.has(it.id)
      );
      if (!errors.length) return;
      const round = lastScanResult.round;
      const head = `【第${round || '未发布'}回合数据核对·共${errors.length}项】`;
      const body = errors.map(e => e.copy).join('\n\n');
      const fullText = head + '\n\n' + body;
      const onOk = () => showToast(`已复制 ${errors.length} 条错误`);
      */

      /* #diag-copyall-warn-include-v1: 错误 + 警告 一并复制 */
      const ignored = loadIgnored();
      const active  = lastScanResult.issues.filter(it => !ignored.has(it.id));
      const errors  = active.filter(it => it.level === 'error');
      const warns   = active.filter(it => it.level === 'warn');
      const eN = errors.length;
      const wN = warns.length;
      const total = eN + wN;
      if (!total) return;

      const round = lastScanResult.round;
      const roundLabel = round || '未发布';

      /* 标题:含错误数与警告数明细 */
      let head;
      if (eN > 0 && wN > 0) {
        head = `【第${roundLabel}回合数据核对·共${total}项(错误${eN}·警告${wN})】`;
      } else if (eN > 0) {
        head = `【第${roundLabel}回合数据核对·共${eN}项(全部错误)】`;
      } else {
        head = `【第${roundLabel}回合数据核对·共${wN}项(全部警告)】`;
      }

      /* 正文:错误段在前,警告段在后,各加一行分隔标题 */
      const parts = [];
      if (eN > 0) {
        parts.push('━━ 错误(必须修正) ━━');
        parts.push(errors.map(e => e.copy).join('\n\n'));
      }
      if (wN > 0) {
        parts.push('━━ 警告(请核对) ━━');
        parts.push(warns.map(w => w.copy).join('\n\n'));
      }
      const fullText = head + '\n\n' + parts.join('\n\n');

      /* toast 文案 */
      let okMsg;
      if (eN > 0 && wN > 0) okMsg = `已复制 ${eN} 错误 + ${wN} 警告`;
      else if (eN > 0)       okMsg = `已复制 ${eN} 条错误`;
      else                   okMsg = `已复制 ${wN} 条警告`;

      const onOk = () => showToast(okMsg);
      const onFail = () => showToast('复制失败,请手动复制');

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullText).then(onOk).catch(() => {
          fallbackCopyAll(fullText, onOk, onFail);
        });
      } else {
        fallbackCopyAll(fullText, onOk, onFail);
      }
    });

    function fallbackCopyAll(text, onOk, onFail) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); onOk(); }
      catch (e) { onFail(); }
      document.body.removeChild(ta);
    }
    /* ════════ END #diag-copyall-warn-include-v1 ════════ */

    if ($body) $body.addEventListener('click', e => {
      const btn = e.target.closest('.diag-action-btn');
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (act === 'copy') {
        const issue = lastScanResult.issues.find(x => x.id === id);
        if (!issue) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(issue.copy)
            .then(() => showToast('已复制到剪贴板'))
            .catch(() => showToast('复制失败，请手动复制'));
        } else {
          /* 降级：用 textarea + execCommand */
          const ta = document.createElement('textarea');
          ta.value = issue.copy;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); showToast('已复制到剪贴板'); }
          catch (e) { showToast('复制失败，请手动复制'); }
          document.body.removeChild(ta);
        }
      } else if (act === 'ignore') {
        const set = loadIgnored();
        if (set.has(id)) set.delete(id);
        else set.add(id);
        saveIgnored(set);
        renderBadge();
        renderDrawer();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  /* ═══════════════════════════════════════════
     启动
  ═══════════════════════════════════════════ */
  function init() {
    bindEvents();
    /* 首次扫描 */
    setTimeout(scan, 300);
    /* 监听回合更新 */
    window.addEventListener('sg-rounds-updated', () => setTimeout(scan, 50));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* 对外 API */
  window.SGDiag = {
    scan, open: openDrawer, close: closeDrawer,
    clearIgnored: () => { saveIgnored(new Set()); renderBadge(); renderDrawer(); },
    _rules: RULES,
  };
})();
