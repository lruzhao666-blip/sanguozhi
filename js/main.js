/**
 * main.js — 三国志文字版 v14 (v2.5)
 * v17 (变更): 方案二最终落地 — 武将名去染色保持中性白;战报卡 v3.0
 *             调用新增 attackerSlot/defenderSlot/Faction 字段渲染徽章;
 *             调度部队/战报均移除"甲乙丙"字面展示
 * v18 (变更): 色条移除 box-shadow,避免相邻行颜色互渗
 * v19 (2026-05-26): 徽章去除外发光 box-shadow,消除色条邻接处的"渐变/混色"错觉
 * v20 (2026-05-26): 军报徽章不再注入 background,改为线框样式;阵营色仅由 border+text 表达
 * v21 (2026-06-03): 军报推倒重做 — 删除军报摘要段渲染 + 简化 renderBattlesBlock + 战报卡 buildBattleCard 攻守双方徽章中性白
 * v22 (2026-06-04): 军报板块整体下线 — 删除 renderBattlesBlock / buildBattleCard / renderAll 中的调用
 * v23 (2026-06-05): 军报板块重建(方案二) — 新增 renderJunbao(),挂载于地图与三方势力之间;读取 transit + battles,徽章色走 P_COLOR / SGMap.getFactionColor()
 * v24 (2026-06-05): 修复 PR#220 renderJunbao 误置于特效开关栏 IIFE 内 — 迁回主 IIFE,恢复 renderChangesDetail/renderHistorySection 调用链
 * v25 (2026-06-12): 军报板块 UI 重做 — CSS 全量补齐,头部去 emoji 与 tag,
 *                   消费已注入的 --strip-color / --badge-* 变量
 * v26 (2026-06-13): 军报板块对齐修复 — 边框/padding/头部 对齐兄弟板块, 小标签改"军情",空态占位加金线装饰
 * v27 (2026-06-17): 工单#pcard-v3-fix-1 玩家卡 v3 视觉精修 — renderPlayerBattles/renderPlayerTransit 空态整段隐藏,移除 pc-battle-empty/pc-transit-empty 占位
 * v28 (2026-XX-XX): 工单#main-v3.40-align-B 对齐 GM 规则书 v3.40 —
 *                   [调度] 段状态映射收窄至 4 种(攻城中/交战中/客驻/剩N→march),
 *                   清理 standoff/retreat/garrison 三个死分支;
 *                   _renderWorldStatus 同步收窄。
 * v16 (2026-05-29) 军报UI 方案2:调度行/战报卡新增势力色徽章 + 左侧势力色条,与城池悬浮卡呼应
 * v15 (2026-05-25): 末尾追加特效开关栏 IIFE
 * v16 (变更): 军报板块 [在途]→[调度];武将名/攻守方按势力色染色;移除甲乙丙文字展示
 * 对接规范 v2.0：
 *  - 剧情区 / 数据区分离（36个=号分隔）
 *  - [甲][乙][丙] 含 cities_list（城名+守将）
 *  - [战报] 新格式：甲→宛城NPC | 胜 | 伤亡:攻40守180
 *  - cityOwnership 携带 holder 守将字段供地图渲染
 *  - 兼容旧格式
 * v29 (2026-10-01): 工单#achievement-engine-A1 成就系统 v1 — 50 成就 + 触发引擎 + localStorage 持久化 + Toast 提示
 * v30 (2026-10-02): 工单#achievement-ui-B1 成就 UI 重做 — 玩家卡徽章接入最稀有成就 + 模态 6 分类 tab + 灰度未解锁态
 * v31 (2026-10-03): 工单#achievement-polish-C1 成就 UI 精修 — 配色重做(白蓝紫橙) + 移动端适配 + tab 进度计数
 * v32 (2026-10-05): 工单#achievement-rename-E1 稀有度重命名 — 铜银金钻 → 常规/稀有/史诗/传说 + 炉石标准配色
 * v33 (2026-10-06): 工单#achievement-polish-F1 tab 栏去 emoji + 桌面/移动端排版修复
 * v34 (2026-10-07): 工单#achievement-expand-G1 新增 50 个成就 — 总数 100(武将组合/名城/隐藏剧情向)
 * v35 (2026-10-08): 工单#achievement-polish-H1 tab 移动端两行 + 自选展示成就 + 文案修复
 * v36 (2026-06-04): 工单#gm-data-only-mode-v1 — GM 录入支持纯数据区修复模式,
 *                    第一行匹配 [回合] 则视为纯数据;查找该回合号对应剧情区,
 *                    拼接后 PATCH 替换 raw_content,不改剧情区。
 */

(function () {
  'use strict';

  const SUPA_URL  = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/sanguo_rounds';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  const SUPA_HEADERS = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const POLL_MS  = 30000;
  const MAX_ROWS = 100;

  // ════ #sanguo-gm-gate-realtime-v1 ════
  const GM_PASSWORD = '0727';
  const SUPA_PROJECT_URL = 'https://smiifcbmmtolimtaxpip.supabase.co';
  const SUPA_TABLE_NAME  = 'sanguo_rounds';
  let _supaClient = null;
  let _realtimeChannel = null;
  let _realtimeOk = false;
  let _realtimeReloadTimer = null;

  let state = {
    rounds:        [],
    players:       defaultPlayers(),
    pollTimer:     null,
    lastUpdatedAt: 0,
    publishing:    false,
  };
  // M39-5: 暴露给 secret-bureau.js 读取回合数据
  window.SGState = state;

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
    applyGMGate();
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
      renderAll();
      startPolling();
      updateSyncStatus('online');
    } catch (e) {
      console.error('[SG] 加载失败:', e);
      updateSyncStatus('error');
    }
  }

  async function fetchAllRounds() {
    const res  = await fetchWithTimeout(`${SUPA_URL}?select=*&order=round.asc&limit=${MAX_ROWS}`, { headers: SUPA_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    state.rounds = rows.map(rowToRound).filter(Boolean);
    state.rounds.sort((a, b) => a.round - b.round);
    applyWorldInheritance(); // #sanguo-inherit-batch2-v1
    applyPlayerInheritance();// #sanguo-inherit-batch2-v1
    rebuildPlayers();
    if (rows.length) {
      state.lastUpdatedAt = Math.max(...rows.map(r => new Date(r.updated_at || 0).getTime()));
    }
  }

  // ════ #sanguo-inherit-batch2-v1 ════
  // [世界] 段继承:从上回合 world 拷贝,所有 remaining 自动 -1,
  //             剩 0 的条目剔除并打 warn。
  function applyWorldInheritance() {
    let lastWorld = null;  // 最近一个完整 [世界] 的数组拷贝(已减 1 处理)

    for (let i = 0; i < state.rounds.length; i++) {
      const rd = state.rounds[i];
      const p = rd.parsed;
      const isInherit = p.worldInherit === true;
      const roundNum = rd.round || 0;

      if (!isInherit) {
        // 完整回合:本回合 world 即为下一回合的继承基准
        lastWorld = (p.world || []).map(w => Object.assign({}, w));
      } else {
        // 继承回合:拷贝上一份并自动减 1
        if (!lastWorld) {
          console.warn('[SG] R' + roundNum + ' 写了 [世界] 同上,但无上回合快照,跳过继承');
          p.world = [];
          continue;
        }
        const inherited = [];
        lastWorld.forEach(w => {
          const copy = Object.assign({}, w);
          if (copy.remaining === Infinity || copy.remaining === '∞') {
            // ∞ 不减
            inherited.push(copy);
          } else {
            const newRem = Number(copy.remaining) - 1;
            if (newRem <= 0) {
              console.warn('[SG] R' + roundNum + ' 武将 ' + copy.name + ' 到期但 AI 未安排归宿,自动剔除');
            } else {
              copy.remaining = newRem;
              inherited.push(copy);
            }
          }
        });
        p.world = inherited;
        // 把本回合处理后的 world 作为下一回合的继承基准
        lastWorld = inherited.map(w => Object.assign({}, w));
      }
    }
  }

  // ════ #sanguo-inherit-batch2-v1 ════
  // 玩家段 城池/武将 继承:对 players 数组中的每个 player,
  //   若 citiesInherit=true,从上回合同 slot 拷贝 cities_list/ownedCities
  //   若 generalsInherit=true,从上回合同 slot 拷贝 generals
  function applyPlayerInheritance() {
    // 按 slot 缓存最近的完整快照
    const lastBySlot = { '甲': null, '乙': null, '丙': null };
    const SLOT_TO_PIDX = { '甲': 0, '乙': 1, '丙': 2 };

    for (let i = 0; i < state.rounds.length; i++) {
      const rd = state.rounds[i];
      const players = rd.parsed.players || [];

      players.forEach(pp => {
        const slot = pp.slot;
        if (!slot || !(slot in lastBySlot)) return;
        const prev = lastBySlot[slot];

        // 城池继承
        if (pp.citiesInherit && prev) {
          pp.cities_list = JSON.parse(JSON.stringify(prev.cities_list || []));
          pp.ownedCities = (pp.cities_list || []).map(c => c.name);
          if (pp.cities_list.length && !pp.city) pp.city = pp.cities_list[0].name;

          // ── 同步 cityOwnership:玩家城必须落进地图归属表 ──
          // 否则 renderMap() 走 cityOwnership 分支时,
          // NPC 城显示正常但本玩家的城会从地图上消失
          if (!rd.parsed.cityOwnership) rd.parsed.cityOwnership = {};
          const pidx = SLOT_TO_PIDX[slot];
          const playerName = pp.name || prev.name || slot;
          /* [legacy v1]
          pp.cities_list.forEach((c, ci) => {
            // 不覆盖已存在的玩家段条目(防止本回合内 troopOps 已写入的覆写)
            if (!rd.parsed.cityOwnership[c.name]) {
              rd.parsed.cityOwnership[c.name] = {
                owner:      'p' + pidx,
                playerIdx:  pidx,
                playerName: playerName,
                holder:     c.holder || '无',
                troops:     c.troops || {},
                isMulti:    ci > 0,
              };
            }
          });
          */
          // #player-inherit-override-B2:
          // 玩家段「同上」对 NPC 段错误占位享有覆盖权,
          // 仅保护"已被其他玩家占用"的城,防止两家同时声明同一城。
          // 同步清理 npcCities 里对应的脏数据,避免军报/图例计数错乱。
          pp.cities_list.forEach((c, ci) => {
            const existing = rd.parsed.cityOwnership[c.name];
            const protectedByOtherPlayer = existing
              && typeof existing.owner === 'string'
              && existing.owner.startsWith('p')
              && existing.playerIdx !== pidx;

            if (!protectedByOtherPlayer) {
              rd.parsed.cityOwnership[c.name] = {
                owner:      'p' + pidx,
                playerIdx:  pidx,
                playerName: playerName,
                holder:     c.holder || '无',
                troops:     c.troops || {},
                isMulti:    ci > 0,
              };
              // 同步从 npcCities 中剔除被错误占用的同名条目
              if (Array.isArray(rd.parsed.npcCities) && rd.parsed.npcCities.length) {
                rd.parsed.npcCities = rd.parsed.npcCities.filter(
                  npc => npc && npc.name !== c.name
                );
              }
            }
          });
        } else if (pp.citiesInherit && !prev) {
          console.warn('[SG] R' + rd.round + ' 玩家 ' + slot + ' 写了 城池:同上,但无上回合快照');
        }

        // 武将继承
        if (pp.generalsInherit && prev) {
          pp.generals = JSON.parse(JSON.stringify(prev.generals || []));
        } else if (pp.generalsInherit && !prev) {
          console.warn('[SG] R' + rd.round + ' 玩家 ' + slot + ' 写了 武将:同上,但无上回合快照');
        }

        // 更新缓存(用本回合处理后的状态作为下一回合的基准)
        lastBySlot[slot] = {
          cities_list: pp.cities_list || [],
          generals:    pp.generals    || [],
          name:        pp.name        || (prev && prev.name) || '',
        };
      });
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
      livelihood_json:     JSON.stringify(rd.parsed.transit        || []),
      city_ownership_json: JSON.stringify(rd.parsed.cityOwnership || {}),
      // [secret-bureau-fix-A] 密报数据正本清源
      secrets_json:        JSON.stringify(rd.parsed.secrets       || []),
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
        parsed: (function () {
          // #sanguo-inherit-persist-v1
          // 兜底:重新解析 raw_content,抽取 4 个 inherit 标记
          // (npcCitiesInherit / worldInherit / 玩家级 citiesInherit / generalsInherit)
          // 这些字段没有独立的 Supabase 列,从 raw_content 重新解析得来。
          // parser 抛错时退回全 false,与原硬编码默认值等价。
          let reparsed = null;
          try {
            reparsed = SGParser.parse(row.raw_content || '');
          } catch (e) {
            console.warn('[sanguo-inherit-persist-v1] 兜底解析失败:', e);
          }

          // 抽取顶层 inherit 标记
          const _worldInherit = !!(reparsed && reparsed.worldInherit);

          // 抽取玩家级 inherit 标记,按 slot 建索引
          const _playerInheritBySlot = {};
          if (reparsed && Array.isArray(reparsed.players)) {
            reparsed.players.forEach(pp => {
              if (pp && pp.slot) {
                _playerInheritBySlot[pp.slot] = {
                  citiesInherit:   !!pp.citiesInherit,
                  generalsInherit: !!pp.generalsInherit,
                };
              }
            });
          }

          // 把玩家级标记合并回 players_json 反序列化出的对象
          const _players = safeJson(row.players_json, []);
          _players.forEach(pp => {
            if (pp && pp.slot && _playerInheritBySlot[pp.slot]) {
              pp.citiesInherit   = _playerInheritBySlot[pp.slot].citiesInherit;
              pp.generalsInherit = _playerInheritBySlot[pp.slot].generalsInherit;
            }
          });

          return {
            round:         row.round,
            rawDigest:     row.raw_digest      || row.raw_content || '',
            digest:        row.digest          || '',
            players:       _players,
            battles:       safeJson(row.battles_json,          []),
            transit:       safeJson(row.livelihood_json,        []),
            changes:       safeJson(row.changes_json,          []),
            cityOwnership: safeJson(row.city_ownership_json,  {}),
            worldInherit:     _worldInherit,  // #sanguo-inherit-persist-v1
            // livelihood 列已复用为 transit_json,旧路径置空
            livelihood:    [],
            situation:     row.situation  || '',
            events:        safeJson(row.events_json, []),
            narration:     row.narration  || '',
            // [secret-bureau-fix-C] secrets 兜底
            secrets: (function () {
              if (row.secrets_json) {
                return safeJson(row.secrets_json, []);
              }
              return (reparsed && Array.isArray(reparsed.secrets)) ? reparsed.secrets : [];
            })(),
            // [world-3] world 兜底
            world: (reparsed && Array.isArray(reparsed.world)) ? reparsed.world : [],
          };
        })(),
        rawContent: row.raw_content || '',
        _apiId:     row.id,
      };
    } catch (e) { return null; }
  }

  function safeJson(str, fallback) {
    try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
  }

  function startPolling() {
    const realtimeStarted = trySetupRealtime();
    if (state.pollTimer) clearInterval(state.pollTimer);
    const interval = realtimeStarted ? 60000 : POLL_MS;
    state.pollTimer = setInterval(pollForUpdates, interval);
  }

  // ════ #sanguo-gm-gate-realtime-v1 ════
  function applyGMGate() {
    let pwd = '';
    try {
      const params = new URLSearchParams(window.location.search);
      pwd = (params.get('gm') || '').trim();
    } catch (e) { pwd = ''; }
    const isGM = (pwd === GM_PASSWORD);
    document.body.classList.toggle('is-gm-mode', isGM);
    document.body.classList.toggle('is-viewer-mode', !isGM);
    if (!isGM) {
      document.querySelectorAll('.gm-nav-btn').forEach(b => { b.style.display = 'none'; });
      const tabGm = document.getElementById('tab-gm');
      if (tabGm) {
        tabGm.style.display = 'none';
        tabGm.classList.remove('active');
      }
      try {
        document.querySelectorAll('.nav-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.tab === 'arena');
        });
        document.querySelectorAll('.tab-panel').forEach(p => {
          p.classList.toggle('active', p.id === 'tab-arena');
        });
      } catch (e) {}
    }
  }

  function trySetupRealtime() {
    if (typeof window.supabase === 'undefined' ||
        typeof window.supabase.createClient !== 'function') {
      console.warn('[SG] Supabase 客户端库未加载,继续轮询');
      return false;
    }
    try {
      _supaClient = window.supabase.createClient(SUPA_PROJECT_URL, SUPA_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } },
      });
      _realtimeChannel = _supaClient
        .channel('sanguo-rounds-changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: SUPA_TABLE_NAME },
          function () { _realtimeReloadDebounced(); })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            _realtimeOk = true;
            console.log('[SG] Realtime 就绪');
            updateSyncStatus('online');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            _realtimeOk = false;
            console.warn('[SG] Realtime 异常降级:', status);
          }
        });
      return true;
    } catch (e) {
      console.error('[SG] Realtime 初始化失败:', e);
      _realtimeOk = false;
      return false;
    }
  }

  function _realtimeReloadDebounced() {
    if (_realtimeReloadTimer) clearTimeout(_realtimeReloadTimer);
    _realtimeReloadTimer = setTimeout(async function () {
      _realtimeReloadTimer = null;
      try {
        updateSyncStatus('updating');
        await fetchAllRounds();
        renderAll();
        showToast('🔄 战局已更新!');
        updateSyncStatus('online');
      } catch (e) {
        console.error('[SG] Realtime 重载失败:', e);
        updateSyncStatus('error');
      }
    }, 800);
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
  }

  // ════ #gm-data-only-mode-v1 ════
  // 判断 GM 输入是否为"纯数据区模式":去掉首尾空白后,
  // 第一个非空行匹配 ^\[回合\] 即为纯数据区
  function _isDataOnlyMode(raw) {
    if (!raw) return false;
    const t = String(raw).trim();
    if (!t) return false;
    // 找第一行非空内容
    const firstLine = t.split('\n').find(l => l.trim().length > 0);
    if (!firstLine) return false;
    return /^\[回合\]/.test(firstLine.trim());
  }

  // 从一段完整 raw_content 中切出剧情区(36 等号分隔线之前的部分)
  // 若无分隔线则返回整段
  function _extractStoryZone(rawContent) {
    if (!rawContent) return '';
    const SEP36 = '='.repeat(36);
    const idx = rawContent.indexOf(SEP36);
    if (idx === -1) {
      // 兜底:整段视为剧情区
      return rawContent;
    }
    // 保留分隔线之前的部分(含末尾换行)
    return rawContent.slice(0, idx);
  }

  function onPreview() {
    /* [legacy v1]
    const raw = document.getElementById('gm-content').value.trim();
    if (!raw) { showToast('⚠️ 请先粘贴内容'); return; }
    const parsed = SGParser.parse(raw);
    showParsePreview(parsed);
    */
    /* #gm-data-only-mode-v1: 预览也分两路 */
    const raw = document.getElementById('gm-content').value.trim();
    if (!raw) { showToast('⚠️ 请先粘贴内容'); return; }

    if (_isDataOnlyMode(raw)) {
      const headM = raw.match(/\[回合\]\s*\n?\s*第\s*(\d+)\s*回合/);
      if (!headM) { showToast('⚠️ 纯数据区模式需含「[回合] 第 N 回合」头'); return; }
      const roundNum = parseInt(headM[1], 10);
      const existing = state.rounds.find(r => r.round === roundNum);
      if (!existing) {
        showToast(`⚠️ 第 ${roundNum} 回合尚未发布,纯数据区模式仅用于修复已有回合`);
        return;
      }
      const storyZone = _extractStoryZone(existing.rawContent || '');
      const SEP36 = '='.repeat(36);
      const finalRaw = (storyZone.replace(/\n+$/, '')) + '\n' + SEP36 + '\n' + raw.trim();
      const parsed = SGParser.parse(finalRaw);
      parsed.round = roundNum;
      parsed._dataOnlyMode = true;  // 给 showParsePreview 一个标记
      showParsePreview(parsed);
    } else {
      const parsed = SGParser.parse(raw);
      showParsePreview(parsed);
    }
  }

  async function onPublish() {
    if (state.publishing) return;
    const raw = document.getElementById('gm-content').value.trim();
    if (!raw) { showToast('⚠️ 内容不能为空'); return; }

    // 回合号：优先使用解析到的剧情标题回合数，失败则自动递增
    const nextRound = state.rounds.length
      ? state.rounds[state.rounds.length - 1].round + 1
      : 1;

    /* [legacy v1] 原版只接受完整剧情+数据;现在分两路:完整模式 vs 纯数据修复模式
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
    */
    /* #gm-data-only-mode-v1 */
    const isDataOnly = _isDataOnlyMode(raw);
    let finalRaw = raw;        // 最终送进 publishRound 的 raw_content
    let parsed = null;
    let roundNum = nextRound;

    if (isDataOnly) {
      // 纯数据区模式:先从数据区里嗅探回合号
      const headM = raw.match(/\[回合\]\s*\n?\s*第\s*(\d+)\s*回合/);
      if (!headM) {
        showToast('⚠️ 纯数据区模式需含「[回合] 第 N 回合」头');
        return;
      }
      roundNum = parseInt(headM[1], 10);
      // 查找该回合是否已存在
      const existing = state.rounds.find(r => r.round === roundNum);
      if (!existing) {
        showToast(`⚠️ 第 ${roundNum} 回合尚未发布,纯数据区模式仅用于修复已有回合`);
        return;
      }
      // 用旧剧情区 + 新数据区拼接
      const storyZone = _extractStoryZone(existing.rawContent || '');
      const SEP36 = '='.repeat(36);
      // 拼接格式:剧情 + 换行 + 36等号 + 换行 + 数据
      finalRaw = (storyZone.replace(/\n+$/, '')) + '\n' + SEP36 + '\n' + raw.trim();
      parsed = SGParser.parse(finalRaw);
      parsed.round = roundNum;
    } else {
      // 完整模式:走原流程
      parsed = SGParser.parse(raw);
      const detectedRound = Number.isInteger(parsed.round) ? parsed.round : parseInt(parsed.round, 10);
      roundNum = Number.isInteger(detectedRound) && detectedRound > 0 ? detectedRound : nextRound;
      parsed.round = roundNum;
    }

    state.publishing = true;
    const btn = document.getElementById('btn-publish');
    btn.disabled = true; btn.textContent = isDataOnly ? '⏳ 修复数据中…' : '⏳ 发布中…';

    try {
      const rd = { round: roundNum, roundTitle: '', parsed, rawContent: finalRaw };
      await publishRound(rd);
      await fetchAllRounds();
      renderAll();
      switchTab('arena');

      document.getElementById('gm-content').value = '';
      document.getElementById('parse-preview').classList.add('hidden');

      updateUndoBtn();
      /* [legacy v1] showToast(`✅ 第 ${roundNum} 回合已发布！`); */
      /* #gm-data-only-mode-v1: 区分两种模式的成功提示 */
      showToast(isDataOnly
        ? `🔧 第 ${roundNum} 回合数据已修复(剧情区保留)`
        : `✅ 第 ${roundNum} 回合已发布！`);
    } catch (e) {
      console.error('[SG] 发布失败:', e);
      /* [legacy v1] showToast('❌ 发布失败，请检查网络'); */
      /* #gm-data-only-mode-v1 */
      showToast(isDataOnly ? '❌ 修复失败,请重试' : '❌ 发布失败,请检查网络');
    } finally {
      state.publishing = false;
      /* [legacy v1] btn.textContent = '🚀 发布回合'; */
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
      state.rounds = []; state.players = defaultPlayers();
      if (window.SGAch && typeof window.SGAch.clearAll === 'function') window.SGAch.clearAll();
      state.lastUpdatedAt = 0;
      renderAll();
      updateUndoBtn();
      showToast('🗑️ 所有记录已清空');
    } catch (e) { showToast('❌ 清空失败，请重试'); }
  }

  // ════ #sanguo-history-rollback-v1 ════
  // 回滚到指定回合:云端删除该回合之后的所有回合,本地重拉。
  // 仅 GM 模式下可触发(按钮本身在 GM 视角才会出现)。
  async function onRollbackToRound(targetRound) {
    if (!Number.isInteger(targetRound)) return;
    const after = state.rounds.filter(r => r.round > targetRound);
    if (!after.length) {
      showToast('⚠️ 该回合已是最新,无需回滚');
      return;
    }
    const cnt = after.length;
    if (!confirm(`确认回滚到第 ${targetRound} 回合?\n之后的 ${cnt} 个回合(第 ${after[0].round}-${after[after.length-1].round} 回合)将从云端永久删除,不可撤销。`)) {
      return;
    }
    showToast('⏳ 回滚中…');
    try {
      // 并发删除所有更晚的回合
      const tasks = after.map(rd => {
        const apiId = rd._apiId;
        if (!apiId) return Promise.resolve();
        return deleteRoundById(apiId).catch(e => {
          console.warn('[SG] 回滚删除失败 R' + rd.round, e);
        });
      });
      await Promise.all(tasks);
      await fetchAllRounds();
      renderAll();
      updateUndoBtn();
      showToast(`↩️ 已回滚至第 ${targetRound} 回合`);
    } catch (e) {
      console.error('[SG] 回滚失败:', e);
      showToast('❌ 回滚失败,请刷新重试');
    }
  }

  // 暴露给历史面板按钮 onclick 调用
  window.__rollbackToRound = onRollbackToRound;

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

      /* [legacy v1]
      renderMap();
      renderWorld(latest);
      renderChangesDetail();
      */

      renderMap();
      renderWorld(latest);
      renderJunbao(latest);    // #battle-splitblock-fix-v1: 补回军报板块渲染调用
      renderChangesDetail();
      renderHistorySection();
    }
    updateFooter();
    updateUndoBtn();
    // M39-5: 广播回合更新事件,触发密报阁重渲染
    try {
      window.dispatchEvent(new CustomEvent('sg-rounds-updated'));
    } catch (e) { /* 兜底,不影响主流程 */ }
  }

