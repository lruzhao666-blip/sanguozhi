/**
 * main.js — 三国志文字版 v11 (v2.5)
 * 对接规范 v2.0：
 *  - 剧情区 / 数据区分离（36个=号分隔）
 *  - [甲][乙][丙] 含 cities_list（城名+守将）
 *  - [战报] 新格式：甲→宛城NPC | 胜 | 伤亡:攻40守180
 *  - cityOwnership 携带 holder 守将字段供地图渲染
 *  - 兼容旧格式
 */

(function () {
  'use strict';

  const SUPA_URL  = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/sanguo_rounds';
  const NOTES_URL = SUPA_URL.replace('sanguo_rounds', 'gm_notes');
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  const SUPA_HEADERS = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const POLL_MS  = 30000;
  const MAX_ROWS = 100;

  let state = {
    rounds:        [],
    players:       defaultPlayers(),
    pollTimer:     null,
    lastUpdatedAt: 0,
    publishing:    false,
  };

  function defaultPlayers() {
    return [
      { name:'城主甲', city:'', gold:null, food:null, troop:null, morale:null, cities:null, generals:[], cities_list:[], situation_note:'', suggestions:[] },
      { name:'城主乙', city:'', gold:null, food:null, troop:null, morale:null, cities:null, generals:[], cities_list:[], situation_note:'', suggestions:[] },
      { name:'城主丙', city:'', gold:null, food:null, troop:null, morale:null, cities:null, generals:[], cities_list:[], situation_note:'', suggestions:[] },
    ];
  }

  // ══════════════════════════════════════════
  //  初始化
  // ══════════════════════════════════════════
  function init() {
    bindNav();
    bindGMPanel();
    initParticles();
    initTipsCard();
    loadFromCloud();
  }

  // ══════════════════════════════════════════
  //  云端 API
  // ══════════════════════════════════════════
  // fetch 加超时包装，避免请求无响应时永久卡住
  function fetchWithTimeout(url, options = {}, ms = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  async function loadFromCloud() {
    updateSyncStatus('loading');
    try {
      await fetchAllRounds();
      await loadGmNotes();
      renderAll();
      startPolling();
      updateSyncStatus('online');
    } catch (e) {
      console.error('[SG] 加载失败:', e);
      updateSyncStatus('error');
    }
  }

  async function loadGmNotes() {
    try {
      const res = await fetchWithTimeout(`${NOTES_URL}?key=eq.freetext&select=value`, { headers: SUPA_HEADERS }, 5000);
      if (!res.ok) return;
      const rows = await res.json();
      if (rows.length && rows[0].value) {
        const ta = document.getElementById('gm-notes-ta');
        if (ta) ta.value = rows[0].value;
      }
    } catch (e) {
      console.error('Failed to load gm notes:', e);
    }
  }

  async function saveGmNotes() {
    const ta = document.getElementById('gm-notes-ta');
    if (!ta) return;
    const value = ta.value;
    try {
      // First try to check if it exists
      const checkRes = await fetchWithTimeout(`${NOTES_URL}?key=eq.freetext&select=id`, { headers: SUPA_HEADERS }, 5000);
      const rows = await checkRes.json();

      let res;
      if (rows.length > 0) {
        // Update
        res = await fetchWithTimeout(`${NOTES_URL}?key=eq.freetext`, {
          method: 'PATCH',
          headers: SUPA_HEADERS,
          body: JSON.stringify({ value, updated_at: new Date().toISOString() })
        }, 5000);
      } else {
        // Insert
        res = await fetchWithTimeout(`${NOTES_URL}`, {
          method: 'POST',
          headers: SUPA_HEADERS,
          body: JSON.stringify({ key: 'freetext', value, updated_at: new Date().toISOString() })
        }, 5000);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const feedback = document.getElementById('notes-save-feedback');
      if (feedback) {
        feedback.classList.remove('hidden');
        setTimeout(() => feedback.classList.add('hidden'), 1500);
      }
    } catch (e) {
      console.error('Failed to save gm notes:', e);
      showToast('❌ 保存笔记失败');
    }
  }

  async function fetchAllRounds() {
    const res  = await fetchWithTimeout(`${SUPA_URL}?select=*&order=round.asc&limit=${MAX_ROWS}`, { headers: SUPA_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    state.rounds = rows.map(rowToRound).filter(Boolean);
    state.rounds.sort((a, b) => a.round - b.round);
    rebuildPlayers();
    if (rows.length) {
      state.lastUpdatedAt = Math.max(...rows.map(r => new Date(r.updated_at || 0).getTime()));
    }
  }

  async function pollForUpdates() {
    try {
      const res  = await fetchWithTimeout(`${SUPA_URL}?select=updated_at&order=updated_at.desc&limit=1`, { headers: SUPA_HEADERS }, 6000);
      if (!res.ok) return;
      const rows = await res.json();
      const latest = rows.length ? new Date(rows[0].updated_at || 0).getTime() : 0;
      if (latest > state.lastUpdatedAt) {
        updateSyncStatus('updating');
        await fetchAllRounds();
        renderAll();
        showToast('🔄 战局已更新！');
        updateSyncStatus('online');
      }
    } catch (e) { /* 静默失败 */ }
  }

  async function publishRound(rd) {
    const payload = {
      round:               rd.round,
      round_title:         '',
      raw_content:         rd.rawContent,
      raw_digest:          rd.parsed.rawDigest      || '',
      digest:              rd.parsed.digest         || '',
      players_json:        JSON.stringify(rd.parsed.players       || []),
      battles_json:        JSON.stringify(rd.parsed.battles       || []),
      changes_json:        JSON.stringify(rd.parsed.changes        || []),
      livelihood_json:     JSON.stringify([]),
      city_ownership_json: JSON.stringify(rd.parsed.cityOwnership || {}),
    };
    const existId = await findRoundId(rd.round);
    if (existId) {
      // UPDATE
      const res = await fetchWithTimeout(`${SUPA_URL}?id=eq.${existId}`, {
        method: 'PATCH',
        headers: SUPA_HEADERS,
        body: JSON.stringify(payload),
      }, 12000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } else {
      // INSERT
      const res = await fetchWithTimeout(SUPA_URL, {
        method: 'POST',
        headers: SUPA_HEADERS,
        body: JSON.stringify(payload),
      }, 12000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
  }

  async function deleteRoundById(apiId) {
    const res = await fetchWithTimeout(`${SUPA_URL}?id=eq.${apiId}`, {
      method: 'DELETE',
      headers: SUPA_HEADERS,
    }, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async function findRoundId(roundNum) {
    try {
      const res  = await fetchWithTimeout(`${SUPA_URL}?select=id,round&round=eq.${roundNum}&limit=1`, { headers: SUPA_HEADERS }, 8000);
      const rows = await res.json();
      return rows.length ? rows[0].id : null;
    } catch (e) { return null; }
  }

  async function getAllApiIds() {
    try {
      const res  = await fetchWithTimeout(`${SUPA_URL}?select=id,round&limit=${MAX_ROWS}`, { headers: SUPA_HEADERS }, 8000);
      const rows = await res.json();
      return rows.map(r => ({ id: r.id, round: r.round }));
    } catch (e) { return []; }
  }

  function rowToRound(row) {
    try {
      return {
        round:      row.round,
        roundTitle: row.round_title || '',
        parsed: {
          round:         row.round,
          rawDigest:     row.raw_digest      || row.raw_content || '',
          digest:        row.digest          || '',
          players:       safeJson(row.players_json,          []),
          battles:       safeJson(row.battles_json,          []),
          changes:       safeJson(row.changes_json,          []),
          cityOwnership: safeJson(row.city_ownership_json,  {}),
          // 兼容旧数据
          livelihood:    safeJson(row.livelihood_json,       []),
          situation:     row.situation  || '',
          events:        safeJson(row.events_json, []),
          narration:     row.narration  || '',
        },
        rawContent: row.raw_content || '',
        _apiId:     row.id,
      };
    } catch (e) { return null; }
  }

  function safeJson(str, fallback) {
    try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(pollForUpdates, POLL_MS);
  }

  // ══════════════════════════════════════════
  //  导航
  // ══════════════════════════════════════════
  function bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );
  }

  function switchTab(name) {
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === `tab-${name}`));
  }

  // ══════════════════════════════════════════
  //  GM 面板
  // ══════════════════════════════════════════
  function bindGMPanel() {
    document.getElementById('btn-preview').addEventListener('click', onPreview);
    document.getElementById('btn-publish').addEventListener('click', onPublish);
    document.getElementById('btn-clear-all').addEventListener('click', onClearAll);
    document.getElementById('btn-undo').addEventListener('click', onUndo);
    bindExportTools();
  }

  function bindExportTools() {
    document.getElementById('btn-gen-savepack')?.addEventListener('click', generateSavePack);
    document.getElementById('btn-gen-format-hint')?.addEventListener('click', generateFormatHint);
    document.getElementById('btn-copy-export')?.addEventListener('click', copyExportText);
    document.getElementById('btn-save-notes')?.addEventListener('click', saveGmNotes);

    document.getElementById('btn-calc-dice')?.addEventListener('click', onCalcDice);
    document.getElementById('btn-copy-dice')?.addEventListener('click', onCopyDice);

    var latestRound = state.rounds.length
      ? state.rounds[state.rounds.length - 1].round
      : 0;
    if (latestRound > 0) {
      var diceRoundEl = document.getElementById('dice-round');
      if (diceRoundEl && diceRoundEl.value === '1') {
        diceRoundEl.value = latestRound + 1;
      }
    }
  }


  function onCalcDice() {
    var roundNum = parseInt(
      document.getElementById('dice-round').value, 10);
    var sString = document.getElementById('dice-s-string')
      .value.trim();
    var count = parseInt(
      document.getElementById('dice-count').value, 10);

    // 校验
    if (!roundNum || roundNum < 1) {
      showToast('⚠️ 请输入有效回合号'); return;
    }
    if (!sString || !/^[1-4]+$/.test(sString)) {
      showToast('⚠️ 行动串只能包含数字1-4'); return;
    }
    if (sString.length < 2) {
      showToast('⚠️ 行动串至少2位'); return;
    }
    if (!count || count < 1 || count > 60) {
      showToast('⚠️ 骰子数量1-60'); return;
    }

    var dice = window.DiceCalc.calculate(roundNum, sString, count);
    var groups = window.DiceCalc.formatGroups(dice);
    var injectText = window.DiceCalc.generateInjectText(
      roundNum, sString, dice, groups);

    // 渲染视觉卡片
    var gridEl = document.getElementById('dice-result-grid');
    gridEl.innerHTML = groups.map(function (g) {
      var dots = g.dice.map(function (d) {
        var cls = 'dice-dot';
        if (d === 6) cls += ' dice-dot--high';
        if (d === 1) cls += ' dice-dot--low';
        return '<span class="' + cls + '">' + d + '</span>';
      }).join('');
      return '<div class="dice-group-card">'
        + '<div class="dice-group-label">' + esc(g.label) + '</div>'
        + '<div class="dice-dots">' + dots + '</div>'
        + '<div class="dice-group-sum">= ' + g.sum + '</div>'
        + '<div class="dice-group-notation">'
        + esc(g.notation) + '</div>'
        + '</div>';
    }).join('');

    // 填充文本框
    document.getElementById('dice-result-text').value = injectText;

    // 显示结果区
    document.getElementById('dice-result-wrap')
      .classList.remove('hidden');
  }

  function onCopyDice() {
    var text = document.getElementById('dice-result-text').value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      showToast('📋 骰点已复制到剪贴板');
    }).catch(function () {
      // 降级
      var ta = document.getElementById('dice-result-text');
      ta.select();
      document.execCommand('copy');
      showToast('📋 骰点已复制');
    });
  }

  function generateSavePack() {
    if (!state.rounds || state.rounds.length === 0) {
      showToast('⚠️ 暂无回合数据可导出');
      return;
    }

    const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });
    const lastRoundIdx = state.rounds.length - 1;
    const lastRoundData = state.rounds[lastRoundIdx];
    const lastRoundNum = lastRoundData.round;

    // Check missing fields gracefully
    const season = lastRoundData.parsed.season || '请填';
    const gmNotesTa = document.getElementById('gm-notes-ta');
    const gmNotesText = (gmNotesTa && gmNotesTa.value.trim()) ? gmNotesTa.value.trim() : '(暂无,建议在GM笔记中记录长线剧情、野外角色、NPC性格等信息)';

    let period = '请手动填写';
    let boss = '请手动填写';
    if (window.gmNotesCache) {
      if (window.gmNotesCache.period) period = window.gmNotesCache.period;
      if (window.gmNotesCache.boss) boss = window.gmNotesCache.boss;
    }

    let text = `═══ 《三国志文字版》存档续接包 ═══\n`;
    text += `续接时间:${nowStr}\n`;
    text += `最后回合:第${lastRoundNum}回合\n\n`;

    text += `【本局基础信息】\n`;
    text += `时期:${period}\n`;
    text += `当前节气:${season}\n`;
    text += `强力势力:${boss}\n\n`;

    const slots = ['甲', '乙', '丙'];
    for (let i = 0; i < 3; i++) {
      const p = state.players[i];
      if (!p || !p.name) continue;

      text += `【${slots[i]}】${p.name}\n`;
      text += `金:${p.gold ?? 0} 粮:${p.food ?? 0} 兵:${p.troop ?? 0} 民心:${p.morale ?? 0} 城:${p.cities ?? 0}\n`;

      let citiesStr = '';
      if (p.cities_list && p.cities_list.length > 0) {
        citiesStr = p.cities_list.map(c => {
          let holders = (c.holders && c.holders.length > 0) ? c.holders.join('/') : (c.holder || '');
          let troopsArr = [];
          if (c.troops) {
            for (let t in c.troops) {
              if (c.troops[t] > 0) troopsArr.push(`${t}:${c.troops[t]}`);
            }
          }
          let troopsStr = troopsArr.join(',');
          return `${c.name}(${holders}|${troopsStr})`;
        }).join(',');
      } else {
        citiesStr = '(无数据)';
      }
      text += `城池:${citiesStr}\n`;

      let generalsStr = '';
      if (p.generals && p.generals.length > 0) {
        generalsStr = p.generals.map(g => {
          let st = (g.status === '健康' || !g.status) ? '' : g.status;
          return `${g.name}(${st})`;
        }).join(',');
      } else {
        generalsStr = '(无数据)';
      }
      text += `武将:${generalsStr}\n`;

      let dutiesStr = '';
      const lastChanges = lastRoundData.parsed.changes || [];
      const pChange = lastChanges.find(ch => ch.slot === i);
      let pDuties = [];
      if (pChange && pChange.productionOps && pChange.productionOps.length > 0) {
         pDuties = pChange.productionOps;
      } else if (lastRoundData.parsed.cityOwnership) {
         for (let cityName in lastRoundData.parsed.cityOwnership) {
            const cObj = lastRoundData.parsed.cityOwnership[cityName];
            if (cObj.owner === `player_${i}` && cObj.productionBuffs) {
               pDuties = pDuties.concat(cObj.productionBuffs);
            }
         }
      }
      if (pDuties.length > 0) {
        dutiesStr = pDuties.map(d => {
          const action = d.action || '';
          const remain = d.remain > 0 ? d.remain : 0;
          return `${d.city}:${d.emoji || ''} ${d.general} ${action}/${remain}`;
        }).join(' ');
      } else {
        dutiesStr = '(无数据)';
      }
      text += `任事:${dutiesStr}\n\n`;
    }

    text += `【NPC 城池现状】\n`;
    let npcCities = [];
    if (lastRoundData.parsed.cityOwnership) {
      for (let cityName in lastRoundData.parsed.cityOwnership) {
        const cObj = lastRoundData.parsed.cityOwnership[cityName];
        if (cObj.owner === 'npc') {
          npcCities.push(`${cityName}(${cObj.holder || ''})`);
        }
      }
    }
    if (npcCities.length > 0) {
      // Chunk by 5
      let lines = [];
      for(let i=0; i<npcCities.length; i+=5) {
        lines.push(npcCities.slice(i, i+5).join(','));
      }
      text += lines.join('\n') + '\n\n';
    } else {
      text += `(无数据)\n\n`;
    }

    text += `【近期重要事件】\n`;
    const startIdx = Math.max(0, state.rounds.length - 3);
    let digestsCount = 0;
    for (let i = startIdx; i < state.rounds.length; i++) {
      const rd = state.rounds[i];
      if (rd.parsed.digest) {
        text += `第${rd.round}回合:${rd.parsed.digest}\n`;
        digestsCount++;
      }
    }
    if (digestsCount === 0) text += `(无数据)\n`;
    text += `\n`;

    text += `【GM 笔记】\n${gmNotesText}\n\n`;
    text += `═══ 续接包结束 ═══`;

    const outputWrap = document.getElementById('export-output-wrap');
    const ta = document.getElementById('export-output');
    if (outputWrap && ta) {
      outputWrap.classList.remove('hidden');
      ta.value = text;
    }
  }

  function generateFormatHint() {
    const text = `═══ 本回合格式提醒(必须严格遵守) ═══

1. 整段输出包裹在一个代码块(\`\`\`)内,代码块外无任何文字
2. 剧情区与数据区用一行36个等号分隔: ====================================
3. 剧情区禁用: ** __ * _ # > --- 表格 全角括号()
4. 数据区字段严格按此顺序,每个独占一行:
   [回合] [节气] [速递] [甲] [乙] [丙] [NPC] [战报] [变动]
5. [甲/乙/丙] 内部格式:
   名号:{名号}
   金:{数字} 粮:{数字} 兵:{数字} 民心:{数字} 城:{数字}
   城池:{城名}({武将1}/{武将2}|{兵种}:{数量},{兵种}:{数量})
   武将:{武将名}(),{武将名}(疲劳)
6. 城池括号必须用半角(),武将用/分隔,兵种用|分隔
7. 兵种只用单字: 步/弓/骑/水/蛮
8. 武将状态只用: 健康(写空括号)/疲劳/受伤/患病/阵亡
9. [变动] 块写法:
   甲 金△{±X} 粮△{±X} 兵△{±X} 民心△{±X}
   甲 收支△
   金:产出+X,维护-X,合计±X
   粮:产出+X,维护-X,合计±X
10. 骰式必须写出每颗点数: 3d6(2,5,3) 不得写 3d6=10
11. 零值项一律省略,不写 +0 或 -0
12. 数据区禁 emoji,唯一例外: 产出△ 行的五枚白名单
    🌾屯田 💰开市 🤝招贤 ⚔️练兵 🔨工造

═══ 提醒结束 ═══`;

    const outputWrap = document.getElementById('export-output-wrap');
    const ta = document.getElementById('export-output');
    if (outputWrap && ta) {
      outputWrap.classList.remove('hidden');
      ta.value = text;
    }
  }

  function copyExportText() {
    const ta = document.getElementById('export-output');
    if (!ta) return;
    const text = ta.value;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(showFeedback);
    } else {
      ta.select();
      try {
        document.execCommand('copy');
        showFeedback();
      } catch (err) {
        showToast('❌ 复制失败');
      }
    }

    function showFeedback() {
      const fb = document.getElementById('copy-feedback');
      if (fb) {
        fb.classList.remove('hidden');
        setTimeout(() => fb.classList.add('hidden'), 1500);
      }
      showToast('📋 已复制到剪贴板');
    }
  }

  function onPreview() {
    const raw = document.getElementById('gm-content').value.trim();
    if (!raw) { showToast('⚠️ 请先粘贴内容'); return; }
    const parsed = SGParser.parse(raw);
    showParsePreview(parsed);
  }

  async function onPublish() {
    if (state.publishing) return;
    const raw = document.getElementById('gm-content').value.trim();
    if (!raw) { showToast('⚠️ 内容不能为空'); return; }

    // 回合号：优先使用解析到的剧情标题回合数，失败则自动递增
    const nextRound = state.rounds.length
      ? state.rounds[state.rounds.length - 1].round + 1
      : 1;

    const parsed = SGParser.parse(raw);
    const detectedRound = Number.isInteger(parsed.round) ? parsed.round : parseInt(parsed.round, 10);
    const roundNum = Number.isInteger(detectedRound) && detectedRound > 0 ? detectedRound : nextRound;
    parsed.round = roundNum;

    state.publishing = true;
    const btn = document.getElementById('btn-publish');
    btn.disabled = true; btn.textContent = '⏳ 发布中…';

    try {
      const rd = { round: roundNum, roundTitle: '', parsed, rawContent: raw };
      await publishRound(rd);
      await fetchAllRounds();
      renderAll();
      switchTab('arena');

      document.getElementById('gm-content').value = '';
      document.getElementById('parse-preview').classList.add('hidden');

      updateUndoBtn();
      showToast(`✅ 第 ${roundNum} 回合已发布！`);
    } catch (e) {
      console.error('[SG] 发布失败:', e);
      showToast('❌ 发布失败，请检查网络');
    } finally {
      state.publishing = false;
      btn.disabled = false; btn.textContent = '🚀 发布回合';
    }
  }

  async function onUndo() {
    if (!state.rounds.length) return;
    const last = state.rounds[state.rounds.length - 1];
    if (!confirm(`确认撤回第 ${last.round} 回合？`)) return;

    const btn = document.getElementById('btn-undo');
    btn.disabled = true; btn.textContent = '⏳ 撤回中…';
    try {
      const apiId = last._apiId || await findRoundId(last.round);
      if (apiId) await deleteRoundById(apiId);
      state.rounds.pop();
      rebuildPlayers();
      renderAll();
      updateUndoBtn();
      showToast(`↩️ 第 ${last.round} 回合已撤回`);
    } catch (e) {
      showToast('❌ 撤回失败，请重试');
    } finally {
      btn.disabled = false;
      updateUndoBtn();
    }
  }

  async function onClearAll() {
    if (!confirm('确认清空所有回合记录？云端数据将一并删除，不可撤销。')) return;
    showToast('⏳ 清空中…');
    try {
      const ids = await getAllApiIds();
      await Promise.all(ids.map(r => deleteRoundById(r.id)));

      // Clear gm_notes as well
      try {
        await fetchWithTimeout(`${NOTES_URL}?key=eq.freetext`, {
          method: 'DELETE',
          headers: SUPA_HEADERS
        });
      } catch (e) { console.error('Clear gm_notes fail', e); }
      const ta = document.getElementById('gm-notes-ta');
      if (ta) ta.value = '';

      state.rounds = []; state.players = defaultPlayers();
      state.lastUpdatedAt = 0;
      if (window.clearAllGeneralDuties) window.clearAllGeneralDuties();
      renderAll();
      updateUndoBtn();
      showToast('🗑️ 所有记录已清空');
    } catch (e) { showToast('❌ 清空失败，请重试'); }
  }

  function updateUndoBtn() {
    const btn = document.getElementById('btn-undo');
    if (!btn) return;
    btn.disabled = state.rounds.length === 0;
    btn.textContent = state.rounds.length
      ? `↩️ 撤回第 ${state.rounds[state.rounds.length - 1].round} 回合`
      : '↩️ 撤回上一步';
  }

  // ══════════════════════════════════════════
  //  玩家状态重建
  // ══════════════════════════════════════════
  function rebuildPlayers() {
    state.players = defaultPlayers();
    state.rounds.forEach(rd => mergePlayerState(rd.parsed));
  }

  function mergePlayerState(parsed) {
    // v2.0：players 数组按 slot 顺序排列（甲乙丙 → idx 0/1/2）
    // 兼容旧格式：livelihood 优先（旧数据路径）
    const legacySrc = (parsed.livelihood && parsed.livelihood.length)
      ? parsed.livelihood : null;

    (parsed.players || []).forEach((pp, i) => {
      if (i >= 3) return;
      const sp = state.players[i];

      // 名称
      if (pp.name) sp.name = pp.name;

      // 主城（取第一座城）
      const firstCity = (pp.cities_list && pp.cities_list.length)
        ? pp.cities_list[0].name
        : (pp.city || null);
      if (firstCity) sp.city = firstCity;

      // 资源：v2.0 字段名 food/grain 都接受，troop/soldiers 都接受
      const gold   = pp.gold   ?? null;
      const food   = pp.food   ?? pp.grain    ?? null;
      const troop  = pp.troop  ?? pp.soldiers ?? null;
      const morale = pp.morale ?? null;
      const cities = pp.cities ?? pp.city_count ?? null;

      if (gold   != null) sp.gold   = gold;
      if (food   != null) sp.food   = food;
      if (troop  != null) sp.troop  = troop;
      if (morale != null) sp.morale = morale;
      if (cities != null) sp.cities = cities;

      // 武将
      if (pp.generals && pp.generals.length) sp.generals = pp.generals;

      // cities_list（含守将，供地图使用）
      if (pp.cities_list && pp.cities_list.length) sp.cities_list = pp.cities_list;

      // ownedCities（兼容旧字段）
      if (pp.ownedCities && pp.ownedCities.length) sp.ownedCities = pp.ownedCities;

      if (pp.situation_note) sp.situation_note = pp.situation_note;
      if (pp.suggestions && pp.suggestions.length) sp.suggestions = pp.suggestions;
    });

    // 旧格式：livelihood 补丁（仅补资源，不覆盖武将/城池）
    if (legacySrc) {
      legacySrc.forEach((pp, i) => {
        if (i >= 3) return;
        const sp = state.players[i];
        if (pp.gold   != null) sp.gold   = pp.gold;
        if (pp.food   != null) sp.food   = pp.food;
        if (pp.troop  != null) sp.troop  = pp.troop;
        if (pp.morale != null) sp.morale = pp.morale;
        if (pp.cities != null) sp.cities = pp.cities;
      });
    }
  }

  // ══════════════════════════════════════════
  //  渲染总入口
  // ══════════════════════════════════════════
  function renderAll() {
    try {
      if (typeof renderVerifyBtn === "function") renderVerifyBtn();
    } catch (e) {
      console.warn('[SG] renderVerifyBtn skipped:', e);
    }
    const hasData = state.rounds.length > 0;
    const emptyEl = document.getElementById('arena-empty');
    const bodyEl  = document.getElementById('arena-body');
    if (emptyEl) emptyEl.style.display = hasData ? 'none' : '';
    if (bodyEl)  bodyEl.classList.toggle('hidden', !hasData);

    if (hasData) {
      const latest = state.rounds[state.rounds.length - 1];
      renderRoundBar(latest);
      renderDigest(latest);
      renderPlayerCards();
      renderBattlesBlock(latest.parsed.battles || []);
      renderMap();
      renderChangesDetail();
      renderHistorySection();
    }
    updateFooter();
    updateUndoBtn();
  }

  // ── 势力地图 ──
  function renderMap() {
    const latest       = state.rounds.length ? state.rounds[state.rounds.length - 1] : null;
    const latestParsed = latest ? latest.parsed : null;

    let cityMap;
    if (latestParsed && latestParsed.cityOwnership && Object.keys(latestParsed.cityOwnership).length > 0) {
      // v2.0/v2.5：解析器直接给出含 holder + troops 的完整 cityOwnership
      cityMap = {};
      Object.entries(latestParsed.cityOwnership).forEach(([k, ow]) => {
        cityMap[k] = Object.assign({}, ow);
      });
      // 同步最新玩家名（解析时 playerName 可能用 slot 代替真名）
      state.players.forEach((p, i) => {
        Object.values(cityMap).forEach(ow => {
          if (ow.playerIdx === i && p.name) ow.playerName = p.name;
        });
      });
    } else {
      // 旧格式降级
      const latestRaw = latest ? (latest.rawContent || latestParsed?.rawDigest || '') : '';
      cityMap = SGMap.parseCityOwnership(state.players, latestRaw);
    }

    SGMap.update(state.players, cityMap);
    _renderMapLegend(cityMap);
  }

  function _renderMapLegend(cityMap) {
    const el = document.getElementById('sgmap-legend');
    if (!el) return;
    const PC = SGMap.P_COLOR;
    // 用传入的 cityMap（含 DATA 块数据），没有则重新算
    const cm = cityMap || SGMap.parseCityOwnership(state.players, '');
    let html = state.players.map((p, i) => {
      const cnt = Object.values(cm).filter(o => o.playerIdx === i).length;
      return `<span class="sgmap-legend-item">
        <span class="sgmap-legend-dot"
          style="background:${PC[i].stroke};box-shadow:0 0 4px ${PC[i].glow}66"></span>
        <span style="color:${PC[i].glow};font-weight:700">${esc(p.name || '城主' + '甲乙丙'[i])}</span>
        <span style="color:var(--text-dim);font-size:.65rem"> ${cnt}城</span>
      </span>`;
    }).join('');
    const npcCnt = Object.values(cm).filter(o => o.owner === 'npc').length;
    html += `<span class="sgmap-legend-item">
      <span class="sgmap-legend-dot" style="background:#9a7c3e;box-shadow:0 0 4px #c09050"></span>
      <span style="color:#c09050;font-weight:700">NPC</span>
      <span style="color:var(--text-dim);font-size:.65rem"> ${npcCnt}城</span>
    </span>`;
    el.innerHTML = html;
  }

  function getRoundStats() {
    if (!state.rounds.length) return { latest: null, total: 0 };
    const nums = state.rounds
      .map(rd => (Number.isInteger(rd.round) ? rd.round : parseInt(rd.round, 10)))
      .filter(n => Number.isInteger(n) && n > 0);
    if (!nums.length) return { latest: null, total: state.rounds.length };
    const latest = nums[nums.length - 1];
    const total = Math.max(...nums);
    return { latest, total };
  }

  // ── 回合标题条 ──
  function renderRoundBar(rd) {
    const roundNum = Number.isInteger(rd.round) ? rd.round : parseInt(rd.round, 10);
    if (Number.isInteger(roundNum)) {
      setTxt('rb-num', roundNum);
    }
    const countEl = document.getElementById('rb-round-count');
    if (countEl) {
      const roundLabel = Number.isInteger(roundNum) ? `当前第 ${roundNum} 回合` : '当前回合';
      countEl.textContent = roundLabel;
    }
  }

  // ══════════════════════════════════════════
  //  战局动态：直接展示原文（rawDigest）
  //  对文本做基础格式化：段落换行、关键词高亮
  // ══════════════════════════════════════════

  function renderDigest(rd) {
    const p      = rd.parsed;
    const block  = document.getElementById('block-digest');
    const body   = document.getElementById('digest-body');
    if (!block || !body) return;

    // rawDigest 优先，兼容旧数据用 situation + events 拼合
    const rawText = p.rawDigest || buildLegacyDigest(p);
    if (!rawText || !rawText.trim()) {
      block.classList.add('hidden');
      return;
    }
    block.classList.remove('hidden');

    // 将原文渲染为带高亮的预格式段落
    body.innerHTML = `<div class="digest-raw">${highlightRaw(rawText)}</div>`;
  }

  /**
   * 将原始文本转为带高亮的 HTML（智能排版版）
   *  - 分隔线（═══ / ───）→ 视觉分割
   *  - 一级章节标题（🌍 天下大势 / ⚡ 风云突变 / 📢 主持人语 / 🔥 战斗结算 等）→ 醒目标题
   *  - 玩家行 👤【...】→ 玩家分组锚点
   *  - 列表项（•、-、①②③、1.）→ 列表样式
   *  - 注记行（📍 当前局势：…）→ 注记块
   *  - 普通行 → 段落
   *  - 连续普通文本会被合并到同一段落，便于长段阅读
   */
  /**
   * 预处理：把原文中的「🎯 行动建议」块整体提取，
   * 渲染成 HTML 后用占位符替换，返回 { text, placeholders }
   * 这样后续逐行循环完全不会碰到 ①②③ 行，彻底避免 NUMBULLET_RE 抢先匹配。
   */
  function _preRenderActionBlocks(text) {
    const placeholders = {};
    let pid = 0;

    // 匹配：🎯 行动建议 开头，一直到「空行之后不再是选项/名字/等待行」为止
    // 策略：逐行扫描，遇到 🎯 行动建议 就开始收集，直到遇到真正的终止条件
    const lines = text.split('\n');
    const out = [];
    let i = 0;

    const ICONS = ['①','②','③','④','⑤','⑥'];

    // 判断是否是选项行：① xxx
    const isOpt  = l => /^\s*[①②③④⑤⑥]\s*.+/.test(l);
    // 判断是否是单行格式：「名: ① xxx ② xxx」
    const isSingleLine = l => /^[^:：①②③④⑤⑥\s][^:：]{0,12}[：:]\s*.*[①②③④⑤⑥]/.test(l.trim());
    // 判断是否是纯玩家名行（短、无特殊符号，无冒号）
    const isPName = l => {
      const t = l.trim();
      return t.length >= 1 && t.length <= 10
        && !/[：:①②③④⑤⑥]/.test(t)
        && !/^[\s\u3000]/.test(t)
        && !/^[📍🔖💡⏳🎯🌍⚡📢🔥📜🎴🌐⚔️🏯🌅🌙•·▪▸▶◆◇■□=─═—]/.test(t);
    };
    // 判断是否是「名字+冒号」行（选项在后续行）：昭: / 高： / 源: 等
    // 条件：1-8字 + 冒号结尾，冒号后无 ① 选项内容
    const isPNameColon = l => {
      const t = l.trim();
      return /^[^:：①②③④⑤⑥\s][^:：①②③④⑤⑥]{0,7}[：:]\s*$/.test(t)
        && !/^[📍🔖💡⏳🎯🌍⚡📢🔥📜🎴🌐⚔️🏯🌅🌙•·▪▸▶◆◇■□=─═—]/.test(t);
    };
    // 判断是否是等待行
    const isWait = l => /^⏳/.test(l.trim());
    // GM 标注剥除
    const stripGM = l => l.trim().replace(/^[【\[][^】\]\n]{1,12}[】\]]\s*/, '').trim();

    // 判断是否是 A/B/C 分支行（兼容：A. / A、 / A： / A: / A 空格）
    const isBranchLine = l => /^\s*[A-Ca-c](?:[.．、]|[：:]|\s)\s*.+/.test(l);
    // 提取分支字母
    const branchLetter = l => l.trim().slice(0,1).toUpperCase();
    // 提取分支正文（去掉 "A. " / "A：" / "A " 前缀）
    const branchText   = l => l.trim().replace(/^[A-Ca-c](?:[.．、]|[：:]|\s)\s*/, '');

    // 渲染一组 actionLines + waitLine → HTML字符串
    // actionLines: [{ playerLabel, opts: [{ text, branches: [{label,text}] }] }]
    const renderBlock = (actionLines, waitLine) => {
      // ── 方案H：竖排名号 · 军帐分列风格 ──
      let ab = '<div class="raw-action-block">';
      // 标题行
      ab += '<div class="rab-header">';
      ab += '<span class="rab-header-icon">🎯</span>';
      ab += '<span class="rab-header-title">行动建议</span>';
      ab += '</div>';
      if (actionLines.length) {
        ab += '<div class="rab-players">';
        actionLines.forEach((al, pi) => {
          const slot = pi % 3;
          ab += `<div class="rab-player-row style-h" data-slot="${slot}">`;
          // 竖排名字列
          ab += '<div class="pname-h-vert">';
          ab += `<span class="pname-h-char">${esc(al.playerLabel)}</span>`;
          ab += '</div>';
          // 内容区
          ab += '<div class="pname-h-content">';
          ab += '<div class="rab-opts">';
          al.opts.forEach((opt, oi) => {
            // 破折号拆分：行动名 —— 注解
            const dashIdx = opt.text.search(/——|──|\s[-—]{2}\s/);
            let name = opt.text, desc = '';
            if (dashIdx > 0) {
              name = opt.text.slice(0, dashIdx).trim();
              desc = opt.text.slice(dashIdx).replace(/^[——──\s-—]+/, '').trim();
            }
            ab += '<div class="rab-opt">';
            ab += `<span class="rab-opt-num">${ICONS[oi] || ''}</span>`;
            ab += '<div class="rab-opt-body">';
            ab += `<span class="rab-opt-name">${esc(name)}</span>`;
            if (desc) {
              ab += '<span class="rab-opt-sep">—</span>';
              ab += `<span class="rab-opt-note">${esc(desc)}</span>`;
            }
            // A/B/C 分支
            if (opt.branches && opt.branches.length) {
              ab += '<div class="rab-branch-list">';
              opt.branches.forEach(br => {
                const lbl = br.label.toUpperCase();
                ab += '<div class="rab-branch">';
                ab += `<span class="rab-branch-label">${lbl}</span>`;
                ab += `<span class="rab-branch-text">${esc(br.text)}</span>`;
                ab += '</div>';
              });
              ab += '</div>'; // .rab-branch-list
            }
            ab += '</div>'; // .rab-opt-body
            ab += '</div>'; // .rab-opt
          });
          ab += '</div>'; // .rab-opts
          ab += '</div>'; // .rab-pname-h-content
          ab += '</div>'; // .rab-player-row
        });
        ab += '</div>'; // .rab-players
      }
      if (waitLine) ab += `<div class="rab-wait">${esc(waitLine)}</div>`;
      ab += '</div>'; // .raw-action-block
      return ab;
    };

    while (i < lines.length) {
      const raw = lines[i];
      const stripped = stripGM(raw);

      // 遇到 🎯 行动建议 → 开始收集整块
      if (/^🎯\s*行动建议/.test(stripped)) {
        const actionLines = [];
        let waitLine = '';
        let pendingPlayer = null;
        let pendingOpts   = [];

        const flushP = () => {
          if (pendingPlayer !== null && pendingOpts.length) {
            actionLines.push({ playerLabel: pendingPlayer, opts: pendingOpts });
          }
          // pendingOpts 现在是 [{text, branches}]，flushP 直接赋值即可
          pendingPlayer = null;
          pendingOpts   = [];
        };

        i++;
        // 允许跳过行动建议块内部的空行（玩家之间可能有空行）
        // 终止条件：连续2个空行，或遇到非行动相关行
        let emptyCount = 0;
        while (i < lines.length) {
          const r2  = lines[i];
          const s2  = stripGM(r2);

          // ⏳ 等待行：不管前面有多少空行都要捕获进来
          if (isWait(s2)) { flushP(); waitLine = s2; i++; break; }

          if (!s2) {
            emptyCount++;
            // 超过1个连续空行 → 块结束
            if (emptyCount > 1) { flushP(); break; }
            i++; continue;
          }
          emptyCount = 0;

          // 单行格式：「名: ① xxx ② xxx」（单行内不含 A/B/C 分支）
          if (isSingleLine(s2)) {
            flushP();
            const cm = s2.match(/^([^:：①②③④⑤⑥\s][^:：]{0,12})[：:]\s*(.+)$/);
            if (cm) {
              const pLabel = cm[1].trim();
              const rest   = cm[2].trim();
              const opts   = [];
              const re     = /[①②③④⑤⑥]\s*([^①②③④⑤⑥]+)/g;
              let m;
              while ((m = re.exec(rest)) !== null)
                opts.push({ text: m[1].trim().replace(/[,，]+$/, ''), branches: [] });
              actionLines.push({ playerLabel: pLabel, opts });
            }
            i++; continue;
          }

          // 纯选项行：① xxx（读完后继续读附属 A/B/C 分支行）
          if (isOpt(s2)) {
            const optTxt = s2.trim().replace(/^[①②③④⑤⑥]\s*/, '').replace(/[,，]+$/, '');
            const branches = [];
            i++;
            // 向前预读：连续吃掉所有 A./B./C. 行（允许中间有单个空行）
            while (i < lines.length) {
              const ahead = stripGM(lines[i]);
              if (!ahead) { i++; continue; }          // 空行跳过
              if (isBranchLine(ahead)) {
                branches.push({ label: branchLetter(ahead), text: branchText(ahead) });
                i++;
              } else {
                break;                               // 非分支行，停止预读
              }
            }
            pendingOpts.push({ text: optTxt, branches });
            continue;  // i 已在内层循环推进，外层不再 i++
          }

          // 玩家名+冒号行：「昭:」「高：」「源:」（选项在后续行）
          if (isPNameColon(s2)) {
            flushP();
            // 去掉尾部冒号，取纯名字
            pendingPlayer = s2.trim().replace(/[：:]\s*$/, '');
            i++; continue;
          }

          // 纯玩家名行（无冒号）
          if (isPName(s2)) {
            flushP();
            pendingPlayer = s2;
            i++; continue;
          }

          // A/B/C 分支行游离在选项之外（理论不应出现，安全跳过）
          if (isBranchLine(s2)) { i++; continue; }

          // 其他行 → 块结束
          flushP();
          break;
        }
        flushP();

        // 生成占位符
        const key = `%%ACTION_BLOCK_${pid++}%%`;
        placeholders[key] = renderBlock(actionLines, waitLine);
        out.push(key);
        continue;
      }

      out.push(raw);
      i++;
    }

    return { text: out.join('\n'), placeholders };
  }

  // ── 段落标题 emoji → 色条颜色映射 ──
  const SECTION_CARD_COLOR = {
    '🎴': { strip: 'rgba(212,168,67,.8)',  bg: 'rgba(50,32,0,.22)',   glow: 'rgba(212,168,67,.12)' },   // 旁白
    '📢': { strip: 'rgba(80,160,220,.8)',  bg: 'rgba(8,32,60,.20)',   glow: 'rgba(80,160,220,.10)' },   // 主持人语
    '🌍': { strip: 'rgba(80,180,100,.8)',  bg: 'rgba(5,35,12,.20)',   glow: 'rgba(80,180,100,.10)' },   // 天下大势
    '⚡': { strip: 'rgba(240,200,60,.85)', bg: 'rgba(50,38,0,.22)',   glow: 'rgba(240,200,60,.12)' },   // 风云突变
    '🔥': { strip: 'rgba(220,80,40,.85)',  bg: 'rgba(50,8,2,.22)',    glow: 'rgba(220,80,40,.12)' },    // 战斗/行动结果
    '👤': { strip: 'rgba(180,100,220,.8)', bg: 'rgba(30,8,45,.20)',   glow: 'rgba(180,100,220,.10)' },  // 城主行动结果
    '🎯': { strip: 'rgba(60,180,220,.8)',  bg: 'rgba(4,30,38,.20)',   glow: 'rgba(60,180,220,.10)' },   // 行动建议
    '⏳': { strip: 'rgba(150,150,150,.6)', bg: 'rgba(18,18,18,.18)',  glow: 'rgba(150,150,150,.08)' },  // 等待决断
    '📜': { strip: 'rgba(160,130,70,.8)',  bg: 'rgba(30,22,4,.20)',   glow: 'rgba(160,130,70,.10)' },   // 事件
    '🌐': { strip: 'rgba(70,140,200,.8)',  bg: 'rgba(5,22,40,.20)',   glow: 'rgba(70,140,200,.10)' },
    '⚔️': { strip: 'rgba(220,80,40,.85)',  bg: 'rgba(50,8,2,.22)',    glow: 'rgba(220,80,40,.12)' },
    '🏯': { strip: 'rgba(212,168,67,.75)', bg: 'rgba(38,25,0,.20)',   glow: 'rgba(212,168,67,.10)' },
    '🌅': { strip: 'rgba(220,140,60,.8)',  bg: 'rgba(45,20,2,.20)',   glow: 'rgba(220,140,60,.10)' },
    '🌙': { strip: 'rgba(100,100,200,.8)', bg: 'rgba(8,8,35,.20)',    glow: 'rgba(100,100,200,.10)' },
  };

  /**
   * 对一行文字做内联渲染：
   *  - 「」→ <em class="raw-quote">...</em>
   *  - ▸ 开头 → 不在此处理（外层已判断），仅作内联转义
   */
  function highlightInline(text) {
    if (!text) return '';
    // 先转义
    let s = esc(text);
    // 「」书名号内文字 → 斜体淡金
    s = s.replace(/「([^」]*)」/g, '<em class="raw-quote">「$1」</em>');
    return s;
  }

  function highlightRaw(rawText) {
    if (!rawText) return '';

    // ── 第一步：预处理，把所有「🎯 行动建议」块整体替换成占位符
    // 这样后续逐行循环完全不会碰到 ①②③ 行，彻底避免 NUMBULLET_RE 抢先匹配
    const { text, placeholders } = _preRenderActionBlocks(rawText);

    // 段落级 emoji 标题检测（匹配7组规定emoji开头，后跟汉字内容）
    // 注意：🎯 由 _preRenderActionBlocks 处理，这里不重复
    const SECTION_EMOJI_RE = /^(🎴|📢|🌍|⚡|🔥|👤|⏳|📜|🌐|⚔️|🏯|🌅|🌙)\s*/;
    const SECTION_RE   = /^(🌍|⚡|📢|🔥|📜|🎴|🌐|⚔️|🏯|🌅|🌙)\s*[【\[]?\s*[\u4e00-\u9fa5]{2,}/;
    const PLAYER_RE    = /^👤\s*[【\[]/;
    const RESULT_PLAYER_LINE_RE = /^\s*(?:[【\[][^】\]]+[】\]]|[^\s:：·\u30fb\u2022]{1,6}\s*[：:·\u30fb\u2022]).*/;
    const NOTE_RE      = /^[📍🔖💡]/;
    const BATTLE_RE    = /^🎲/;
    // ▸ 影响行：行首 ▸（含全角/半角变体）
    const EFFECT_RE    = /^▸\s*/;
    const BULLET_RE    = /^[•·▪▶◆◇■□]\s+/;
    const NUMBULLET_RE = /^(?:[①②③④⑤⑥⑦⑧⑨⑩]|[1-9]\.|[1-9]、)\s*/;
    // GM 内部标注过滤规则
    const GM_LABEL_PREFIX_RE = /^[【\[][^】\]\n]{1,12}[】\]]\s*/;

    const lines = text.split('\n').map(l => l.replace(/\s+$/, ''));
    const out = [];
    let paraBuf = [];
    // 当前所在段落卡片（非null时收集到卡片内）
    let currentCard = null;   // { emoji, lines:[] }

    const flushPara = () => {
      if (!paraBuf.length) return;
      if (currentCard) {
        currentCard.lines.push(`<p class="raw-para">${paraBuf.map(highlightInline).join('<br>')}</p>`);
      } else {
        out.push(`<p class="raw-para">${paraBuf.map(highlightInline).join('<br>')}</p>`);
      }
      paraBuf = [];
    };

    // ── 👤 各城主行动结果：子玩家分组 ──
    // 与 🎯 行动建议 完全相同的 action-item 排版
    const _groupPlayerResultLines = (cardLines) => {
      const SUB_PLAYER_RE = /^([^\s:：·\u30fb\u2022\d第]{1,6})\s*[·\u30fb\u2022]\s*(.*)$/;
      const SUB_PLAYER_BRACKET_RE = /^[【\[]([^】\]]{1,12})[】\]]\s*(.*)$/;
      const parseRawPlayer = (html) => {
        const text = html.replace(/<[^>]+>/g, '').trim();
        const bracket = text.match(/[【\[]([^】\]]+)[】\]]\s*(.*)$/);
        if (bracket) {
          return { name: bracket[1], title: bracket[2].trim() };
        }
        return { name: text.replace(/^👤\s*/, ''), title: '' };
      };
      const hasSubPlayer = cardLines.some(l => {
        if (l.startsWith('<div class="raw-player">')) return true;
        if (l.startsWith('<')) return false;
        const t = l.trim();
        return SUB_PLAYER_RE.test(t) || SUB_PLAYER_BRACKET_RE.test(t);
      });
      if (!hasSubPlayer) return cardLines;

      // 破折号拆分：标题 —— 注解（与 renderBlock 完全一致）
      const splitDash = text => {
        const idx = text.search(/\u2014\u2014|\u2500\u2500|\s[\-\u2014]{2}\s/);
        if (idx <= 0) return { name: text, desc: '' };
        return {
          name: text.slice(0, idx).trim(),
          desc: text.slice(idx).replace(/^[\u2014\u2500\s\-]+/, '').trim()
        };
      };

      // slot 分配（首次出现顺序）
      const slotMap = {};
      let slotIdx = 0;
      const getSlot = n => { if (!(n in slotMap)) slotMap[n] = slotIdx++; return slotMap[n]; };

      const result = [];
      // { name, slot, titleText, bodyLines[], extraHtml[] }
      let grp = null;
      let hasGroup = false;

      const pushDivider = () => {
        if (hasGroup) result.push('<div class="result-divider"></div>');
        hasGroup = true;
      };

      const flushGroup = () => {
        if (!grp) return;
        const sl = grp.slot % 3;
        let inner = `<div class="action-player-tag" data-slot="${sl}">${esc(grp.name)}</div>`;

        // ── 主行动条目：玩家名后的标题行（action-item，无序号） ──
        if (grp.titleText) {
          const { name, desc } = splitDash(grp.titleText);
          inner += '<div class="action-item">';
          inner += `<span class="name">${highlightInline(name)}</span>`;
          if (desc) {
            inner += `<span class="dash">\u2014\u2014</span>`;
            inner += `<span class="desc">${highlightInline(desc)}</span>`;
          }
          inner += '</div>';
        }

        // ── 新代码：正文行按段落渲染 ──
        {
          let _bodyParaBuf = [];
          const _flushBodyPara = () => {
            if (!_bodyParaBuf.length) return;
            inner += `<p class="raw-para">${_bodyParaBuf.map(highlightInline).join('<br>')}</p>`;
            _bodyParaBuf = [];
          };
          grp.bodyLines.forEach(bLine => {
            // 空行 → 断段
            if (!bLine.trim()) {
              _flushBodyPara();
              return;
            }
            // ▸ 影响行 → 独立渲染
            if (/^▸/.test(bLine)) {
              _flushBodyPara();
              inner += `<div class="raw-effect">${highlightInline(bLine)}</div>`;
              return;
            }
            // 普通行 → 累入段落缓冲
            _bodyParaBuf.push(bLine);
          });
          _flushBodyPara();
        }

        // ── 已渲染 HTML（▸ 影响、note 等）原样附后 ──
        inner += grp.extraHtml.join('');

        result.push(`<div class="result-player-group" data-slot="${sl}">${inner}</div>`);
        grp = null;
      };

      const startGroup = (name, title) => {
        flushGroup();
        pushDivider();
        grp = { name, slot: getSlot(name), titleText: title, bodyLines: [], extraHtml: [] };
      };

      cardLines.forEach(line => {
        if (line.startsWith('<div class="raw-player">')) {
          const parsed = parseRawPlayer(line);
          startGroup(parsed.name, parsed.title);
          return;
        }
        if (line.startsWith('<')) {
          if (grp) {
            grp.extraHtml.push(line);
          } else {
            result.push(line);
          }
          return;
        }
        const trimmed = line.trim();
        const m = trimmed.match(SUB_PLAYER_RE);
        const mb = trimmed.match(SUB_PLAYER_BRACKET_RE);
        if (m || mb) {
          const name = m ? m[1] : mb[1];
          const title = m ? m[2].trim() : mb[2].trim();
          startGroup(name, title);
        } else {
          if (grp) grp.bodyLines.push(trimmed);
          else result.push(`<p class="raw-para">${highlightInline(line)}</p>`);
        }
      });
      flushGroup();
      return result;
    };

    const flushCard = () => {
      if (!currentCard) return;
      // 对 👤 段落卡片执行子玩家分组后处理
      const finalLines = currentCard.emoji === '👤'
        ? _groupPlayerResultLines(currentCard.lines)
        : currentCard.lines;
      // 无盒版：去掉背景/边框，仅用间距分组
      const cardHtml =
        `<div class="raw-section-card">`
        + `<div class="raw-section-card-body">`
        + finalLines.join('')
        + `</div></div>`;
      out.push(cardHtml);
      currentCard = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i];

      // 空行 → 段落分隔（卡片内保留空行感，但不关闭卡片）
      if (!t.trim()) {
        flushPara();
        continue;
      }

      // 占位符 → 直接输出对应 HTML（🎯 行动建议块）
      if (t.trim() in placeholders) {
        flushPara();
        flushCard();
        out.push(placeholders[t.trim()]);
        continue;
      }

      // GM 内部标注处理
      let tLine = t;
      if (GM_LABEL_PREFIX_RE.test(tLine.trim())) {
        tLine = tLine.trim().replace(GM_LABEL_PREFIX_RE, '').trim();
        if (!tLine) continue;
      }

      // 分隔线（36个=）→ 折叠数据面板触发点
      if (/^={10,}/.test(tLine.trim())) {
        flushPara();
        flushCard();
        // 收集分隔线以后的所有内容进折叠面板
        const dataLines = [];
        i++;
        while (i < lines.length) {
          dataLines.push(lines[i]);
          i++;
        }
        i--; // 补偿外层 for 的 i++
        if (dataLines.length > 0) {
          const dataContent = dataLines.join('\n');
          const dataHtml = dataContent.split('\n').map(dl => {
            if (!dl.trim()) return '';
            return `<div class="raw-data-line">${esc(dl)}</div>`;
          }).join('');
          out.push(
            `<details class="raw-data-panel">`
            + `<summary class="raw-data-summary">📊 结构化数据区 <span class="raw-data-badge">${dataLines.filter(l=>l.trim()).length} 行</span></summary>`
            + `<div class="raw-data-body">${dataHtml}</div>`
            + `</details>`
          );
        } else {
          out.push('<div class="raw-divider"></div>');
        }
        continue;
      }

      // 其他分隔线
      if (/^[═─\-—]{4,}/.test(tLine)) {
        flushPara();
        flushCard();
        out.push('<div class="raw-divider"></div>');
        continue;
      }

      // ── 段落标题 emoji 检测（🎴📢🌍⚡🔥👤⏳📜🌐⚔️🏯🌅🌙）──
      // 匹配条件：行首为规定 emoji，后跟汉字/空格/【
      const sectionEmojiM = tLine.match(SECTION_EMOJI_RE);
      if (sectionEmojiM && /[\u4e00-\u9fa5【\[]/.test(tLine.slice(sectionEmojiM[0].length, sectionEmojiM[0].length + 3))) {
        flushPara();
        flushCard();
        const emoji = sectionEmojiM[1];
        currentCard = { emoji, lines: [] };
        // 标题行：data-emoji 属性驱动 CSS 色调，独立输出到卡片
        currentCard.lines.push(`<h4 class="raw-section-title" data-emoji="${emoji}">${highlightInline(tLine)}</h4>`);
        continue;
      }

      // 章节标题（无卡片 fallback）
      if (SECTION_RE.test(tLine) && !SECTION_EMOJI_RE.test(tLine)) {
        flushPara();
        flushCard();
        out.push(`<h4 class="raw-section">${highlightInline(tLine)}</h4>`);
        continue;
      }

      // ── 👤 卡片内：精确识别子玩家分组标题行 ──
      // 格式：{1-6字名号}·{行动名} 或 {1-6字名号}：{行动名}
      // 例如："昭·犒赏北平与冀州居间"、"高·广陵平乱与紧急通商"
      // 注意：不能匹配 "第一路·天水攻街亭" 这类子段落标题（排除 "第X路" 前缀）
      if (currentCard && currentCard.emoji === '👤') {
        const subTitleM = tLine.match(
          /^([^\s:：·\u30fb\u2022\d第]{1,6})\s*[·\u30fb\u2022]\s*(.+)$/
        );
        if (subTitleM) {
          flushPara();
          // 作为纯文本行推入 cardLines，由 _groupPlayerResultLines() 处理分组
          currentCard.lines.push(tLine);
          continue;
        }
      }

      // 玩家行（👤 或 👤 段落内的玩家标识）
      if (PLAYER_RE.test(tLine) || (currentCard && currentCard.emoji === '👤' && RESULT_PLAYER_LINE_RE.test(tLine) && tLine.trim().length <= 30)) {
        flushPara();
        if (currentCard) {
          currentCard.lines.push(`<div class="raw-player">${highlightInline(tLine)}</div>`);
        } else {
          out.push(`<div class="raw-player">${highlightInline(tLine)}</div>`);
        }
        continue;
      }

      // ── 🎲 战斗骰子行 → 等宽框，横向可滚动 ──
      if (BATTLE_RE.test(tLine)) {
        flushPara();
        const battleHtml = `<div class="raw-battle"><code class="raw-battle-code">${esc(tLine)}</code></div>`;
        if (currentCard) {
          currentCard.lines.push(battleHtml);
        } else {
          out.push(battleHtml);
        }
        continue;
      }

      // ⏳ 等待/启幕尾句 → story-outro 压暗样式
      if (/^⏳/.test(tLine)) {
        flushPara();
        flushCard();
        out.push(`<p class="story-outro">${highlightInline(tLine)}</p>`);
        continue;
      }

      // 注记行
      if (NOTE_RE.test(tLine)) {
        flushPara();
        const noteHtml = `<div class="raw-note">${highlightInline(tLine)}</div>`;
        if (currentCard) {
          currentCard.lines.push(noteHtml);
        } else {
          out.push(noteHtml);
        }
        continue;
      }

      // ── ▸ 影响行 → 降级样式（次要色 + 左缩进 + 略小字号）──
      if (EFFECT_RE.test(tLine)) {
        flushPara();
        const effectHtml = `<div class="raw-effect">${highlightInline(tLine)}</div>`;
        if (currentCard) {
          currentCard.lines.push(effectHtml);
        } else {
          out.push(effectHtml);
        }
        continue;
      }

      // ── ①②③④/A/B/C 编号项（仅在卡片外作为 bullet 处理；卡片内已由 _preRenderActionBlocks 处理）──
      if (NUMBULLET_RE.test(tLine)) {
        flushPara();
        // 提取编号和内容
        const numM = tLine.match(/^([①②③④⑤⑥⑦⑧⑨⑩]|[1-9]\.|[1-9]、)\s*/);
        const numStr = numM ? numM[1] : '';
        const rest = numStr ? tLine.slice(numM[0].length) : tLine;
        const bulletHtml = `<div class="raw-numbered-item">`
          + (numStr ? `<span class="raw-num-badge">${esc(numStr)}</span>` : '')
          + `<span class="raw-num-text">${highlightInline(rest)}</span>`
          + `</div>`;
        if (currentCard) {
          currentCard.lines.push(bulletHtml);
        } else {
          out.push(bulletHtml);
        }
        continue;
      }

      // 普通列表项
      if (BULLET_RE.test(tLine)) {
        flushPara();
        const bHtml = `<div class="raw-bullet">${highlightInline(tLine)}</div>`;
        if (currentCard) {
          currentCard.lines.push(bHtml);
        } else {
          out.push(bHtml);
        }
        continue;
      }

      // 普通行 → 累加进当前段落
      paraBuf.push(tLine);
    }
    flushPara();
    flushCard();

    return out.join('');
  }

  /** 兼容旧数据（没有 rawDigest）：拼合 situation + events + narration */
  function buildLegacyDigest(p) {
    const parts = [];
    if (p.situation) parts.push(p.situation);
    if (p.events && p.events.length) {
      parts.push('', '⚡ 风云突变');
      p.events.forEach(ev => {
        parts.push(`📜 ${ev.name}`);
        if (ev.effect) parts.push(`影响：${ev.effect}`);
      });
    }
    if (p.narration) parts.push('', '📢 主持人语', p.narration);
    return parts.join('\n');
  }

  // ══════════════════════════════════════════
  //  文本处理（已移除关键词高亮，仅保留转义）
  //  注意：章节标题（raw-section）的高亮样式由 CSS 控制，此处不影响
  // ══════════════════════════════════════════
  function highlight(text) {
    if (!text) return '';
    return esc(text);
  }

  // ══════════════════════════════════════════
  //  战斗结算
  // ══════════════════════════════════════════
  function renderBattlesBlock(battles) {
    const block = document.getElementById('block-battles');
    const list  = document.getElementById('battles-list');
    if (!block || !list) return;
    if (!battles || !battles.length) { block.classList.add('hidden'); return; }
    block.classList.remove('hidden');
    list.innerHTML = '<div class="battle-list">' +
      battles.map(b => buildBattleCard(b)).join('') +
      '</div>';
  }

  function buildBattleCard(b) {
    // 兼容 v2.0（attacker/defender/result/attacker_loss/defender_loss）
    // 和旧格式（player/dice/resultTxt/narrative/success）
    const isV2    = b.attacker !== undefined;
    const success = isV2 ? b.result === '胜' : (b.success ?? true);
    const isDraw  = isV2 && b.result === '平';
    const cls     = success ? 'success' : (isDraw ? 'draw' : 'fail');
    const resultLabel = isV2
      ? ({ '胜':'胜利', '平':'平局', '负':'失败' }[b.result] || b.result)
      : (success ? '成功' : '失败');
    const resultIcon = success ? '⚔️ 胜' : (isDraw ? '🔶 平' : '💀 败');

    if (isV2) {
      // ── v2.0 重构卡片 ──
      const atkLoss = b.attacker_loss ?? 0;
      const defLoss = b.defender_loss ?? 0;
      return `<div class="battle-card ${cls}">
        <div class="bc-sides">
          <div class="bc-side bc-atk">
            <span class="bc-role">攻方</span>
            <span class="bc-name">${esc(b.attacker)}</span>
            ${atkLoss > 0 ? `<span class="bc-loss loss-atk">-${atkLoss}</span>` : ''}
          </div>
          <div class="bc-center">
            <span class="bc-result-badge ${cls}">${resultIcon}</span>
          </div>
          <div class="bc-side bc-def">
            <span class="bc-role">守方</span>
            <span class="bc-name">${esc(b.defender)}</span>
            ${defLoss > 0 ? `<span class="bc-loss loss-def">-${defLoss}</span>` : ''}
          </div>
        </div>
      </div>`;
    } else {
      // ── 旧格式兼容 ──
      const icon = success ? '✅' : '❌';
      let html = `<div class="battle-card ${cls}">
        <div class="bc-legacy">
          ${b.player ? `<span class="bc-name">${esc(b.player)}</span>` : ''}
          <span class="bc-result-badge ${cls}">${icon} ${resultLabel}</span>
          ${b.dice ? `<span class="bc-dice">🎲 ${esc(b.dice)}</span>` : ''}
        </div>`;
      const desc = b.resultTxt || b.narrative || '';
      if (desc) html += `<div class="bc-desc">${esc(desc.slice(0, 100))}</div>`;
      html += `</div>`;
      return html;
    }
  }

  // ══════════════════════════════════════════
  //  玩家势力卡 + 行动选项
  // ══════════════════════════════════════════
  function renderPlayerCards() {
    const latestPlayers = state.rounds.length
      ? (state.rounds[state.rounds.length - 1].parsed.players || [])
      : [];

    state.players.forEach((p, i) => {
      setTxt(`pname-${i}`, p.name || `城主${['甲','乙','丙'][i]}`);

      const cityEl = document.getElementById(`pcity-${i}`);
      if (cityEl) {
        cityEl.textContent   = p.city || '';
        cityEl.style.display = p.city ? '' : 'none';
      }

      setTxt(`pgold-${i}`,   p.gold   != null ? p.gold   : '—');
      setTxt(`pfood-${i}`,   p.food   != null ? p.food   : '—');
      setTxt(`ptroop-${i}`,  p.troop  != null ? p.troop  : '—');
      setTxt(`pmorale-${i}`, p.morale != null ? p.morale : '—');
      setTxt(`pcities-${i}`, p.cities != null ? p.cities : '—');

      const bar = document.getElementById(`mbar-${i}`);
      if (bar) {
        const pct = Math.max(0, Math.min(100, p.morale ?? 60));
        bar.style.width   = `${pct}%`;
        bar.style.opacity = pct < 40 ? '.65' : pct > 80 ? '1' : '.85';
      }

      const badgeEl = document.getElementById(`pc-badges-${i}`);
      if (badgeEl) {
        const m = p.morale;
        let bhtml = '';
        if (m != null) {
          if (m <= 0)       bhtml = `<span class="status-badge sb-danger">⚠️ 叛乱风险</span>`;
          else if (m < 40)  bhtml = `<span class="status-badge sb-warn">❗ 民心低落</span>`;
          else if (m >= 80) bhtml = `<span class="status-badge sb-alive">✨ 万民拥戴</span>`;
        }
        badgeEl.innerHTML = bhtml;
      }

      renderGenList(i, p.generals);

      const noteEl = document.getElementById(`pc-note-${i}`);
      if (noteEl) {
        if (p.situation_note && p.situation_note.trim()) {
          noteEl.textContent = '📍 ' + p.situation_note;
          noteEl.classList.remove('hidden');
        } else {
          noteEl.classList.add('hidden');
        }
      }

    });
  }

  function renderGenList(idx, generals) {
    const listEl = document.getElementById(`gen-list-${idx}`);
    if (!listEl) return;
    if (!generals || !generals.length) {
      listEl.innerHTML = '<span class="gen-empty">——</span>';
      return;
    }
    listEl.innerHTML = generals.map(g => buildGenTag(g)).join('');
  }

  // ── 武将状态颜色（按钮颜色完全由状态决定，不区分稀有度）
  var GEN_STATUS_STYLES = {
    healthy:{ bg:'rgba(0,50,0,.30)',    bd:'rgba(0,160,70,.45)',   c:'#7ddd7d',  bc:'rgba(0,160,70,.22)'  },
    tired:  { bg:'rgba(70,50,0,.30)',   bd:'rgba(200,155,0,.45)',  c:'#d4b040',  bc:'rgba(200,155,0,.18)' },
    injured:{ bg:'rgba(70,0,0,.30)',    bd:'rgba(200,40,0,.45)',   c:'#e07070',  bc:'rgba(200,40,0,.18)'  },
    sick:   { bg:'rgba(42,0,60,.30)',   bd:'rgba(150,0,190,.45)',  c:'#cc80ee',  bc:'rgba(150,0,190,.18)' },
    dead:   { bg:'rgba(18,18,18,.42)',  bd:'rgba(60,60,60,.35)',   c:'#686868',  bc:'rgba(60,60,60,.15)'  }
  };

  function genStatusKey(s) {
    if (!s) return 'healthy';
    if (/疲劳|疲/.test(s))    return 'tired';
    if (/受伤|伤/.test(s))    return 'injured';
    if (/患病|病/.test(s))    return 'sick';
    if (/阵亡|亡|死/.test(s)) return 'dead';
    return 'healthy';
  }

  function buildGenTag(g) {
    var statusKey = genStatusKey(g.status);
    var sc        = GEN_STATUS_STYLES[statusKey] || GEN_STATUS_STYLES.healthy;
    var isDead    = statusKey === 'dead';

    // 状态文字映射（仅用于 title tooltip）
    var STATUS_LABEL = { healthy:'健康', tired:'疲劳', injured:'受伤', sick:'患病', dead:'阵亡' };
    var statusLabel  = STATUS_LABEL[statusKey] || (g.status || '健康');

    // ── 容器样式：颜色表示状态，只显示名字 ──
    var wrapStyle = 'display:inline-flex!important;align-items:center!important;'
      + 'border-radius:5px;padding:2px 9px;'
      + 'font-size:.74rem;font-family:inherit;transition:transform .15s;cursor:default;'
      + 'border:1px solid ' + sc.bd + '!important;'
      + 'background:' + sc.bg + '!important;'
      + (isDead ? 'text-decoration:line-through;opacity:.5;' : '');

    var nameStyle = 'font-weight:700;color:' + sc.c + '!important;letter-spacing:.02em;';

    // 结构：仅名字，状态通过颜色体现；title 已移除（使用自定义 tooltip）
    return '<span class="gen-tag" data-status="' + statusKey
      + '" data-name="' + esc(g.name) + '"'
      + ' style="' + wrapStyle + '">'
      + '<span style="' + nameStyle + '">' + esc(g.name) + '</span>'
      + '</span>';
  }



  // ══════════════════════════════════════════
  //  📊 本回合收支详情  v3.0
  //  数据驱动·三层卡片·通用锚点渲染
  // ══════════════════════════════════════════

  // 已知锚点图标映射（未知锚点自动用 ◆ 兜底）
  const ANCHOR_ICON = {
    '季度':'🗓️','府库':'🏛️','暗账':'🏛️','城':'🏯','驻军':'🛡️',
    '兵种':'⚔️','情报':'📜','NPC状态':'🎭','野外':'🌿',
    '收支':'💰','赏赐':'🎁','救灾':'🚑','贡赋':'📦',
    '状态':'🩺',
  };
  // 已知锚点的优先显示顺序
  const ANCHOR_ORDER = ['季度','府库','暗账','城','驻军','兵种','状态','情报'];

  // 武将状态值 → CSS class 映射
  const STATUS_DESC_CLS = (desc) => {
    if (!desc) return 'ag-status-normal';
    if (/受伤|重伤|伤/.test(desc))  return 'ag-status-injured';
    if (/疲劳|疲惫|劳/.test(desc))  return 'ag-status-tired';
    if (/病|染病|重病/.test(desc))   return 'ag-status-sick';
    if (/战死|阵亡|死/.test(desc))   return 'ag-status-dead';
    if (/正常|健康|恢复/.test(desc)) return 'ag-status-normal';
    return 'ag-status-other';
  };

  const sign   = v => v > 0 ? '+' : '';
  const valCls = v => v < 0 ? 'neg' : v > 0 ? 'pos' : 'zero';
  const RES_ICON  = { 金:'💰', 粮:'🌾', 兵:'🛡️', 民心:'❤️', 城:'🏯' };
  const RES_ORDER = ['金', '粮', '兵', '民心'];

  // ── Layer 1：总账条 ──
  function _renderResRow(res) {
    if (!res || !Object.keys(res).length) return '';
    const pills = RES_ORDER.filter(k => k in res).map(k => {
      const v = res[k];
      return `<span class="cd-res-pill">
        <span class="pill-icon">${RES_ICON[k]||''}</span>
        <span class="pill-name">${k}</span>
        <span class="pill-val ${valCls(v)}">${sign(v)}${v}</span>
      </span>`;
    }).join('');
    return pills ? `<div class="cd-res-row">${pills}</div>` : '';
  }

  // ── Layer 2：收支明细（可折叠） ──
  // 收支分项显示顺序（规则 v2.7.9 §收支明细）
  // 扩展预留：在此数组末尾追加新分项名即可自动排序，无需改动渲染逻辑
  const BD_ITEM_ORDER = [
    '产出',   // 常规收入：屯田/税收
    '维护',   // 常规支出：兵力/城池维护
    '季度',   // 每5回合季度结算（每城-40金-60粮）
    '明账',   // 公开账目变动
    '府库',   // 府库特殊操作（原"暗账"）
    '贸易',   // 贸易收入
    '事件',   // 事件奖惩
    '赤字',   // 资源赤字扣除
    '战损',   // 战斗兵力损失
    '急征',   // 紧急征粮/征兵
    '招募',   // 招募新兵
    '逃亡',   // 兵力/民心逃亡
    '攻城',   // 攻城相关消耗
  ];
  function _renderBreakdown(bd, troopChanges) {
    if (!bd) return '';
    const cats = RES_ORDER.filter(k => k in bd);
    // 兵种变动聚合
    const troopMap = {};
    for (const tc of (troopChanges || [])) troopMap[tc.cityName] = tc.entries || [];
    const hasTroops = Object.keys(troopMap).length > 0;
    const allCats = [...cats];
    if (hasTroops && !allCats.includes('兵')) allCats.push('兵');
    if (!allCats.length) return '';

    const rows = allCats.map(cat => {
      const d = bd[cat] || { items: [], total: null };
      if ((!d.items || !d.items.length) && (d.total === 0 || d.total === null)) {
        if (cat !== '兵' || !hasTroops) return '';
      }
      // 分项排序
      const sorted = [...(d.items || [])].sort((a, b) => {
        const ai = BD_ITEM_ORDER.indexOf(a.label), bi = BD_ITEM_ORDER.indexOf(b.label);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      const chips = sorted.map(it =>
        `<span class="bd-chip">
          <span class="bd-chip-lbl">${esc(it.label)}</span>
          <span class="bd-chip-val ${valCls(it.val)}">${sign(it.val)}${it.val}</span>
        </span>`).join('');
      // ★ 合计固定右端：用 flex 布局，chip 区自由换行，合计始终贴右
      const tv = d.total != null
        ? `<span class="bd-total ${valCls(d.total)}">${sign(d.total)}${d.total}</span>` : '';
      // 兵行：附兵种细项（注意：troop entry 用 e.type 不是 e.res，val 正确传入 valCls）
      let troopHtml = '';
      if (cat === '兵' && hasTroops) {
        troopHtml = '<div class="bd-troop-block">'
          + Object.entries(troopMap).map(([city, entries]) =>
              '<div class="bd-troop-row">'
              + '<span class="bd-troop-city">' + esc(city) + '</span>'
              + '<span class="bd-troop-chips">'
              + entries.map(e =>
                  '<span class="troop-chip ' + valCls(e.val) + '">'
                  + esc(e.type) + sign(e.val) + e.val
                  + '</span>'
                ).join('')
              + '</span>'
              + '</div>'
            ).join('')
          + '</div>';
      }
      // 新布局：资源名固定左，chips一行，兵种明细块独占次行，合计固定右
      return '<div class="cd-bd-row">'
        + '<span class="cd-bd-cat"><span class="cd-bd-cat-icon">' + (RES_ICON[cat]||'') + '</span><span class="cd-bd-cat-name">' + cat + '</span></span>'
        + '<span class="cd-bd-items">'
          + '<span class="cd-bd-chips-wrap">' + chips + '</span>'
          + troopHtml
        + '</span>'
        + '<span class="cd-bd-total-cell">' + tv + '</span>'
        + '</div>';
    }).filter(Boolean).join('');

    if (!rows) return '';
    return `<div class="cc-breakdown">
      <div class="cc-breakdown-label">收支明细</div>
      <div class="cd-bd-table">${rows}</div>
    </div>`;
  }

  // ── Layer 3：通用锚点组渲染（数据驱动，无白名单）──
  // 默认折叠，显示摘要行：「N 项变动 · 含X调度 · 府库-100金」
  function _renderAnchorGroups(groups) {
    if (!groups || !Object.keys(groups).length) return '';
    // 隐藏不需要独立区块显示的锚点：
    //   状态：武将状态由玩家卡片直接展示
    //   季度：季度结算已体现在收支明细的「季度」chip 中，独立区块是重复信息
    const hiddenAnchors = new Set(['状态', '季度']);
    const knownKeys   = ANCHOR_ORDER.filter(k => groups[k] && !hiddenAnchors.has(k));
    const unknownKeys = Object.keys(groups).filter(k => !ANCHOR_ORDER.includes(k) && !hiddenAnchors.has(k));
    const allKeys     = [...knownKeys, ...unknownKeys];

    const sectionsHtml = allKeys.map(key => {
      const items = groups[key];
      const icon  = ANCHOR_ICON[key] || '◆';
      const isStatus  = key === '状态';
      const isGarrison = key === '驻军';
      const isTroop   = key === '兵种';

      const itemsHtml = items.map(it => {

        // ── 驻军：用 incoming/outgoing 字段，每城一行 ──
        if (isGarrison) {
          const city = esc(it.cityName || it.label || '');
          const inList  = (it.incoming || []).map(n => esc(n));
          const outList = (it.outgoing || []).map(n => esc(n));
          // 两者都空则跳过（不渲染空行）
          if (!inList.length && !outList.length) return '';
          const parts = [];
          if (inList.length)  parts.push(
            `<span class="guard-in">← ${inList.join(' / ')}<span class="guard-action"> 入驻</span></span>`);
          if (outList.length) parts.push(
            `<span class="guard-out">${outList.join(' / ')} →<span class="guard-action"> 调离</span></span>`);
          return `<li class="ag-item ag-item-guard">
            <span class="ag-guard-city">${city}</span>
            <span class="ag-guard-moves">${parts.join('')}</span>
          </li>`;
        }

        // ── 兵种：delta chip 正绿负红 ──
        if (isTroop) {
          const city = esc(it.label || '');
          const chipsHtml = (it.deltas || []).map(d =>
            `<span class="delta-chip ${valCls(d.val)}">${esc(d.res)}${sign(d.val)}${d.val}</span>`
          ).join('');
          if (!chipsHtml) return '';
          return `<li class="ag-item">
            <span class="ag-label">${city}</span>
            <span class="ag-deltas">${chipsHtml}</span>
          </li>`;
        }

        // ── 武将状态：武将名 + 纯文字状态 badge（只显示状态值本身）──
        if (isStatus) {
          const genName = esc(it.label || '');
          // desc 优先；若无则从 text 里提取冒号后的部分（去掉原始锚点前缀）
          let rawDesc = it.desc || '';
          if (!rawDesc && it.text) {
            const colonIdx = it.text.indexOf(':');
            rawDesc = colonIdx >= 0 ? it.text.slice(colonIdx + 1).trim() : '';
          }
          if (!genName && !rawDesc) return '';
          const descTxt = esc(rawDesc);
          const descCls = STATUS_DESC_CLS(rawDesc);
          // 健康/空状态不显示 badge
          if (!rawDesc || descCls === 'ag-status-normal') {
            return `<li class="ag-item ag-item-status">
              <span class="ag-gen-name">${genName}</span>
            </li>`;
          }
          return `<li class="ag-item ag-item-status">
            <span class="ag-gen-name">${genName}</span>
            <span class="ag-status-badge ${descCls}">${descTxt}</span>
          </li>`;
        }

        // ── 通用 ──
        const deltasHtml = (it.deltas && it.deltas.length)
          ? `<span class="ag-deltas">${it.deltas.map(d =>
              `<span class="delta-chip ${valCls(d.val)}">${RES_ICON[d.res]||''}${d.res} ${sign(d.val)}${d.val}</span>`
            ).join('')}</span>` : '';
        const labelTxt = it.label || it.text || '';
        return `<li class="ag-item">
          <span class="ag-label">${esc(labelTxt)}</span>
          ${deltasHtml}
        </li>`;
      }).join('');

      const titleTxt = key === '状态' ? '武将状态' : key;
      return `<section class="anchor-group" data-anchor="${esc(key)}">
        <h4 class="ag-title"><span class="ag-icon">${icon}</span>${esc(titleTxt)}</h4>
        <ul class="ag-items">${itemsHtml}</ul>
      </section>`;
    }).join('');

    if (!sectionsHtml) return '';

    return `<div class="cc-anchor-groups-body">${sectionsHtml}</div>`;
  }

  // ── 兼容旧数据：把旧字段转换为 anchorGroups ──
  function _migrateToAnchorGroups(ch) {
    const groups = Object.assign({}, ch.anchorGroups || {});

    // 季度△（旧存档兼容迁移：seasonal[] → anchorGroups.季度）
    // v12 parser 不再写入 seasonal，此分支只处理 Supabase 中的历史旧存档。
    // 保护条件 !groups['季度'] 确保：新数据（anchorGroups已由parser直接写入）不被重复追加。
    if (ch.seasonal && ch.seasonal.length && !groups['季度']) {
      groups['季度'] = [];
      groups['季度'].push({
        label:  '季度结算',
        deltas: ch.seasonal.map(s => ({ res: s.res, val: s.val })),
        text:   '',
      });
    }
    // 府库△（旧数据兼容：anchorGroups['府库'] 已由 v11 parser 直接写入时跳过，避免重复）
    if (ch.darkItems && ch.darkItems.length && !groups['府库']) {
      groups['府库'] = [];
      ch.darkItems.forEach(d => {
        groups['府库'].push({
          label:  typeof d === 'string' ? d : (d.desc || ''),
          deltas: typeof d === 'string' ? [] : (d.entries || []).map(e => ({ res: e.res, val: e.val })),
          text:   typeof d === 'string' ? d : '',
        });
      });
    }
    // 情报△（合并进 anchorGroups）
    if (ch.intel && ch.intel.length) {
      // 浅拷贝数组避免污染原始数据
      groups['情报'] = [...(groups['情报'] || [])];
      ch.intel.forEach(s => {
        // 去重：避免 parser 已写入 anchorGroups 的情报被重复添加
        if (!groups['情报'].some(it => it.text === s || it.label === s)) {
          groups['情报'].push({ label: s, deltas: [], text: s });
        }
      });
    }
    // 兵种变动 ── res 字段用 type（步/弓/骑/水/蛮），val 保持原值供 valCls 正确配色
    if (ch.troopChanges && ch.troopChanges.length && !groups['兵种']) {
      groups['兵种'] = [];
      ch.troopChanges.forEach(tc => {
        groups['兵种'].push({
          label:  tc.cityName,
          deltas: (tc.entries || []).map(e => ({ res: e.type, val: e.val })),
          text:   tc.spec || '',
          isTroop: true,
        });
      });
    }
    // ★ 驻军变动 ── 迁移 ch.guards 进 anchorGroups，按城名去重聚合
    if (ch.guards && ch.guards.length) {
      // 先合并 anchorGroups 里可能已有的旧驻军条目（防止通用锚点二次写入残留）
      delete groups['驻军'];
      groups['驻军'] = [];
      // 按城名聚合：同城的 incoming/outgoing 合并到一条
      const cityMap = {};
      ch.guards.forEach(g => {
        if (!cityMap[g.cityName]) cityMap[g.cityName] = { incoming: [], outgoing: [] };
        (g.members || []).forEach(m => {
          if (m.dir === 'in')  cityMap[g.cityName].incoming.push(m.name);
          else                 cityMap[g.cityName].outgoing.push(m.name);
        });
        // 兼容旧格式 newHolder（无 members）
        if (!g.members && g.newHolder) {
          cityMap[g.cityName].incoming.push(g.newHolder);
        }
      });
      Object.entries(cityMap).forEach(([city, mv]) => {
        groups['驻军'].push({ cityName: city, incoming: mv.incoming, outgoing: mv.outgoing, label: city });
      });
    }
    return groups;
  }

  // ── 公共事件区（NPC动态 + v3 事件列表 + 错误提示）──
  function _renderPublicEvents(publicEvents, v3Events, v3Errors) {
    let html = '';

    // ── NPC 动态 / 野外动态 ──
    if (publicEvents && publicEvents.length) {
      const npcItems = publicEvents.filter(ev =>
        ev.anchor === 'NPC状态' || ev.anchor === '野外'
      );
      if (npcItems.length) {
        // 分组：NPC城池 / 野外
        const npcCities = npcItems.filter(ev => ev.anchor === 'NPC状态');
        const wildItems  = npcItems.filter(ev => ev.anchor === '野外');

        let gridHtml = '';
        // NPC 城池动态
        npcCities.forEach(ev => {
          const cityTxt  = ev.label ? `<span class="npc-city">🏯 ${esc(ev.label)}</span>` : '';
          const descTxt  = ev.text  ? `<span class="npc-desc">${esc(ev.text)}</span>` : '';
          if (!cityTxt && !descTxt) return;
          gridHtml += `<div class="npc-event-item">${cityTxt}${descTxt}</div>`;
        });
        // 野外动态
        wildItems.forEach(ev => {
          const descTxt = ev.text ? `<span class="npc-desc">${esc(ev.text)}</span>` : '';
          if (!descTxt) return;
          gridHtml += `<div class="npc-event-item"><span class="npc-city">🌿 野外</span>${descTxt}</div>`;
        });

        if (gridHtml) {
          html += `<div class="npc-events-block">
            <div class="npc-events-hd">🎭 NPC 动态</div>
            <div class="npc-events-grid">${gridHtml}</div>
          </div>`;
        }
      }
    }

    // ── v3 事件列表 ──
    if (v3Events && v3Events.length) {
      const byLord = {};
      v3Events.forEach(ev => {
        const k = ev.lord || '全局';
        if (!byLord[k]) byLord[k] = [];
        byLord[k].push(ev);
      });
      const cols = Object.entries(byLord).map(([lord, evs]) => {
        const items = evs.map(ev => {
          const placeTag = ev.place ? `<span class="v3-ev-place">📍${esc(ev.place)}</span>` : '';
          return `<div class="v3-ev-item">${placeTag}<span class="v3-ev-content">${esc(ev.content)}</span></div>`;
        }).join('');
        return `<div class="v3-ev-col"><div class="v3-ev-lord">${esc(lord)}</div>${items}</div>`;
      }).join('');
      html += `<div class="public-events-block">
        <div class="public-events-hd">📋 本回合事件</div>
        <div class="v3-ev-grid">${cols}</div>
      </div>`;
    }

    // ── v3 错误提示 ──
    if (v3Errors && v3Errors.length) {
      const errItems = v3Errors.map(e =>
        `<div class="v3-err-item">
          <span class="v3-err-type">${esc(e.type)}</span>
          <span class="v3-err-raw">${esc(e.raw)}</span>
          ${e.problem ? `<span class="v3-err-problem">⚠ ${esc(e.problem)}</span>` : ''}
          ${e.fix ? `<span class="v3-err-fix">→ ${esc(e.fix)}</span>` : ''}
        </div>`).join('');
      html += `<div class="public-events-block v3-errors-block">
        <div class="public-events-hd">⚠ 数据错误</div>
        <div>${errItems}</div>
      </div>`;
    }

    return html;
  }

  function renderChangesDetail() {
    const el = document.getElementById('block-changes-detail');
    if (!el) return;

    const latest = state.rounds.length ? state.rounds[state.rounds.length - 1] : null;
    if (!latest) { el.classList.add('hidden'); return; }

    // 从 rawContent 实时重解析（保证使用最新解析器逻辑 + 保留 npcStatus/wildEvents）
    let changes = latest.parsed.changes || [];
    let freshNpcStatus  = [];
    let freshWildEvents = [];
    if (latest.rawContent) {
      try {
        const fp = window.SGParser.parse(latest.rawContent);
        if (fp.changes && fp.changes.length) changes = fp.changes;
        // fp.npcStatus / fp.wildEvents 来自解析器顶层，不依赖数组非索引属性，Supabase 往返安全
        freshNpcStatus  = fp.npcStatus  || [];
        freshWildEvents = fp.wildEvents || [];
      } catch(e) {}
    }

    if (!changes.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');

    const sub = document.getElementById('changes-detail-sub');
    if (sub) sub.textContent = `第 ${latest.round} 回合`;

    const row = document.getElementById('changes-cards-row');
    if (!row) return;

    const SLOT_CFG = [{ slot:'甲', idx:0 }, { slot:'乙', idx:1 }, { slot:'丙', idx:2 }];

    // ── 三栏玩家卡（三层结构）──
    const cardsHtml = SLOT_CFG.map(cfg => {
      const ch    = changes.find(c => c.slot === cfg.slot);
      const pName = (state.players[cfg.idx] && state.players[cfg.idx].name) || `城主${cfg.slot}`;
      const ci    = cfg.idx;

      if (!ch) {
        return `<div class="cd-card cd-card-${ci}">
          <div class="cd-header cd-header-${ci}">
            <div class="cd-strip cd-strip-${ci}"></div>
            <span class="cd-name">${esc(pName)}</span>
          </div>
          <p class="cd-empty">本回合无变动记录</p>
        </div>`;
      }

      // 合并旧字段进 anchorGroups（兼容已存 Supabase 旧数据）
      const anchorGroups = _migrateToAnchorGroups(ch);

      // 收支校验警告
      const warningsHtml = (ch.warnings && ch.warnings.length)
        ? `<div class="anchor-group" style="border-left-color:rgba(230,80,50,.5)">
            <h4 class="ag-title"><span class="ag-icon">⚠</span>数据校验</h4>
            <ul class="ag-items">${ch.warnings.map(w =>
              `<li class="ag-item"><span class="ag-label" style="color:#f07070">${esc(w)}</span></li>`
            ).join('')}</ul>
          </div>` : '';

      return `<div class="cd-card cd-card-${ci}">
        <div class="cd-header cd-header-${ci}">
          <div class="cd-strip cd-strip-${ci}"></div>
          <span class="cd-name">${esc(pName)}</span>
        </div>
        ${_renderResRow(ch.resources)}
        ${_renderBreakdown(ch.breakdown, ch.troopChanges)}
        <div class="cc-anchor-groups">
          ${_renderAnchorGroups(anchorGroups)}
          ${warningsHtml}
        </div>
        <div class="cd-card-spacer"></div>
      </div>`;
    }).join('');

    // ── 公共事件区（NPC动态 + 野外动态）──
    // 优先使用本次重解析的结果（freshNpcStatus/freshWildEvents）；
    // rawContent 不存在时降级到 parsed 里已有的字段；
    // 最后兜底尝试 changes.__publicEvents（内存中的新鲜解析不受 JSON 往返影响）。
    const resolvedNpc  = freshNpcStatus.length  ? freshNpcStatus
      : (latest.parsed.npcStatus  || []);
    const resolvedWild = freshWildEvents.length ? freshWildEvents
      : (latest.parsed.wildEvents || []);

    // 统一转换为 _renderPublicEvents 期望的 publicEvents 格式
    const publicEvents = [
      ...resolvedNpc.map(ev  => ({ anchor: 'NPC状态', label: ev.city  || '', deltas: [], text: ev.desc  || '' })),
      ...resolvedWild.map(ev => ({ anchor: '野外',    label: '',            deltas: [], text: ev.desc  || '' })),
    ];
    // 兼容旧版内存数据（未经 JSON 往返时 __publicEvents 仍可用）
    if (!publicEvents.length && changes.__publicEvents && changes.__publicEvents.length) {
      publicEvents.push(...changes.__publicEvents);
    }

    const publicHtml = _renderPublicEvents(
      publicEvents,
      latest.parsed.events || [],
      latest.parsed.errors || []
    );

    row.innerHTML = cardsHtml + publicHtml;
  }


  // ══════════════════════════════════════════
  //  历史回合
  // ══════════════════════════════════════════
  function renderHistorySection() {
    const badge   = document.getElementById('history-badge');
    const tabBar  = document.getElementById('history-tab-bar');
    const content = document.getElementById('history-content');
    if (!tabBar || !content) return;

    if (badge) badge.textContent = state.rounds.length;

    if (!state.rounds.length) {
      tabBar.innerHTML  = '';
      content.innerHTML = '<p style="font-size:.78rem;color:var(--text-dim);padding:8px 0">暂无记录</p>';
      return;
    }

    tabBar.innerHTML = state.rounds.map(rd =>
      `<button class="hround-btn" onclick="window.__showHistoryRound(${rd.round})">
        第${rd.round}回合
      </button>`
    ).join('');

    const latest = state.rounds[state.rounds.length - 1];
    content.innerHTML = buildHistoryRoundHTML(latest);
    const btns = tabBar.querySelectorAll('.hround-btn');
    if (btns.length) btns[btns.length - 1].classList.add('active');
  }

  window.__showHistoryRound = function (roundNum) {
    const rd = state.rounds.find(r => r.round === roundNum);
    if (!rd) return;
    const content = document.getElementById('history-content');
    if (content) content.innerHTML = buildHistoryRoundHTML(rd);
    document.querySelectorAll('.hround-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.trim().startsWith(`第${roundNum}回合`));
    });
  };

  function buildHistoryRoundHTML(rd) {
    const p = rd.parsed;
    let html = `<div class="history-round-block">`;

    // 标题（只显示回合号）
    html += `<div class="h-round-title">
      <span class="h-rt-tag">第</span>
      <span class="h-rt-num">${rd.round}</span>
      <span class="h-rt-tag">回合</span>
    </div>`;

    // 战局动态：原文展示
    const rawText = p.rawDigest || buildLegacyDigest(p);
    if (rawText && rawText.trim()) {
      html += `<div class="info-block block-digest" style="margin:0 0 10px">
        <div class="ib-header">
          <span class="ib-icon ib-icon--text">动态</span>
          <span class="ib-title">战局动态</span>
        </div>
        <div class="ib-body digest-body">
          <div class="digest-raw">${highlightRaw(rawText)}</div>
        </div>
      </div>`;
    }

    // 各方态势（资源快览）
    if (p.players && p.players.length) {
      const P_COLORS = ['var(--p0-color)','var(--p1-color)','var(--p2-color)'];
      html += `<div class="info-block hist-players-block" style="margin:0 0 10px">
        <div class="ib-header"><span class="ib-icon ib-icon--text">态势</span><span class="ib-title">各方态势</span></div>
        <div class="ib-body hist-players-grid">`;
      p.players.forEach((pl, i) => {
        html += `<div class="hist-player-card" style="border-left:3px solid ${P_COLORS[i]||'var(--border-red)'}">
          <div class="hpc-name">
            <span>${esc(pl.name || '城主')}</span>
            ${pl.city ? `<span class="hpc-city">${esc(pl.city)}</span>` : ''}
          </div>`;
        const chips = buildResChips(pl);
        if (chips) html += `<div class="hpc-res">${chips}</div>`;
        if (pl.generals && pl.generals.length) {
          html += `<div class="hpc-generals">` +
            pl.generals.map(g => buildGenTag(g)).join('') +
          `</div>`;
        }
        if (pl.situation_note) html += `<div class="hpc-note">${esc(pl.situation_note)}</div>`;
        html += `</div>`;
      });
      html += `</div></div>`;
    }

    // 战斗结算
    if (p.battles && p.battles.length) {
      html += `<div class="info-block block-battles" style="margin:0 0 10px">
        <div class="ib-header"><span class="ib-icon ib-icon--text">战斗</span><span class="ib-title">战斗结算</span></div>
        <div class="ib-body"><div class="battle-list">` +
        p.battles.map(b => buildBattleCard(b)).join('') +
        `</div></div></div>`;
    }

    html += `</div>`;
    return html;
  }

  function buildResChips(p) {
    return [
      p.gold   != null ? `<span class="res-chip res-chip--gold">金<b>${p.gold}</b></span>`   : '',
      p.food   != null ? `<span class="res-chip res-chip--food">粮<b>${p.food}</b></span>`   : '',
      p.troop  != null ? `<span class="res-chip res-chip--troop">兵<b>${p.troop}</b></span>` : '',
      p.morale != null ? `<span class="res-chip res-chip--morale">心<b>${p.morale}</b></span>` : '',
      p.cities != null ? `<span class="res-chip res-chip--city">城<b>${p.cities}</b></span>` : '',
    ].filter(Boolean).join('');
  }

  // ══════════════════════════════════════════
  //  解析预览
  // ══════════════════════════════════════════
  function showParsePreview(parsed) {
    var el = document.getElementById('parse-result');
    if (!el) return;
    if (!parsed) {
      el.innerHTML = '<div class="pp-row"><span class="pp-fail">❌ 无法解析，请检查格式</span></div>';
      document.getElementById('parse-preview').classList.remove('hidden');
      return;
    }
    var html = '';

    // 回合号
    html += '<div class="pp-row">';
    html += parsed.round
      ? '<span class="pp-ok">✅ 回合: 第' + parsed.round + '回合</span>'
      : '<span class="pp-fail">❌ 回合号未识别</span>';
    html += '</div>';

    // 速递
    html += '<div class="pp-row">';
    html += parsed.digest
      ? '<span class="pp-ok">✅ 速递: ' + esc(parsed.digest.slice(0,50)) + '</span>'
      : '<span class="pp-warn">⚠️ 速递未识别</span>';
    html += '</div>';

    // 三位玩家
    parsed.players.forEach(function (p, i) {
      html += '<div class="pp-row">';
      var fields = [];
      if (p.name) fields.push('名号:' + p.name);
      if (p.gold !== null) fields.push('金:' + p.gold);
      if (p.food !== null) fields.push('粮:' + p.food);
      if (p.troop !== null) fields.push('兵:' + p.troop);
      if (p.morale !== null) fields.push('民心:' + p.morale);
      if (p.cities !== null) fields.push('城:' + p.cities);
      if (p.cities_list.length) fields.push('城池明细:' + p.cities_list.length + '座');
      if (p.generals.length) fields.push('武将:' + p.generals.length + '人');

      var missing = [];
      if (p.gold === null) missing.push('金');
      if (p.food === null) missing.push('粮');
      if (p.troop === null) missing.push('兵');
      if (!p.cities_list.length) missing.push('城池明细');
      if (!p.generals.length) missing.push('武将');

      if (fields.length >= 5) {
        html += '<span class="pp-ok">✅ ' + '甲乙丙'[i] + ': '
          + fields.join(' · ') + '</span>';
      } else if (fields.length >= 2) {
        html += '<span class="pp-warn">⚠️ ' + '甲乙丙'[i] + ': '
          + fields.join(' · ');
        if (missing.length) html += ' (缺失: ' + missing.join(',') + ')';
        html += '</span>';
      } else {
        html += '<span class="pp-fail">❌ ' + '甲乙丙'[i]
          + ': 数据严重不足</span>';
      }
      html += '</div>';
    });

    // 如果玩家数量不足3
    if (parsed.players.length < 3) {
      html += '<div class="pp-row"><span class="pp-fail">❌ 只识别到 '
        + parsed.players.length + '/3 位玩家</span></div>';
    }

    // NPC
    html += '<div class="pp-row">';
    html += parsed.npcCities.length
      ? '<span class="pp-ok">✅ NPC: ' + parsed.npcCities.length + '座城</span>'
      : '<span class="pp-warn">⚠️ NPC城池未识别</span>';
    html += '</div>';

    // 战报
    html += '<div class="pp-row">';
    html += parsed.battles.length
      ? '<span class="pp-ok">✅ 战报: ' + parsed.battles.length + '条</span>'
      : '<span class="pp-ok">✅ 战报: 无战事</span>';
    html += '</div>';

    // 变动
    html += '<div class="pp-row">';
    html += parsed.changes.length
      ? '<span class="pp-ok">✅ 变动: ' + parsed.changes.length + '条</span>'
      : '<span class="pp-warn">⚠️ 变动块未识别</span>';
    html += '</div>';

    // 剧情区
    html += '<div class="pp-row">';
    html += parsed.rawDigest
      ? '<span class="pp-ok">✅ 剧情区: '
        + parsed.rawDigest.length + '字</span>'
      : '<span class="pp-fail">❌ 剧情区为空</span>';
    html += '</div>';

    el.innerHTML = html;
    var previewBox = document.getElementById('parse-preview');
    if (previewBox) previewBox.classList.remove('hidden');
  }

  // ══════════════════════════════════════════
  //  页脚 / 同步状态
  // ══════════════════════════════════════════
  function updateFooter() {
    const el = document.getElementById('footer-info');
    if (!el) return;
    if (!state.rounds.length) { el.textContent = '尚未开局'; return; }
    const { latest } = getRoundStats();
    const latestLabel = latest || state.rounds[state.rounds.length - 1].round;
    el.textContent = `当前第 ${latestLabel} 回合`;
  }

  function updateSyncStatus(s) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    const { latest } = getRoundStats();
    const roundPrefix = latest ? `当前第 ${latest} 回合` : '';
    const map = {
      loading:  ['☁️ 连接云端中…',                                                         '#3dbe6c'],
      online:   [`☁️ 云端已连接${roundPrefix ? ` · ${roundPrefix}` : ''} · 每30秒自动刷新`, '#7dce7d'],
      updating: [`🔄 正在同步新内容…${roundPrefix ? ` · ${roundPrefix}` : ''}`, '#3dbe6c'],
      error:    ['⚠️ 云端连接失败，请刷新页面',                                            '#e74c3c'],
    };
    const [txt, color] = map[s] || map.online;
    el.textContent = txt;
    el.style.color  = color;
  }

  // ══════════════════════════════════════════
  //  Toast
  // ══════════════════════════════════════════
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 320);
    }, 2800);
  }

  // ══════════════════════════════════════════
  //  粒子特效
  // ══════════════════════════════════════════
  function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    });
    const P = [], N = 48;
    for (let i = 0; i < N; i++) P.push(mkP(true));
    function mkP(rand) {
      return {
        x:  Math.random() * W,
        y:  rand ? Math.random() * H : H + 10,
        r:  Math.random() * 2 + 0.4,
        vx: (Math.random() - .5) * .5,
        vy: -(Math.random() * .8 + .3),
        a:  Math.random() * .6 + .2,
        d:  Math.random() * .003 + .001,
        h:  Math.random() < .6 ? 0 : 35,
      };
    }
    (function draw() {
      ctx.clearRect(0, 0, W, H);
      P.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.h},90%,55%,${p.a})`;
        ctx.fill();
        p.x += p.vx; p.y += p.vy; p.a -= p.d;
        if (p.a <= 0 || p.y < -10) P[i] = mkP(false);
      });
      requestAnimationFrame(draw);
    })();
  }

  // ══════════════════════════════════════════
  //  工具函数
  // ══════════════════════════════════════════
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
      // 注意：不在这里替换 \n，由 highlightRaw 按行处理
  }

  function setTxt(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  // ══════════════════════════════════════════
  //  行动提醒卡
  // ══════════════════════════════════════════
  function initTipsCard() {
    const btn     = document.getElementById('tips-btn');
    const overlay = document.getElementById('tips-overlay');
    const closeBtn= document.getElementById('tips-close');
    const tabsEl  = document.getElementById('tips-tabs');
    const bodyEl  = document.getElementById('tips-body');
    if (!btn || !overlay || !window.TIPS_DATA) return;

    let activeTab = 0;

    // 把 [占位符] 包裹成高亮 span
    function wrapPlaceholders(text) {
      return esc(text).replace(/\[([^\]]+)\]/g,
        '<span class="ph">[$1]</span>');
    }

    // 渲染指定 tab 内容
    function renderTab(idx) {
      const tab = window.TIPS_DATA[idx];
      if (!tab) return;
      bodyEl.innerHTML = tab.scenes.map(scene => {
        const tipsHtml = scene.tips.map(tip => {
          const noteHtml = tip.note
            ? '<span class="tips-tip-note">' + esc(tip.note) + '</span>'
            : '';
          return '<div class="tips-tip">'
            + '<span class="tips-tip-text">' + wrapPlaceholders(tip.text) + '</span>'
            + noteHtml
            + '</div>';
        }).join('');
        return '<div class="tips-scene">'
          + '<div class="tips-scene-title">' + esc(scene.title) + '</div>'
          + tipsHtml
          + '</div>';
      }).join('');
      bodyEl.scrollTop = 0;
    }

    // 渲染 Tab 栏
    function renderTabs() {
      tabsEl.innerHTML = window.TIPS_DATA.map((tab, i) =>
        '<button class="tips-tab' + (i === activeTab ? ' active' : '') + '" data-idx="' + i + '">'
        + esc(tab.label) + '</button>'
      ).join('');
    }

    // 打开卡片
    function openCard() {
      overlay.classList.remove('hidden');
      // 延一帧再加 visible，让 transition 生效
      requestAnimationFrame(() => overlay.classList.add('visible'));
      renderTabs();
      renderTab(activeTab);
      // 滚动激活的 tab 进视口
      const activeEl = tabsEl.querySelector('.active');
      if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }

    // 关闭卡片
    function closeCard() {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.classList.add('hidden'), 190);
    }

    // 事件绑定
    btn.addEventListener('click', () => {
      overlay.classList.contains('visible') ? closeCard() : openCard();
    });

    closeBtn.addEventListener('click', closeCard);

    // 点遮罩空白区关闭（点 card 本身不关闭）
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeCard();
    });

    // ESC 关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) closeCard();
    });

    // Tab 切换（事件委托）
    tabsEl.addEventListener('click', e => {
      const tabBtn = e.target.closest('.tips-tab');
      if (!tabBtn) return;
      const idx = parseInt(tabBtn.dataset.idx, 10);
      if (idx === activeTab) return;
      activeTab = idx;
      tabsEl.querySelectorAll('.tips-tab').forEach((t, i) =>
        t.classList.toggle('active', i === activeTab));
      renderTab(activeTab);
      tabBtn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    });
  }

  document.addEventListener('DOMContentLoaded', function() { init();
  var btnVerify = document.getElementById('btn-verify-balance');
  if (btnVerify) {
    btnVerify.addEventListener('click', window.onVerifyBalance);
  }
  var btnCalcCas = document.getElementById('btn-calc-cas');
  if (btnCalcCas) {
    btnCalcCas.addEventListener('click', window.onCalcCasualties);
  }
});
})();


window.onCalcCasualties = function() {
  var atkTroops = parseInt(document.getElementById('cas-atk-troops').value, 10) || 0;
  var defTroops = parseInt(document.getElementById('cas-def-troops').value, 10) || 0;
  var diff = parseInt(document.getElementById('cas-diff').value, 10) || 0;

  if (atkTroops < 1 || defTroops < 1) {
    if (window.showToast) window.showToast('⚠️ 请输入有效兵力');
    return;
  }

  var mod = {
    siege:          document.getElementById('cas-siege').checked,
    flank:          document.getElementById('cas-flank').checked,
    longMarch:      document.getElementById('cas-march').checked,
    famedGeneral:   document.getElementById('cas-famous').checked,
    mountain:       document.getElementById('cas-terrain').checked,
    pass:           document.getElementById('cas-pass').checked,
    extremeWeather: document.getElementById('cas-weather').checked,
  };

  if (!window.EconCalc) {
    console.error("EconCalc not loaded");
    return;
  }
  var r = window.EconCalc.calcCasualties(atkTroops, defTroops, diff, mod);

  document.getElementById('cas-atk-loss').textContent = '-' + r.atkLoss;
  document.getElementById('cas-atk-rate').textContent = '伤亡率 ' + r.atkRate;
  document.getElementById('cas-atk-remain').textContent = '剩余 ' + (atkTroops - r.atkLoss) + ' 兵';
  document.getElementById('cas-def-loss').textContent = '-' + r.defLoss;
  document.getElementById('cas-def-rate').textContent = '伤亡率 ' + r.defRate;
  document.getElementById('cas-def-remain').textContent = '剩余 ' + (defTroops - r.defLoss) + ' 兵';
  document.getElementById('cas-grade').textContent = r.grade;
  document.getElementById('cas-details-list').textContent = r.details.join(' · ');
  document.getElementById('cas-result').classList.remove('hidden');
};

function renderVerifyBtn() {
  var btn = document.getElementById('btn-verify-balance');
  if (!btn) return;
  if (!state.parsed || !state.parsed.changes || state.parsed.changes.length === 0) {
    btn.classList.add('hidden');
    var pnl = document.getElementById('verify-panel');
    if (pnl) pnl.classList.add('hidden');
  } else {
    btn.classList.remove('hidden');
  }
}

window.onVerifyBalance = function() {
  if (!state.parsed || !state.players) return;

  var verifyCardsContainer = document.getElementById('verify-cards');
  if (!verifyCardsContainer) return;
  verifyCardsContainer.innerHTML = '';

  var panel = document.getElementById('verify-panel');
  if (panel) panel.classList.remove('hidden');

  var roundNum = state.parsed.round || 0;

  var currentChanges = state.parsed.changes || [];

  for (var slot in state.players) {
    var p = state.players[slot];
    var cityNameList = Object.keys(p.cities || {});
    var cityCount = cityNameList.length;
    var morale = p.resources ? (p.resources.morale || 0) : 0;
    var totalTroop = p.resources ? (p.resources.troop || 0) : 0;
    var generalCount = Object.keys(p.generals || {}).length;

    var income = window.EconCalc.calcTotalIncome(cityNameList, morale);
    var maint = window.EconCalc.calcMaintenance(totalTroop, generalCount, cityCount);
    var quarter = window.EconCalc.calcQuarterly(roundNum, cityCount);

    // Find AI values
    var aiGoldIncome = null, aiFoodIncome = null;
    var aiGoldMaint = null, aiFoodMaint = null;
    var aiGoldNet = null, aiFoodNet = null;

    var cData = currentChanges.find(function(c) { return c.slot === slot; });
    if (cData && cData.breakdown) {
      if (cData.breakdown.gold) {
        cData.breakdown.gold.forEach(function(item) {
          if (item.label.indexOf('产出') !== -1) aiGoldIncome = item.value;
          if (item.label.indexOf('维护') !== -1) aiGoldMaint = item.value;
        });
      }
      if (cData.breakdown.food) {
        cData.breakdown.food.forEach(function(item) {
          if (item.label.indexOf('产出') !== -1) aiFoodIncome = item.value;
          if (item.label.indexOf('维护') !== -1) aiFoodMaint = item.value;
        });
      }
      if (cData.resources) {
        aiGoldNet = cData.resources.gold;
        aiFoodNet = cData.resources.food;
      }
    }

    var html = '<div class="verify-card">';
    html += '<div class="verify-card-name">' + (window.esc ? window.esc(p.name || slot) : (p.name || slot)) + '</div>';

    function renderRow(label, engineVal, aiVal) {
      var engineStr = (engineVal > 0 ? '+' : '') + engineVal;
      var aiStr = (aiVal === null) ? '(未解析到)' : ((aiVal > 0 ? '+' : '') + aiVal);

      var matchClass = '';
      if (aiVal !== null) {
        if (Math.abs(engineVal - aiVal) <= 5) {
          matchClass = 'match';
        } else {
          matchClass = 'mismatch';
          aiStr = '⚠️' + aiStr;
        }
      }

      return '<div class="verify-row">' +
        '<span class="verify-label">' + label + '</span>' +
        '<span class="verify-engine">引擎: ' + engineStr + '</span>' +
        '<span class="verify-ai ' + matchClass + '">AI: ' + aiStr + '</span>' +
        '</div>';
    }

    html += renderRow('产出(金)', income.totalGold, aiGoldIncome);
    html += renderRow('产出(粮)', income.totalFood, aiFoodIncome);
    html += renderRow('维护(金)', -maint.gold, aiGoldMaint);
    html += renderRow('维护(粮)', -maint.food, aiFoodMaint);

    if (quarter.isQuarter) {
      html += '<div class="verify-row"><span class="verify-label" style="width:100%;">季度维护: 金-' + quarter.gold + ' 粮-' + quarter.food + '</span></div>';
    }

    var pState = {
      cityNames: cityNameList,
      morale: morale,
      totalTroop: totalTroop,
      generalCount: generalCount,
      roundNum: roundNum,
      actions: [],
      events: []
    };

    var pData = state.parsed && state.parsed.players ? state.parsed.players.find(function(x) { return x.slot === slot; }) : null;
    if (pData && pData.actions) {
      pData.actions.forEach(function(a) {
        var type = '';
        if (a.raw.indexOf('招募') !== -1) type = '招募';
        else if (a.raw.indexOf('急征') !== -1) type = '急征';
        else if (a.raw.indexOf('攻城') !== -1) type = '攻城';
        else if (a.raw.indexOf('内政') !== -1) type = '内政';
        else if (a.raw.indexOf('外交') !== -1) type = '外交';
        else if (a.raw.indexOf('计策') !== -1) type = '计策';
        else if (a.raw.indexOf('侦察') !== -1) type = '侦察';
        else if (a.raw.indexOf('剿匪') !== -1) type = '剿匪';
        else if (a.raw.indexOf('屯田') !== -1) type = '屯田';
        else if (a.raw.indexOf('开市') !== -1) type = '开市';
        else if (a.raw.indexOf('招贤') !== -1) type = '招贤';
        else if (a.raw.indexOf('练兵') !== -1) type = '练兵';
        else if (a.raw.indexOf('工造') !== -1) type = '工造';

        var count = 0;
        var match = a.raw.match(/(\d+)/);
        if (match) count = parseInt(match[1], 10);

        if (type) {
          pState.actions.push({ type: type, params: { count: count, troops: count } });
        }
      });
    }

    var fullBalance = window.EconCalc.calcFullBalance(pState);

    html += '<div class="verify-row verify-total">' +
      '<span class="verify-label">净收入(金)</span>' +
      '<span class="verify-engine">引擎: ' + (fullBalance.net.gold > 0 ? '+' : '') + fullBalance.net.gold + '</span>' +
      '<span class="verify-ai ' + (aiGoldNet !== null ? (Math.abs(fullBalance.net.gold - aiGoldNet) <= 5 ? 'match' : 'mismatch') : '') + '">AI: ' + (aiGoldNet !== null ? ((aiGoldNet > 0 ? '+' : '') + aiGoldNet) : '(未解析到)') + '</span>' +
      '</div>';

    html += '<div class="verify-row verify-total">' +
      '<span class="verify-label">净收入(粮)</span>' +
      '<span class="verify-engine">引擎: ' + (fullBalance.net.food > 0 ? '+' : '') + fullBalance.net.food + '</span>' +
      '<span class="verify-ai ' + (aiFoodNet !== null ? (Math.abs(fullBalance.net.food - aiFoodNet) <= 5 ? 'match' : 'mismatch') : '') + '">AI: ' + (aiFoodNet !== null ? ((aiFoodNet > 0 ? '+' : '') + aiFoodNet) : '(未解析到)') + '</span>' +
      '</div>';

    html += '</div>';
    verifyCardsContainer.insertAdjacentHTML('beforeend', html);
  }
};
