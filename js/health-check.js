/**
 * health-check.js - 三国志文字版 · 数据健康检测 v1
 *
 * 检测项:
 *  A1 武将唯一性:同一武将不得同时出现在多个落点
 *     合法重复:[战报] + [调度·攻城中/交战中] / 多将共率行 / 短期出使
 *  A2 武将失踪:上回合在册武将本回合一个落点都找不到
 *     豁免:多将共率副将 / 短期出使(≤2回合,由 GM 在剧情区交代)
 *  B4 城池归属冲突:同一城同时出现在 [NPC] 行和某玩家段
 *
 * 告警分级:
 *  red    武将分身 / 城池归属冲突 — 顶部红条强提示
 *  yellow 武将疑似失踪              — 玩家卡角标 + console.warn
 *
 * 对外 API:
 *   window.SGHealthCheck.run(rounds, opts)
 *     opts.fullAudit  true=跑全量(每回合都检测) false=只检测最新回合(默认)
 *     返回 { red: [...], yellow: [...] }
 *
 *   window.SGHealthCheck.renderAlerts(report)
 *     把 run() 返回的 report 渲染到顶部红条 + 玩家卡角标
 */
(function () {
  'use strict';

  const VALID_SLOTS = ['甲', '乙', '丙'];

  function run(rounds, opts) {
    opts = opts || {};
    const fullAudit = !!opts.fullAudit;
    const report = { red: [], yellow: [] };
    if (!rounds || !rounds.length) return report;

    const targetRounds = fullAudit ? rounds : [rounds[rounds.length - 1]];

    targetRounds.forEach(function (rd) {
      const roundNum = rd.round;
      const p = rd.parsed || {};

      // A1 武将唯一性
      _checkGeneralUniqueness(roundNum, p, report);

      // B4 城池归属冲突
      _checkCityOwnershipConflict(roundNum, p, report);
    });

    // A2 武将失踪 — 需要相邻两回合对比,只在 fullAudit 时对所有相邻对跑
    // 默认模式下只对比 倒数第二回合 → 最新回合
    if (rounds.length >= 2) {
      const pairs = fullAudit
        ? rounds.slice(0, -1).map(function (r, i) { return [r, rounds[i + 1]]; })
        : [[rounds[rounds.length - 2], rounds[rounds.length - 1]]];
      pairs.forEach(function (pair) {
        _checkGeneralMissing(pair[0], pair[1], report);
      });
    }

    return report;
  }

  // ─────────────────────────────────────
  //  A1 武将唯一性检测
  // ─────────────────────────────────────
  function _checkGeneralUniqueness(roundNum, p, report) {
    // 收集每个武将的所有落点
    // locationMap: { 武将名: [ {type, detail}, ... ] }
    const locationMap = {};

    const addLoc = function (name, type, detail) {
      if (!name) return;
      if (!locationMap[name]) locationMap[name] = [];
      locationMap[name].push({ type: type, detail: detail });
    };

    // 1) 玩家段 守将括号
    (p.players || []).forEach(function (pp) {
      const slot = pp.slot || '';
      (pp.cities_list || []).forEach(function (c) {
        (c.holders || []).forEach(function (h) {
          if (h) addLoc(h, 'city', slot + '·' + c.name);
        });
      });
    });

    // 2) [NPC] 行守将括号
    (p.npcCities || []).forEach(function (c) {
      (c.holders || []).forEach(function (h) {
        if (h) addLoc(h, 'city', 'NPC·' + c.name);
      });
    });

    // 3) [调度] 段
    (p.transit || []).forEach(function (t) {
      const general = t.general || '';
      if (!general) return;
      // 多将共率:用 / 分隔
      general.split('/').forEach(function (g) {
        const name = g.trim();
        if (name) addLoc(name, 'transit', (t.from || '') + '→' + (t.to || '') + '·' + (t.status || ''));
      });
    });

    // 4) [世界] 段
    (p.world || []).forEach(function (w) {
      if (w.name) addLoc(w.name, 'world', w.status + '·' + w.location);
    });

    // 检查重复 — 合法重复白名单
    Object.keys(locationMap).forEach(function (name) {
      const locs = locationMap[name];
      if (locs.length <= 1) return;

      // 合法重复模式1:city + transit(攻城中/交战中) — 武将在守城同时部队在调度态
      // 这种情况实际上 transit 的 general 不应该等于守将,但 AI 偶尔会这么写
      // 保守:transit 状态为 攻城中/交战中 + 另一处是 city,视为合法持续态
      const cityLocs = locs.filter(function (l) { return l.type === 'city'; });
      const transitActiveLocs = locs.filter(function (l) {
        return l.type === 'transit' && /攻城中|交战中/.test(l.detail);
      });
      const transitOtherLocs = locs.filter(function (l) {
        return l.type === 'transit' && !/攻城中|交战中/.test(l.detail);
      });
      const worldLocs = locs.filter(function (l) { return l.type === 'world'; });

      // 合法:仅 1 个 city + 1 个 transit(攻城中/交战中)
      if (cityLocs.length === 1 && transitActiveLocs.length === 1 &&
          transitOtherLocs.length === 0 && worldLocs.length === 0) {
        return;
      }

      // 其他所有重复 = 违规
      report.red.push({
        round: roundNum,
        type: 'general_duplicate',
        name: name,
        locations: locs.map(function (l) { return l.detail; }),
        msg: '武将「' + name + '」第 ' + roundNum + ' 回合在 ' +
             locs.length + ' 处同时出现:' + locs.map(function (l) { return l.detail; }).join(' / '),
      });
    });
  }

  // ─────────────────────────────────────
  //  B4 城池归属冲突检测
  // ─────────────────────────────────────
  function _checkCityOwnershipConflict(roundNum, p, report) {
    // 收集每座城的所有出现处
    // cityMap: { 城名: [ {type, detail}, ... ] }
    const cityMap = {};

    const addCity = function (name, type, detail) {
      if (!name) return;
      if (!cityMap[name]) cityMap[name] = [];
      cityMap[name].push({ type: type, detail: detail });
    };

    (p.players || []).forEach(function (pp) {
      (pp.cities_list || []).forEach(function (c) {
        addCity(c.name, 'player', pp.slot || '?');
      });
    });

    (p.npcCities || []).forEach(function (c) {
      addCity(c.name, 'npc', c.faction || '散城');
    });

    Object.keys(cityMap).forEach(function (name) {
      const occurrences = cityMap[name];
      if (occurrences.length <= 1) return;

      // 多个出现 = 冲突(同名城不应跨阵营出现)
      report.red.push({
        round: roundNum,
        type: 'city_conflict',
        name: name,
        occurrences: occurrences.map(function (o) { return o.type + ':' + o.detail; }),
        msg: '城池「' + name + '」第 ' + roundNum + ' 回合归属冲突:' +
             occurrences.map(function (o) { return o.type + '·' + o.detail; }).join(' / '),
      });
    });
  }

  // ─────────────────────────────────────
  //  A2 武将失踪检测
  // ─────────────────────────────────────
  function _checkGeneralMissing(prevRd, currRd, report) {
    const prevP = prevRd.parsed || {};
    const currP = currRd.parsed || {};
    const currRound = currRd.round;

    // 收集上回合所有在册武将(玩家+NPC,不含[世界]段在野/被俘)
    const prevGenerals = new Set();
    (prevP.players || []).forEach(function (pp) {
      (pp.cities_list || []).forEach(function (c) {
        (c.holders || []).forEach(function (h) { if (h) prevGenerals.add(h); });
      });
    });
    (prevP.npcCities || []).forEach(function (c) {
      (c.holders || []).forEach(function (h) { if (h) prevGenerals.add(h); });
    });
    (prevP.transit || []).forEach(function (t) {
      (t.general || '').split('/').forEach(function (g) {
        const n = g.trim();
        if (n) prevGenerals.add(n);
      });
    });

    // 收集本回合所有落点(含[世界]段,因为武将可能从城移到[世界]段)
    const currLocations = new Set();
    (currP.players || []).forEach(function (pp) {
      (currP.cities_list || []).forEach(function (c) {
        (c.holders || []).forEach(function (h) { if (h) currLocations.add(h); });
      });
    });
    (currP.npcCities || []).forEach(function (c) {
      (c.holders || []).forEach(function (h) { if (h) currLocations.add(h); });
    });
    (currP.transit || []).forEach(function (t) {
      (t.general || '').split('/').forEach(function (g) {
        const n = g.trim();
        if (n) currLocations.add(n);
      });
    });
    (currP.world || []).forEach(function (w) {
      if (w.name) currLocations.add(w.name);
    });

    // 差集:上回合在册 - 本回合任意落点 = 失踪
    prevGenerals.forEach(function (name) {
      if (!currLocations.has(name)) {
        // 不知道这位武将属于哪个玩家段,扫一遍 prev 找
        let belongSlot = null;
        (prevP.players || []).some(function (pp) {
          const found = (pp.cities_list || []).some(function (c) {
            return (c.holders || []).indexOf(name) !== -1;
          });
          if (found) { belongSlot = pp.slot || ''; return true; }
          return false;
        });
        report.yellow.push({
          round: currRound,
          type: 'general_missing',
          name: name,
          belongSlot: belongSlot,
          msg: '武将「' + name + '」第 ' + currRound + ' 回合疑似失踪(上回合在册,本回合无落点)',
        });
      }
    });
  }

  // ─────────────────────────────────────
  //  渲染告警
  // ─────────────────────────────────────
  function renderAlerts(report) {
    _renderRedBar(report.red);
    _renderYellowBadges(report.yellow);

    // F12 控制台输出黄色告警(便于 GM 排查)
    (report.yellow || []).forEach(function (y) {
      console.warn('[SGHealthCheck]', y.msg);
    });
  }

  function _renderRedBar(redList) {
    let bar = document.getElementById('sg-health-alert');
    if (!redList || !redList.length) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sg-health-alert';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;' +
        'background:rgba(160,30,30,.95);color:#fff;' +
        'padding:10px 18px;font-size:13px;font-family:"Noto Sans SC",sans-serif;' +
        'text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer;';
      bar.title = '点击关闭';
      bar.addEventListener('click', function () { bar.remove(); });
      document.body.appendChild(bar);
    }
    const summary = redList.slice(0, 3).map(function (r) {
      return r.type === 'general_duplicate'
        ? '武将分身·' + r.name
        : '城池冲突·' + r.name;
    }).join(' / ');
    const more = redList.length > 3 ? ' 等 ' + redList.length + ' 处' : '';
    bar.innerHTML = '⚠️ 数据健康检测告警 — ' + summary + more +
      ' (点击关闭 · 详情见 F12 控制台)';
    // F12 详细输出
    redList.forEach(function (r) { console.error('[SGHealthCheck]', r.msg); });
  }

  function _renderYellowBadges(yellowList) {
    // 仅 GM 模式渲染黄角标(玩家模式由 CSS 隐藏 .health-badge-yellow)
    // 先清空所有玩家卡的旧黄角标
    document.querySelectorAll('.health-badge-yellow').forEach(function (el) {
      el.remove();
    });
    if (!yellowList || !yellowList.length) return;

    // 按玩家槽聚合
    const bySlot = { '甲': [], '乙': [], '丙': [] };
    yellowList.forEach(function (y) {
      if (y.belongSlot && bySlot[y.belongSlot]) {
        bySlot[y.belongSlot].push(y);
      }
    });

    VALID_SLOTS.forEach(function (slotName, slotIdx) {
      const arr = bySlot[slotName];
      if (!arr.length) return;
      // 玩家卡容器:#pname-${slotIdx} 的祖先卡
      const nameEl = document.getElementById('pname-' + slotIdx);
      if (!nameEl) return;
      const card = nameEl.closest('.player-card') || nameEl.parentElement;
      if (!card) return;
      // card 需要 relative 定位以承载绝对定位的角标
      const cs = window.getComputedStyle(card);
      if (cs.position === 'static') card.style.position = 'relative';

      const badge = document.createElement('div');
      badge.className = 'health-badge-yellow';
      badge.textContent = '⚠ ' + arr.length;
      badge.title = arr.map(function (y) { return y.msg; }).join('\n');
      badge.addEventListener('click', function (ev) {
        ev.stopPropagation();
        alert(arr.map(function (y) { return y.msg; }).join('\n\n'));
      });
      card.appendChild(badge);
    });
  }

  window.SGHealthCheck = { run: run, renderAlerts: renderAlerts };
})();