// ─────────────────────────────────────────
// 任事调度板块渲染 v1
// 数据源:cityOwnership[城].productionBuffs + players[i].generals
// 熟练度:遍历 state.rounds 反推已挂回合数
// ─────────────────────────────────────────
  // ── 势力地图 ──


  // 战况嫁接渲染（按攻方 slot 归到对应玩家卡）
  // v20260617a 工单#pcard-v3-fix-1:
  //  - 空态:整个 <details> 加 .hidden,连标题都不显示
  //  - 有内容:显示但不主动 open(默认 closed,由 HTML 已删 open 属性保证)
  //  - 不再渲染 .pc-battle-empty 占位
  // ─────────────────────────────────────────
  // 调度行兵种显示辅助 v1 #transit-multitroop-display-fix-v1
  // 优先读 t.troopEntries(parser v18+,保序数组),
  // 降级兜底 t.troopType / t.troopCount(单兵种向后兼容)。
  // 返回示例:
  //   多兵种 → "步 2300 · 水 1005"
  //   单兵种 → "步 2300"
  //   零数据 → ""
  // ─────────────────────────────────────────
  function _formatTransitTroops(t) {
    if (!t) return '';
    // v18 多兵种保序数组
    if (Array.isArray(t.troopEntries) && t.troopEntries.length) {
      const parts = [];
      t.troopEntries.forEach(e => {
        if (!e || !e.type) return;
        const n = Number(e.count) || 0;
        if (n <= 0) return;
        parts.push(esc(e.type) + ' ' + n);
      });
      if (parts.length) return parts.join(' · ');
    }
    // 兜底:t.troops 对象形式(parser v18+ 同时输出)
    if (t.troops && typeof t.troops === 'object') {
      const parts = [];
      Object.keys(t.troops).forEach(k => {
        const n = Number(t.troops[k]) || 0;
        if (n <= 0) return;
        parts.push(esc(k) + ' ' + n);
      });
      if (parts.length) return parts.join(' · ');
    }
    // 最终兜底:旧单兵种字段
    if (t.troopType && t.troopCount != null) {
      const n = Number(t.troopCount) || 0;
      if (n > 0) return esc(t.troopType) + ' ' + n;
    }
    return '';
  }


  // 在途部队嫁接渲染（按 slot 归到对应玩家卡）
  // v20260617a 工单#pcard-v3-fix-1:
  //  - 空态:整个 <details> 加 .hidden,连标题都不显示
  //  - 有内容:显示但不主动 open(默认 closed,由 HTML 已删 open 属性保证)
  //  - 不再渲染 .pc-transit-empty 占位
  // 在途部队嫁接渲染 v20260628a
  // 数据源:parser _parseTransit 输出
  //   { faction, slot(0/1/2|null), general, from, to, troopType, troopCount, status, note }
  // 归属规则:
  //   1) t.slot === slot       → 玩家自己的调度
  //   2) t.slot === null 且 t.to ∈ 当前玩家城池列表 → NPC 朝该玩家来的调度(标记为 NPC 行)
  // 状态映射:
  //   '围攻中' → siege  (红色色条)
  //   '客驻'   → guest  (蓝色色条)
  //   '剩N' 或其他 → march (暗金色条)
  // NPC 行额外加 .is-npc class,色条强制为红色(NPC 来攻)
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

    SGMap.update(state.players, cityMap,
      latestParsed?.transit  || [],
      latestParsed?.battles  || []);
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
    const playerTotal   = Object.values(cm).filter(o => o.owner !== '' && o.owner !== 'npc').length;
    const namedNpcTotal = Object.values(cm).filter(o => o.owner === 'npc' && o.faction != null).length;
    // 群雄 = 总城数 - 玩家城 - 有名NPC势力城（faction有值的），无主/无名城归群雄
    const qhCnt         = 60 - playerTotal - namedNpcTotal;
    html += `<span class="sgmap-legend-item">
      <span class="sgmap-legend-dot" style="background:#9a7c3e;box-shadow:0 0 4px #c09050"></span>
      <span style="color:#c09050;font-weight:700">群雄</span>
      <span style="color:var(--text-dim);font-size:.65rem"> ${qhCnt}城</span>
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
        let inner = '';

        // ── 主行动条目：玩家名与标题合并为同行小标题 ──
        if (grp.titleText) {
          const { name, desc } = splitDash(grp.titleText);
          let subtitleHtml = `<span class="raw-player-subtitle">${highlightInline(name)}`;
          if (desc) {
            subtitleHtml += `<span class="dash">\u2014\u2014</span><span class="desc">${highlightInline(desc)}</span>`;
          }
          subtitleHtml += `</span>`;

          inner += `
<div class="raw-player-anchor with-subtitle">
  <span class="raw-player-name action-player-tag" data-slot="${sl}">${esc(grp.name)}</span>
  <span class="raw-player-sep">·</span>
  ${subtitleHtml}
