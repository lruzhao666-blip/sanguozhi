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
        (latest.parsed.players || []).forEach(p => {
          const slot = p.slot || '?';
          (p.generals || []).forEach(g => push(g.name, `${slot}方武将列表`));
          (p.cities_list || []).forEach(c => {
            (c.holders || []).forEach(h => push(h, `${slot}方${c.name}守将`));
          });
        });
        (latest.parsed.npcCities || []).forEach(c => {
          (c.holders || []).forEach(h => push(h, `NPC ${c.name}守将`));
        });
        (latest.parsed.transit || []).forEach(t => {
          if (t.general) push(t.general, `[调度]段(${t.from}→${t.to})`);
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

        /* 上回合在册武将集合（含玩家武将、守将、调度、世界、NPC 守将）*/
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

        /* 本回合在册集合 */
        const currSet = new Set();
        collectFrom(latest.parsed);

        /* 失踪 = 上回合在 & 本回合不在 & 剧情区也没提到 */
        const rawDigest = latest.parsed.rawDigest || latest.rawContent || '';
        const issues = [];
        prevSet.forEach(name => {
          if (!name || currSet.has(name)) return;
          /* 宽松：剧情区提到也算"有交代" */
          if (rawDigest.includes(name)) return;
          issues.push({
            id: `R2-r${round}-${name}`,
            ruleId: 'R2', ruleName: '武将失踪', level: 'error',
            body: `<b>${escHtml(name)}</b>上回合在册，本回合从所有数据区消失，剧情区也未提及。可能是数据遗漏。`,
            copy: `【第${round}回合数据核对】[R2·武将失踪] ${name}上回合在册，本回合所有数据区无此人，剧情区也未提及。请确认其当前位置或补充落点。`,
          });
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

          /* 找本回合该 slot 的"总账块"（resources 非空 + breakdown 为空）*/
          const totalCh = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.resources && Object.keys(ch.resources).length > 0
                  && (!ch.breakdown || Object.keys(ch.breakdown).length === 0)
          );
          const delta = totalCh ? totalCh.resources : {};

          RES_FIELDS.forEach(f => {
            const before = pPrev[f.key];
            const after  = pCurr[f.key];
            if (before == null || after == null) return;
            const d = Number(delta[f.name] || 0);
            const expected = before + d;
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
          /* 总账块：resources 非空 + breakdown 空 */
          const total = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.resources && Object.keys(ch.resources).length > 0
                  && (!ch.breakdown || Object.keys(ch.breakdown).length === 0)
          );
          if (!detail || !total) return;

          ['金', '粮', '兵', '民心'].forEach(res => {
            const bd = detail.breakdown[res];
            const totalVal = Number(total.resources[res] || 0);
            if (!bd || typeof bd.total !== 'number') return;
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

    /* ─────── R9 维护栏偏离持城规模 ─────── */
    {
      id: 'R9', name: '维护栏偏离持城规模', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          const player = (latest.parsed.players || []).find(p => p.slot === slot);
          if (!player || !player.cities_list || player.cities_list.length === 0) return;

          /* 经验值估算 */
          let expGold = 0, expFood = 0;
          player.cities_list.forEach(c => {
            const tier = CITY_TIER[getCityLevel(c.name)] || CITY_TIER['郡城'];
            expGold += tier.gold;
            expFood += tier.food;
          });
          /* 持城膨胀附加 */
          const n = player.cities_list.length;
          if (n >= 6)  { expGold += -25 * (Math.min(n,10) - 5);  expFood += -60  * (Math.min(n,10) - 5); }
          if (n >= 11) { expGold += -50 * (Math.min(n,15) - 10); expFood += -120 * (Math.min(n,15) - 10); }
          if (n >= 16) { expGold += -100 * (n - 15);             expFood += -250 * (n - 15); }

          /* 实际维护：从详细块的 breakdown 取"维护"分项 */
          const detail = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.breakdown
          );
          if (!detail) return;
          const getWeihu = (res) => {
            const items = (detail.breakdown[res] && detail.breakdown[res].items) || [];
            const wh = items.find(it => /维护/.test(it.label || ''));
            return wh ? wh.val : null;
          };
          const actGold = getWeihu('金');
          const actFood = getWeihu('粮');
          if (actGold == null && actFood == null) return;

          /* 偏离 50% 以上报警，且持城 >= 3 才检查（避免开局误报）*/
          if (n < 3) return;
          const deviateGold = actGold != null && Math.abs(actGold - expGold) > Math.abs(expGold) * 0.5;
          const deviateFood = actFood != null && Math.abs(actFood - expFood) > Math.abs(expFood) * 0.5;
          if (!deviateGold && !deviateFood) return;

          const parts = [];
          if (deviateGold) parts.push(`金维护应约 <span class="diag-mark">${expGold}</span>，实际 <span class="diag-mark">${actGold}</span>`);
          if (deviateFood) parts.push(`粮维护应约 <span class="diag-mark">${expFood}</span>，实际 <span class="diag-mark">${actFood}</span>`);

          issues.push({
            id: `R9-r${round}-${slot}`,
            ruleId: 'R9', ruleName: '维护栏偏离持城规模', level: 'warn',
            body: `${slot}方持城 <span class="diag-mark">${n}</span>，按 M-32 经验值估算${parts.join('；')}。偏离超 50%，建议核对。`,
            copy: `【第${round}回合数据核对】[R9·维护偏离] ${slot}方持城${n}，按 M-32 经验值估算金维护应约${expGold}/粮约${expFood}，实际写${actGold == null ? '未列' : actGold}/${actFood == null ? '未列' : actFood}。偏离超 50%，请核对。`,
          });
        });
        return issues;
      },
    },

    /* ─────── R10 行动栏消耗与持城规模不匹配 ─────── */
    {
      id: 'R10', name: '行动栏消耗偏低', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const issues = [];

        ['甲', '乙', '丙'].forEach(slot => {
          const player = (latest.parsed.players || []).find(p => p.slot === slot);
          if (!player || !player.cities_list) return;
          const n = player.cities_list.length;
          if (n < 6) return; /* 持城 < 6 不检查（规则书 M-22 阶梯起点）*/

          const detail = (latest.parsed.changes || []).find(
            ch => ch.slot === slot && ch.breakdown
          );
          if (!detail) return;
          /* 行动消耗：从金粮 breakdown 中取"行动"分项绝对值 */
          const getXingdong = (res) => {
            const items = (detail.breakdown[res] && detail.breakdown[res].items) || [];
            const xd = items.find(it => /行动|招募|急征|攻城/.test(it.label || ''));
            return xd ? Math.abs(xd.val) : 0;
          };
          const xdGold = getXingdong('金');
          const xdFood = getXingdong('粮');
          const goldStock = player.gold || 0;
          const foodStock = player.food || 0;
          if (goldStock < 1000 && foodStock < 1000) return; /* 库存太少不检查 */

          const threshold = (goldStock + foodStock) >= 10000 ? 0.05 : 0.02;
          const total = xdGold + xdFood;
          const stock = goldStock + foodStock;
          if (total === 0) return; /* 完全无行动也不检查（可能是休整回合）*/
          if (total / stock >= threshold) return;

          issues.push({
            id: `R10-r${round}-${slot}`,
            ruleId: 'R10', ruleName: '行动栏消耗偏低', level: 'warn',
            body: `${slot}方持城 <span class="diag-mark">${n}</span>，库存金+粮约 <span class="diag-mark">${stock}</span>，本回合行动消耗仅 <span class="diag-mark">${total}</span>（${(total/stock*100).toFixed(1)}%）。按 M-22 持城膨胀表偏小，可能行动建议规模过低。`,
            copy: `【第${round}回合数据核对】[R10·行动偏小] ${slot}方持城${n}、库存金粮${stock}，本回合行动消耗${total}（占${(total/stock*100).toFixed(1)}%）。按 M-22 持城阶梯，6+ 城应按 5%起步。请核对建议是否过保守。`,
          });
        });
        return issues;
      },
    },

    /* ─────── R11 新登场武将未入数据区 ─────── */
    {
      id: 'R11', name: '新登场武将未入数据区', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed) return [];
        const round = latest.round || 0;
        const rawDigest = latest.parsed.rawDigest || latest.rawContent || '';
        if (!rawDigest) return [];

        /* 收集本回合"已落点"的所有武将名 */
        const settled = new Set();
        (latest.parsed.players || []).forEach(p => {
          (p.generals || []).forEach(g => settled.add(g.name));
          (p.cities_list || []).forEach(c => (c.holders || []).forEach(h => settled.add(h)));
        });
        (latest.parsed.npcCities || []).forEach(c => (c.holders || []).forEach(h => settled.add(h)));
        (latest.parsed.transit || []).forEach(t => { if (t.general) settled.add(t.general); });
        (latest.parsed.world || []).forEach(w => { if (w.name) settled.add(w.name); });

        /* 收集前几回合已出现过的武将（已投放池）*/
        const known = new Set();
        rounds.slice(0, -1).forEach(rd => {
          if (!rd.parsed) return;
          (rd.parsed.players || []).forEach(p => {
            (p.generals || []).forEach(g => known.add(g.name));
            (p.cities_list || []).forEach(c => (c.holders || []).forEach(h => known.add(h)));
          });
          (rd.parsed.npcCities || []).forEach(c => (c.holders || []).forEach(h => known.add(h)));
          (rd.parsed.transit || []).forEach(t => { if (t.general) known.add(t.general); });
          (rd.parsed.world || []).forEach(w => { if (w.name) known.add(w.name); });
        });

        /* 从剧情区扫描候选武将名（2-4 字汉字 + 紧邻"」/「/对白/动作动词"）
           简化策略：扫描所有 2-4 字汉字串，过滤出"看起来像武将名"的——
           条件：前后不含数字/单位，且至少在 rawDigest 中出现 >=2 次。
           注：这是粗糙启发式，可能误报，所以归 warn 档。*/
        const candidateMap = {};
        const re = /([\u4e00-\u9fa5]{2,4})/g;
        let m;
        while ((m = re.exec(rawDigest)) !== null) {
          const name = m[1];
          /* 过滤常见非人名词 */
          if (/[城关山河水军兵将相国王侯帝师法令道路队营寨阵]/.test(name)) continue;
          candidateMap[name] = (candidateMap[name] || 0) + 1;
        }
        const issues = [];
        Object.entries(candidateMap).forEach(([name, count]) => {
          if (count < 2) return;
          if (settled.has(name)) return;
          if (!known.has(name)) {
            /* 全新名字 + 剧情多次出现 + 未落数据区 → 候选警告 */
            /* 进一步过滤：长度 = 2 的太多误报，要求与已知武将姓氏匹配或长度 >= 3 */
            if (name.length === 2) return;
            issues.push({
              id: `R11-r${round}-${name}`,
              ruleId: 'R11', ruleName: '新登场武将未入数据区', level: 'warn',
              body: `剧情区出现新名字 <b>${escHtml(name)}</b>（${count} 次），但数据区无落点。若为新登场武将，需补入。`,
              copy: `【第${round}回合数据核对】[R11·新武将未落点] 剧情区出现"${name}"（${count}次）但数据区无落点。若为新登场武将，请补入对应阵营守将/调度/世界段。`,
            });
          }
        });
        return issues.slice(0, 5); /* 避免炸太多，限制 5 条 */
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
  }

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