</div>`.trim();
        } else {
          inner += `<div class="action-player-tag" data-slot="${sl}">${esc(grp.name)}</div>`;
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

      // ── 回合大标题:第 N 回合 · 四字标题 (ROUND-TITLE-A3-MEDIUM-v1) ──
      // 匹配 GM 规则书 v3.40 格式:行首"第" + 空格 + 数字 + 空格 + "回合"
      //                          + 空格 + 中间隔号·或半角· + 空格 + 标题文字
      // 容差:数字两侧空格可省、间隔号支持中点·(U+00B7)/全角·/半角·,
      //       标题文字长度 1-12 汉字。
      const roundTitleM = t.trim().match(
        /^第\s*(\d+)\s*回合\s*[·\u00B7\u30FB\u2027]\s*([\u4e00-\u9fa5]{1,12})\s*$/
      );
      if (roundTitleM) {
        flushPara();
        flushCard();
        const _rtNum   = roundTitleM[1];
        const _rtTitle = roundTitleM[2];
        out.push(
          '<h3 class="raw-round-title">' +
            '<span class="rrt-prefix">第</span>' +
            '<span class="rrt-num">' + esc(_rtNum) + '</span>' +
            '<span class="rrt-suffix">回合</span>' +
            '<span class="rrt-sep">·</span>' +
            '<span class="rrt-title">' + esc(_rtTitle) + '</span>' +
          '</h3>'
        );
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

        const nextLineRaw = lines[i + 1] || '';
        const nextLine = nextLineRaw.trim().replace(/^[【\[][^】\]\n]{1,12}[】\]]\s*/, '');

        const isActionSubtitle = s => {
          if (!s) return false;
          if (s.length > 30) return false;
          if (/[。！？；,，.!?;]/.test(s)) return false;

          const t = s.trim();
          const isPNameCheck = t.length >= 1 && t.length <= 10
            && !/[：:①②③④⑤⑥]/.test(t)
            && !/^[\s\u3000]/.test(t)
            && !/^[📍🔖💡⏳🎯🌍⚡📢🔥📜🎴🌐⚔️🏯🌅🌙•·▪▸▶◆◇■□=─═—]/.test(t);
          if (isPNameCheck || PLAYER_RE.test(s)) return false;

          if (/^[📍🔖💡⏳🎯🌍⚡📢🔥📜🎴🌐⚔️🏯🌅🌙•·▪▸▶◆◇■□=─═—]/.test(s)) return false;
          if (/^[①②③④⑤⑥]/.test(s) || /^[A-Ca-c][.．、：:\s]/.test(s)) return false;
          if (/^[=─═—]{3,}$/.test(s)) return false;
          return true;
        };

        if (isActionSubtitle(nextLine)) {
          const anchorHtml = `<div class="raw-player-anchor with-subtitle">
            <span class="raw-player-name">${highlightInline(tLine)}</span>
            <span class="raw-player-sep">·</span>
            <span class="raw-player-subtitle">${esc(nextLine)}</span>
          </div>`;
          if (currentCard) {
            currentCard.lines.push(anchorHtml);
          } else {
            out.push(anchorHtml);
          }
          i++;
        } else {
          if (currentCard) {
            currentCard.lines.push(`<div class="raw-player">${highlightInline(tLine)}</div>`);
          } else {
            out.push(`<div class="raw-player">${highlightInline(tLine)}</div>`);
          }
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

  // ══════════════════════════════════════════
  //  玩家势力卡 + 行动选项
  // ══════════════════════════════════════════
  function renderPlayerCards() {
    const latestPlayers = state.rounds.length
      ? (state.rounds[state.rounds.length - 1].parsed.players || [])
      : [];
    const latest = state.rounds.length ? state.rounds[state.rounds.length - 1] : null;
    const changes = latest && latest.parsed.changes ? latest.parsed.changes : [];

    // 从最新回合原始文本提取各玩家称号（格式：【玩家名】称号 或 玩家名·称号）
    const _extractTitles = () => {
      const raw = (latest && latest.rawContent) || '';
      const titleMap = {}; // name → title
      const SEP36 = '='.repeat(36);
      // 仅看剧情区（分隔线上方），避免数据区干扰
      const storyZone = raw.includes(SEP36) ? raw.split(SEP36)[0] : raw;
      // 格式A：【玩家名】称号 —— 取行首
      storyZone.split('\n').forEach(line => {
        const t = line.replace(/<[^>]+>/g, '').trim();
        const mB = t.match(/^[【\[]([^】\]]{1,12})[】\]]\s+(.{1,12})$/);
        if (mB && mB[2]) { titleMap[mB[1]] = mB[2].trim(); return; }
        // 格式B：玩家名·称号
        const mD = t.match(/^([^\s:：·\u30fb\u2022\d第]{1,6})\s*[·\u30fb\u2022]\s*(.{1,12})$/);
        if (mD && mD[2]) { titleMap[mD[1]] = mD[2].trim(); }
      });
      return titleMap;
    };
    const titleMap = _extractTitles();

    state.players.forEach((p, i) => {
      setTxt(`pname-${i}`, p.name || `城主${['甲','乙','丙'][i]}`);
      // 称号：写入隐藏 span 供加密行动模块读取
      const titleEl = document.getElementById(`ptitle-${i}`);
      if (titleEl) titleEl.textContent = (p.name && titleMap[p.name]) || '';

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

      // 工单#achievement-ui-B1: 玩家卡徽章渲染（取最稀有成就）
      _renderAchSlot(i);
    });
  }

  // 工单#achievement-ui-B1: 渲染单个玩家卡的成就徽章
  function _renderAchSlot(slot) {
    const slotEl = document.getElementById('pc-ach-slot-' + slot);
    if (!slotEl) return;
    const titleEl = slotEl.querySelector('.ach-title');
    const countEl = slotEl.querySelector('.ach-count');
    if (!titleEl || !countEl) return;

    let best = null;
    let unlockedCount = 0;
    if (window.SGAch && typeof window.SGAch.getHighestRarity === 'function') {
      best = window.SGAch.getHighestRarity(slot);
      const arr = (typeof window.SGAch.getUnlocked === 'function')
        ? window.SGAch.getUnlocked(slot) : [];
      unlockedCount = arr.length;
    }

    // 清除旧稀有度 class
    titleEl.classList.remove('rar-bronze','rar-silver','rar-gold','rar-diamond','rar-none');

    if (best) {
      titleEl.classList.add('rar-' + best.rar);
      titleEl.textContent = best.name;
    } else {
      titleEl.classList.add('rar-none');
      titleEl.textContent = '初出茅庐';
    }
    countEl.textContent = unlockedCount;
  }

  function renderGenList(idx, generals) {
    const listEl = document.getElementById(`gen-list-${idx}`);
    if (!listEl) return;
    if (!generals || !generals.length) {
      listEl.innerHTML = '<span class="gen-empty">——</span>';
      return;
    }
    listEl.innerHTML = generals.map(g => buildGenTag(g, idx)).join('');
  }

  // ── 武将状态颜色（按钮颜色完全由状态决定，不区分稀有度）
  var GEN_STATUS_STYLES = {
    healthy:{ bg:'rgba(0,50,0,.30)',    bd:'rgba(0,160,70,.45)',   c:'#7ddd7d',  bc:'rgba(0,160,70,.22)'  },
    tired:  { bg:'rgba(70,50,0,.30)',   bd:'rgba(200,155,0,.45)',  c:'#d4b040',  bc:'rgba(200,155,0,.18)' },
    injured:{ bg:'rgba(70,0,0,.30)',    bd:'rgba(200,40,0,.45)',   c:'#e07070',  bc:'rgba(200,40,0,.18)'  },
    sick:   { bg:'rgba(42,0,60,.30)',   bd:'rgba(150,0,190,.45)',  c:'#cc80ee',  bc:'rgba(150,0,190,.18)' },
    dead:   { bg:'rgba(18,18,18,.42)',  bd:'rgba(60,60,60,.35)',   c:'#686868',  bc:'rgba(60,60,60,.15)'  }
  };

  // 武将胶囊势力色（v20260616a：胶囊背景按 slot，状态由左色条 CSS 表达）
  var GEN_FACTION_STYLES = {
    0: { bg:'rgba(231,76,60,.10)',  bd:'rgba(231,76,60,.40)',  c:'#ec9a8e' },  // 红
    1: { bg:'rgba(61,190,108,.10)', bd:'rgba(61,190,108,.40)', c:'#9ad9b3' },  // 绿
    2: { bg:'rgba(52,152,219,.10)', bd:'rgba(52,152,219,.40)', c:'#8ec5e8' },  // 蓝
  };

  function genStatusKey(s) {
    if (!s) return 'healthy';
    if (/疲劳|疲/.test(s))    return 'tired';
    if (/受伤|伤/.test(s))    return 'injured';
    if (/患病|病/.test(s))    return 'sick';
    if (/阵亡|亡|死/.test(s)) return 'dead';
    return 'healthy';
  }

  function buildGenTag(g, slot) {
    // 势力色：slot 0/1/2 → 红/绿/蓝；其他兜底用旧状态色
    var fc = GEN_FACTION_STYLES[slot] || GEN_STATUS_STYLES.healthy;

    // inline 仅注入颜色三项（背景/边框/字色），形态与状态色条由 CSS 负责
    var wrapStyle = 'background-color:' + fc.bg + ';'
      + 'border:1px solid ' + fc.bd + ';'
      + 'color:' + fc.c + ';';

    return '<span class="gen-tag" data-status="' + esc(g.status || '健康')
      + '" data-name="' + esc(g.name) + '">'
      + esc(g.name)
      + '</span>';
  }



  // ══════════════════════════════════════════
  //  收支详情渲染 v4.1 (工单 #pcard-v4-fix-C)
  //  字段对齐真实 parser 输出:
  //  - changes 是数组,每个 slot 出现两次:
  //      a) 详细块:含 breakdown {资源名:{items:[{label,val}], total}}, intel(数组)
  //      b) 总账行:含 resources {资源名:数字}, breakdown 为空对象
  //  - 本函数策略:遍历找到每个 slot 的"详细块"(breakdown 非空),
  //    并用"总账行" resources 补足 breakdown 缺失的资源(只显示合计,无明细)
  // ══════════════════════════════════════════
  function renderChangesDetail() {
    const latest = state.rounds[state.rounds.length - 1];
    if (!latest) return;
    const allChanges = (latest.parsed && latest.parsed.changes) || [];

    // 按 slot 聚合:detailMap[slot] = 详细块, totalMap[slot] = 总账块
    const detailMap = { '甲': null, '乙': null, '丙': null };
    const totalMap  = { '甲': null, '乙': null, '丙': null };
    allChanges.forEach(ch => {
      if (!ch || !ch.slot) return;
      const hasBreakdown = ch.breakdown && Object.keys(ch.breakdown).length > 0;
      if (hasBreakdown) {
        detailMap[ch.slot] = ch;
      } else if (ch.resources && Object.keys(ch.resources).length > 0) {
        totalMap[ch.slot] = ch;
      }
    });

    const SLOT_NAMES = ['甲', '乙', '丙'];
    const RES_DEFS = [
      { key: '金',   emoji: '💰' },
      { key: '粮',   emoji: '🌾' },
      { key: '兵',   emoji: '🛡️' },
      { key: '民心', emoji: '❤️' },
      { key: '城',   emoji: '🏯' },
    ];

    SLOT_NAMES.forEach((slotName, slotIdx) => {
      const listEl  = document.getElementById('pc-changes-list-' + slotIdx);
      const sumEl   = document.getElementById('pc-changes-sum-' + slotIdx);
      const intelEl = document.getElementById('pc-changes-intel-' + slotIdx);
      if (!listEl || !sumEl) return;

      const detail = detailMap[slotName];
      const total  = totalMap[slotName];

      if (!detail && !total) {
        listEl.innerHTML = '<div class="no-battle">— 暂无数据 —</div>';
        sumEl.textContent = '—';
        sumEl.className = 'pcs-count';
        if (intelEl) intelEl.classList.add('hidden');
        return;
      }

      // 每种资源:优先用 detail.breakdown,缺失时回落到 total.resources
      const rowsHtml = RES_DEFS.map(def => {
        const bd = detail && detail.breakdown && detail.breakdown[def.key];
        let items = [];
        let sum = 0;

        if (bd && Array.isArray(bd.items) && bd.items.length) {
          // 详细明细可用
          items = bd.items.map(it => ({
            label: it.label || '',
            val:   Number(it.val) || 0,
            note:  it.note || '',
          }));
          sum = (typeof bd.total === 'number')
            ? bd.total
            : items.reduce((a, b) => a + b.val, 0);
        } else if (total && total.resources && total.resources[def.key] != null) {
          // 仅总账有值,无明细
          sum = Number(total.resources[def.key]) || 0;
        } else {
          // 完全无变动
          sum = 0;
        }

        /* [legacy v1] 不含 note,仅渲染 label + val 胶囊
        const itemsHtml = items.length
          ? items.map(it => {
              const cls = it.val > 0 ? 'pos' : (it.val < 0 ? 'neg' : 'zero');
              const sign = it.val > 0 ? '+' : '';
              const valTxt = it.val === 0 ? '±0' : (sign + it.val);
              return '<span class="pcc-item"><span class="pcc-label">' + esc(it.label) +
                     '</span><span class="pcc-val ' + cls + '">' + valTxt + '</span></span>';
            }).join('')
          : '<span class="pcc-item"><span class="pcc-label">无变动</span><span class="pcc-val zero">±0</span></span>';
        */

        /* #changes-note-expose-v1: item.note 存在时,在胶囊后追加副标题元素。
           note 为空(或字段不存在)时,胶囊渲染与旧版完全一致。
           CSS 类 .pcc-note 由改动 3 定义。 */
        const itemsHtml = items.length
          ? items.map(it => {
              const cls = it.val > 0 ? 'pos' : (it.val < 0 ? 'neg' : 'zero');
              const sign = it.val > 0 ? '+' : '';
              const valTxt = it.val === 0 ? '±0' : (sign + it.val);
              const noteHtml = it.note
                ? '<span class="pcc-note">' + esc(it.note) + '</span>'
                : '';
              return '<span class="pcc-item"><span class="pcc-label">' + esc(it.label) +
                     '</span><span class="pcc-val ' + cls + '">' + valTxt + '</span>' +
                     noteHtml + '</span>';
            }).join('')
          : '<span class="pcc-item"><span class="pcc-label">无变动</span><span class="pcc-val zero">±0</span></span>';

        const sumCls = sum > 0 ? 'pos' : (sum < 0 ? 'neg' : 'zero');
        const sumSign = sum > 0 ? '+' : '';
        const sumTxt = sum === 0 ? '±0' : (sumSign + sum);

        return '<div class="pc-changes-row">' +
                 '<span class="pcc-icon">' + def.emoji + '</span>' +
                 '<span class="pcc-detail">' + itemsHtml + '</span>' +
                 '<span class="pcc-sum ' + sumCls + '">' + sumTxt + '</span>' +
               '</div>';
      }).join('');

      listEl.innerHTML = rowsHtml;

      // 顶部徽:净金粮变化(优先 total.resources,回落到 detail.breakdown.total)
      let netGold = 0, netFood = 0;
      if (total && total.resources) {
        netGold = Number(total.resources['金']) || 0;
        netFood = Number(total.resources['粮']) || 0;
      } else if (detail && detail.breakdown) {
        netGold = (detail.breakdown['金'] && detail.breakdown['金'].total) || 0;
        netFood = (detail.breakdown['粮'] && detail.breakdown['粮'].total) || 0;
      }
      const net = netGold + netFood;
      const netCls = net > 0 ? 'is-positive' : (net < 0 ? 'is-negative' : '');
      const netSign = net > 0 ? '+' : '';
      sumEl.textContent = '净 ' + (net === 0 ? '±0' : netSign + net);
      sumEl.className = 'pcs-count ' + netCls;

      // 情报(intel 是数组,合并为字符串)
      if (intelEl) {
        const intelArr = (detail && Array.isArray(detail.intel)) ? detail.intel : [];
        const intelText = intelArr.filter(Boolean).join(';').trim();
        if (intelText) {
          intelEl.textContent = intelText;
          intelEl.classList.remove('hidden');
        } else {
          intelEl.classList.add('hidden');
        }
      }
    });
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

    // #sanguo-history-rollback-v1 — 仅 GM 模式渲染回滚按钮
    const isGM = document.body.classList.contains('is-gm-mode');
    tabBar.innerHTML = state.rounds.map(rd => {
      const rollbackBtn = isGM
        ? `<button class="hround-rollback-btn"
            title="回滚到此回合,删除之后的回合"
            onclick="event.stopPropagation();window.__rollbackToRound(${rd.round})"
            style="margin-left:2px;padding:2px 6px;font-size:.65rem;
                   background:rgba(80,30,30,.7);color:#f0a8a8;
                   border:1px solid rgba(180,60,60,.5);border-radius:3px;
                   cursor:pointer;vertical-align:middle">↩</button>`
        : '';
      return `<span class="hround-btn-group" style="display:inline-block;margin:2px">
        <button class="hround-btn" onclick="window.__showHistoryRound(${rd.round})">
          第${rd.round}回合
        </button>${rollbackBtn}
      </span>`;
    }).join('');

    const latest = state.rounds[state.rounds.length - 1];
    content.innerHTML = buildHistoryRoundHTML(latest);
    const btns = tabBar.querySelectorAll('.hround-btn');
    if (btns.length) btns[btns.length - 1].classList.add('active');
  }

  // ══════════════════════════════════════════
  //  军报板块渲染 v1 · 方案二(势力徽章 + 色条)
  //  数据源:latest.parsed.transit / latest.parsed.battles
  //  色源:  SGMap.P_COLOR(玩家)/ SGMap.getFactionColor(NPC)
  // ══════════════════════════════════════════
  function renderJunbao(latest) {
    const block = document.getElementById('block-junbao');
    const body  = document.getElementById('junbao-body');
    if (!block || !body) return;

    const parsed  = latest && latest.parsed ? latest.parsed : {};
    const transit = Array.isArray(parsed.transit) ? parsed.transit : [];
    const battles = Array.isArray(parsed.battles) ? parsed.battles : [];

    // v27 (2026-05-26): 调度+战报均为空时隐藏整块
    const _block = document.getElementById('block-junbao');
    if (_block) {
      const _hasTransit = (transit && transit.length > 0);
      const _hasBattles = (battles && battles.length > 0);
      if (!_hasTransit && !_hasBattles) {
        _block.classList.add('hidden');
        return;
      } else {
        _block.classList.remove('hidden');
      }
    }

    // 无调度也无战报 → 整块隐藏
    if (!transit.length && !battles.length) {
      block.classList.add('hidden');
      body.innerHTML = '';
      return;
    }
    block.classList.remove('hidden');

    const html = [];

    // ── 调度部队段 ──
    html.push('<div class="jbt-title">调度</div>');
    if (transit.length) {
      html.push('<div class="jbt-list">');
      transit.forEach(t => {
        const sideColor = _junbaoGetSideColor(t.slot, t.faction);
        const badgeText = _junbaoGetBadgeText(t.slot, t.faction);
        // v28 (2026-XX): 对齐 GM 规则书 v3.40 M-29 红线九,
        // 状态白名单收窄至 4 种;旧词由 parser 归一化处理,UI 不再兜底。
        const statusCls = t.status === '攻城中' ? 'jbt-siege'
                        : t.status === '交战中' ? 'jbt-battle'
                        : t.status === '客驻'   ? 'jbt-resident'
                        : 'jbt-march';  // 剩N 走 jbt-march
        const styleStr = [
          `--strip-color:${sideColor.glow}`,
          `--badge-bg:${sideColor.film}`,
          `--badge-border:${sideColor.stroke}`,
          `--badge-color:${sideColor.glow}`
        ].join(';');
        html.push(`
          <div class="jbt-row ${statusCls}" style="${styleStr}">
            <div class="jbt-strip"></div>
            <div class="jbt-inner">
              <span class="jbt-faction-badge">${esc(badgeText)}</span>
              <span class="jbt-general">${esc(t.general || '')}</span>
              <span class="jbt-route">${esc(t.from || '')}<span class="jbt-arrow">›</span>${esc(t.to || '')}</span>
              <!-- [legacy v14] note 追加在徽章群之后,语义错位 -->
              <!-- <span class="jbt-troop">\${esc(t.troopType || '')} \${t.troopCount || 0}</span> -->
              <!-- <span class="jbt-status">\${esc(t.status || '')}</span> -->
              <!-- \${t.note ? \`<span class="jbt-note">\${esc(t.note)}</span>\` : ''} -->
              <!-- v15 (2026-05-26): note 紧贴路径,使用 ↪ 引导符,语义自洽 -->
              ${t.note ? `<span class="jbt-note">↪ ${esc(t.note)}</span>` : ''}
              <span class="jbt-troop">${_formatTransitTroops(t)}</span>
              <span class="jbt-status">${esc(t.status || '')}</span>
            </div>
          </div>
        `);
      });
      html.push('</div>');
    } else {
      html.push('<div class="jbt-empty">本回合无调度部队</div>');
    }

    // ── 战报段 ──
    if (battles.length) {
      html.push('<div class="battle-list">');
      html.push('<div class="battle-list-title">战报</div>');
      battles.forEach(b => {
        const WIN_SET = ['惨胜','小胜','大胜','胜'];
        const LOSE_SET = ['小负','大败','负'];
        const cardCls = WIN_SET.includes(b.result) ? 'success'
                      : LOSE_SET.includes(b.result) ? 'fail'
                      : 'draw';
        const atkColor = _junbaoGetSideColor(b.attackerSlot, b.attackerFaction);
        const defColor = _junbaoGetSideColor(b.defenderSlot, b.defenderFaction);
        const atkBadge = _junbaoGetBadgeText(b.attackerSlot, b.attackerFaction);
        const defBadge = _junbaoGetBadgeText(b.defenderSlot, b.defenderFaction);
        const atkName  = _junbaoStripPrefix(b.attacker, atkBadge);
        const defName  = _junbaoStripPrefix(b.defender, defBadge);
        const atkStyle = `--badge-bg:${atkColor.film};--badge-border:${atkColor.stroke};--badge-color:${atkColor.glow}`;
        const defStyle = `--badge-bg:${defColor.film};--badge-border:${defColor.stroke};--badge-color:${defColor.glow}`;
        html.push(`
          <div class="battle-card ${cardCls}">
            <div class="bc-strip"></div>
            <div class="bc-body">
              <span class="bc-badge">${esc(b.result || '')}</span>
              <div class="bc-versus">
                <div class="bc-side-v">
                  <span class="bc-role-v">攻</span>
                  <span class="bc-faction-badge" style="${atkStyle}">${esc(atkBadge)}</span>
                  <span class="bc-name-v">${esc(atkName)}</span>
                  <span class="bc-loss-v">-${b.attacker_loss || 0}</span>
                </div>
                <span class="bc-vs">vs</span>
                <div class="bc-side-v">
                  <span class="bc-role-v">守</span>
                  <span class="bc-faction-badge" style="${defStyle}">${esc(defBadge)}</span>
                  <span class="bc-name-v">${esc(defName)}</span>
                  <span class="bc-loss-v">-${b.defender_loss || 0}</span>
                </div>
              </div>
            </div>
          </div>
        `);
      });
      html.push('</div>');
    } else {
      // [legacy v23] html.push('<div class="jbt-empty">本回合无战事</div>');
      // v27 (2026-05-26): 套 .battle-list 外壳,配合 CSS :has() 选择器整段隐藏
      html.push('<div class="battle-list"><div class="battle-list-title">战报</div><div class="battle-empty">本回合无战事</div></div>');
    }

    body.innerHTML = html.join('');
  }

  // 取势力色:玩家走 SGMap.P_COLOR,NPC 走 SGMap.getFactionColor;兜底暗金
  function _junbaoGetSideColor(slot, faction) {
    const FALLBACK = { glow:'#a07830', film:'rgba(120,90,30,.18)', stroke:'rgba(155,120,45,0.55)' };
    if (slot === 0 || slot === 1 || slot === 2) {
      const pc = (window.SGMap && SGMap.P_COLOR) ? SGMap.P_COLOR[slot] : null;
      return pc ? { glow: pc.glow, film: pc.film, stroke: pc.stroke } : FALLBACK;
    }
    if (faction && window.SGMap && typeof SGMap.getFactionColor === 'function') {
      const fc = SGMap.getFactionColor(faction);
      if (fc) return { glow: fc.glow, film: fc.film, stroke: fc.stroke };
    }
    return FALLBACK;
  }

  // 徽章文字:玩家取名号首字,NPC 取阵营名原文
  function _junbaoGetBadgeText(slot, faction) {
    if (slot === 0 || slot === 1 || slot === 2) {
      const pname = (state.players[slot] && state.players[slot].name) || '甲乙丙'[slot];
      return pname;
    }
    return faction || '?';
  }

  // 战报 attacker/defender 原文里可能含"甲/乙/丙"或阵营名前缀,渲染时要去掉只留武将名
  /* [legacy v1] */
  // function _junbaoStripPrefix(raw, badgeText) {
  //   if (!raw) return '';
  //   let s = String(raw).trim();
  //   // 去掉开头的 甲/乙/丙
  //   s = s.replace(/^[甲乙丙]\s*/, '');
  //   // 去掉开头的阵营名(如"袁绍 颜良" → "颜良")
  //   if (badgeText && badgeText.length >= 2 && s.indexOf(badgeText) === 0) {
  //     s = s.slice(badgeText.length).trim();
  //   }
  //   return s || raw;
  // }
  /* [legacy v1] */
  // function _junbaoStripPrefix(raw, badgeText) {
  //   if (!raw) return '';
  //   let s = String(raw).trim();
  //   // 去掉开头的 甲/乙/丙
  //   s = s.replace(/^[甲乙丙]\s*/, '');
  //   /* #battle-faction-city-fix-v1: 去掉开头的 [阵营] 方括号标签 */
  //   s = s.replace(/^\[[^\]]{1,6}\]\s*/, '');
  //   // 去掉开头的阵营名(如"袁绍 颜良" → "颜良")
  //   if (badgeText && badgeText.length >= 2 && s.indexOf(badgeText) === 0) {
  //     s = s.slice(badgeText.length).trim();
  //   }
  //   /* #battle-faction-city-fix-v1: 去掉尾部 (城名) 括号 */
  //   s = s.replace(/[（(][\u4e00-\u9fa5]{1,6}[）)]$/, '').trim();
  //   return s || raw;
  // }
  function _junbaoStripPrefix(raw, badgeText) {
    if (!raw) return '';
    let s = String(raw).trim();
    // 去掉开头的 甲/乙/丙
    s = s.replace(/^[甲乙丙]\s*/, '');
    /* #battle-faction-city-fix-v1: 去掉开头的 [阵营] 方括号标签 */
    s = s.replace(/^\[[^\]]{1,6}\]\s*/, '');
    // 去掉开头的阵营名(如"袁绍 颜良" → "颜良")
    /* #battle-strip-prefix-guard-v1: 防护——去掉后若以括号开头，
       说明剥离的是武将名本身而非冗余前缀，不执行 */
    if (badgeText && badgeText.length >= 2 && s.indexOf(badgeText) === 0) {
      const remainder = s.slice(badgeText.length).trim();
      if (remainder && !(/^[（(]/.test(remainder))) {
        s = remainder;
      }
    }
    /* #battle-faction-city-fix-v1: 去掉尾部 (城名) 括号 */
    s = s.replace(/[（(][\u4e00-\u9fa5]{1,6}[）)]$/, '').trim();
    return s || raw;
  }

  // ══════════════════════════════════════════
  //  「世界」面板渲染 v1 (工单 #world-3)
  //  数据源:
  //    武将动态 = latest.parsed.world[]
  //              字段 {name,status,location,remaining,raw}
  //    烽烟    = latest.parsed.transit[] 中 slot===null 的 NPC 调度
  //  排序:紧迫度优先(剩余回合升序,∞ 排尾,同剩余按状态权重)
  // ══════════════════════════════════════════
  function renderWorld(latest) {
    const block   = document.getElementById('block-world');
    if (!block) return;
    const genList = document.getElementById('world-gen-list');
    const milList = document.getElementById('world-mil-list');
    const genCnt  = document.getElementById('world-gen-count');
    const milCnt  = document.getElementById('world-mil-count');
    if (!genList || !milList || !genCnt || !milCnt) return;

    const parsed = (latest && latest.parsed) ? latest.parsed : {};
    const world   = Array.isArray(parsed.world)   ? parsed.world   : [];
    const transit = Array.isArray(parsed.transit) ? parsed.transit : [];
    const battles = Array.isArray(parsed.battles) ? parsed.battles : [];

    // ── 武将动态:整段 world 数组 ──
    _renderWorldGen(genList, genCnt, world);

    // ── 烽烟:全部调度都并入(NPC 与玩家)+ 战况结算 ──
    _renderWorldMil(milList, milCnt, transit, battles);
  }

  // 武将动态排序:剩余升序,∞ 排尾,同剩余按状态权重
  function _sortWorldGen(list) {
    const ORDER = { '被俘': 0, '在野': 1, '客途': 2 };
    return list.slice().sort((a, b) => {
      const ar = (a.remaining === Infinity || a.remaining === '∞') ? 99999 : Number(a.remaining);
      const br = (b.remaining === Infinity || b.remaining === '∞') ? 99999 : Number(b.remaining);
      if (ar !== br) return ar - br;
      const so = (ORDER[a.status] || 99) - (ORDER[b.status] || 99);
      if (so !== 0) return so;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
    });
  }

  // ─────────────────────────────────────────
  // 烽烟行势力展示信息 v1 #world-mil-include-players-v1
  // 玩家(slot=0/1/2)取 state.players[slot].name 与 SGMap.P_COLOR[slot],
  // NPC(slot=null)取 t.faction 与 SGMap.getFactionColor(faction)。
  // 返回 { factionLabel, factionColor }。
  // ─────────────────────────────────────────
  function _getWorldMilSide(t) {
    const FALLBACK_COLOR = '#a07830';
    if (!t) return { factionLabel: '?', factionColor: FALLBACK_COLOR };

    // 玩家调度:slot 为 0/1/2
    if (t.slot === 0 || t.slot === 1 || t.slot === 2) {
      const p = state.players[t.slot];
      const label = (p && p.name) ? p.name : ['甲','乙','丙'][t.slot];
      let color = FALLBACK_COLOR;
      if (window.SGMap && SGMap.P_COLOR && SGMap.P_COLOR[t.slot]) {
        color = SGMap.P_COLOR[t.slot].glow || FALLBACK_COLOR;
      }
      return { factionLabel: label, factionColor: color };
    }

    // NPC 调度:slot === null
    const fac = String(t.faction || '?');
    let color = FALLBACK_COLOR;
    if (fac && window.SGMap && typeof SGMap.getFactionColor === 'function') {
      const fc = SGMap.getFactionColor(fac);
      if (fc && fc.glow) color = fc.glow;
    }
    return { factionLabel: fac, factionColor: color };
  }

  // 武将动态折叠阈值
  const WORLD_GEN_FOLD_LIMIT = 6;

  function _renderWorldGen(listEl, cntEl, data) {
    cntEl.textContent = data.length;
    if (!data.length) {
      listEl.innerHTML = '<div class="world-empty">天下安定,江湖无事</div>';
      return;
    }
    const sorted = _sortWorldGen(data);
    const rowsHtml = sorted.map(g => {
      const status = String(g.status || '');
      const name   = String(g.name || '');
      const loc    = String(g.location || '');
      const rem    = g.remaining;
      return '<div class="world-gen-row" data-status="' + esc(status) + '">' +
        '<span class="world-gen-status">' + esc(status) + '</span>' +
        '<div class="world-gen-main">' +
          '<span class="world-gen-name">' + esc(name) + '</span>' +
          '<span class="world-gen-loc">' + _renderWorldLoc(loc) + '</span>' +
        '</div>' +
        _renderWorldRem(rem) +
      '</div>';
    }).join('');

    // 折叠机制
    if (sorted.length <= WORLD_GEN_FOLD_LIMIT) {
      listEl.innerHTML = rowsHtml;
      return;
    }
    const overflow = sorted.length - WORLD_GEN_FOLD_LIMIT;
    listEl.innerHTML =
      '<div class="world-fold-wrap" data-fold-collapsed="1">' +
        rowsHtml +
        '<button class="world-fold-btn" type="button" data-fold-action="toggle">' +
          '<span class="wfb-text-collapsed">▼ 展开剩余 ' + overflow + ' 位</span>' +
          '<span class="wfb-text-expanded">▲ 收起</span>' +
        '</button>' +
      '</div>';
    _bindWorldFoldBtn(listEl);
  }

  // 烽烟折叠阈值
  const WORLD_MIL_FOLD_LIMIT = 4;
  const WORLD_BAT_FOLD_LIMIT = 3;

  function _renderWorldMil(listEl, cntEl, transitData, battlesData) {
    const transit = Array.isArray(transitData) ? transitData : [];
    const battles = Array.isArray(battlesData) ? battlesData : [];

    // 顶部计数:N 队 · M 战(战况为 0 时省略)
    let cntText = '共 ' + transit.length + ' 队';
    if (battles.length > 0) cntText += ' · ' + battles.length + ' 战';
    cntEl.textContent = cntText;

    // 双空 → 整段空态
    if (!transit.length && !battles.length) {
      listEl.innerHTML = '<div class="world-empty">四境无兵动</div>';
      return;
    }

    const out = [];

    // ── 兵马调度段 ──
    out.push('<div class="world-subsec">');
    out.push('<h5 class="world-subsec-title">兵马调度</h5>');
    if (transit.length === 0) {
      out.push('<div class="world-empty world-empty--inline">本回合无调度</div>');
    } else {
      const milRows = transit.map(t => _buildWorldMilRow(t)).join('');
      if (transit.length <= WORLD_MIL_FOLD_LIMIT) {
        out.push(milRows);
      } else {
        const overflow = transit.length - WORLD_MIL_FOLD_LIMIT;
        out.push('<div class="world-fold-wrap" data-fold-collapsed="1">');
        out.push(milRows);
        out.push('<button class="world-fold-btn" type="button" data-fold-action="toggle">');
        out.push('<span class="wfb-text-collapsed">▼ 展开剩余 ' + overflow + ' 队</span>');
        out.push('<span class="wfb-text-expanded">▲ 收起</span>');
        out.push('</button>');
        out.push('</div>');
      }
    }
    out.push('</div>');

    // ── 战况结算段(只在有战况时渲染)──
    if (battles.length > 0) {
      out.push('<div class="world-subsec world-subsec--bat">');
      out.push('<h5 class="world-subsec-title">战况结算</h5>');
      const batRows = battles.map(b => _buildWorldBatRow(b)).join('');
      if (battles.length <= WORLD_BAT_FOLD_LIMIT) {
        out.push(batRows);
      } else {
        const overflow = battles.length - WORLD_BAT_FOLD_LIMIT;
        out.push('<div class="world-fold-wrap" data-fold-collapsed="1">');
        out.push(batRows);
        out.push('<button class="world-fold-btn" type="button" data-fold-action="toggle">');
        out.push('<span class="wfb-text-collapsed">▼ 展开剩余 ' + overflow + ' 战</span>');
        out.push('<span class="wfb-text-expanded">▲ 收起</span>');
        out.push('</button>');
        out.push('</div>');
      }
      out.push('</div>');
    }

    listEl.innerHTML = out.join('');
    _bindWorldFoldBtn(listEl);
  }

  // 单行调度(从原 _renderWorldMil 拆出,保持渲染逻辑完全一致)
  function _buildWorldMilRow(t) {
    const side = _getWorldMilSide(t);
    const faction = side.factionLabel;
    const mc      = side.factionColor;
    const general = String(t.general || '');
    const from    = String(t.from || '');
    const to      = String(t.to || '');
    const troopStr = _formatTransitTroops(t);
    const status  = String(t.status || '');

    return '<div class="world-mil-row" style="--wm-c:' + mc + '">' +
      '<span class="world-mil-faction">' + esc(faction) + '</span>' +
      '<div class="world-mil-main">' +
        '<span class="world-mil-general">' + esc(general) + '</span>' +
        '<span class="world-mil-route">' + esc(from) + '<span class="arrow">›</span>' + esc(to) + '</span>' +
      '</div>' +
      (troopStr
        ? '<span class="world-mil-troop">' + troopStr + '</span>'
        : '') +
      _renderWorldStatus(status) +
    '</div>';
  }

  // 单行战况:攻方→守方 + 城名 + 结果徽章 + 伤亡
  // 攻守双方徽章色复用 _junbaoGetSideColor / _junbaoGetBadgeText
  function _buildWorldBatRow(b) {
    const atkColor = _junbaoGetSideColor(b.attackerSlot, b.attackerFaction);
    const defColor = _junbaoGetSideColor(b.defenderSlot, b.defenderFaction);

    const atkLabel = b.attackerFactionRaw || _junbaoGetBadgeText(b.attackerSlot, b.attackerFaction);
    const defLabel = b.defenderFactionRaw || _junbaoGetBadgeText(b.defenderSlot, b.defenderFaction);

    const atkName = b.attackerGeneral || _junbaoStripPrefix(b.attacker, atkLabel);
    const defName = b.defenderGeneral || _junbaoStripPrefix(b.defender, defLabel);

    const city = b.defenderCity || b.city || '';

    const result = String(b.result || '');
    const WIN_SET = ['惨胜','小胜','大胜','胜'];
    const LOSE_SET = ['小负','大败','负'];
    const resultCls = WIN_SET.includes(result) ? 'win'
                    : LOSE_SET.includes(result) ? 'lose'
                    : 'draw';

    const atkLossZero = (b.attacker_loss === 0 || b.attacker_loss === '0');
    const defLossZero = (b.defender_loss === 0 || b.defender_loss === '0');

    /* [legacy v1]
    return '<div class="world-bat-row" data-result="' + resultCls + '">' +
    */
    return '<div class="world-bat-row" data-result="' + resultCls + '" style="--wm-c:' + atkColor.glow + '">' +
      '<div class="world-bat-atk">' +
        '<span class="world-bat-badge" style="color:' + atkColor.glow + ';border-color:' + atkColor.stroke + '">' + esc(atkLabel) + '</span>' +
        '<span class="world-bat-name">' + esc(atkName) + '</span>' +
        '<span class="world-bat-loss' + (atkLossZero ? ' is-zero' : '') + '">-' + (b.attacker_loss != null ? b.attacker_loss : '0') + '</span>' +
      '</div>' +
      '<div class="world-bat-center">' +
        '<span class="world-bat-result">' + esc(result) + '</span>' +
        (city ? '<span class="world-bat-city">' + esc(city) + '</span>' : '') +
      '</div>' +
      '<div class="world-bat-def">' +
        '<span class="world-bat-loss' + (defLossZero ? ' is-zero' : '') + '">-' + (b.defender_loss != null ? b.defender_loss : '0') + '</span>' +
        '<span class="world-bat-name">' + esc(defName) + '</span>' +
        '<span class="world-bat-badge" style="color:' + defColor.glow + ';border-color:' + defColor.stroke + '">' + esc(defLabel) + '</span>' +
      '</div>' +
    '</div>';
  }

  // 折叠按钮事件绑定(委托到 listEl,幂等)
  function _bindWorldFoldBtn(listEl) {
    if (listEl._sgWorldFoldBound) return;
    listEl._sgWorldFoldBound = true;
    listEl.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.world-fold-btn');
      if (!btn) return;
      const wrap = btn.closest('.world-fold-wrap');
      if (!wrap) return;
      const collapsed = wrap.getAttribute('data-fold-collapsed') === '1';
      wrap.setAttribute('data-fold-collapsed', collapsed ? '0' : '1');
    });
  }

  // 位置渲染:含 → 时按箭头切分,其他原样输出
  function _renderWorldLoc(loc) {
    if (!loc) return '';
    if (loc.indexOf('→') !== -1) {
      return loc.split('→').map((p, i) =>
        (i > 0 ? '<span class="arrow">›</span>' : '') + esc(p)
      ).join('');
    }
    return esc(loc);
  }

  // 剩余回合渲染:∞ 金色,≤2 橙红警示,其他暗金
  function _renderWorldRem(rem) {
    if (rem === Infinity || rem === '∞') {
      return '<span class="world-gen-rem infinity">∞</span>';
    }
    const n = Number(rem);
    if (!Number.isFinite(n)) {
      return '<span class="world-gen-rem">—</span>';
    }
    const cls = n <= 2 ? 'world-gen-rem urgent' : 'world-gen-rem';
    return '<span class="' + cls + '">剩 ' + n + '</span>';
  }

  // 烽烟状态渲染:围攻中橙、剩N≤1 红、客驻蓝、其他暗金
  // v15: 7 状态映射,旧词「围攻中」与新词「攻城中」同义
  // v28 (2026-XX): 对齐 GM 规则书 v3.40 M-29 红线九,
  // 状态白名单收窄至 4 种;旧词由 parser 归一化处理,UI 不再兜底。
  function _renderWorldStatus(s) {
    if (!s) return '<span class="world-mil-status">—</span>';
    if (s === '攻城中') return '<span class="world-mil-status siege">攻城中</span>';
    if (s === '交战中') return '<span class="world-mil-status battle">交战中</span>';
    if (s === '客驻')   return '<span class="world-mil-status guest">客驻</span>';
    const m = s.match(/^剩(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const cls = n <= 1 ? 'world-mil-status urgent' : 'world-mil-status march';
      return '<span class="' + cls + '">' + esc(s) + '</span>';
    }
    return '<span class="world-mil-status">' + esc(s) + '</span>';
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
    // [legacy v22] buildBattleCard 已删除,此处降级为纯文本列表
    // 字段来源: parser 产物 battles[] = { attacker, defender, result,
    //   attacker_loss, defender_loss, city? }
    if (p.battles && p.battles.length) {
      const _resultCls = r => r === '胜' ? 'hist-bt-win'
                            : r === '负' ? 'hist-bt-lose'
                            : 'hist-bt-draw';
      html += `<div class="info-block block-battles" style="margin:0 0 10px">
        <div class="ib-header"><span class="ib-icon ib-icon--text">战斗</span><span class="ib-title">战斗结算</span></div>
        <div class="ib-body"><ul class="hist-battle-list">` +
        p.battles.map(b => {
          const atk = esc(b.attacker || '');
          const def = esc(b.defender || '');
          const city = b.city ? `<span class="hist-bt-city">(${esc(b.city)})</span>` : '';
          const res = esc(b.result || '');
          const al = b.attacker_loss != null ? `攻-${b.attacker_loss}` : '';
          const dl = b.defender_loss != null ? `守-${b.defender_loss}` : '';
          const losses = [al, dl].filter(Boolean).join(' / ');
          return `<li class="hist-bt-row">
            <span class="hist-bt-pair">${atk} <span class="hist-bt-arrow">›</span> ${def}${city}</span>
            <span class="hist-bt-result ${_resultCls(b.result)}">${res}</span>
            ${losses ? `<span class="hist-bt-loss">${losses}</span>` : ''}
          </li>`;
        }).join('') +
        `</ul></div></div>`;
    }

    // M39-5: 密报提示(按当前身份判断该回合有无密报)
    // 不在历史详情里重复渲染密报正文,只挂一行提示,
    // 引导用户去密报阁主区的"📜 历史密报"折叠区查看
    if (p.secrets && p.secrets.length) {
      const role = (window.SGRole && SGRole.get) ? SGRole.get() : null;
      const myCount = role
        ? p.secrets.filter(s => Array.isArray(s.slots) && s.slots.indexOf(role) !== -1).length
        : 0;
      if (myCount > 0) {
        html += `<div class="info-block block-history-secret-hint" style="margin:0 0 10px;border-color:rgba(160,50,38,.25);background:rgba(20,10,8,.5)">
          <div class="ib-body" style="padding:9px 14px;font-size:.78rem;color:var(--text-sub);line-height:1.6;font-family:var(--font-serif);letter-spacing:.04em">
            <span style="font-size:.86rem">🔒</span>
            <span style="margin:0 4px">本回合共有</span>
            <b style="color:var(--gold-light);font-weight:700;padding:0 2px">${myCount}</b>
            <span>条与你相关的密报</span>
            <span style="color:var(--text-dim);margin-left:6px">·</span>
            <span style="color:var(--text-dim);margin-left:6px">详见上方密报阁的「📜 历史密报」折叠区</span>
          </div>
        </div>`;
      }
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
  //  M39-5: 密报清单渲染(GM 校验用,不过滤身份)
  //  - 列出每条密报的 slots / title / body 前 30 字 / 是否密令
  //  - 校验 slots 是否在 [甲,乙,丙] 白名单内
  //  - 校验 slots 是否为空数组
  //  - 校验密令选项 items 是否为空
  //  - 异常用红色 ⚠ 警示,正常用绿色 ✓
  // ══════════════════════════════════════════
  function _buildParsePreviewSecrets(parsed) {
    if (!parsed) return '';
    const secrets = (parsed.secrets && Array.isArray(parsed.secrets)) ? parsed.secrets : [];
    if (!secrets.length) {
      return `<div class="pp-item"><strong>📨 密报阁:</strong><span class="pp-nil">本回合无密报</span></div>`;
    }

    const VALID_SLOTS = ['甲', '乙', '丙'];
    const lines = [];
    lines.push(`<div class="pp-item"><strong>📨 密报阁:</strong><span class="pp-ok">共 ${secrets.length} 条</span></div>`);

    secrets.forEach((s, i) => {
      // slots 合法性
      const slots = Array.isArray(s.slots) ? s.slots : [];
      const slotsBad = !slots.length;
      const invalidSlots = slots.filter(sl => VALID_SLOTS.indexOf(sl) === -1);
      const slotsHtml = slotsBad
        ? `<span style="color:#f07070">⚠ slots 为空</span>`
        : invalidSlots.length
          ? `<span style="color:#f07070">⚠ 非法 slots: ${esc(invalidSlots.join(','))}</span>`
          : `<span class="pp-ok">${esc(slots.join('+'))}</span>`;

      // 标题
      const title = s.title || '(无标题)';

      // 内容预览
      let bodyPreview = '';
      if (s.isCmd) {
        const items = Array.isArray(s.items) ? s.items : [];
        if (!items.length) {
          bodyPreview = `<span style="color:#f0b040">⚠ 密令选项为空</span>`;
        } else {
          const itemsTxt = items.map(it => (it.num || '') + ' ' + (it.name || '')).join(' / ');
          bodyPreview = `<span style="color:var(--text-sub)">密令 ${items.length} 条: ${esc(itemsTxt.slice(0, 40))}${itemsTxt.length > 40 ? '…' : ''}</span>`;
        }
      } else {
        const body = (s.body || '').replace(/\s+/g, ' ').trim();
        if (!body) {
          bodyPreview = `<span style="color:#f0b040">⚠ 密报正文为空</span>`;
        } else {
          bodyPreview = `<span style="color:var(--text-sub)">${esc(body.slice(0, 30))}${body.length > 30 ? '…' : ''}</span>`;
        }
      }

      const cmdTag = s.isCmd
        ? `<span style="color:#f0c060;font-size:.7rem;margin-left:4px">[密令]</span>`
        : '';

      lines.push(
        `<div class="pp-item" style="padding-left:18px">` +
        `<span style="color:var(--text-dim)">#${i + 1}</span>` +
        ` ${slotsHtml}` +
        ` <strong style="color:var(--gold-light);margin:0 4px">${esc(title)}</strong>` +
        cmdTag +
        ` ${bodyPreview}` +
        `</div>`
      );
    });

    return lines.join('');
  }

  // ══════════════════════════════════════════
  //  解析预览
  // ══════════════════════════════════════════
  function showParsePreview(parsed) {
    const box = document.getElementById('parse-preview');
    const res = document.getElementById('parse-result');
    if (!box || !res) return;
    const lines = parsed ? SGParser.summarize(parsed) : ['❌ 无法解析，请检查格式'];
    // 显示回合号提示（优先解析结果）
    const nextRound = state.rounds.length
      ? state.rounds[state.rounds.length - 1].round + 1
      : 1;
    const detectedRound = Number.isInteger(parsed?.round) ? parsed.round : parseInt(parsed?.round, 10);
    const roundNum = Number.isInteger(detectedRound) && detectedRound > 0 ? detectedRound : nextRound;
    /* [legacy v1]
    const header = `<div class="pp-item"><strong>🎴 发布后将成为：</strong><span class="pp-ok">第 ${roundNum} 回合</span></div>`;
    */
    /* #gm-data-only-mode-v1: 标识当前是完整发布还是数据修复 */
    const modeBadge = (parsed && parsed._dataOnlyMode)
      ? `<div class="pp-item"><strong>🔧 模式:</strong><span class="pp-ok" style="color:#f0c060">仅数据区修复(剧情区保留)</span></div>`
      : `<div class="pp-item"><strong>🎴 模式:</strong><span class="pp-ok">完整回合发布</span></div>`;
    const header = modeBadge
      + `<div class="pp-item"><strong>🎴 目标回合:</strong><span class="pp-ok">第 ${roundNum} 回合</span></div>`;

    // M39-5: 密报清单 + slots 校验(GM 校验用,不过滤身份)
    const secretsHtml = _buildParsePreviewSecrets(parsed);

    res.innerHTML = header + secretsHtml + lines.map(l => `<div class="pp-item">${l}</div>`).join('');
    box.classList.remove('hidden');
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

  document.addEventListener('DOMContentLoaded', init);
})();

/* ════════════════════════════════════════
   特效开关栏 v2 事件绑定 (2026-05-25)
   独立 IIFE,不与 SGMap 模块耦合
════════════════════════════════════════ */
(function () {
  'use strict';
  function bindFxToggles() {
    const bar = document.getElementById('fx-toggles');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', function (e) {
      const btn = e.target.closest('.fx-btn');
      if (!btn || !bar.contains(btn)) return;
      const fx = btn.dataset.fx;
      if (!fx) return;
      const pressed = btn.getAttribute('aria-pressed') !== 'false';
      const next = !pressed;
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      document.body.classList.toggle('fx-off-' + fx, !next);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindFxToggles);
  } else {
    bindFxToggles();
  }


})();

/* ════════════════════════════════════════════
   v20261008a 工单#achievement-polish-H1
   成就系统 v5 · tab 移动端两行布局 + 自选展示成就 + 文案修复
   - 触发时机：每次 renderAll() 结束自动 scan()
   - 解锁存储：localStorage[`sg-ach-unlocked-{slot}`]
   - Toast 提示：新解锁时弹 b 方案（淡 toast）
   - 撤回回合不回退成就
   - 清空全部时一并清空 localStorage
   对外 API:
     window.SGAch.open(slot)            打开成就墙
     window.SGAch.close()                关闭成就墙
     window.SGAch.scan()                 主动触发一次扫描
     window.SGAch.getUnlocked(slot)      取该 slot 已解锁 code 数组
     window.SGAch.getHighestRarity(slot) 取该 slot 最高稀有度成就对象
     window.SGAch.clearAll()             清空全部成就（供 onClearAll 调用）
   ════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 稀有度等级（用于排序）── */
  const RAR_LEVEL = { bronze: 1, silver: 2, gold: 3, diamond: 4 };

  /* ── 雄都列表（M10 用）── */
  const XIONGDU = ['洛阳', '邺城', '许昌', '长安', '襄阳', '建业', '成都'];

  /* ── 险关列表(M14/M19 用)── */
  const XIANGUAN_LIST = [
    '虎牢关','潼关','街亭','剑阁','葭萌关','阳平关',
    '上党','弘农','上庸','梓潼','夷陵','永安'
  ];

  /* ── 州治列表(I15 用)── */
  const ZHOUZHI_LIST = [
    '陈留','蓟县','晋阳','汉中','江夏','寿春','吴郡','下邳'
  ];

  /* ── 水战强城池(M17 用)── */
  const SHUIZHAN_LIST = [
    '襄阳','江夏','江陵','广陵','夷陵','巴丘',
    '寿春','合肥','庐江','建业','吴郡','会稽','柴桑',
    '永安','江州'
  ];

  /* ── 南中城池(H04 用)── */
  const SOUTH_4 = ['建宁','云南','永昌','交趾'];

  /* ── 武将组合白名单(T01-T12 用)──
     注:单名 + 全名都列出,渲染时由 hasGeneral 宽松匹配 ── */
  const WUHU = [        // 五虎上将
    ['关羽','羽'], ['张飞','飞'], ['赵云','云'],
    ['马超','超'], ['黄忠','忠']
  ];
  const WUZI = [        // 五子良将
    ['张辽','辽'], ['乐进','进'], ['于禁','禁'],
    ['张郃','郃'], ['徐晃','晃']
  ];
  const JIANGDONG = [   // 江东武将
    ['孙策','策'], ['周瑜','瑜'], ['鲁肃','肃'],
    ['吕蒙','蒙'], ['陆逊','逊'], ['太史慈','慈'],
    ['甘宁','宁'], ['周泰','泰'], ['凌统','统']
  ];
  const CAOWEI_ZONG = [ // 曹氏/夏侯宗亲
    ['曹仁','仁'], ['曹洪','洪'], ['曹真','真'],
    ['夏侯惇','惇'], ['夏侯渊','渊']
  ];
  const HEBEI_4 = [     // 河北四庭柱
    ['颜良','良'], ['文丑','丑'], ['张郃','郃'], ['高览','览']
  ];
  const XILIANG_2 = [   // 西凉铁骑
    ['马超','超'], ['庞德','德']
  ];
  const THREE_PRIME = [ // 三国名相
    ['诸葛亮','亮'], ['司马懿','懿'], ['周瑜','瑜']
  ];
  const WUMIAO_10 = [   // 武庙十哲(知名度近似)
    ['吕布','布'], ['关羽','羽'], ['张飞','飞'],
    ['赵云','云'], ['马超','超'], ['典韦','韦'],
    ['许褚','褚'], ['诸葛亮','亮'], ['司马懿','懿'],
    ['周瑜','瑜'], ['陆逊','逊'], ['郭嘉','嘉'],
    ['张辽','辽']
  ];

  /* ── 州区映射(H05 用,M-03 65 城) ── */
  const STATE_MAP = {
    '幽州': ['襄平','北平','蓟县'],
    '冀州': ['南皮','平原','邺城'],
    '并州': ['晋阳','上党','平阳'],
    '青州': ['北海','济南'],
    '司隶': ['洛阳','弘农','河内','虎牢关','潼关'],
    '雍凉': ['长安','天水','安定','武威','西平','街亭'],
    '兖豫': ['濮阳','陈留','许昌','汝南','谯郡','阳翟'],
    '徐州': ['下邳','小沛','广陵','琅琊'],
    '荆襄': ['宛城','新野','襄阳','江夏','江陵','巴丘',
            '夷陵','武陵','长沙','桂阳','零陵'],
    '扬州': ['寿春','合肥','庐江','建业','吴郡',
            '会稽','柴桑','庐陵'],
    '益州': ['汉中','上庸','梓潼','成都','永安','江州',
            '武都','剑阁','葭萌关','阳平关'],
    '南中': ['建宁','云南','永昌','交趾'],
  };

  /* ── 辅助:武将名宽松匹配 ──
     names = [['关羽','羽'], ['张飞','飞']] 二维数组
     每个武将允许 单名 / 全名 / 包含关系 都算命中
     最终返回:全员命中数(用于 some/全集判定) ── */
  function hasGeneralMulti(generals, namesPairs) {
    if (!Array.isArray(generals)) return 0;
    let hit = 0;
    namesPairs.forEach(pair => {
      const matched = generals.some(g => {
        const gn = String(g.name || '');
        return pair.some(n => gn === n || gn.includes(n));
      });
      if (matched) hit++;
    });
    return hit;
  }

  /* ── 辅助:玩家所有回合 generals 累加去重(用于"曾拥有过"判定) ── */
  function getEverGenerals(slot, rounds) {
    const set = new Set();
    rounds.forEach(rd => {
      const gens = rd.parsed.players?.[slot]?.generals || [];
      gens.forEach(g => { if (g.name) set.add(g.name); });
    });
    return Array.from(set).map(name => ({ name }));
  }

  /* ── 辅助:累计在指定城池列表中胜战 ── */
  function countCityWinInList(slot, rounds, cityList) {
    const wonCities = new Set();
    rounds.forEach(rd => {
      (rd.parsed.battles || []).forEach(b => {
        if (b.attackerSlot === slot && b.result === '胜' &&
            b.city && cityList.includes(b.city)) {
          wonCities.add(b.city);
        }
      });
    });
    return wonCities.size;
  }

  /* ── 辅助:玩家当前是否拥有某城(扫最新回合 players[slot].cities_list) ── */
  function currentlyOwnCity(slot, rounds, cityName) {
    if (!rounds.length) return false;
    const latest = rounds[rounds.length - 1];
    const list = latest.parsed.players?.[slot]?.cities_list || [];
    return list.some(c => c && c.name === cityName);
  }

  /* ── 辅助:玩家最新回合的城名集合 ── */
  function currentOwnedCitiesSet(slot, rounds) {
    if (!rounds.length) return new Set();
    const latest = rounds[rounds.length - 1];
    const list = latest.parsed.players?.[slot]?.cities_list || [];
    return new Set(list.map(c => c && c.name).filter(Boolean));
  }

  /* ── 辅助:被攻防御胜利计数(NPC/对手攻本人 + 本人胜)──
     注:battles 中 attackerSlot ≠ 本人 且 city 属于本人 + result=负 ── */
  function countDefenseWins(slot, rounds) {
    let n = 0;
    rounds.forEach((rd, idx) => {
      // 取上一回合的城池列表判断"当时是否属于本人"
      const prevIdx = idx > 0 ? idx - 1 : idx;
      const ownedNames = new Set(
        (rd.parsed.players?.[slot]?.cities_list || []).map(c => c.name)
      );
      (rd.parsed.battles || []).forEach(b => {
        if (b.attackerSlot !== slot && b.city && ownedNames.has(b.city) &&
            b.result === '负') {
          n++;
        }
      });
    });
    return n;
  }

  /* ── 辅助:累计敌方伤亡 ── */
  function totalDefenderLoss(slot, rounds) {
    let n = 0;
    rounds.forEach(rd => (rd.parsed.battles || []).forEach(b => {
      if (b.attackerSlot === slot) n += Number(b.defender_loss) || 0;
    }));
    return n;
  }

  /* ── 辅助:连续回合同武将同目标 status=攻城中/交战中 ── */
  function checkConsecutiveSiege(slot, rounds, n) {
    if (rounds.length < n) return false;
    // 收集每回合本人的 (general, to) 对
    const perRound = rounds.map(rd =>
      (rd.parsed.transit || [])
        .filter(t => t.slot === slot &&
                     (t.status === '攻城中' || t.status === '交战中'))
        .map(t => (t.general || '') + '|' + (t.to || ''))
    );
    for (let i = 0; i <= perRound.length - n; i++) {
      const first = perRound[i];
      if (!first.length) continue;
      for (const key of first) {
        let ok = true;
        for (let j = 1; j < n; j++) {
          if (!perRound[i+j].includes(key)) { ok = false; break; }
        }
        if (ok) return true;
      }
    }
    return false;
  }

  /* ── 辅助:secrets 含特定可信度 ── */
  function countSecretsByTrust(slot, rounds, trust) {
    const slotName = ['甲','乙','丙'][slot];
    let n = 0;
    rounds.forEach(rd => {
      (rd.parsed.secrets || []).forEach(s => {
        if (!Array.isArray(s.slots) || !s.slots.includes(slotName)) return;
        const txt = String(s.title || '') + String(s.body || '');
        if (txt.includes(trust)) n++;
      });
    });
    return n;
  }

  /* ── 辅助:secrets 是密令 ── */
  function countCommandSecrets(slot, rounds) {
    const slotName = ['甲','乙','丙'][slot];
    let n = 0;
    rounds.forEach(rd => {
      (rd.parsed.secrets || []).forEach(s => {
        if (Array.isArray(s.slots) && s.slots.includes(slotName) && s.isCmd) n++;
      });
    });
    return n;
  }

  /* ── 辅助:被俘转为己方(H02 用)── */
  function checkCapturedRecruit(slot, rounds) {
    if (rounds.length < 2) return false;
    const slotName = ['甲','乙','丙'][slot];
    for (let i = 1; i < rounds.length; i++) {
      const prevWorld = rounds[i-1].parsed.world || [];
      const currGens = rounds[i].parsed.players?.[slot]?.generals || [];
      const prevCapturedByMe = prevWorld.filter(w =>
        w.status === '被俘' &&
        String(w.location || '').includes(slotName + '方')
      );
      for (const w of prevCapturedByMe) {
        if (currGens.some(g =>
          g.name === w.name || (w.name && g.name && (g.name.includes(w.name) || w.name.includes(g.name)))
        )) return true;
      }
    }
    return false;
  }

  /* ── 辅助:释放被俘(H03 用)──
     检测:某武将在某回合 world 被俘+位置本人方,下回合 world 在野 ── */
  function countReleasedCaptives(slot, rounds) {
    if (rounds.length < 2) return 0;
    const slotName = ['甲','乙','丙'][slot];
    let n = 0;
    const counted = new Set();
    for (let i = 1; i < rounds.length; i++) {
      const prev = rounds[i-1].parsed.world || [];
      const curr = rounds[i].parsed.world || [];
      prev.forEach(p => {
        if (p.status !== '被俘') return;
        if (!String(p.location || '').includes(slotName + '方')) return;
        if (counted.has(p.name)) return;
        const stillCaptive = curr.some(c => c.name === p.name && c.status === '被俘');
        const nowWild = curr.some(c => c.name === p.name && c.status === '在野');
        const recruited = (rounds[i].parsed.players?.[slot]?.generals || [])
          .some(g => g.name === p.name);
        // 释放 = 从被俘消失 + 出现在野(且不是被本人招揽)
        if (!stillCaptive && nowWild && !recruited) {
          n++;
          counted.add(p.name);
        }
      });
    }
    return n;
  }

  /* ── 辅助:跨州数(H05 用) ── */
  function countDistinctStates(slot, rounds) {
    const owned = currentOwnedCitiesSet(slot, rounds);
    const states = new Set();
    Object.entries(STATE_MAP).forEach(([state, cities]) => {
      if (cities.some(c => owned.has(c))) states.add(state);
    });
    return states.size;
  }

  /* ── 50 个成就定义 ── */
  const ACHIEVEMENTS = [
    // ═══ ⚔️ 军事 12 ═══
    { code:'M01', cat:'military', rar:'bronze',  name:'初战告捷', icon:'胜',
      desc:'首次取得攻城战胜利',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.battles||[]).some(b=>b.attackerSlot===slot && b.result==='胜' && b.city)) },
    { code:'M02', cat:'military', rar:'bronze',  name:'沙场试锋', icon:'锋',
      desc:'累计参与战斗 5 场',
      check:(slot,rounds)=>countBattles(slot,rounds)>=5 },
    { code:'M03', cat:'military', rar:'bronze',  name:'攻城拔寨', icon:'拔',
      desc:'累计攻下城池 3 座',
      check:(slot,rounds)=>countCityGain(slot,rounds)>=3 },
    { code:'M04', cat:'military', rar:'silver',  name:'百战之师', icon:'百',
      desc:'累计参与战斗 15 场',
      check:(slot,rounds)=>countBattles(slot,rounds)>=15 },
    { code:'M05', cat:'military', rar:'silver',  name:'连战连捷', icon:'连',
      desc:'连续 3 回合每回合都有胜战',
      check:(slot,rounds)=>checkConsecutiveWins(slot,rounds,3) },
    { code:'M06', cat:'military', rar:'silver',  name:'单回双胜', icon:'双',
      desc:'单回合内攻克 2 座城池',
      check:(slot,rounds)=>checkSingleRoundCityGain(slot,rounds,2) },
    { code:'M07', cat:'military', rar:'silver',  name:'大破敌军', icon:'破',
      desc:'单场战斗敌方伤亡 ≥3000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.battles||[]).some(b=>b.attackerSlot===slot && (b.defender_loss||0)>=3000)) },
    { code:'M08', cat:'military', rar:'gold',    name:'万人之敌', icon:'万',
      desc:'兵力首次达到 10000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.troop||0)>=10000) },
    { code:'M09', cat:'military', rar:'gold',    name:'定鼎乾坤', icon:'定',
      desc:'单场战斗敌方伤亡 ≥6000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.battles||[]).some(b=>b.attackerSlot===slot && (b.defender_loss||0)>=6000)) },
    { code:'M10', cat:'military', rar:'gold',    name:'名城克星', icon:'克',
      desc:'攻下雄都级城池（洛阳/邺城/许昌/长安/襄阳/建业/成都）',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.battles||[]).some(b=>b.attackerSlot===slot && b.result==='胜' && XIONGDU.includes(b.city))) },
    { code:'M11', cat:'military', rar:'diamond', name:'横扫六合', icon:'横',
      desc:'占据城池数达到 15 座',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.cities||0)>=15) },
    { code:'M12', cat:'military', rar:'diamond', name:'不败之师', icon:'屹',
      desc:'累计 10 场战斗无败绩',
      check:(slot,rounds)=>{
        const list = [];
        rounds.forEach(rd=>(rd.parsed.battles||[]).forEach(b=>{ if(b.attackerSlot===slot) list.push(b); }));
        return list.length>=10 && list.every(b=>b.result!=='负');
      } },

    // ═══ 🏛️ 内政 12 ═══
    { code:'I01', cat:'govern', rar:'bronze',  name:'仓廪初实', icon:'廪',
      desc:'粮草储备首次突破 5000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.food||0)>=5000) },
    { code:'I02', cat:'govern', rar:'bronze',  name:'金玉满堂', icon:'玉',
      desc:'金钱储备首次突破 3000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.gold||0)>=3000) },
    { code:'I03', cat:'govern', rar:'bronze',  name:'民心所向', icon:'心',
      desc:'民心首次达到 75',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.morale||0)>=75) },
    { code:'I04', cat:'govern', rar:'bronze',  name:'三军用命', icon:'军',
      desc:'兵力首次突破 5000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.troop||0)>=5000) },
    { code:'I05', cat:'govern', rar:'silver',  name:'富甲一方', icon:'富',
      desc:'金钱储备突破 8000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.gold||0)>=8000) },
    { code:'I06', cat:'govern', rar:'silver',  name:'屯粮如山', icon:'屯',
      desc:'粮草储备突破 15000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.food||0)>=15000) },
    { code:'I07', cat:'govern', rar:'silver',  name:'万众归心', icon:'归',
      desc:'民心达到 90',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.morale||0)>=90) },
    { code:'I08', cat:'govern', rar:'silver',  name:'治世能臣', icon:'治',
      desc:'单回合净金收入 ≥500',
      check:(slot,rounds)=>{
        const slotName = ['甲','乙','丙'][slot];
        return rounds.some(rd=>{
          const changes = rd.parsed.changes||[];
          return changes.some(ch=>ch.slot===slotName && ch.resources && Number(ch.resources['金'])>=500);
        });
      } },
    { code:'I09', cat:'govern', rar:'gold',    name:'富可敌国', icon:'国',
      desc:'金钱储备突破 20000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.gold||0)>=20000) },
    { code:'I10', cat:'govern', rar:'gold',    name:'粮秣无忧', icon:'秣',
      desc:'粮草储备突破 30000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.food||0)>=30000) },
    { code:'I11', cat:'govern', rar:'gold',    name:'王师之兵', icon:'王',
      desc:'兵力突破 20000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.troop||0)>=20000) },
    { code:'I12', cat:'govern', rar:'diamond', name:'国泰兵强', icon:'泰',
      desc:'同一回合：金≥15000 / 粮≥20000 / 兵≥15000 / 民心≥80',
      check:(slot,rounds)=>rounds.some(rd=>{
        const p = rd.parsed.players?.[slot];
        return p && (p.gold||0)>=15000 && (p.food||0)>=20000 && (p.troop||0)>=15000 && (p.morale||0)>=80;
      }) },

    // ═══ 👥 武将 10 ═══
    { code:'G01', cat:'general', rar:'bronze',  name:'初见贤士', icon:'贤',
      desc:'麾下武将数达到 3 名',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.generals||[]).length>=3) },
    { code:'G02', cat:'general', rar:'bronze',  name:'礼贤下士', icon:'礼',
      desc:'麾下武将数达到 5 名',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.generals||[]).length>=5) },
    { code:'G03', cat:'general', rar:'silver',  name:'群英会聚', icon:'英',
      desc:'麾下武将数达到 8 名',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.generals||[]).length>=8) },
    { code:'G04', cat:'general', rar:'silver',  name:'卧虎藏龙', icon:'卧',
      desc:'麾下武将数达到 12 名',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.generals||[]).length>=12) },
    { code:'G05', cat:'general', rar:'silver',  name:'同甘共苦', icon:'甘',
      desc:'麾下武将全部健康（≥5 名）',
      check:(slot,rounds)=>rounds.some(rd=>{
        const gens = rd.parsed.players?.[slot]?.generals||[];
        return gens.length>=5 && gens.every(g=>!g.status || g.status==='健康');
      }) },
    { code:'G06', cat:'general', rar:'gold',    name:'文武鼎盛', icon:'鼎',
      desc:'麾下武将数达到 18 名',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.generals||[]).length>=18) },
    { code:'G07', cat:'general', rar:'gold',    name:'妙手回春', icon:'春',
      desc:'武将从受伤/患病状态恢复健康',
      check:(slot,rounds)=>checkRecovery(slot,rounds) },
    { code:'G08', cat:'general', rar:'gold',    name:'痛失栋梁', icon:'殇',
      desc:'麾下武将首次阵亡',
      check:(slot,rounds)=>checkGeneralLost(slot,rounds) },
    { code:'G09', cat:'general', rar:'diamond', name:'名将云集', icon:'集',
      desc:'麾下武将数达到 25 名',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.generals||[]).length>=25) },
    { code:'G10', cat:'general', rar:'diamond', name:'三国第一', icon:'冠',
      desc:'麾下武将数达到 30 名',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.generals||[]).length>=30) },

    // ═══ 🎭 谋略 8 ═══
    { code:'S01', cat:'strategy', rar:'bronze',  name:'初施暗算', icon:'暗',
      desc:'首次收到密报',
      check:(slot,rounds)=>countSecrets(slot,rounds)>=1 },
    { code:'S02', cat:'strategy', rar:'bronze',  name:'情报先行', icon:'情',
      desc:'累计收到密报 5 条',
      check:(slot,rounds)=>countSecrets(slot,rounds)>=5 },
    { code:'S03', cat:'strategy', rar:'silver',  name:'谍影重重', icon:'谍',
      desc:'累计收到密报 15 条',
      check:(slot,rounds)=>countSecrets(slot,rounds)>=15 },
    { code:'S04', cat:'strategy', rar:'silver',  name:'远交近攻', icon:'交',
      desc:'在 NPC 城池客驻部队',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.transit||[]).some(t=>t.slot===slot && t.status==='客驻')) },
    { code:'S05', cat:'strategy', rar:'silver',  name:'兵贵神速', icon:'速',
      desc:'单回合调度部队 ≥3 支',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.transit||[]).filter(t=>t.slot===slot).length>=3) },
    { code:'S06', cat:'strategy', rar:'gold',    name:'运筹帷幄', icon:'幄',
      desc:'累计收到密报 30 条',
      check:(slot,rounds)=>countSecrets(slot,rounds)>=30 },
    { code:'S07', cat:'strategy', rar:'gold',    name:'鬼神莫测', icon:'鬼',
      desc:'收到一条「难辨」密报',
      check:(slot,rounds)=>checkUnknownSecret(slot,rounds) },
    { code:'S08', cat:'strategy', rar:'diamond', name:'神机妙算', icon:'算',
      desc:'累计收到密报 50 条',
      check:(slot,rounds)=>countSecrets(slot,rounds)>=50 },

    // ═══ 🏆 里程碑 8 ═══
    { code:'L01', cat:'milestone', rar:'bronze',  name:'揭竿而起', icon:'起',
      desc:'开启乱世征途',
      check:(slot,rounds)=>rounds.length>=1 },
    { code:'L02', cat:'milestone', rar:'bronze',  name:'一方诸侯', icon:'侯',
      desc:'占据城池数达到 3 座',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.cities||0)>=3) },
    { code:'L03', cat:'milestone', rar:'silver',  name:'据州称雄', icon:'雄',
      desc:'占据城池数达到 5 座',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.cities||0)>=5) },
    { code:'L04', cat:'milestone', rar:'silver',  name:'风云十载', icon:'载',
      desc:'游戏进行到第 20 回合',
      check:(slot,rounds)=>rounds.some(rd=>(rd.round||0)>=20) },
    { code:'L05', cat:'milestone', rar:'silver',  name:'半壁江山', icon:'壁',
      desc:'占据城池数达到 10 座',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.cities||0)>=10) },
    { code:'L06', cat:'milestone', rar:'gold',    name:'五幕传奇', icon:'幕',
      desc:'游戏进行到第 50 回合（决战幕）',
      check:(slot,rounds)=>rounds.some(rd=>(rd.round||0)>=50) },
    { code:'L07', cat:'milestone', rar:'gold',    name:'鼎足而立', icon:'足',
      desc:'二幕（19-35 回合）期间存活且未失城',
      check:(slot,rounds)=>checkSurvivalPhase2(slot,rounds) },
    { code:'L08', cat:'milestone', rar:'diamond', name:'一统天下', icon:'统',
      desc:'占据城池数达到 20 座',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.cities||0)>=20) },

    // ═══ ⚔️ 军事进阶 10 ═══
    { code:'M13', cat:'military', rar:'bronze', name:'首胜雄都', icon:'都',
      desc:'首次攻下任意雄都(洛阳/邺城/许昌/长安/襄阳/建业/成都)',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,XIONGDU)>=1 },
    { code:'M14', cat:'military', rar:'bronze', name:'险关之主', icon:'关',
      desc:'攻下任意一座险关',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,XIANGUAN_LIST)>=1 },
    { code:'M15', cat:'military', rar:'silver', name:'三战三捷', icon:'三',
      desc:'单回合内 3 场战斗全胜',
      check:(slot,rounds)=>rounds.some(rd=>{
        const list = (rd.parsed.battles||[]).filter(b=>b.attackerSlot===slot);
        return list.length>=3 && list.every(b=>b.result==='胜');
      }) },
    { code:'M16', cat:'military', rar:'silver', name:'围城猛将', icon:'围',
      desc:'累计攻城战胜利 5 场',
      check:(slot,rounds)=>{
        let n=0;
        rounds.forEach(rd=>(rd.parsed.battles||[]).forEach(b=>{
          if(b.attackerSlot===slot && b.result==='胜' && b.city) n++;
        }));
        return n>=5;
      } },
    { code:'M17', cat:'military', rar:'silver', name:'水陆双修', icon:'渡',
      desc:'攻下任一水战强城池',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,SHUIZHAN_LIST)>=1 },
    { code:'M18', cat:'military', rar:'gold', name:'雄都连下', icon:'连',
      desc:'累计攻下 3 座雄都',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,XIONGDU)>=3 },
    { code:'M19', cat:'military', rar:'gold', name:'险关克星', icon:'破',
      desc:'累计攻下 5 座险关',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,XIANGUAN_LIST)>=5 },
    { code:'M20', cat:'military', rar:'gold', name:'一夫当关', icon:'守',
      desc:'守住己方城池累计抵御 5 次进攻',
      check:(slot,rounds)=>countDefenseWins(slot,rounds)>=5 },
    { code:'M21', cat:'military', rar:'diamond', name:'千军辟易', icon:'辟',
      desc:'累计敌方伤亡突破 30000',
      check:(slot,rounds)=>totalDefenderLoss(slot,rounds)>=30000 },
    { code:'M22', cat:'military', rar:'diamond', name:'战神不朽', icon:'朽',
      desc:'累计 30 场战斗无败绩',
      check:(slot,rounds)=>{
        const list = [];
        rounds.forEach(rd=>(rd.parsed.battles||[]).forEach(b=>{
          if(b.attackerSlot===slot) list.push(b);
        }));
        return list.length>=30 && list.every(b=>b.result!=='负');
      } },

    // ═══ 🏛️ 内政进阶 8 ═══
    { code:'I13', cat:'govern', rar:'bronze', name:'民为邦本', icon:'邦',
      desc:'民心首次达到 100(满民心)',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.morale||0)>=100) },
    { code:'I14', cat:'govern', rar:'silver', name:'兵精粮足', icon:'备',
      desc:'同回合 兵≥10000 且 粮≥20000',
      check:(slot,rounds)=>rounds.some(rd=>{
        const p=rd.parsed.players?.[slot];
        return p && (p.troop||0)>=10000 && (p.food||0)>=20000;
      }) },
    { code:'I15', cat:'govern', rar:'silver', name:'太守之政', icon:'政',
      desc:'同时占据 3 座州治',
      check:(slot,rounds)=>rounds.some(rd=>{
        const list=rd.parsed.players?.[slot]?.cities_list||[];
        return list.filter(c=>ZHOUZHI_LIST.includes(c.name)).length>=3;
      }) },
    { code:'I16', cat:'govern', rar:'gold', name:'雄都之主', icon:'雄',
      desc:'同时占据 2 座雄都',
      check:(slot,rounds)=>rounds.some(rd=>{
        const list=rd.parsed.players?.[slot]?.cities_list||[];
        return list.filter(c=>XIONGDU.includes(c.name)).length>=2;
      }) },
    { code:'I17', cat:'govern', rar:'gold', name:'富甲三国', icon:'豪',
      desc:'金钱储备突破 50000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.gold||0)>=50000) },
    { code:'I18', cat:'govern', rar:'gold', name:'屯粮百万', icon:'垠',
      desc:'粮草储备突破 80000',
      check:(slot,rounds)=>rounds.some(rd=>(rd.parsed.players?.[slot]?.food||0)>=80000) },
    { code:'I19', cat:'govern', rar:'diamond', name:'王业可成', icon:'业',
      desc:'同回合达成 金≥30000 / 粮≥50000 / 兵≥30000 / 民心≥90',
      check:(slot,rounds)=>rounds.some(rd=>{
        const p=rd.parsed.players?.[slot];
        return p && (p.gold||0)>=30000 && (p.food||0)>=50000 &&
               (p.troop||0)>=30000 && (p.morale||0)>=90;
      }) },
    { code:'I20', cat:'govern', rar:'diamond', name:'不战屈人', icon:'屈',
      desc:'占城 ≥10 且累计参战 ≤5 场',
      check:(slot,rounds)=>{
        if (!rounds.some(rd=>(rd.parsed.players?.[slot]?.cities||0)>=10)) return false;
        return countBattles(slot,rounds)<=5;
      } },

    // ═══ 👥 武将组合·历史名将组 12 ═══
    { code:'T01', cat:'general', rar:'gold', name:'桃园结义', icon:'桃',
      desc:'同时拥有 关羽 + 张飞',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,[['关羽','羽'],['张飞','飞']])===2;
      }) },
    { code:'T02', cat:'general', rar:'gold', name:'五虎上将', icon:'虎',
      desc:'集齐五虎上将(关羽/张飞/赵云/马超/黄忠)',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,WUHU)===5;
      }) },
    { code:'T03', cat:'general', rar:'gold', name:'五子良将', icon:'良',
      desc:'集齐五子良将(张辽/乐进/于禁/张郃/徐晃)',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,WUZI)===5;
      }) },
    { code:'T04', cat:'general', rar:'gold', name:'江东双璧', icon:'璧',
      desc:'同时拥有 周瑜 + 陆逊',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,[['周瑜','瑜'],['陆逊','逊']])===2;
      }) },
    { code:'T05', cat:'general', rar:'silver', name:'卧龙凤雏', icon:'卧',
      desc:'拥有 诸葛亮 或 庞统',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,[['诸葛亮','亮'],['庞统','统']])>=1;
      }) },
    { code:'T06', cat:'general', rar:'diamond', name:'卧龙得雏', icon:'凤',
      desc:'同时拥有 诸葛亮 + 庞统',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,[['诸葛亮','亮'],['庞统','统']])===2;
      }) },
    { code:'T07', cat:'general', rar:'silver', name:'江东虎臣', icon:'臣',
      desc:'同时拥有 3 位江东武将',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,JIANGDONG)>=3;
      }) },
    { code:'T08', cat:'general', rar:'gold', name:'曹魏宗亲', icon:'宗',
      desc:'同时拥有 3 位曹氏/夏侯',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,CAOWEI_ZONG)>=3;
      }) },
    { code:'T09', cat:'general', rar:'silver', name:'河北四柱', icon:'柱',
      desc:'集齐河北四庭柱(颜良/文丑/张郃/高览)',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,HEBEI_4)===4;
      }) },
    { code:'T10', cat:'general', rar:'gold', name:'西凉铁骑', icon:'骑',
      desc:'同时拥有 马超 + 庞德',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,XILIANG_2)===2;
      }) },
    { code:'T11', cat:'general', rar:'diamond', name:'三国名相', icon:'相',
      desc:'同时拥有 诸葛亮 + 司马懿 + 周瑜',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,THREE_PRIME)===3;
      }) },
    { code:'T12', cat:'general', rar:'diamond', name:'武庙十哲', icon:'哲',
      desc:'麾下 6 位名将齐聚(按知名度白名单)',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,WUMIAO_10)>=6;
      }) },

    // ═══ 🎭 谋略进阶 6 ═══
    { code:'S09', cat:'strategy', rar:'bronze', name:'客驻他乡', icon:'客',
      desc:'累计在 NPC 城客驻 3 次',
      check:(slot,rounds)=>{
        let n=0;
        rounds.forEach(rd=>(rd.parsed.transit||[]).forEach(t=>{
          if(t.slot===slot && t.status==='客驻') n++;
        }));
        return n>=3;
      } },
    { code:'S10', cat:'strategy', rar:'silver', name:'攻心为上', icon:'信',
      desc:'累计收到 10 条「可信」密报',
      check:(slot,rounds)=>countSecretsByTrust(slot,rounds,'可信')>=10 },
    { code:'S11', cat:'strategy', rar:'silver', name:'围而不攻', icon:'困',
      desc:'单支部队"攻城中/交战中"持续 ≥3 回合',
      check:(slot,rounds)=>checkConsecutiveSiege(slot,rounds,3) },
    { code:'S12', cat:'strategy', rar:'gold', name:'暗中布局', icon:'局',
      desc:'累计获得密令选项 20 次',
      check:(slot,rounds)=>countCommandSecrets(slot,rounds)>=20 },
    { code:'S13', cat:'strategy', rar:'gold', name:'共享盟友', icon:'盟',
      desc:'收到共享密报(多方共阅)',
      check:(slot,rounds)=>{
        const slotName = ['甲','乙','丙'][slot];
        return rounds.some(rd=>(rd.parsed.secrets||[]).some(s=>
          Array.isArray(s.slots) && s.slots.includes(slotName) && s.slots.length>=2
        ));
      } },
    { code:'S14', cat:'strategy', rar:'diamond', name:'鬼谋深算', icon:'谋',
      desc:'累计收到密报 80 条',
      check:(slot,rounds)=>countSecrets(slot,rounds)>=80 },

    // ═══ 🏆 里程碑·名场面 8 ═══
    { code:'L09', cat:'milestone', rar:'bronze', name:'初出五幕', icon:'初',
      desc:'二幕开启(第 19 回合)',
      check:(slot,rounds)=>rounds.some(rd=>(rd.round||0)>=19) },
    { code:'L10', cat:'milestone', rar:'silver', name:'雷霆将至', icon:'雷',
      desc:'三幕开启(第 36 回合)',
      check:(slot,rounds)=>rounds.some(rd=>(rd.round||0)>=36) },
    { code:'L11', cat:'milestone', rar:'gold', name:'决战之时', icon:'决',
      desc:'四幕开启(第 46 回合)',
      check:(slot,rounds)=>rounds.some(rd=>(rd.round||0)>=46) },
    { code:'L12', cat:'milestone', rar:'gold', name:'余波回响', icon:'余',
      desc:'五幕开启(第 56 回合)',
      check:(slot,rounds)=>rounds.some(rd=>(rd.round||0)>=56) },
    { code:'L13', cat:'milestone', rar:'silver', name:'攻占洛阳', icon:'洛',
      desc:'攻下洛阳',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,['洛阳'])>=1 },
    { code:'L14', cat:'milestone', rar:'silver', name:'入主许昌', icon:'许',
      desc:'攻下许昌',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,['许昌'])>=1 },
    { code:'L15', cat:'milestone', rar:'gold', name:'据有邺城', icon:'邺',
      desc:'攻下邺城',
      check:(slot,rounds)=>countCityWinInList(slot,rounds,['邺城'])>=1 },
    { code:'L16', cat:'milestone', rar:'diamond', name:'三都归一', icon:'归',
      desc:'同时拥有 洛阳 + 长安 + 许昌',
      check:(slot,rounds)=>rounds.some(rd=>{
        const list=rd.parsed.players?.[slot]?.cities_list||[];
        const names=new Set(list.map(c=>c.name));
        return names.has('洛阳') && names.has('长安') && names.has('许昌');
      }) },

    // ═══ 💎 隐藏·剧情向 6 ═══
    { code:'H01', cat:'milestone', rar:'bronze', name:'寒微出身', icon:'寒',
      desc:'开局首回合武将数 ≤2',
      check:(slot,rounds)=>{
        if (!rounds.length) return false;
        const first = rounds[0];
        return (first.parsed.players?.[slot]?.generals||[]).length<=2;
      } },
    { code:'H02', cat:'general', rar:'silver', name:'收降名将', icon:'收',
      desc:'招降一名被俘武将至麾下',
      check:(slot,rounds)=>checkCapturedRecruit(slot,rounds) },
    { code:'H03', cat:'general', rar:'gold', name:'释义放归', icon:'释',
      desc:'累计释放被俘武将 3 次',
      check:(slot,rounds)=>countReleasedCaptives(slot,rounds)>=3 },
    { code:'H04', cat:'milestone', rar:'gold', name:'南征蛮夷', icon:'蛮',
      desc:'占据任一南中城池(建宁/云南/永昌/交趾)',
      check:(slot,rounds)=>rounds.some(rd=>{
        const list=rd.parsed.players?.[slot]?.cities_list||[];
        return list.some(c=>SOUTH_4.includes(c.name));
      }) },
    { code:'H05', cat:'milestone', rar:'diamond', name:'横跨九州', icon:'跨',
      desc:'同时占据涵盖 6 个州的城池',
      check:(slot,rounds)=>countDistinctStates(slot,rounds)>=6 },
    { code:'H06', cat:'general', rar:'diamond', name:'五虎五子', icon:'极',
      desc:'同时集齐五虎上将与五子良将',
      check:(slot,rounds)=>rounds.some(rd=>{
        const g=rd.parsed.players?.[slot]?.generals||[];
        return hasGeneralMulti(g,WUHU)===5 && hasGeneralMulti(g,WUZI)===5;
      }) },
  ];

  /* ── 工具函数：复用避免重复代码 ── */
  function countBattles(slot, rounds) {
    let n = 0;
    rounds.forEach(rd => (rd.parsed.battles || []).forEach(b => {
      if (b.attackerSlot === slot) n++;
    }));
    return n;
  }

  function countCityGain(slot, rounds) {
    let gain = 0;
    for (let i = 1; i < rounds.length; i++) {
      const prev = rounds[i-1].parsed.players?.[slot]?.cities || 0;
      const curr = rounds[i].parsed.players?.[slot]?.cities || 0;
      if (curr > prev) gain += (curr - prev);
    }
    return gain;
  }

  function checkConsecutiveWins(slot, rounds, n) {
    if (rounds.length < n) return false;
    for (let i = 0; i <= rounds.length - n; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) {
        const battles = rounds[i+j].parsed.battles || [];
        const hasWin = battles.some(b => b.attackerSlot === slot && b.result === '胜');
        if (!hasWin) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  function checkSingleRoundCityGain(slot, rounds, n) {
    for (let i = 1; i < rounds.length; i++) {
      const prev = rounds[i-1].parsed.players?.[slot]?.cities || 0;
      const curr = rounds[i].parsed.players?.[slot]?.cities || 0;
      if (curr - prev >= n) return true;
    }
    return false;
  }

  function checkRecovery(slot, rounds) {
    if (rounds.length < 2) return false;
    for (let i = 1; i < rounds.length; i++) {
      const prevGens = rounds[i-1].parsed.players?.[slot]?.generals || [];
      const currGens = rounds[i].parsed.players?.[slot]?.generals || [];
      for (const g of prevGens) {
        if (g.status === '受伤' || g.status === '患病') {
          const found = currGens.find(c => c.name === g.name);
          if (found && (!found.status || found.status === '健康')) return true;
        }
      }
    }
    return false;
  }

  function checkGeneralLost(slot, rounds) {
    if (rounds.length < 2) return false;
    // 在册武将名集合，跨回合消失即视为阵亡
    for (let i = 1; i < rounds.length; i++) {
      const prevNames = new Set((rounds[i-1].parsed.players?.[slot]?.generals || []).map(g => g.name));
      const currNames = new Set((rounds[i].parsed.players?.[slot]?.generals || []).map(g => g.name));
      // 上回合在册 + 这回合不在册 = 可能阵亡（也可能调走，但简化判定）
      for (const name of prevNames) {
        if (!currNames.has(name)) return true;
      }
    }
    return false;
  }

  function countSecrets(slot, rounds) {
    const slotName = ['甲','乙','丙'][slot];
    let n = 0;
    rounds.forEach(rd => {
      (rd.parsed.secrets || []).forEach(s => {
        if (Array.isArray(s.slots) && s.slots.includes(slotName)) n++;
      });
    });
    return n;
  }

  function checkUnknownSecret(slot, rounds) {
    const slotName = ['甲','乙','丙'][slot];
    return rounds.some(rd =>
      (rd.parsed.secrets || []).some(s =>
        Array.isArray(s.slots) && s.slots.includes(slotName) &&
        /难辨/.test(String(s.title || '') + String(s.body || ''))
      )
    );
  }

  function checkSurvivalPhase2(slot, rounds) {
    // 二幕 19-35 回合期间，玩家城数始终 ≥ 起始（即 ≥1）
    const inPhase = rounds.filter(rd => (rd.round||0) >= 19 && (rd.round||0) <= 35);
    if (!inPhase.length) return false;
    return inPhase.every(rd => (rd.parsed.players?.[slot]?.cities || 0) >= 1);
  }

  /* ── localStorage 读写 ── */
  function storageKey(slot) { return 'sg-ach-unlocked-' + slot; }

  /* ── 自选展示成就 storageKey ── */
  function pinKey(slot) { return 'sg-ach-pinned-' + slot; }

  function loadPinned(slot) {
    // 优先远端（SGAchSync 已加载且有数据）
    if (window.SGAchSync && typeof window.SGAchSync.getPinned === 'function') {
      const remoteCode = window.SGAchSync.getPinned(slot);
      if (remoteCode) return remoteCode;
    }
    // 降级：localStorage（离线/未加载时仍可用）
    try {
      const code = localStorage.getItem(pinKey(slot));
      return code || null;
    } catch (e) { return null; }
  }

  function savePinned(slot, code) {
    // 远端写入（仅本人 slot 才会成功）
    if (window.SGAchSync && typeof window.SGAchSync.setPinned === 'function') {
      window.SGAchSync.setPinned(slot, code);
    }
    // 同步 localStorage 作为降级缓存
    try {
      if (code) localStorage.setItem(pinKey(slot), code);
      else localStorage.removeItem(pinKey(slot));
    } catch (e) {}
  }

  function loadUnlocked(slot) {
    try {
      const raw = localStorage.getItem(storageKey(slot));
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveUnlocked(slot, arr) {
    try { localStorage.setItem(storageKey(slot), JSON.stringify(arr)); }
    catch (e) { /* localStorage 满或禁用 */ }
  }

  /* ── 取玩家名 ── */
  function getPlayerName(slot) {
    const el = document.getElementById('pname-' + slot);
    return el ? (el.textContent || '').trim() : ('城主' + ['甲','乙','丙'][slot]);
  }

  /* ── Toast 提示（沿用全站 #toast 节点）── */
  function fireToast(msg) {
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

  /* ── 核心扫描函数 ── */
  function scan() {
    const state = window.SGState;
    if (!state || !state.rounds) return;
    const rounds = state.rounds;
    if (!rounds.length) return;

    let totalNewlyUnlocked = 0;

    for (let slot = 0; slot < 3; slot++) {
      const unlocked = loadUnlocked(slot);
      const newlyAdded = [];

      ACHIEVEMENTS.forEach(ach => {
        if (unlocked.indexOf(ach.code) !== -1) return;
        try {
          if (ach.check(slot, rounds)) {
            unlocked.push(ach.code);
            newlyAdded.push(ach);
          }
        } catch (e) {
          console.warn('[SGAch] check failed for', ach.code, e);
        }
      });

      if (newlyAdded.length) {
        saveUnlocked(slot, unlocked);
        const playerName = getPlayerName(slot);
        // 多个成就时按稀有度倒序，依次弹（每条间隔由 setTimeout 自然错开）
        newlyAdded
          .sort((a,b) => (RAR_LEVEL[b.rar]||0) - (RAR_LEVEL[a.rar]||0))
          .forEach((ach, idx) => {
            setTimeout(() => {
              fireToast('🏆 ' + playerName + ' 解锁「' + ach.name + '」');
            }, idx * 3200);
          });
        totalNewlyUnlocked += newlyAdded.length;
      }
    }

    // 触发玩家卡徽章重渲染（由工单 B 接管，本工单先广播事件）
    if (totalNewlyUnlocked > 0) {
      try { window.dispatchEvent(new CustomEvent('sg-ach-unlocked')); }
      catch (e) { /* 兜底 */ }
    }
  }

  /* ── 取该 slot 展示成就(优先 pinned,否则最高稀有度)── */
  function getHighestRarity(slot) {
    const unlocked = loadUnlocked(slot);
    if (!unlocked.length) return null;

    // 优先返回玩家自选展示的成就(且必须已解锁)
    const pinnedCode = loadPinned(slot);
    if (pinnedCode && unlocked.indexOf(pinnedCode) !== -1) {
      const pinned = ACHIEVEMENTS.find(a => a.code === pinnedCode);
      if (pinned) return pinned;
    }

    // 兜底:返回最稀有
    let best = null;
    unlocked.forEach(code => {
      const ach = ACHIEVEMENTS.find(a => a.code === code);
      if (!ach) return;
      if (!best || (RAR_LEVEL[ach.rar]||0) > (RAR_LEVEL[best.rar]||0)) {
        best = ach;
      }
    });
    return best;
  }

  /* ── 取已解锁 code 数组（供外部调试或 UI 用）── */
  function getUnlocked(slot) {
    return loadUnlocked(slot).slice();
  }

  /* ── 清空全部（供 onClearAll 调用）── */
  function clearAll() {
    for (let i = 0; i < 3; i++) {
      try { localStorage.removeItem(storageKey(i)); } catch (e) {}
      try { localStorage.removeItem(pinKey(i)); } catch (e) {}
    }
    try { window.dispatchEvent(new CustomEvent('sg-ach-unlocked')); }
    catch (e) {}
  }

  /* ── 当前打开的 slot（用于 tab 切换时复用）── */
  let _currentSlot = 0;
  let _currentCat = 'all';

  /* ── 分类中文名（供徽章右下角显示）── */
  const CAT_LABEL = {
    military:'军事', govern:'内政', general:'武将',
    strategy:'谋略', milestone:'里程碑',
  };

  /* ── 稀有度中文（用于 .ach-card-rar-tag）── */
  const RAR_CN = { bronze:'常规', silver:'稀有', gold:'史诗', diamond:'传说' };

  /* ── 打开成就墙模态 ── */
  function open(slot) {
    const modal = document.getElementById('ach-modal');
    if (!modal) return;
    _currentSlot = slot;
    _currentCat = 'all';
    _renderModal();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    _bindTabsOnce();
  }

  /* ── tab 绑定（只绑一次）── */
  let _tabsBound = false;
  function _bindTabsOnce() {
    if (_tabsBound) return;
    const tabsEl = document.getElementById('ach-tabs');
    if (!tabsEl) return;
    _tabsBound = true;
    tabsEl.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.ach-tab');
      if (!btn) return;
      const cat = btn.getAttribute('data-cat');
      if (!cat || cat === _currentCat) return;
      _currentCat = cat;
      tabsEl.querySelectorAll('.ach-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-cat') === cat);
      });
      _renderList();
    });
  }

  /* ── 渲染整个模态（标题 + 进度 + tab 计数 + 列表）── */
  function _renderModal() {
    const unlocked = loadUnlocked(_currentSlot);
    const playerEl = document.getElementById('ach-modal-player');
    const unEl = document.getElementById('ach-stat-unlocked');
    const totalEl = document.getElementById('ach-stat-total');
    if (playerEl) playerEl.textContent = getPlayerName(_currentSlot);
    if (unEl) unEl.textContent = unlocked.length;
    if (totalEl) totalEl.textContent = ACHIEVEMENTS.length;

    // 同步更新模态说明条总数
    const noteTotalEl = document.getElementById('ach-note-total');
    if (noteTotalEl) noteTotalEl.textContent = ACHIEVEMENTS.length;

    // tab 计数：显示「已解锁数 / 总数」
    const totalCnts  = { all: ACHIEVEMENTS.length };
    const unlockedCnts = { all: 0 };
    ACHIEVEMENTS.forEach(a => {
      totalCnts[a.cat] = (totalCnts[a.cat] || 0) + 1;
      if (!(a.cat in unlockedCnts)) unlockedCnts[a.cat] = 0;
      if (unlocked.indexOf(a.code) !== -1) {
        unlockedCnts[a.cat]++;
        unlockedCnts.all++;
      }
    });
    Object.keys(totalCnts).forEach(k => {
      const el = document.querySelector('.ach-tab-count[data-cnt="' + k + '"]');
      if (!el) return;
      const u = unlockedCnts[k] || 0;
      const t = totalCnts[k];
      el.textContent = u + ' / ' + t;
      // 已解锁数 > 0 时给计数加 has-progress class，方便 CSS 高亮
      el.classList.toggle('has-progress', u > 0);
      el.classList.toggle('is-complete', u === t && t > 0);
    });

    // 默认回到"全部"tab
    const tabsEl = document.getElementById('ach-tabs');
    if (tabsEl) {
      tabsEl.querySelectorAll('.ach-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-cat') === _currentCat);
      });
    }
    _renderList();
  }

  /* ── 渲染成就列表（按当前 tab 过滤）── */
  function _renderList() {
    const listEl = document.getElementById('ach-list');
    if (!listEl) return;
    const unlocked = loadUnlocked(_currentSlot);
    const list = (_currentCat === 'all')
      ? ACHIEVEMENTS
      : ACHIEVEMENTS.filter(a => a.cat === _currentCat);

    // 排序：已解锁优先，同状态内按稀有度倒序，再按 code 升序（稳定）
    const sorted = list.slice().sort((a, b) => {
      const ua = unlocked.indexOf(a.code) !== -1 ? 1 : 0;
      const ub = unlocked.indexOf(b.code) !== -1 ? 1 : 0;
      if (ua !== ub) return ub - ua;
      const ra = RAR_LEVEL[a.rar] || 0;
      const rb = RAR_LEVEL[b.rar] || 0;
      if (ra !== rb) return rb - ra;
      return a.code.localeCompare(b.code);
    });

    const pinnedCode = loadPinned(_currentSlot);

    listEl.innerHTML = sorted.map(a => {
      const isU = unlocked.indexOf(a.code) !== -1;
      const isPinned = isU && (a.code === pinnedCode);
      // 已解锁 + 是本人 slot 才有"设为展示"按钮（同步模式下只能改自己）
      const canPin = isU && (
        !window.SGAchSync ||
        typeof window.SGAchSync.isMineSlot !== 'function' ||
        window.SGAchSync.isMineSlot(_currentSlot)
      );
      const pinBtn = canPin
        ? '<button class="ach-pin-btn ' + (isPinned ? 'is-pinned' : '') + '" ' +
          'data-code="' + _escHtml(a.code) + '" ' +
          'title="' + (isPinned ? '取消展示' : '设为展示') + '">' +
            (isPinned ? '★' : '☆') +
          '</button>'
        : '';
      return '<div class="ach-card-i rar-' + a.rar + ' ' + (isU ? 'unlocked' : 'locked') + ' ' +
              (isPinned ? 'is-pinned' : '') + '">' +
        '<div class="ach-card-icon">' + _escHtml(a.icon) + '</div>' +
        '<div class="ach-card-text">' +
          '<div class="ach-card-name">' + _escHtml(a.name) + '</div>' +
          '<div class="ach-card-desc">' + _escHtml(a.desc) + '</div>' +
        '</div>' +
        '<div class="ach-card-meta">' +
          pinBtn +
          '<span class="ach-card-rar-tag">' + (RAR_CN[a.rar] || '') + '</span>' +
          '<span class="ach-card-status">' + (isU ? '已达成' : '未达成') + '</span>' +
        '</div>' +
        '</div>';
    }).join('');

    // 绑定"设为展示"按钮事件(委托到 listEl,只绑一次)
    if (!listEl._sgPinBound) {
      listEl._sgPinBound = true;
      listEl.addEventListener('click', function (ev) {
        const btn = ev.target.closest('.ach-pin-btn');
        if (!btn) return;
        ev.stopPropagation();
        const code = btn.getAttribute('data-code');
        if (!code) return;
        const currPinned = loadPinned(_currentSlot);
        if (currPinned === code) {
          // 取消展示
          savePinned(_currentSlot, null);
        } else {
          // 切换为展示
          savePinned(_currentSlot, code);
        }
        // 重渲染列表 + 玩家卡徽章
        _renderList();
        try { window.dispatchEvent(new CustomEvent('sg-ach-unlocked')); }
        catch (e) {}
      });
    }
  }

  function _escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function close() {
    const modal = document.getElementById('ach-modal');
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'ach-modal') close();
  });

  /* ── 监听 renderAll 完成（通过 sg-rounds-updated 自定义事件接力扫描）──
       main.js 的 renderAll() 末尾已经广播 sg-rounds-updated（用于 secret-bureau），
       本模块复用同一事件，零侵入 ── */
  window.addEventListener('sg-rounds-updated', function () {
    setTimeout(scan, 20);  // 让 renderAll 内的 DOM 写入先稳定
  });

  /* ── 首次加载兜底：如果 SGState 已有数据，立即扫一次 ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(scan, 200);
    });
  } else {
    setTimeout(scan, 200);
  }

  /* ── 远端 pin 变更时也要重渲染玩家卡（来自 SGAchSync 推送） ── */
  // sg-ach-unlocked 事件已被 SGAchSync 复用，无需新增监听
  // 此注释占位，便于将来排查
  /* ── 监听自身解锁事件，触发玩家卡徽章重渲染 ── */
  window.addEventListener('sg-ach-unlocked', function () {
    for (let i = 0; i < 3; i++) {
      const slotEl = document.getElementById('pc-ach-slot-' + i);
      if (!slotEl) continue;
      const titleEl = slotEl.querySelector('.ach-title');
      const countEl = slotEl.querySelector('.ach-count');
      if (!titleEl || !countEl) continue;
      const best = getHighestRarity(i);
      const cnt = loadUnlocked(i).length;
      titleEl.classList.remove('rar-bronze','rar-silver','rar-gold','rar-diamond','rar-none');
      if (best) {
        titleEl.classList.add('rar-' + best.rar);
        titleEl.textContent = best.name;
      } else {
        titleEl.classList.add('rar-none');
        titleEl.textContent = '初出茅庐';
      }
      countEl.textContent = cnt;
    }
  });

  /* ── 对外 API ── */
  window.SGAch = {
    open: open,
    close: close,
    scan: scan,
    getUnlocked: getUnlocked,
    getHighestRarity: getHighestRarity,
    clearAll: clearAll,
    _list: ACHIEVEMENTS,  // 工单 B 会用到
  };
})();


/* ============================================================
   SGAdvice  ·  我的建议渲染模块  v20260920a
   ------------------------------------------------------------
   职责:
   - 从最新一轮 rd.parsed.rawDigest 解析 🎯 行动建议
   - 按当前登录身份(SGRole.get())过滤出属于本人的建议项
   - 渲染到 #sa-advice-content 内(采纳/撤销/分支弹窗交互)
   - 监听 sg-rounds-updated、sg-role-changed 自动重渲染

   依赖:
   - PR2:#sa-advice-content、#sa-advice-role-tip、
          #sa-branch-overlay 及其子元素
   - PR3:.sa-advice-card / .sa-advice-head / .sa-advice-num /
          .sa-advice-name / .sa-advice-note /
          .sa-advice-branches / .sa-advice-branch /
          .sa-advice-branch-label / .sa-advice-branch-text /
          .sa-advice-actions / .sa-advice-btn / .is-undo /
          .sa-advice-accepted-tag / .is-accepted /
          .sa-advice-fallback / .sa-advice-empty / .sa-advice-list /
          .sa-branch-opt / .sa-branch-opt-radio /
          .sa-branch-opt-body / .sa-branch-opt-label /
          .sa-branch-opt-text / .sa-branch-opt.selected
   - PR4:window.SGArmyCouncil.{acceptToFirstEmpty, undoAccept,
          findAcceptedOrderIdx, isSlotLocked, buildAcceptText}

   不动现有逻辑:与 _preRenderActionBlocks 平行存在,
   通过末尾追加 IIFE 实现,零侵入。
   ============================================================ */
(function () {
  'use strict';

  /* ── 角色 → slot 映射(对齐 role-login.js 的 '甲'/'乙'/'丙') ── */
  const ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
  const SLOT_TO_LORD = ['城主甲', '城主乙', '城主丙'];

  /* ── HTML 转义 ── */
  function escAd(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── 剥除 GM 标注 ── */
  function stripGM(l) {
    return String(l || '').trim()
      .replace(/^[【\[][^】\]\n]{1,12}[】\]]\s*/, '').trim();
  }

  /* ── 本地 toast(不依赖 secret-action.js 内部私有函数) ── */
  function adToast(msg) {
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

  /* ─────────────────────────────────────────────
     从 rawDigest 解析建议为结构化数据
     输出格式:
     [
       { playerSlot: 0,
         playerLabel: '昭',
         items: [
           { idx: 1, name: '联合孙权', note: '共抗曹操', branches: [] },
           { idx: 2, name: '夺取荆州', note: '...',
             branches: [ {key:'A', text:'走水路'}, {key:'B', text:'走陆路'} ] }
         ]
       }, ...
     ]
     说明:playerSlot 通过出现顺序 0/1/2 映射,与玩家卡顺序一致。
     正则规则与 main.js 内 _preRenderActionBlocks 保持一致。
  ───────────────────────────────────────────── */
  function parseAdviceStructured(text) {
    if (!text || !text.trim()) return [];
    const lines = text.split('\n');
    const result = [];
    let i = 0;

    const isOpt  = l => /^\s*[①②③④⑤⑥]\s*.+/.test(l);
    const isSingleLine = l => /^[^:：①②③④⑤⑥\s][^:：]{0,12}[：:]\s*.*[①②③④⑤⑥]/.test(l.trim());
    const isPName = l => {
      const t = l.trim();
      return t.length >= 1 && t.length <= 10
        && !/[：:①②③④⑤⑥]/.test(t)
        && !/^[\s\u3000]/.test(t)
        && !/^[📍🔖💡⏳🎯🌍⚡📢🔥📜🎴🌐⚔️🏯🌅🌙•·▪▸▶◆◇■□=─═—]/.test(t);
    };
    const isPNameColon = l => {
      const t = l.trim();
      return /^[^:：①②③④⑤⑥\s][^:：①②③④⑤⑥]{0,7}[：:]\s*$/.test(t)
        && !/^[📍🔖💡⏳🎯🌍⚡📢🔥📜🎴🌐⚔️🏯🌅🌙•·▪▸▶◆◇■□=─═—]/.test(t);
    };
    const isWait = l => /^⏳/.test(l.trim());
    const isBranchLine = l => /^\s*[A-Ca-c](?:[.．、]|[：:]|\s)\s*.+/.test(l);
    const branchLetter = l => l.trim().slice(0, 1).toUpperCase();
    const branchText   = l => l.trim().replace(/^[A-Ca-c](?:[.．、]|[：:]|\s)\s*/, '');

    function splitNameNote(raw) {
      const dashIdx = raw.search(/——|──|\s[-—]{2}\s/);
      if (dashIdx > 0) {
        return {
          name: raw.slice(0, dashIdx).trim(),
          note: raw.slice(dashIdx).replace(/^[——──\s-—]+/, '').trim()
        };
      }
      return { name: raw.trim(), note: '' };
    }

    while (i < lines.length) {
      const stripped = stripGM(lines[i]);
      if (!/^🎯\s*行动建议/.test(stripped)) { i++; continue; }

      // 进入 🎯 行动建议块
      i++;
      const pendingPlayers = [];
      let pendingPlayer = null;
      let pendingOpts = [];
      let emptyCount = 0;

      const flushP = () => {
        if (pendingPlayer !== null && pendingOpts.length) {
          pendingPlayers.push({ playerLabel: pendingPlayer, opts: pendingOpts });
        }
        pendingPlayer = null;
        pendingOpts = [];
      };

      while (i < lines.length) {
        const s2 = stripGM(lines[i]);
        if (isWait(s2)) { flushP(); i++; break; }
        if (!s2) {
          emptyCount++;
          if (emptyCount > 1) { flushP(); break; }
          i++; continue;
        }
        emptyCount = 0;

        // 单行格式:「名: ① xxx ② xxx」(无分支)
        if (isSingleLine(s2)) {
          flushP();
          const cm = s2.match(/^([^:：①②③④⑤⑥\s][^:：]{0,12})[：:]\s*(.+)$/);
          if (cm) {
            const pLabel = cm[1].trim();
            const rest = cm[2].trim();
            const opts = [];
            const re = /[①②③④⑤⑥]\s*([^①②③④⑤⑥]+)/g;
            let m;
            while ((m = re.exec(rest)) !== null) {
              const txt = m[1].trim().replace(/[,,]+$/, '');
              const nn = splitNameNote(txt);
              opts.push({ name: nn.name, note: nn.note, branches: [] });
            }
            pendingPlayers.push({ playerLabel: pLabel, opts });
          }
          i++; continue;
        }

        // 纯选项行:① xxx
        if (isOpt(s2)) {
          const optTxt = s2.trim().replace(/^[①②③④⑤⑥]\s*/, '').replace(/[,,]+$/, '');
          const nn = splitNameNote(optTxt);
          const branches = [];
          i++;
          while (i < lines.length) {
            const ahead = stripGM(lines[i]);
            if (!ahead) { i++; continue; }
            if (isBranchLine(ahead)) {
              branches.push({ key: branchLetter(ahead), text: branchText(ahead) });
              i++;
            } else break;
          }
          pendingOpts.push({ name: nn.name, note: nn.note, branches });
          continue;
        }

        if (isPNameColon(s2)) {
          flushP();
          pendingPlayer = s2.trim().replace(/[：:]\s*$/, '');
          i++; continue;
        }
        if (isPName(s2)) {
          flushP();
          pendingPlayer = s2;
          i++; continue;
        }
        if (isBranchLine(s2)) { i++; continue; }

        flushP();
        break;
      }
      flushP();

      // 按出现顺序映射 slot
      pendingPlayers.forEach((p, idx) => {
        const items = p.opts.map((o, oi) => ({
          idx: oi + 1,
          name: o.name,
          note: o.note,
          branches: o.branches || []
        }));
        result.push({ playerSlot: idx % 3, playerLabel: p.playerLabel, items });
      });

      // 只取第一个 🎯 行动建议块
      break;
    }

    return result;
  }

  /* ─────────────────────────────────────────────
     根据角色获取本人建议
     返回 { slot, playerLabel, items:[] } 或 null
  ───────────────────────────────────────────── */
  function getForRole(role) {
    const slot = ROLE_TO_SLOT[role];
    if (slot === undefined) return null;

    const st = window.SGState;
    if (!st || !st.rounds || !st.rounds.length) {
      return { slot, playerLabel: '', items: [] };
    }
    const last = st.rounds[st.rounds.length - 1];
    const rawDigest =
      (last && last.parsed && last.parsed.rawDigest) ||
      (last && last.rawDigest) || '';
    const all = parseAdviceStructured(rawDigest);
    const mine = all.find(p => p.playerSlot === slot);
    return {
      slot,
      playerLabel: mine ? mine.playerLabel : '',
      items: mine ? mine.items : []
    };
  }

  /* ─────────────────────────────────────────────
     adviceKey 生成器:用于 PR4 的 SGArmyCouncil 追踪
     格式:slot{N}::{ICON}   如 slot0::①
  ───────────────────────────────────────────── */
  const ICONS = ['①','②','③','④','⑤','⑥'];
  function buildAdviceKey(slot, idx) {
    return `slot${slot}::${ICONS[idx] || (idx + 1)}`;
  }

  /* ─────────────────────────────────────────────
     渲染到 #sa-advice-content(对齐 PR2 HTML + PR3 CSS)
  ───────────────────────────────────────────── */
  function render() {
    const panel = document.getElementById('sa-advice-content');
    if (!panel) return;

    // 角色提示位(标题旁,PR2 提供 #sa-advice-role-tip)
    const tipEl = document.getElementById('sa-advice-role-tip');

    const role = (window.SGRole && typeof window.SGRole.get === 'function')
      ? window.SGRole.get() : null;

    // 未登录态
    if (!role) {
      panel.innerHTML =
        '<div class="sa-advice-empty">🔐 请先登录身份后查看专属建议</div>';
      if (tipEl) tipEl.textContent = '';
      return;
    }

    const data = getForRole(role);
    const slot = data ? data.slot : -1;

    // 标题旁显示视角
    if (tipEl) {
      tipEl.textContent = ` · ${SLOT_TO_LORD[slot] || ''}视角`;
    }

    if (!data || !data.items || !data.items.length) {
      panel.innerHTML =
        '<div class="sa-advice-empty">本回合暂无属于你的行动建议</div>';
      return;
    }

    // 已锁定 → 仍渲染卡片,但全部按钮置禁用
    const locked = !!(window.SGArmyCouncil
      && typeof window.SGArmyCouncil.isSlotLocked === 'function'
      && window.SGArmyCouncil.isSlotLocked(slot));

    let html = '<div class="sa-advice-list">';
    data.items.forEach((it, idx) => {
      const adviceKey = buildAdviceKey(slot, idx);
      const hasBranch = it.branches && it.branches.length > 0;

      // 已采纳查询(PR4 API)
      let acceptedOrderIdx = -1;
      if (window.SGArmyCouncil && typeof window.SGArmyCouncil.findAcceptedOrderIdx === 'function') {
        try { acceptedOrderIdx = window.SGArmyCouncil.findAcceptedOrderIdx(slot, adviceKey); }
        catch (e) { acceptedOrderIdx = -1; }
      }
      const isAccepted = acceptedOrderIdx >= 0;

      html += `<div class="sa-advice-card${isAccepted ? ' is-accepted' : ''}" data-advice-key="${escAd(adviceKey)}" data-idx="${idx}">`;

      // 头部:序号 + 行动名 + 已采纳标签
      html += `<div>`;
      html += `<div class="sa-advice-head">`;
      html += `<span class="sa-advice-num">${ICONS[idx] || (idx + 1)}</span>`;
      html += `<span class="sa-advice-name">${escAd(it.name)}</span>`;
      if (isAccepted) {
        const orderNum = ICONS[acceptedOrderIdx] || (acceptedOrderIdx + 1);
        html += `<span class="sa-advice-accepted-tag">✓ 已采纳到 ${orderNum} 军令框</span>`;
      }
      html += `</div>`; // .sa-advice-head

      // 注解
      if (it.note) {
        html += `<div class="sa-advice-note">${escAd(it.note)}</div>`;
      }

      // 分支列表
      if (hasBranch) {
        html += `<div class="sa-advice-branches">`;
        it.branches.forEach(br => {
          html += `<div class="sa-advice-branch">`;
          html += `<span class="sa-advice-branch-label">${escAd(br.key)}</span>`;
          html += `<span class="sa-advice-branch-text">${escAd(br.text)}</span>`;
          html += `</div>`;
        });
        html += `</div>`; // .sa-advice-branches
      }
      html += `</div>`; // body 包裹

      // 操作按钮区
      html += `<div class="sa-advice-actions">`;
      if (isAccepted) {
        html += `<button class="sa-advice-btn is-undo" data-act="undo" data-advice-key="${escAd(adviceKey)}" data-idx="${idx}"${locked ? ' disabled' : ''}>撤销</button>`;
      } else {
        html += `<button class="sa-advice-btn" data-act="accept" data-advice-key="${escAd(adviceKey)}" data-idx="${idx}"${locked ? ' disabled' : ''}>${hasBranch ? '采纳…' : '采纳'}</button>`;
      }
      html += `</div>`; // .sa-advice-actions

      html += `</div>`; // .sa-advice-card
    });
    html += `</div>`; // .sa-advice-list

    // 锁定提示
    if (locked) {
      html += `<div class="sa-advice-fallback">该方军令已锁定,如需采纳建议请先解除锁定。</div>`;
    }

    panel.innerHTML = html;

    // 缓存当前数据,供事件回调取用
    panel._sgAdviceData = { slot, items: data.items, locked };
  }

  /* ─────────────────────────────────────────────
     事件委托:采纳 / 撤销
  ───────────────────────────────────────────── */
  function bindEvents() {
    const panel = document.getElementById('sa-advice-content');
    if (!panel || panel._sgAdviceBound) return;
    panel._sgAdviceBound = true;

    panel.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.sa-advice-btn');
      if (!btn || btn.disabled) return;
      const act = btn.getAttribute('data-act');
      const adviceKey = btn.getAttribute('data-advice-key');
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const data = panel._sgAdviceData;
      if (!data || !data.items) return;

      const it = data.items[idx];
      if (!it) return;

      const SAC = window.SGArmyCouncil;
      if (!SAC) {
        adToast('⚠️ 军帐模块未就绪');
        return;
      }

      // 槽位已锁定 → 拒绝
      if (typeof SAC.isSlotLocked === 'function' && SAC.isSlotLocked(data.slot)) {
        adToast('⚠️ 该方军令已锁定,请先解除锁定');
        return;
      }

      if (act === 'undo') {
        SAC.undoAccept(data.slot, adviceKey);
        render();
        adToast('✓ 已撤销采纳');
        return;
      }

      if (act === 'accept') {
        // 有分支 → 弹窗选择
        if (it.branches && it.branches.length > 0) {
          openBranchModal(data.slot, adviceKey, it);
          return;
        }
        // 无分支 → 直接采纳
        const text = (typeof SAC.buildAcceptText === 'function')
          ? SAC.buildAcceptText(it.name, '')
          : it.name;
        const r = SAC.acceptToFirstEmpty(data.slot, text, adviceKey);
        handleAcceptResult(r);
      }
    });
  }

  function handleAcceptResult(r) {
    if (!r || typeof r !== 'object') { render(); return; }
    if (r.ok) {
      render();
      const orderNum = ICONS[r.orderIdx] || (r.orderIdx + 1);
      adToast(`✓ 已采纳到 ${orderNum} 军令框`);
      return;
    }
    if (r.reason === 'full') {
      adToast('⚠️ 军令已满,请先清空一个框再采纳');
    } else if (r.reason === 'locked') {
      adToast('⚠️ 该方军令已锁定,请先解除锁定');
    } else {
      adToast('⚠️ 采纳失败');
    }
    render();
  }

  /* ─────────────────────────────────────────────
     分支选择弹窗(对齐 PR2 HTML + PR3 CSS)
     使用 #sa-branch-overlay / #sa-branch-title /
          #sa-branch-options / #sa-branch-cancel /
          #sa-branch-confirm
     交互:单选 radio 模式,选中后"确定"按钮才可点
  ───────────────────────────────────────────── */
  let _branchState = null; // { slot, adviceKey, item, selectedKey }
  let _branchBound = false;

  function openBranchModal(slot, adviceKey, item) {
    const overlay = document.getElementById('sa-branch-overlay');
    const titleEl = document.getElementById('sa-branch-title');
    const optsEl  = document.getElementById('sa-branch-options');
    const cancelBtn  = document.getElementById('sa-branch-cancel');
    const confirmBtn = document.getElementById('sa-branch-confirm');

    if (!overlay || !optsEl || !confirmBtn) {
      // DOM 不存在 → 降级:原生 prompt
      const keys = item.branches.map(b => b.key).join('/');
      const pick = (prompt(`选择「${item.name}」的分支(${keys}):`, item.branches[0].key) || '').trim().toUpperCase();
      const br = item.branches.find(b => b.key === pick);
      if (!br) return;
      doAcceptWithBranch(slot, adviceKey, item, br);
      return;
    }

    // 标题
    if (titleEl) titleEl.textContent = `选择「${item.name}」的分支`;

    // 渲染选项(对齐 PR3 .sa-branch-opt 结构)
    let html = '';
    item.branches.forEach(br => {
      html += `<div class="sa-branch-opt" data-key="${escAd(br.key)}">`;
      html += `<div class="sa-branch-opt-radio"></div>`;
      html += `<div class="sa-branch-opt-body">`;
      html += `<div class="sa-branch-opt-label">${escAd(br.key)}</div>`;
      html += `<div class="sa-branch-opt-text">${escAd(br.text)}</div>`;
      html += `</div>`;
      html += `</div>`;
    });
    optsEl.innerHTML = html;

    // 重置选中态 + 确定按钮
    confirmBtn.disabled = true;
    _branchState = { slot, adviceKey, item, selectedKey: null };

    // 显示
    overlay.classList.remove('hidden');

    // 绑定事件(幂等)
    if (!_branchBound) {
      _branchBound = true;

      optsEl.addEventListener('click', function (ev) {
        const opt = ev.target.closest('.sa-branch-opt');
        if (!opt) return;
        const key = opt.getAttribute('data-key');
        if (!_branchState) return;
        _branchState.selectedKey = key;
        // 视觉刷新
        optsEl.querySelectorAll('.sa-branch-opt').forEach(el => {
          el.classList.toggle('selected', el.getAttribute('data-key') === key);
        });
        confirmBtn.disabled = false;
      });

      cancelBtn && cancelBtn.addEventListener('click', closeBranchModal);

      // 点击遮罩外区域关闭
      overlay.addEventListener('click', function (ev) {
        if (ev.target === overlay) closeBranchModal();
      });

      confirmBtn.addEventListener('click', function () {
        if (!_branchState || !_branchState.selectedKey) return;
        const st = _branchState;
        const br = st.item.branches.find(b => b.key === st.selectedKey);
        closeBranchModal();
        if (br) doAcceptWithBranch(st.slot, st.adviceKey, st.item, br);
      });

      // ESC 关闭
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
          closeBranchModal();
        }
      });
    }
  }

  function closeBranchModal() {
    const overlay = document.getElementById('sa-branch-overlay');
    if (overlay) overlay.classList.add('hidden');
    _branchState = null;
  }

  function doAcceptWithBranch(slot, adviceKey, item, br) {
    const SAC = window.SGArmyCouncil;
    if (!SAC || typeof SAC.acceptToFirstEmpty !== 'function') return;

    const text = (typeof SAC.buildAcceptText === 'function')
      ? SAC.buildAcceptText(item.name, br.text)
      : `${item.name} - ${br.text}`;

    const r = SAC.acceptToFirstEmpty(slot, text, adviceKey);
    handleAcceptResult(r);
  }

  /* ─────────────────────────────────────────────
     启动
  ───────────────────────────────────────────── */
  function init() {
    bindEvents();
    render();

    // 监听全局事件
    window.addEventListener('sg-rounds-updated', render);
    window.addEventListener('sg-role-changed',  render);
  }

  // 等待 DOM 就绪;稍微延迟确保 secret-action.js 的 SGArmyCouncil 已挂载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 50);
    });
  } else {
    setTimeout(init, 50);
  }

  // 暴露给外部
  // - render():无参,PR4 在用户手改军令框 / 新一轮 / 锁定切换时调用
  // - getForRole(role):供调试或扩展
  // - parseAdviceStructured(text):纯函数,供单测或调试
  window.SGAdvice = {
    render: render,
    getForRole: getForRole,
    parseAdviceStructured: parseAdviceStructured,
  };
})();


/* ============================================================
   #copy-btn-role-gate-v1  ·  军帐复制按钮身份门禁
   ------------------------------------------------------------
   职责：
   - 军帐底部 .sa-bottom-bar（含"复制全部行动给 GM"按钮、就绪 banner、
     等待提示）整段，仅对身份「甲」可见。
   - 非甲（乙/丙/未登录/GM）整段隐藏（复用现有 .hidden 工具类）。
   触发时机：
   - DOMContentLoaded 首次判定
   - 全局事件 sg-role-changed 切换身份时重新判定
   依赖：window.SGRole.get() 返回 '甲'|'乙'|'丙'|null
   零侵入：
   - 不改 secret-action.js / role-login.js / style.css
   - 不动 .sa-bottom-bar 内部任何子元素
   ============================================================ */
(function () {
  'use strict';

  function applyRoleGate() {
    const bar = document.querySelector('#block-secret-action .sa-bottom-bar');
    if (!bar) return;
    const role = (window.SGRole && typeof window.SGRole.get === 'function')
      ? window.SGRole.get() : null;
    if (role === '甲') {
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyRoleGate);
  } else {
    applyRoleGate();
  }
  window.addEventListener('sg-role-changed', applyRoleGate);
})();
