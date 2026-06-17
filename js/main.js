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
  let _actionRealtimeChannel = null;  // 行动提交实时监听
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

  /**
   * Toast提示函数（如果不存在则添加）
   */
  function showToast(message, type, duration) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast';

    // ← 新增：支持 info 类型
    if (type === 'error') {
      toast.style.background = 'rgba(244,67,54,.95)';
    } else if (type === 'success') {
      toast.style.background = 'rgba(76,175,80,.95)';
    } else if (type === 'info') {
      toast.style.background = 'rgba(33,150,243,.95)';
    } else {
      toast.style.background = 'rgba(76,175,80,.95)'; // 默认绿色
    }

    toast.classList.remove('hidden');

    // ← 修改：支持自定义持续时间，默认3秒
    const delay = duration !== undefined ? duration : 3000;
    setTimeout(() => {
      toast.classList.add('hidden');
    }, delay);
  }



  function init() {
    applyGMGate();
    bindNav();
    bindGMPanel();
    initParticles();
    initTipsCard();
    bindFogToggle();
    loadFromCloud();
    bindActionTab();
    initIdentitySelector();

  }

  // #fog-of-war-main-v1: 战争迷雾开关逻辑
  function bindFogToggle() {
    // v6.0: 战争迷雾已移除，所有兵力公开展示
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
    // v20260609-fengyan: 武将动态已下线，世界继承停用
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
            // [action-pass-v1] 透传行动字段:parser 解析后未存入独立 Supabase 列,
            // 从 reparsed(对 raw_content 的临时解析结果)直接拷贝。
            playerActions: (reparsed && reparsed.playerActions) || {},
            opportunities: (reparsed && Array.isArray(reparsed.opportunities)) ? reparsed.opportunities : [],
            firstMove:     (reparsed && reparsed.firstMove) || null,
            prestige:      (reparsed && reparsed.prestige) || null,
            worldStatus:   (reparsed && reparsed.worldStatus) || null,
            storyParts:    (reparsed && reparsed.storyParts) || null,
            warnings:      (reparsed && Array.isArray(reparsed.warnings)) ? reparsed.warnings : [],
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

  function cleanupRealtime() {
    if (_realtimeChannel) {
      _realtimeChannel.unsubscribe();
      _realtimeChannel = null;
    }
    if (_actionRealtimeChannel) {
      _actionRealtimeChannel.unsubscribe();
      _actionRealtimeChannel = null;
    }
  }

  // 页面卸载时清理
  window.addEventListener('beforeunload', cleanupRealtime);

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

      // ════ 行动提交实时监听 ════
      _actionRealtimeChannel = _supaClient
        .channel('action-submissions-changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'action_submissions_v2' },
          function (payload) {
            console.log('[SG] 行动提交变更:', payload);
            _onActionSubmissionChanged(payload);
          })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            console.log('[SG] 行动实时监听就绪');
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

  // ── #layout-fix-mobile-v2 · Tab 切换 scrollTop 记忆 ──
  const _tabScrollMemory = Object.create(null);
  let _currentTab = null;

  function switchTab(name) {
    if (_currentTab && _currentTab !== name) {
      _tabScrollMemory[_currentTab] =
        window.scrollY || document.documentElement.scrollTop || 0;
    }

    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p =>
      p.classList.toggle('active', p.id === `tab-${name}`));

    const targetY = _tabScrollMemory[name] || 0;
    document.documentElement.classList.add('tab-switching');
    requestAnimationFrame(() => {
      window.scrollTo(0, targetY);
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('tab-switching');
      });
    });

    _currentTab = name;
  }
  // ── END #layout-fix-mobile-v2 ──

  // ══════════════════════════════════════════
  //  GM 面板
  // ══════════════════════════════════════════
  function bindGMPanel() {
    document.getElementById('btn-preview').addEventListener('click', onPreview);
    document.getElementById('btn-publish').addEventListener('click', onPublish);
    document.getElementById('btn-clear-all').addEventListener('click', onClearAll);
    document.getElementById('btn-undo').addEventListener('click', onUndo);

    // 初始化 GM 复制按钮为 disabled（等三家全提交后启用）
    const gmCopyBtn2 = document.getElementById('btn-gm-copy-all-actions');
    if (gmCopyBtn2) gmCopyBtn2.disabled = true;
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
      // achievement system removed
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

  /**
   * HTML转义工具函数
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ══════════════════════════════════════════

  // ══════════════════════════════════════════
  //  行动 Tab 模块 v3
  //  工单 #action-collab-v1
  //  - 无身份验证，三家面板全部公开可操作
  //  - 每家独立提交按钮
  //  - 公共机遇与应变令联动
  //  - GM 录入台一键复制（三家全提交后亮起）
  // ══════════════════════════════════════════


  // ══════════════════════════════════════════
  //  行动 Tab v10 — 完整渲染 + Supabase 提交模块
  // ══════════════════════════════════════════

  var ACT10_SUPA_URL = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/action_submissions_v2';
  var ACT10_SLOT_NAMES = ['甲', '乙', '丙'];
  var ACT10_SLOT_COLORS = { '甲': '0', '乙': '1', '丙': '2' };
  var ACT10_LING_NUMS = ['①', '②', '③'];

  function bindActionTab() {
    var gmCopyBtn = document.getElementById('btn-gm-copy-all-actions');
    if (gmCopyBtn) gmCopyBtn.addEventListener('click', _act10GMCopy);
  }

  async function renderActionTab(rd) {
    // 重置全齐提醒标记
    window._act10AllSubmittedNotified = false;

    if (!rd || !rd.parsed) return;
    var parsed = rd.parsed;
    _act10RoundStrip(parsed);
    _act10Prestige(parsed);
    _act10OppPool(parsed);
    _act10Columns(parsed);
    _act10SyncPresHeight();

    console.log('[act10] 渲染行动Tab，当前回合:', rd.round || parsed.round);
    await _act10LoadSubmissions(rd.round || parsed.round);

    // ↓↓↓ 工单 #action-panel-reorder-v1 ↓↓↓
    // 监听窗口尺寸变化，动态调整行动面板顺序
    function _act10ReorderPanels() {
      var root = document.getElementById('act10-root');
      if (!root) return;
      var isMobile = window.matchMedia('(max-width: 768px)').matches;
      var currentSlot = getCurrentPlayerSlot();

      for (var i = 0; i < 3; i++) {
        var panel = root.querySelector('.col-panel[data-slot="' + i + '"]');
        if (panel) {
          if (isMobile) {
            panel.style.order = (i === currentSlot) ? '0' : String(i + 1);
          } else {
            panel.style.order = '';
          }
        }
      }
    }

    // 初始执行一次
    _act10ReorderPanels();

    // 监听窗口尺寸变化
    if (!window._act10ResizeHandler) {
      window._act10ResizeHandler = function() {
        clearTimeout(window._act10ResizeTimer);
        window._act10ResizeTimer = setTimeout(_act10ReorderPanels, 200);
      };
      window.addEventListener('resize', window._act10ResizeHandler);
    }
    // ↑↑↑ 工单结束 ↑↑↑
  }

  // ── 回合信息条 ──
  function _act10RoundStrip(parsed) {
    var el = document.getElementById('act10-round-strip');
    if (!el) return;
    var round = parsed.round || '';
    var sp = parsed.storyParts || {};
    var title = sp.title || '';
    var season = sp.season || '';
    var fm = parsed.firstMove || '';
    var h = '';
    h += '<div class="rs-block"><span class="rs-label">回合</span><span class="rs-val">第 ' + _act10Esc(round) + ' 回合</span></div>';
    if (title) h += '<div class="rs-block"><span class="rs-label">标题</span><span class="rs-val small">' + _act10Esc(title) + '</span></div>';
    if (season) h += '<div class="rs-block"><span class="rs-label">节气</span><span class="rs-val season">' + _act10Esc(season) + '</span></div>';
    if (fm) h += '<div class="rs-block"><span class="rs-label">先手（威望最低）</span><span class="rs-val small" style="color:#c888e8;">' + _act10Esc(fm) + '</span></div>';
    h += '<div class="rs-spacer"></div>';
    /* v6.2: 规则描述已删除 */
    el.innerHTML = h;
  }

  // ── 威望排行 ──
  function _act10Prestige(parsed) {
    var el = document.getElementById('act10-pres-body');
    if (!el) return;
    var pres = parsed.prestige;
    if (!pres || !pres.entries || !pres.entries.length) {
      el.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-dim);font-size:.76rem;">等待GM数据</div>';
      return;
    }
    var entries = pres.entries;
    var maxS = entries[0].score || 1;
    var h = '';
    entries.forEach(function(e, idx) {
      var rank = idx + 1;
      var rCls = rank === 1 ? ' r1' : rank === 2 ? ' r2' : rank === 3 ? ' r3' : ' rn';
      var isP = e.isPlayer;
      var ck = isP ? (ACT10_SLOT_COLORS[e.name] || '0') : 'n';
      var barCls = isP ? 'c' + ck + ' c' + ck + 's' : 'cn';
      var nCls = isP ? '' : ' npc';
      var pct = Math.round((e.score / maxS) * 100);
      var dn = e.name;
      if (isP) {
        var pi = { '甲': 0, '乙': 1, '丙': 2 }[e.name];
        if (pi !== undefined && state.players[pi] && state.players[pi].name) dn = state.players[pi].name;
      }
      h += '<div class="pres-row">';
      h += '<span class="pr-rank' + rCls + '">' + rank + '</span>';
      h += '<span class="pr-bar ' + barCls + '"></span>';
      h += '<span class="pr-name' + nCls + '">' + _act10Esc(dn) + '</span>';
      h += '<div class="pr-micro"><div class="pr-fill ' + barCls.split(' ')[0] + '" style="width:' + pct + '%"></div></div>';
      h += '<span class="pr-val">' + e.score + '</span>';
      h += '</div>';
      // 玩家与 NPC 之间加分隔线
      if (isP && idx < entries.length - 1 && !entries[idx + 1].isPlayer) {
        h += '<div class="pr-divider"></div>';
      }
    });
    el.innerHTML = h;
  }

  // ── 威望面板高度同步 ──
  // v6.2: 威望面板等高由 CSS stretch 控制，不再 JS 同步
  function _act10SyncPresHeight() {}
  window.addEventListener('resize', _act10SyncPresHeight);

  // ── 公共机遇池 ──
  function _act10OppPool(parsed) {
    var el = document.getElementById('act10-opp-grid');
    if (!el) return;
    var opps = parsed.opportunities || [];
    if (!opps.length) {
      el.innerHTML = '<div class="opp-empty" style="grid-column:1/-1;text-align:center;padding:18px;color:var(--text-dim);font-size:.76rem;">本回合无公共机遇</div>';
      return;
    }
    var TM = { compete: 'ot-jing', cooperate: 'ot-xie', epic: 'ot-shi', gamble: 'ot-du' };
    var TI = { compete: '⚔️', cooperate: '🤝', epic: '🏆', gamble: '🎲' };
    var TT = { compete: '竞争', cooperate: '协力', epic: '史诗', gamble: '赌博' };
    var h = '';
    opps.forEach(function(o) {
      var cls = TM[o.type] || 'ot-jing';
      h += '<div class="opp-display ' + cls + '" data-opp-id="' + o.id + '" data-opp-type="' + o.type + '">';
      h += '<div class="opp-top"><span class="opp-id">机遇' + o.id + '</span><span class="opp-name">' + _act10Esc(o.title) + '</span><span class="opp-type-icon">' + (TI[o.type] || '⚔️') + '</span></div>';
      h += '<div class="opp-desc">' + _act10Esc(o.desc) + '</div>';
      h += '<div class="opp-foot"><span class="opp-pres">预估 ' + _act10Esc(String(o.prestige)) + ' 威望</span><span class="chip chip-' + cls + '">' + (TT[o.type] || '竞争') + '</span></div>';
      h += '</div>';
    });
    var TOTAL_SLOTS = 4;
    for (var i = opps.length; i < TOTAL_SLOTS; i++) h += '<div class="opp-empty"></div>';
    el.innerHTML = h;

    // 电脑端：智能悬浮卡
    if (window.matchMedia && window.matchMedia('(min-width: 769px)').matches) {
      _act10InitTooltip(opps);
    }
    // 手机端：底部抽屉
    else {
      _act10InitDrawer(opps);
    }
  }

  // ── 电脑端：智能悬浮卡初始化 ──
  function _act10InitTooltip(opps) {
    var tooltip = document.getElementById('opp-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'opp-tooltip';
      document.body.appendChild(tooltip);
    }

    var cards = document.querySelectorAll('.opp-display[data-opp-id]');
    cards.forEach(function(card) {
      card.addEventListener('mouseenter', function() {
        var oppId = parseInt(this.dataset.oppId);
        var opp = opps.find(function(o) { return o.id === oppId; });
        if (!opp || !opp.detail) return;

        var TI = { compete: '⚔️', cooperate: '🤝', epic: '🏆', gamble: '🎲' };
        var TT = { compete: '竞争', cooperate: '协力', epic: '史诗', gamble: '赌博' };
        var TM = { compete: 'ot-jing', cooperate: 'ot-xie', epic: 'ot-shi', gamble: 'ot-du' };
        var cls = TM[opp.type] || 'ot-jing';

        var html = '';
        html += '<div class="opp-tooltip-header">';
        html += '<span class="opp-tooltip-icon">' + (TI[opp.type] || '⚔️') + '</span>';
        html += '<span class="opp-tooltip-title">机遇' + opp.id + ' · ' + _act10Esc(opp.title) + '</span>';
        html += '<span class="opp-tooltip-type chip chip-' + cls + '">' + (TT[opp.type] || '竞争') + '</span>';
        html += '</div>';
        html += '<div class="opp-tooltip-body">';
        html += _act10Esc(opp.detail).replace(/\n/g, '<br>');
        html += '<div class="opp-tooltip-prestige">预估 ' + _act10Esc(String(opp.prestige)) + ' 威望</div>';
        html += '</div>';

        tooltip.innerHTML = html;
        tooltip.classList.add('show');

        // 智能定位
        _act10PositionTooltip(tooltip, this);
      });

      card.addEventListener('mouseleave', function() {
        tooltip.classList.remove('show');
      });
    });
  }

  // ── 智能定位算法 ──
  function _act10PositionTooltip(tooltip, trigger) {
    var rect = trigger.getBoundingClientRect();
    var tooltipW = tooltip.offsetWidth;
    var tooltipH = tooltip.offsetHeight;
    var winW = window.innerWidth;
    var winH = window.innerHeight;
    var gap = 8;

    var x, y;

    // 优先右侧
    if (rect.right + gap + tooltipW <= winW) {
      x = rect.right + gap;
      y = rect.top;
    }
    // 尝试左侧
    else if (rect.left - gap - tooltipW >= 0) {
      x = rect.left - gap - tooltipW;
      y = rect.top;
    }
    // 尝试上方
    else if (rect.top - gap - tooltipH >= 0) {
      x = Math.max(gap, Math.min(winW - tooltipW - gap, rect.left));
      y = rect.top - gap - tooltipH;
    }
    // 兜底下方
    else {
      x = Math.max(gap, Math.min(winW - tooltipW - gap, rect.left));
      y = rect.bottom + gap;
    }

    // 垂直居中调整
    if (y + tooltipH > winH - gap) {
      y = Math.max(gap, winH - tooltipH - gap);
    }

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  // ── 手机端：底部抽屉初始化 ──
  function _act10InitDrawer(opps) {
    var overlay = document.getElementById('opp-drawer-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'opp-drawer-overlay';
      overlay.className = 'opp-drawer-overlay';
      overlay.innerHTML = '<div class="opp-drawer"><div class="opp-drawer-handle"></div><div class="opp-drawer-header"></div><div class="opp-drawer-body"></div></div>';
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.classList.remove('show');
        }
      });
    }

    var cards = document.querySelectorAll('.opp-display[data-opp-id]');
    cards.forEach(function(card) {
      card.addEventListener('click', function() {
        var oppId = parseInt(this.dataset.oppId);
        var opp = opps.find(function(o) { return o.id === oppId; });
        if (!opp || !opp.detail) return;

        var TI = { compete: '⚔️', cooperate: '🤝', epic: '🏆', gamble: '🎲' };
        var TT = { compete: '竞争', cooperate: '协力', epic: '史诗', gamble: '赌博' };
        var TM = { compete: 'ot-jing', cooperate: 'ot-xie', epic: 'ot-shi', gamble: 'ot-du' };
        var cls = TM[opp.type] || 'ot-jing';

        var headerHtml = '';
        headerHtml += '<span class="opp-drawer-icon">' + (TI[opp.type] || '⚔️') + '</span>';
        headerHtml += '<span class="opp-drawer-title">机遇' + opp.id + ' · ' + _act10Esc(opp.title) + '</span>';
        headerHtml += '<span class="opp-drawer-type chip chip-' + cls + '">' + (TT[opp.type] || '竞争') + '</span>';
        headerHtml += '<button class="opp-drawer-close">✕</button>';

        var bodyHtml = '';
        bodyHtml += _act10Esc(opp.detail).replace(/\n/g, '<br>');
        bodyHtml += '<div class="opp-drawer-prestige">预估 ' + _act10Esc(String(opp.prestige)) + ' 威望</div>';

        overlay.querySelector('.opp-drawer-header').innerHTML = headerHtml;
        overlay.querySelector('.opp-drawer-body').innerHTML = bodyHtml;
        overlay.classList.add('show');

        // 绑定关闭按钮
        overlay.querySelector('.opp-drawer-close').addEventListener('click', function() {
          overlay.classList.remove('show');
        });
      });
    });
  }

  // ── 三家行动面板 ──
  function _act10Columns(parsed) {
    var el = document.getElementById('act10-cols-grid');
    if (!el) return;
    var actions = parsed.playerActions || {};
    var opps = parsed.opportunities || [];
    var pres = parsed.prestige;

    // v6.3: 移动端 tab 已删除，三栏始终并排显示（移动端纵向堆叠）
    var tabH = '';

    var h = '';
    var currentSlot = getCurrentPlayerSlot();

    for (var i = 0; i < 3; i++) {
      var sk = ACT10_SLOT_NAMES[i];
      var sa = actions[sk];
      var pn = state.players[i] ? state.players[i].name : '城主' + sk;
      var isEditable = (i === currentSlot);
      var pp = '';
      if (pres && pres.entries) {
        var pe = pres.entries.find(function(x) { return x.name === sk; });
        if (pe) pp = pe.score;
      }

      // ↓↓↓ 工单 #action-panel-reorder-v1 ↓↓↓
      var orderStyle = '';
      if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
        var currentSlot = getCurrentPlayerSlot();
        orderStyle = ' style="order:' + (i === currentSlot ? '0' : String(i + 1)) + '"';
      }
      h += '<div class="col-panel" data-slot="' + i + '" data-editable="' + isEditable + '"' + orderStyle + '>';
      // ↑↑↑ 工单结束 ↑↑↑
      h += '<div class="col-head">';
      h += '<span class="col-name">' + _act10Esc(pn) + '</span>';
      h += '<span class="col-slot-tag">[' + sk + ']</span>';
      h += '<div class="col-sel-badge" id="act10-badge-' + i + '"><span class="sc">0</span>/3 已选</div>';
      if (pp !== '') h += '<div class="col-pres-val"><span class="col-pres-num">' + pp + '</span><span class="col-pres-lbl"> 威望</span></div>';
      h += '</div>';

      // 已提交摘要区（初始隐藏，加载提交数据后填充）
      h += '<div class="col-summary" id="act10-summary-' + i + '" style="display:none"></div>';

      h += '<div class="col-body" id="act10-body-' + i + '">';

      if (!sa) {
        h += '<div style="text-align:center;padding:28px 10px;color:var(--text-dim);font-size:.82rem;">等待 GM 发布行动选项…</div>';
      } else {
        // v6.2: ①②③④ 建议令（含自定军令，4选2）
        var lingItems = sa.items || [];
        if (lingItems.length) {
          lingItems.forEach(function(item, li) {
            h += _act10BuildLing(item, li, i, 'item' + li);
          });
          // 只有当 items 数组少于4个时，才补充自定军令
          if (lingItems.length < 4) {
            h += _act10BuildCustomOrder(i, lingItems.length);
          }
        } else {
          var lingKeys = ['wu', 'wen', 'ce'];
          lingKeys.forEach(function(key, li) {
            var ling = sa[key];
            if (!ling) return;
            h += _act10BuildLing(ling, li, i, key);
          });
          // 旧版本格式才自动追加自定军令
          h += _act10BuildCustomOrder(i, 3);
        }

        // 机遇选取区（占1个行动额度）
        h += _act10BuildOppSelect(opps, i);

        // 提交区
        h += '<div class="submit-area" id="act10-submit-' + i + '">';
        h += '<button class="submit-btn" data-slot="' + i + '">提交行动</button>';
        h += '<button class="col-edit-btn" data-slot="' + i + '">📝 修改行动</button>';
        h += '<span class="submit-hint" id="act10-hint-' + i + '">选满3个行动额度后提交</span>';
        h += '<div class="val-toast" id="act10-toast-' + i + '"></div>';
        h += '</div>';
      }

      h += '</div></div>';
    }
    el.innerHTML = tabH + h;
    _act10BindAll();
  }

  // ── 构建单个令 HTML ──
  function _act10BuildLing(ling, lingIdx, slotIdx, lingKey) {
    var grp = 'g' + slotIdx + '-' + lingKey;
    var h = '<div class="ling" id="act10-ling-' + slotIdx + '-' + lingIdx + '">';

    // 令头
    h += '<div class="ling-header"><span class="ling-num">' + _act10Esc(ling.num || ACT10_LING_NUMS[lingIdx] || '') + '</span><div class="ling-main">';
    h += '<div class="ling-title-row"><span class="ling-name">' + _act10Esc(ling.title || ling.name || '') + '</span>';
    if (ling.risk || ling.prestige) {
      var rc = ling.risk === '稳' ? 'chip-s' : ling.risk === '险' ? 'chip-r' : 'chip-m';
      h += '<div class="ling-risk">';
      if (ling.risk) h += '<span class="chip ' + rc + '">' + _act10Esc(ling.risk) + '</span>';
      if (ling.prestige) h += '<span class="ling-pres">预估 +' + _act10Esc(ling.prestige) + ' 威望</span>';
      h += '</div>';
    }
    h += '</div>';
    if (ling.quote) {
      h += '<div class="ling-quote"><span class="ling-quote-marks">「</span><span class="ling-quote-text">' + _act10Esc(ling.quote) + '</span><span class="ling-quote-marks">」</span>';
      if (ling.quoteWho) h += '<span class="ling-quote-who">— ' + _act10Esc(ling.quoteWho) + '</span>';
      h += '</div>';
    }
    if (ling.note) h += '<div class="ling-note">' + _act10Esc(ling.note) + '</div>';
    h += '</div></div>';

    // 分支列表
    h += '<div class="branch-list">';
    // 优先读 options 数组（parser 标准输出）
    var opts = ling.options || [];
    if (opts.length) {
      opts.forEach(function(opt) {
        h += '<div class="opt" data-grp="' + grp + '" data-slot="' + slotIdx + '" data-ling="' + lingIdx + '" data-val="' + _act10Esc(opt.label || opt.name) + '">';
        h += '<div class="rdot"></div><div class="opt-body">';
        if (opt.label) h += '<span class="opt-lbl">' + _act10Esc(opt.label) + '.</span>';
        h += '<span class="opt-nm">' + _act10Esc(opt.name) + '</span>';
        if (opt.desc) h += '<div class="opt-desc">' + _act10Esc(opt.desc) + '</div>';
        h += '</div></div>';
      });
    } else {
      // 兜底：读 a/b/c 字段
      var optKeys = Object.keys(ling).filter(function(k) { return /^[a-c]$/.test(k); }).sort();
      if (optKeys.length) {
        optKeys.forEach(function(k) {
          var o = ling[k]; if (!o) return;
          h += '<div class="opt" data-grp="' + grp + '" data-slot="' + slotIdx + '" data-ling="' + lingIdx + '" data-val="' + k.toUpperCase() + '">';
          h += '<div class="rdot"></div><div class="opt-body"><span class="opt-lbl">' + k.toUpperCase() + '.</span><span class="opt-nm">' + _act10Esc(o.name) + '</span>';
          if (o.desc) h += '<div class="opt-desc">' + _act10Esc(o.desc) + '</div>';
          h += '</div></div>';
        });
      } else if (ling.desc) {
        // 直球令
        h += '<div class="opt" data-grp="' + grp + '" data-slot="' + slotIdx + '" data-ling="' + lingIdx + '" data-val="execute">';
        h += '<div class="rdot"></div><div class="opt-body"><span class="opt-nm">执行此谋略</span><div class="opt-desc">' + _act10Esc(ling.desc) + '</div></div></div>';
      }
    }
    h += '</div>';

    // 备注区（选中此令后显示，不占额度）
    h += '<div class="remark-block" id="act10-remark-' + slotIdx + '-' + lingIdx + '"><div class="remark-lbl">备注（可选，不占额度）</div><textarea class="remark-ta" rows="1" placeholder="对此行动的补充说明…"></textarea></div>';

    h += '</div>';
    return h;
  }

  // ── 构建④自定军令（和①②③同级）──
  function _act10BuildCustomOrder(slotIdx, lingIdx) {
    var grp = 'g' + slotIdx + '-custom';
    var h = '<div class="ling" id="act10-ling-' + slotIdx + '-' + lingIdx + '">';

    // 令头
    h += '<div class="ling-header">';
    h += '<span class="ling-num">④</span>';
    h += '<div class="ling-main">';
    h += '<div class="ling-title-row"><span class="ling-name">自定军令</span></div>';
    h += '</div></div>';

    // 输入区（作为唯一选项）
    h += '<div class="branch-list">';
    h += '<div class="opt zdjl-opt" data-grp="' + grp + '" data-slot="' + slotIdx + '" data-ling="' + lingIdx + '" data-val="custom">';
    h += '<div class="zdjl-top"><div class="rdot"></div><span class="zdjl-tag">④</span><span class="zdjl-nm">填写自定军令</span></div>';
    h += '<div class="zdjl-wrap"><textarea class="zdjl-ta" rows="3" placeholder="请填写自定军令内容..."></textarea></div>';
    h += '</div>';
    h += '</div>';

    h += '</div>';
    return h;
  }

  // ── 构建机遇选取区 ──
  function _act10BuildOppSelect(opps, slotIdx) {
    var TI = { compete: '⚔️', cooperate: '🤝', epic: '🏆', gamble: '🎲' };
    var TT = { compete: '竞争', cooperate: '协力', epic: '史诗', gamble: '赌博' };
    var TC = { compete: 'chip-ot-jing', cooperate: 'chip-ot-xie', epic: 'chip-ot-shi', gamble: 'chip-ot-du' };
    var grp = 'opp-g' + slotIdx;
    var h = '<div class="opp-select-block">';
    h += '<div class="opp-select-hd"><span class="chip chip-opp" style="font-size:.6rem;">机遇</span><span class="opp-select-title">选取机遇（可选）</span><span class="opp-select-hint">占1个行动额度</span></div>';
    h += '<div class="opp-active-hint">已选机遇 · 占用1个行动额度，还可再选1条令</div>';
    opps.forEach(function(o) {
      h += '<div class="opp-opt-row" data-grp="' + grp + '" data-slot="' + slotIdx + '" data-opp-id="' + o.id + '">';
      h += '<div class="opp-rdot"></div>';
      h += '<span class="opp-opt-icon">' + (TI[o.type] || '⚔️') + '</span>';
      h += '<span class="opp-opt-name">机遇' + o.id + ' · ' + _act10Esc(o.title) + '</span>';
      h += '<span class="opp-opt-pres">+' + o.prestige + '</span>';
      h += '<span class="chip ' + (TC[o.type] || 'chip-ot-jing') + '" style="margin-left:2px;">' + (TT[o.type] || '竞争') + '</span>';
      h += '</div>';
    });
    h += '<div class="opp-no-sel-note">占1个行动额度 · 每人每回合最多选1条</div>';
    h += '</div>';
    return h;
  }

  // ══════════════════════════════════════════
  //  交互绑定
  // ══════════════════════════════════════════
  function _act10BindAll() {
    var root = document.getElementById('act10-root');
    if (!root) return;

    // 选项 Toggle
    root.querySelectorAll('.opt').forEach(function(opt) {
      opt.addEventListener('click', function(e) {
        if (e.target.tagName === 'TEXTAREA') return;

        var panel = this.closest('.col-panel');
        if (panel && panel.dataset.editable === 'false') {
          showToast('⚠️ 无法编辑其他玩家的行动');
          return;
        }

        var grp = this.dataset.grp;
        var si = parseInt(this.dataset.slot);
        var li = parseInt(this.dataset.ling);
        if (isNaN(li)) {
          console.warn('[act10] Invalid data-ling:', this.dataset.ling, 'for opt:', this);
        }
        var already = this.classList.contains('checked');
        root.querySelectorAll('.opt[data-grp="' + grp + '"]').forEach(function(c) { c.classList.remove('checked'); });
        var rem = document.getElementById('act10-remark-' + si + '-' + li);
        if (!already) {
          this.classList.add('checked');
          if (rem) rem.classList.add('visible');
        } else {
          if (rem) rem.classList.remove('visible');
        }
        _act10UpdateBadge(si);
        _act10HideToast(si);
      });
    });

    // 机遇 Toggle（点击选中，再点取消，单选）
    root.querySelectorAll('.opp-opt-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var panel = this.closest('.col-panel');
        if (panel && panel.dataset.editable === 'false') {
          showToast('⚠️ 无法编辑其他玩家的行动');
          return;
        }

        var grp = this.dataset.grp;
        var si = parseInt(this.dataset.slot);
        var already = this.classList.contains('checked');
        // 先清除同组所有选中
        root.querySelectorAll('.opp-opt-row[data-grp="' + grp + '"]').forEach(function(c) { c.classList.remove('checked'); });
        var panel = root.querySelector('.col-panel[data-slot="' + si + '"]');
        if (!already) {
          // 选中
          this.classList.add('checked');
          if (panel) panel.classList.add('opp-active');
        } else {
          // 取消选中
          if (panel) panel.classList.remove('opp-active');
        }
        _act10UpdateBadge(si);
        _act10HideToast(si);
      });
    });

    // textarea 阻止冒泡
    root.querySelectorAll('.zdjl-ta, .remark-ta, .zero-ta').forEach(function(ta) {
      ta.addEventListener('click', function(e) { e.stopPropagation(); });
    });

    // 提交按钮
    root.querySelectorAll('.submit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slotIdx = parseInt(this.dataset.slot);
        var currentSlot = getCurrentPlayerSlot();

        if (slotIdx !== currentSlot) {
          showToast('⚠️ 无法提交其他玩家的行动');
          return;
        }

        _act10Submit(slotIdx);
      });
    });

    // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓
    // 修改按钮
    root.querySelectorAll('.col-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slotIdx = parseInt(this.dataset.slot);
        var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
        if (!panel) return;

        // 解锁面板
        panel.classList.remove('submitted-locked');

        // ↓↓↓ 工单 #edit-btn-fix-v2 彻底清除摘要区 ↓↓↓
        var summary = document.getElementById('act10-summary-' + slotIdx);
        if (summary) {
          summary.style.display = 'none';
          summary.innerHTML = ''; // 清空内容，防止占据空间
        }
        // ↑↑↑ 工单结束 ↑↑↑

        // 强制触发重绘，确保 pointer-events 立即恢复
        var colBody = panel.querySelector('.col-body');
        if (colBody) {
          void colBody.offsetHeight;
          colBody.style.pointerEvents = 'auto';
        }

        // ↓↓↓ 工单 #edit-btn-fix-v2 清除残留选中态 ↓↓↓
        // 清除所有选项的选中状态，避免 UI 残留
        panel.querySelectorAll('.opt.checked, .opp-opt-row.checked').forEach(function(el) {
          el.classList.remove('checked');
        });
        // 清空自定军令和备注输入框
        panel.querySelectorAll('.zdjl-ta, .remark-ta').forEach(function(ta) {
          ta.value = '';
        });
        // 重置徽章
        _act10UpdateBadge(slotIdx);
        // ↑↑↑ 工单结束 ↑↑↑

        showToast('📝 已解锁，可重新选择行动');
      });
    });
    // ↑↑↑ 工单结束 ↑↑↑

    // ↓↓↓ 工单 #action-draft-autosave-v1 ↓↓↓
    // 草稿自动保存逻辑
    var draftTimer = null;
    var DRAFT_DEBOUNCE = 1000; // 1秒防抖

    // 监听所有输入变化（选项、机遇、自定军令、备注）
    root.querySelectorAll('.opt, .opp-opt-row, .zdjl-ta, .remark-ta').forEach(function(el) {
      var eventType = (el.tagName === 'TEXTAREA') ? 'input' : 'click';
      el.addEventListener(eventType, function() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(function() {
          _act10SaveDraft();
        }, DRAFT_DEBOUNCE);
      });
    });

    // 保存草稿函数
    function _act10SaveDraft() {
      var currentSlot = getCurrentPlayerSlot();
      var currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
      if (currentSlot === null || !currentRound) return;

      var draft = _act10CollectSlot(currentSlot);
      if (!draft) return;

      var key = 'sg_draft_r' + currentRound + '_s' + currentSlot;
      try {
        localStorage.setItem(key, JSON.stringify(draft));
        console.log('[act10] 草稿已保存:', key);
      } catch (e) {
        console.warn('[act10] 草稿保存失败:', e);
      }
    }

    // 加载草稿函数（在渲染完成后调用）
    function _act10LoadDraft() {
      var currentSlot = getCurrentPlayerSlot();
      var currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
      if (currentSlot === null || !currentRound) return;

      var key = 'sg_draft_r' + currentRound + '_s' + currentSlot;
      var draftStr = localStorage.getItem(key);
      if (!draftStr) return;

      try {
        var draft = JSON.parse(draftStr);
        _act10RestoreDraft(draft, currentSlot);
        console.log('[act10] 草稿已加载:', key);
      } catch (e) {
        console.warn('[act10] 草稿加载失败:', e);
      }
    }

    // 恢复草稿到UI
    function _act10RestoreDraft(draft, slotIdx) {
      var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
      if (!panel) return;

      // 恢复令选择
      (draft.ling_selections || []).forEach(function(sel) {
        var ling = panel.querySelector('.ling[id*="-' + sel.lingIdx + '"]');
        if (!ling) return;
        var opt = ling.querySelector('.opt[data-val="' + sel.choice + '"]');
        if (opt) {
          opt.click(); // 模拟点击，触发UI更新
          // 恢复自定军令文本
          if (sel.customText) {
            var ta = opt.querySelector('.zdjl-ta');
            if (ta) ta.value = sel.customText;
          }
        }
      });

      // 恢复机遇选择
      if (draft.opp_selection && draft.opp_selection.type === 'opp') {
        var oppRow = panel.querySelector('.opp-opt-row[data-opp-id="' + draft.opp_selection.oppId + '"]');
        if (oppRow) oppRow.click();
      }
    }

    // 页面加载时恢复草稿
    _act10LoadDraft();
    // ↑↑↑ 工单结束 ↑↑↑

    // v6.3: 移动端 tab 已删除，无需事件绑定
  }

  function _act10UpdateBadge(si) {
    var root = document.getElementById('act10-root');
    if (!root) {
      console.warn('[act10] UpdateBadge: root not found');
      return;
    }
    var panel = root.querySelector('.col-panel[data-slot="' + si + '"]');
    if (!panel) {
      console.warn('[act10] UpdateBadge: panel not found for slot', si);
      return;
    }
    // 令选中数（①②③④ 中选中的）
    var lingCount = panel.querySelectorAll('.branch-list .opt.checked').length;
    // 机遇是否选中
    var oppChecked = panel.querySelector('.opp-opt-row.checked');
    var oppCount = oppChecked ? 1 : 0;
    var total = Math.min(lingCount + oppCount, 3);
    console.log('[act10] UpdateBadge slot', si, '- lingCount:', lingCount, 'oppCount:', oppCount, 'total:', total);
    var badge = document.getElementById('act10-badge-' + si);
    if (badge) {
      badge.querySelector('.sc').textContent = total;
      badge.classList.toggle('full', total >= 3);
    } else {
      console.warn('[act10] UpdateBadge: badge not found for slot', si);
    }
  }

  // ══════════════════════════════════════════
  //  收集选择数据
  // ══════════════════════════════════════════
  function _act10CollectSlot(slotIdx) {
    var root = document.getElementById('act10-root');
    if (!root) return null;
    var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
    if (!panel) return null;

    var lingSelections = [];
    var remarks = [];
    panel.querySelectorAll('.ling').forEach(function(ling, li) {
      var checked = ling.querySelector('.opt.checked');
      if (!checked) return;
      var val = checked.dataset.val || '';
      var customText = null;
      if (checked.classList.contains('zdjl-opt')) {
        var ta = checked.querySelector('.zdjl-ta');
        customText = ta ? ta.value.trim() : '';
        if (!customText) return; // 自定军令为空不计
      }
      lingSelections.push({ lingIdx: li, choice: val, customText: customText });
    });

    // 机遇（可选，不选则 type:'none'）
    var oppSel = { type: 'none' };
    var oppChecked = panel.querySelector('.opp-opt-row.checked');
    if (oppChecked) {
      oppSel = { type: 'opp', oppId: oppChecked.dataset.oppId || '' };
    }

    // 零消耗已删除
    var zeroCost = '';

    return {
      ling_selections: lingSelections,
      opp_selection: oppSel,
      zero_cost: zeroCost,
      remarks: remarks
    };
  }

  // ══════════════════════════════════════════
  //  提交到 Supabase
  // ══════════════════════════════════════════
  async function _act10Submit(slotIdx) {
    var root = document.getElementById('act10-root');
    if (!root) return;
    var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
    if (!panel) return;
    var currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
    if (!currentRound) { showToast('当前无回合数据'); return; }

    // 校验：总额度3，机遇占1（可选），令占剩余
    var reasons = [];
    var lingCount = 0;
    var zdjlEmpty = false;
    panel.querySelectorAll('.ling').forEach(function(ling) {
      var reg = ling.querySelector('.opt:not(.zdjl-opt).checked');
      if (reg) { lingCount++; return; }
      var zd = ling.querySelector('.zdjl-opt.checked');
      if (zd) {
        var ta = zd.querySelector('.zdjl-ta');
        (ta && ta.value.trim()) ? lingCount++ : (zdjlEmpty = true);
      }
    });
    var oppChecked = panel.querySelector('.opp-opt-row.checked');
    var oppCount = oppChecked ? 1 : 0;
    var totalUsed = lingCount + oppCount;
    if (totalUsed < 3) {
      var need = 3 - totalUsed;
      reasons.push('还需选择 <b>' + need + '</b> 个行动（已用 ' + totalUsed + ' / 3 额度）');
    } else if (totalUsed > 3) {
      reasons.push('行动额度已超（已选 ' + totalUsed + ' / 3 额度）。机遇占1个额度，请减少选择');
    }
    if (zdjlEmpty) reasons.push('已勾选「自定军令」但内容为空，请填写后再提交');
    if (reasons.length) { _act10ShowToast(slotIdx, reasons); return; }
    _act10HideToast(slotIdx);

    var data = _act10CollectSlot(slotIdx);
    if (!data) return;

    var payload = {
      round: currentRound,
      slot: ACT10_SLOT_NAMES[slotIdx],
      ling_selections: JSON.stringify(data.ling_selections),
      opp_selection: JSON.stringify(data.opp_selection),
      zero_cost: data.zero_cost,
      remarks: JSON.stringify(data.remarks)
    };

    var btn = panel.querySelector('.submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 提交中…'; }

    try {
      // UPSERT by round+slot
      var res = await fetchWithTimeout(ACT10_SUPA_URL, {
        method: 'POST',
        headers: Object.assign({}, SUPA_HEADERS, { 'Prefer': 'return=representation,resolution=merge-duplicates' }),
        body: JSON.stringify(payload),
      }, 10000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      showToast('✅ ' + ACT10_SLOT_NAMES[slotIdx] + ' 行动已提交！');
      await _act10LoadSubmissions(currentRound);
      // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓
      // 提交成功后锁定面板
      var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
      if (panel) panel.classList.add('submitted-locked');
      // ↑↑↑ 工单结束 ↑↑↑
    } catch (e) {
      console.error('[act10] 提交失败:', e);
      // 超时或报错后，强制重新加载提交状态，确认是否真的失败
      try {
        await _act10LoadSubmissions(currentRound);
        var sumEl = document.getElementById('act10-summary-' + slotIdx);
        if (sumEl && sumEl.style.display !== 'none') {
          // 摘要区显示 = 实际已提交成功（只是响应超时）
          showToast('✅ ' + ACT10_SLOT_NAMES[slotIdx] + ' 行动已提交！');
          return; // 提前返回，不执行 finally 中的按钮恢复
        } else {
          // 确实失败
          showToast('❌ 提交失败，请重试');
        }
      } catch (e2) {
        // 重新加载状态也失败，显示原始错误
        showToast('❌ 提交失败，请重试');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '提交行动'; }
    }
  }

  // ══════════════════════════════════════════
  //  加载已提交数据 + 渲染摘要 + GM 复制按钮
  // ══════════════════════════════════════════
  async function _act10LoadSubmissions(roundNum) {
    if (!roundNum) return;
    try {
      var res = await fetchWithTimeout(
        ACT10_SUPA_URL + '?round=eq.' + roundNum + '&select=*',
        { headers: SUPA_HEADERS }, 8000
      );
      if (!res.ok) return;
      var rows = await res.json();
      var submitted = {};
      rows.forEach(function(r) { submitted[r.slot] = r; });

      // 渲染摘要 + 控制提交区
      ACT10_SLOT_NAMES.forEach(function(sk, i) {
        var sumEl = document.getElementById('act10-summary-' + i);
        var subArea = document.getElementById('act10-submit-' + i);
        var sub = submitted[sk];
        if (sub) {
          // 显示摘要
          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }
          // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓
          // 已提交数据存在，且是当前玩家，自动锁定
          var currentSlot = getCurrentPlayerSlot();
          if (i === currentSlot) {
            var panel = document.querySelector('.col-panel[data-slot="' + i + '"]');
            if (panel) panel.classList.add('submitted-locked');
          }
          // ↑↑↑ 工单结束 ↑↑↑
          // 提交区改为"已提交 + 修改按钮"
          if (subArea) {
            subArea.innerHTML = '<div class="submitted-tag">✅ 已提交行动</div>'
              + '<button class="withdraw-btn" data-slot="' + i + '">修改</button>';
            subArea.querySelector('.withdraw-btn').addEventListener('click', function() {
              _act10Withdraw(parseInt(this.dataset.slot));
            });
          }
        } else {
          if (sumEl) sumEl.style.display = 'none';
        }
      });

      // GM 复制按钮
      var allDone = ACT10_SLOT_NAMES.every(function(s) { return !!submitted[s]; });
      var gmBtn = document.getElementById('btn-gm-copy-all-actions');
      if (gmBtn) gmBtn.disabled = !allDone;

      // 缓存提交数据给 GM 复制用
      window._act10Submitted = submitted;

      // ← 新增：自动更新高亮状态
      _act10UpdateAllPanelsHighlight();

    } catch (e) {
      console.error('[act10] 加载提交状态失败:', e);
    }
  }

  // ══════════════════════════════════════════
  //  行动提交实时变更回调
  // ══════════════════════════════════════════
  async function _onActionSubmissionChanged(payload) {
    var currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
    if (!currentRound) return;

    // 只处理当前回合的变更
    var changedRound = payload.new?.round || payload.old?.round;
    if (changedRound !== currentRound) return;

    console.log('[act10] 检测到行动提交变更，同步中...', payload);

    // 重新加载提交状态
    await _act10LoadSubmissions(currentRound);

    // 检查是否三人全部提交
    _checkAllSubmitted();

    // ← 修改：强化高亮更新 + Toast 提示
    _act10UpdateAllPanelsHighlight();

    // 提示：哪个玩家刚刚提交/修改了
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      var changedSlot = payload.new?.slot;
      if (changedSlot) {
        var slotIdx = ACT10_SLOT_NAMES.indexOf(changedSlot);
        var playerName = state.players[slotIdx] ? state.players[slotIdx].name : '城主' + changedSlot;
        showToast('📬 ' + playerName + ' 已提交行动', 'info', 2000);
      }
    } else if (payload.eventType === 'DELETE') {
      var changedSlot = payload.old?.slot;
      if (changedSlot) {
        var slotIdx = ACT10_SLOT_NAMES.indexOf(changedSlot);
        var playerName = state.players[slotIdx] ? state.players[slotIdx].name : '城主' + changedSlot;
        showToast('↩️ ' + playerName + ' 已撤回行动', 'info', 2000);
      }
    }
  }

  // ══════════════════════════════════════════
  //  全面板高亮更新函数（方案A v2）
  // ══════════════════════════════════════════
  /**
   * 更新所有行动面板的已选高亮状态
   * - 自己的选择：正常高亮（checked）
   * - 其他人的选择：半透明高亮（other-submitted）
   */
  function _act10UpdateAllPanelsHighlight() {
    var submitted = window._act10Submitted || {};
    var currentSlot = getCurrentPlayerSlot();

    ACT10_SLOT_NAMES.forEach(function(sk, slotIdx) {
      var sub = submitted[sk];
      var panel = document.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
      if (!panel) return;

      // 先清除所有高亮状态
      panel.querySelectorAll('.opt').forEach(function(opt) {
        opt.classList.remove('other-submitted');
      });
      panel.querySelectorAll('.opp-opt-row').forEach(function(row) {
        row.classList.remove('other-submitted');
      });

      // 如果没有提交数据，跳过
      if (!sub) return;

      var lingSelections = safeJson(sub.ling_selections, []);
      var oppSel = safeJson(sub.opp_selection, {});

      // 标记已提交的选项
      lingSelections.forEach(function(sel) {
        var lings = panel.querySelectorAll('.ling');
        var ling = lings[sel.lingIdx];
        if (!ling) return;

        var targetOpt = null;
        if (sel.customText) {
          // 自定军令
          targetOpt = ling.querySelector('.opt.zdjl-opt');
        } else {
          // 普通选项
          targetOpt = ling.querySelector('.opt[data-val="' + sel.choice + '"]');
        }

        if (targetOpt) {
          // 如果是当前玩家，保持 checked 状态；否则添加 other-submitted
          if (slotIdx !== currentSlot) {
            targetOpt.classList.add('other-submitted');
          }
        }
      });

      // 机遇选择高亮
      if (oppSel.type === 'opp' && oppSel.oppId) {
        var oppRow = panel.querySelector('.opp-opt-row[data-opp-id="' + oppSel.oppId + '"]');
        if (oppRow && slotIdx !== currentSlot) {
          oppRow.classList.add('other-submitted');
        }
      }
    });
  }

  // ══════════════════════════════════════════
  //  检测三人全部提交 + 弹窗提醒
  // ══════════════════════════════════════════
  function _checkAllSubmitted() {
    var submitted = window._act10Submitted || {};
    var allDone = ACT10_SLOT_NAMES.every(function(s) { return !!submitted[s]; });

    if (allDone && !window._act10AllSubmittedNotified) {
      window._act10AllSubmittedNotified = true;

      // ← 修改：更醒目的提示（5秒 + success 样式）
      showToast('🎯 三家行动已齐，可结算！', 'success', 5000);

      // ← 新增：可选的提示音效（浏览器允许的情况下播放）
      try {
        var audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE=');
        audio.volume = 0.3;
        audio.play().catch(function() {
          console.log('[act10] 提示音播放失败（用户未交互）');
        });
      } catch (e) {
        // 静默失败，不影响主流程
      }
    }
  }

  // ── 构建已提交摘要 HTML ──
  function _act10BuildSummary(sub, slotIdx) {
    var sels = [];
    try { sels = typeof sub.ling_selections === 'string' ? JSON.parse(sub.ling_selections) : (sub.ling_selections || []); } catch (e) { sels = []; }
    var opp = {};
    try { opp = typeof sub.opp_selection === 'string' ? JSON.parse(sub.opp_selection) : (sub.opp_selection || {}); } catch (e) { opp = {}; }
    var rems = [];
    try { rems = typeof sub.remarks === 'string' ? JSON.parse(sub.remarks) : (sub.remarks || []); } catch (e) { rems = []; }

    var h = '<div class="col-summary-hd">已提交行动</div>';
    sels.forEach(function(sel) {
      var label = '行动' + ACT10_LING_NUMS[sel.lingIdx];
      var val = sel.choice === 'custom' ? '自定军令: ' + _act10Esc(sel.customText || '') : ACT10_LING_NUMS[sel.lingIdx] + ' ' + _act10Esc(sel.choice);
      h += '<div class="col-summary-row"><span class="sum-lbl">' + label + '</span><span class="sum-val">' + val + '</span></div>';
    });
    if (opp.type === 'opp') {
      h += '<div class="col-summary-row"><span class="sum-lbl">机遇</span><span class="sum-val">机遇' + _act10Esc(opp.oppId) + '</span></div>';
    }
    if (sub.zero_cost) {
      h += '<div class="col-summary-row"><span class="sum-lbl">零消耗</span><span class="sum-val dim">' + _act10Esc(sub.zero_cost) + '</span></div>';
    }
    rems.forEach(function(rem) {
      h += '<div class="col-summary-row"><span class="sum-lbl">备注' + ACT10_LING_NUMS[rem.lingIdx] + '</span><span class="sum-val dim">' + _act10Esc(rem.text) + '</span></div>';
    });
    return h;
  }

  // ── 修改（撤回后重新编辑）──
  async function _act10Withdraw(slotIdx) {
    var currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
    if (!currentRound) return;
    var sk = ACT10_SLOT_NAMES[slotIdx];

    // 获取已提交的数据
    var submitted = window._act10Submitted || {};
    var sub = submitted[sk];
    if (!sub) return;

    // ← ↓↓↓ 新增：真删除数据库记录 ↓↓↓
    try {
      // 删除 Supabase 中的提交记录
      var deleteUrl = ACT10_SUPA_URL + '?round=eq.' + currentRound + '&slot=eq.' + sk;
      var res = await fetchWithTimeout(deleteUrl, {
        method: 'DELETE',
        headers: SUPA_HEADERS,
      }, 8000);

      if (!res.ok) {
        console.error('[act10] 删除提交记录失败:', res.status);
        showToast('❌ 撤回失败，请重试');
        return;
      }

      // 从本地缓存中移除
      delete submitted[sk];
      window._act10Submitted = submitted;

      showToast('↩️ 已撤回 ' + sk + ' 的提交，可重新编辑');
    } catch (e) {
      console.error('[act10] 撤回失败:', e);
      showToast('❌ 撤回失败，请重试');
      return;
    }
    // ← ↑↑↑ 新增结束 ↑↑↑

    // 隐藏摘要
    var sumEl = document.getElementById('act10-summary-' + slotIdx);
    if (sumEl) sumEl.style.display = 'none';

    // 恢复提交按钮
    var subArea = document.getElementById('act10-submit-' + slotIdx);
    if (subArea) {
      subArea.innerHTML = '<button class="submit-btn" data-slot="' + slotIdx + '">提交行动</button>'
        + '<span class="submit-hint" id="act10-hint-' + slotIdx + '">修改后重新提交</span>'
        + '<div class="val-toast" id="act10-toast-' + slotIdx + '"></div>';
      subArea.querySelector('.submit-btn').addEventListener('click', function() {
        _act10Submit(parseInt(this.dataset.slot));
      });
    }

    // ════ 恢复选择状态 ════
    var panel = document.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
    if (!panel) return;

    // 先清除所有选中状态
    panel.querySelectorAll('.opt').forEach(function(opt) {
      opt.classList.remove('checked');
    });
    panel.querySelectorAll('.opp-opt-row').forEach(function(row) {
      row.classList.remove('checked');
    });
    panel.classList.remove('opp-active');

    var lingSelections = safeJson(sub.ling_selections, []);
    var oppSel = safeJson(sub.opp_selection, {});

    // 1. 恢复行动令选择（模拟点击以触发事件）
    lingSelections.forEach(function(sel) {
      var lings = panel.querySelectorAll('.ling');
      var ling = lings[sel.lingIdx];
      if (!ling) return;

      var targetOpt = null;
      if (sel.customText) {
        // 自定军令
        targetOpt = ling.querySelector('.opt.zdjl-opt');
        if (targetOpt) {
          var ta = targetOpt.querySelector('.zdjl-ta');
          if (ta) ta.value = sel.customText;
          // 模拟点击自定军令选项
          targetOpt.click();
        }
      } else {
        // 普通选项
        targetOpt = ling.querySelector('.opt[data-val="' + sel.choice + '"]');
        if (targetOpt) {
          // 模拟点击普通选项
          targetOpt.click();
        }
      }
    });

    // 2. 恢复机遇选择（模拟点击）
    if (oppSel.type === 'opp' && oppSel.oppId) {
      var oppRow = panel.querySelector('.opp-opt-row[data-opp-id="' + oppSel.oppId + '"]');
      if (oppRow) {
        oppRow.click();
      }
    } else {
      var noOppRow = panel.querySelector('.opp-opt-row.no-opp');
      if (noOppRow) {
        noOppRow.click();
      }
    }

    // 3. 恢复零消耗（直接赋值即可）
    var zeroTa = panel.querySelector('.zero-ta');
    if (zeroTa && sub.zero_cost) {
      zeroTa.value = sub.zero_cost;
    }
  }

  // ── GM 一键复制 ──
  async function _act10GMCopy() {
    var currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
    if (!currentRound) return;
    var submitted = window._act10Submitted || {};

    var text = '第 ' + currentRound + ' 回合 · 玩家行动\n\n';
    ACT10_SLOT_NAMES.forEach(function(sk, i) {
      var name = state.players[i] ? state.players[i].name : sk;
      var sub = submitted[sk];
      text += name + ' [' + sk + ']\n';
      if (!sub) { text += '  （未提交）\n\n'; return; }

      var sels = [];
      try { sels = typeof sub.ling_selections === 'string' ? JSON.parse(sub.ling_selections) : (sub.ling_selections || []); } catch (e) {}
      var opp = {};
      try { opp = typeof sub.opp_selection === 'string' ? JSON.parse(sub.opp_selection) : (sub.opp_selection || {}); } catch (e) {}
      var rems = [];
      try { rems = typeof sub.remarks === 'string' ? JSON.parse(sub.remarks) : (sub.remarks || []); } catch (e) {}

      sels.forEach(function(sel) {
        var label = '  行动' + ACT10_LING_NUMS[sel.lingIdx] + ': ';
        if (sel.choice === 'custom') {
          text += label + '自定军令: ' + (sel.customText || '') + '\n';
        } else {
          text += label + sel.choice + '\n';
        }
      });
      if (opp.type === 'opp') {
        text += '  机遇: 机遇' + (opp.oppId || '') + '\n';
      } else {
        text += '  机遇: 不选\n';
      }
      if (sub.zero_cost) text += '  零消耗: ' + sub.zero_cost + '\n';
      rems.forEach(function(rem) {
        text += '  备注' + ACT10_LING_NUMS[rem.lingIdx] + ': ' + rem.text + '\n';
      });
      text += '\n';
    });

    try {
      await navigator.clipboard.writeText(text.trim());
      showToast('📋 已复制全部行动');
      var okEl = document.getElementById('gm-copy-all-ok');
      if (okEl) { okEl.classList.remove('hidden'); setTimeout(function() { okEl.classList.add('hidden'); }, 2500); }
    } catch (e) {
      showToast('❌ 复制失败');
    }
  }

  // ── Toast ──
  function _act10ShowToast(si, reasons) {
    var t = document.getElementById('act10-toast-' + si);
    if (!t) return;
    t.innerHTML = '<div class="val-toast-hd">⚠️ 提交条件未满足</div><ul>' + reasons.map(function(r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
    t.classList.add('show');
  }
  function _act10HideToast(si) {
    var t = document.getElementById('act10-toast-' + si);
    if (t) t.classList.remove('show');
  }

  // ── HTML 转义 ──
  function _act10Esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
      renderActionTab(latest);
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

    // #fog-of-war-main-v1 + #storm-intel-v1 + #secret-digest-fix-v1:
    // 密报块在"战局动态"中完全不显示（有专门的"密报阁"板块）
    // 无条件删除所有 [[密|X]]...[[/密]] 块（包括标签和内容）
    if (rawText.includes('[[密|')) {
      const RE = /\[\[密\|([甲乙丙,]+)\]\]([\s\S]*?)\[\[\/密\]\]/g;
      rawText = rawText.replace(RE, ''); // 删除整个密报块
    }

    // ── v6.0: 截断行动令段 ──
    // 🎯 行动令 已由行动 Tab 专门渲染，战局总览不重复显示。
    // 从 rawText 中移除 🎯 行动令 及其后所有内容（到剧情区末尾）。
    const actionOrderCutIdx = rawText.search(/🎯\s*行动令/);
    if (actionOrderCutIdx > 0) {
      rawText = rawText.slice(0, actionOrderCutIdx).replace(/\s+$/, '');
    }

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

    });
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
  // 提取武将名和状态
  const name = (g && g.name) || '';
  const status = (g && g.status) || '健康';

  // 只输出 class + data-status + data-name，样式完全由 CSS 控制
  return '<span class="gen-tag" data-status="' + esc(status)
    + '" data-name="' + esc(name) + '">'
    + esc(name)
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
    // v20260619a #warboard-js-v1: 旧军报板块已下线，由 renderWorld() 接管
    // 保留空函数避免 renderAll() 调用链报错
    return;
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
    // v20260619a #warboard-js-v1: 重写为战情速报板块渲染
    const block = document.getElementById('block-warboard');
    if (!block) return;

    const parsed  = (latest && latest.parsed) ? latest.parsed : {};
    const transit = Array.isArray(parsed.transit) ? parsed.transit : [];
    const battles = Array.isArray(parsed.battles) ? parsed.battles : [];

    // 双空 → 隐藏整块
    if (!transit.length && !battles.length) {
      block.classList.add('hidden');
      return;
    }
    block.classList.remove('hidden');

    // 渲染战报列
    const battlesListEl = document.getElementById('wb-battles-list');
    if (battlesListEl) {
      if (!battles.length) {
        battlesListEl.innerHTML = '<div class="wb-empty-wrap"><span class="wb-empty">本回合无战事</span></div>';
      } else {
        battlesListEl.innerHTML = battles.map(function(b) { return _buildWbBattleCard(b); }).join('');
      }
    }

    // 渲染调度列 + #fog-transit-filter-v1: 战争迷雾过滤
    const transitListEl = document.getElementById('wb-transit-list');
    if (transitListEl) {
      // v6.0: 战争迷雾已移除，所有调度全部公开
      const visibleTransit = transit;

      if (!visibleTransit.length) {
        transitListEl.innerHTML = '<div class="wb-empty-wrap"><span class="wb-empty">本回合无调度部队</span></div>';
      } else {
        transitListEl.innerHTML = visibleTransit.map(function(t) { return _buildWbTransitCard(t); }).join('');
      }
    }
  }

  // ── 战情速报：单张战报卡片 ──
  function _buildWbBattleCard(b) {
    var WIN_SET = ['惨胜','小胜','大胜','胜'];
    var LOSE_SET = ['小负','大败','负'];
    var cardCls = WIN_SET.indexOf(b.result) !== -1 ? 'win'
                : LOSE_SET.indexOf(b.result) !== -1 ? 'lose'
                : 'draw';

    var atkColor = _junbaoGetSideColor(b.attackerSlot, b.attackerFaction);
    var defColor = _junbaoGetSideColor(b.defenderSlot, b.defenderFaction);
    var atkBadge = _junbaoGetBadgeText(b.attackerSlot, b.attackerFaction);
    var defBadge = _junbaoGetBadgeText(b.defenderSlot, b.defenderFaction);
    var atkName  = b.attackerGeneral || _junbaoStripPrefix(b.attacker, atkBadge);
    var defName  = b.defenderGeneral || _junbaoStripPrefix(b.defender, defBadge);
    var city     = b.defenderCity || b.city || '';

    var atkLoss = b.attacker_loss != null ? b.attacker_loss : 0;
    var defLoss = b.defender_loss != null ? b.defender_loss : 0;
    var isZeroLoss = (atkLoss === 0 && defLoss === 0);
    var lossText = isZeroLoss ? '零损接管' : ('攻' + atkLoss + ' 守' + defLoss);
    var lossStyle = isZeroLoss ? ' style="color:var(--text-dim);opacity:.5"' : '';

    return '<div class="wb-br-card ' + cardCls + '">'
      + '<span class="wb-br-result">' + esc(b.result || '') + '</span>'
      + '<span class="wb-br-badge" style="color:' + atkColor.glow + ';border-color:' + atkColor.stroke + '">' + esc(atkBadge) + '</span>'
      + '<span class="wb-br-name">' + esc(atkName) + '</span>'
      + '<span class="wb-br-vs">vs</span>'
      + '<span class="wb-br-badge" style="color:' + defColor.glow + ';border-color:' + defColor.stroke + '">' + esc(defBadge) + '</span>'
      + '<span class="wb-br-name">' + esc(defName) + '</span>'
      + (city ? '<span class="wb-br-city">' + esc(city) + '</span>' : '')
      + '<span class="wb-br-losses"' + lossStyle + '>' + lossText + '</span>'
      + '</div>';
  }

  // ── 战情速报：单张调度卡片 ──
  function _buildWbTransitCard(t) {
    var side = _getWorldMilSide(t);
    var color = side.factionColor;
    var label = side.factionLabel;

    // 状态 CSS class 映射
    var statusCls = 'wb-st-generic';
    var s = t.status || '';
    if (s === '攻城中')      statusCls = 'wb-st-siege';
    else if (s === '交战中') statusCls = 'wb-st-battle';
    else if (s === '客驻')   statusCls = 'wb-st-guest';
    else if (s === '巡防')   statusCls = 'wb-st-patrol';
    else if (s === '撤退中') statusCls = 'wb-st-retreat';
    else if (s === '驻屯')   statusCls = 'wb-st-camp';
    else if (s === '护送')   statusCls = 'wb-st-escort';
    else if (s === '待命')   statusCls = 'wb-st-standby';
    else if (/^剩\d+$/.test(s)) statusCls = 'wb-st-march';

    var troopStr = _formatTransitTroops(t);

    return '<div class="wb-dp-card" style="--wb-strip-c:' + color + '">'
      + '<div class="wb-dp-line1">'
        + '<span class="wb-dp-badge" style="color:' + color + ';border-color:' + color + '">' + esc(label) + '</span>'
        + '<span class="wb-dp-general">' + esc(t.general || '') + '</span>'
        + '<span class="wb-dp-status ' + statusCls + '">' + esc(s) + '</span>'
      + '</div>'
      + '<div class="wb-dp-line2">'
        + '<span class="wb-dp-route">' + esc(t.from || '') + '<span class="wb-arrow">→</span>' + esc(t.to || '') + '</span>'
        + (troopStr ? '<span class="wb-dp-troop">' + troopStr + '</span>' : '')
      + '</div>'
      + '</div>';
  }


  /* v20260609-fengyan: 武将动态已下线，以下函数停用
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
  v20260609-fengyan: END */

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

  /* v20260609-fengyan: 武将动态已下线，以下函数停用
  // 武将动态折叠阈值
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

    listEl.innerHTML = rowsHtml;
  }
  v20260609-fengyan: END */

  // 烽烟折叠阈值

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
      out.push(milRows);
    }
    out.push('</div>');

    // ── 战况结算段(只在有战况时渲染)──
    if (battles.length > 0) {
      out.push('<div class="world-subsec world-subsec--bat">');
      out.push('<h5 class="world-subsec-title">战况结算</h5>');
      const batRows = battles.map(b => _buildWorldBatRow(b)).join('');
      out.push(batRows);
      out.push('</div>');
    }

    listEl.innerHTML = out.join('');
    listEl.querySelectorAll('.world-fold-wrap').forEach(_applyWorldFold);
  }

  // 单行调度(方案B v2: Flex + identity分组)
  function _buildWorldMilRow(t) {
    var side = _getWorldMilSide(t);
    var faction = side.factionLabel;
    var mc      = side.factionColor;
    var general = String(t.general || '');
    var from    = String(t.from || '');
    var to      = String(t.to || '');
    var troopStr = _formatTransitTroops(t);
    var status  = String(t.status || '');

    return '<div class="world-mil-row" style="--wm-c:' + mc + '">' +
      '<span class="world-mil-identity">' +
        '<span class="world-mil-faction">' + esc(faction) + '</span>' +
        '<span class="world-mil-general">' + esc(general) + '</span>' +
      '</span>' +
      '<span class="world-mil-route">' + esc(from) + '<span class="arrow">›</span>' + esc(to) + '</span>' +
      '<span class="world-mil-right">' +
        (troopStr ? '<span class="world-mil-troop">' + troopStr + '</span>' : '') +
        _renderWorldStatus(status) +
      '</span>' +
    '</div>';
  }

  // 单行战况:攻方→守方 + 城名 + 结果徽章 + 伤亡
  // 攻守双方徽章色复用 _junbaoGetSideColor / _junbaoGetBadgeText
  /* [legacy v1]
  function _buildWorldBatRow(b) {
    const atkColor = _junbaoGetSideColor(b.attackerSlot, b.attackerFaction);
    const defColor = _junbaoGetSideColor(b.defenderSlot, b.defenderFaction);

    const atkLabel = _junbaoGetBadgeText(b.attackerSlot, b.attackerFaction);
    const defLabel = _junbaoGetBadgeText(b.defenderSlot, b.defenderFaction);

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

    // [legacy v1]
//     return '<div class="world-bat-row" data-result="' + resultCls + '">' +
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
  */
  function _buildWorldBatRow(b) {
    var atkColor = _junbaoGetSideColor(b.attackerSlot, b.attackerFaction);
    var defColor = _junbaoGetSideColor(b.defenderSlot, b.defenderFaction);

    var atkLabel = _junbaoGetBadgeText(b.attackerSlot, b.attackerFaction);
    var defLabel = _junbaoGetBadgeText(b.defenderSlot, b.defenderFaction);

    var atkName = b.attackerGeneral || _junbaoStripPrefix(b.attacker, atkLabel);
    var defName = b.defenderGeneral || _junbaoStripPrefix(b.defender, defLabel);

    var city = b.defenderCity || b.city || '';

    var result = String(b.result || '');
    var WIN_SET = ['惨胜','小胜','大胜','胜'];
    var LOSE_SET = ['小负','大败','负'];
    var resultCls = WIN_SET.includes(result) ? 'win'
                  : LOSE_SET.includes(result) ? 'lose'
                  : 'draw';

    var atkLoss = b.attacker_loss != null ? b.attacker_loss : '0';
    var defLoss = b.defender_loss != null ? b.defender_loss : '0';

    return '<div class="wbat-row ' + resultCls + '" style="--wm-c:' + atkColor.glow + '">' +
      '<span class="wbat-atk-group">' +
        '<span class="world-mil-faction" style="color:' + atkColor.glow + ';border-color:' + atkColor.stroke + '">' + esc(atkLabel) + '</span>' +
        '<span class="world-mil-general">' + esc(atkName) + '</span>' +
      '</span>' +
      '<span class="wbat-vs">vs</span>' +
      '<span class="wbat-def-group">' +
        '<span class="world-mil-faction" style="color:' + defColor.glow + ';border-color:' + defColor.stroke + '">' + esc(defLabel) + '</span>' +
        '<span class="world-mil-general">' + esc(defName) + '</span>' +
      '</span>' +
      '<span class="wbat-info">' +
        (city ? '<span class="wbat-city">' + esc(city) + '</span>' : '') +
        '<span class="wbat-losses">-' + atkLoss + '/-' + defLoss + '</span>' +
        '<span class="wbat-status ' + resultCls + '">' + esc(result) + '</span>' +
      '</span>' +
    '</div>';
  }

  // 折叠按钮事件绑定(委托到 listEl,幂等)
  /* [legacy v1]
  function _bindWorldFoldBtn(listEl) {
    if (listEl._sgWorldFoldBound) return;
    listEl._sgWorldFoldBound = true;
  */
  function _applyWorldFold(wrap) {
    var collapsed = wrap.getAttribute('data-fold-collapsed') === '1';
    var rows = wrap.querySelectorAll('.world-gen-row, .world-mil-row, .wbat-row');
    var limit = parseInt(wrap.getAttribute('data-fold-limit') || '0', 10);
    if (!limit) {
      // 从按钮文案中推断 limit：总数 - overflow = limit
      var btn = wrap.querySelector('.world-fold-btn');
      if (btn) {
        var m = btn.textContent.match(/剩余\s*(\d+)/);
        if (m) limit = rows.length - parseInt(m[1], 10);
      }
      if (!limit || limit <= 0) limit = rows.length;
    }
    for (var i = 0; i < rows.length; i++) {
      if (collapsed && i >= limit) {
        rows[i].style.display = 'none';
      } else {
        rows[i].style.display = '';
      }
    }
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
    // v20260609-fengyan: 主持人写什么就显示什么，不做固定映射
    // 保留几个已知状态的 CSS class 以维持现有配色
    if (s === '攻城中') return '<span class="world-mil-status siege">' + esc(s) + '</span>';
    if (s === '交战中') return '<span class="world-mil-status battle">' + esc(s) + '</span>';
    if (s === '客驻')   return '<span class="world-mil-status guest">' + esc(s) + '</span>';
    var m = s.match(/^剩(\d+)$/);
    if (m) {
      var n = parseInt(m[1], 10);
      var cls = n <= 1 ? 'world-mil-status urgent' : 'world-mil-status march';
      return '<span class="' + cls + '">' + esc(s) + '</span>';
    }
    // 未知状态：用 march 默认色显示原文
    return '<span class="world-mil-status march">' + esc(s) + '</span>';
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

// ══════════════════════════════════════════
//  身份识别模块 v1
//  工单：#identity-selector-v1
// ══════════════════════════════════════════

/**
 * 初始化身份选择器
 * - 从 localStorage 读取上次选择的身份
 * - 绑定按钮点击事件
 * - 默认选择"甲"
 */
function initIdentitySelector() {
  const selector = document.getElementById('identity-selector');
  if (!selector) return;

  // 从 localStorage 读取身份，默认为 0（甲）
  const savedSlot = localStorage.getItem('sg_current_slot');
  const currentSlot = savedSlot !== null ? parseInt(savedSlot, 10) : 0;

  // 验证有效性
  const validSlot = (currentSlot >= 0 && currentSlot <= 2) ? currentSlot : 0;

  // 设置全局变量
  window._currentPlayerSlot = validSlot;

  // 更新按钮激活状态
  updateIdentityUI(validSlot);

  // 绑定按钮点击事件
  // ↓↓↓ 工单 #identity-btn-class-fix ↓↓↓
  selector.querySelectorAll('.identity-btn, .identity-btn-mini').forEach(btn => {
    btn.addEventListener('click', function() {
      const slot = parseInt(this.dataset.slot, 10);
      switchIdentity(slot);
    });
  });
  // ↑↑↑ 工单结束 ↑↑↑
  // ↓↓↓ 工单 #mobile-panel-reorder-v1 ↓↓↓
  // 监听身份变化，移动端时重排玩家面板顺序
  window.addEventListener('storage', _reorderPlayerPanelsOnMobile);
  _reorderPlayerPanelsOnMobile(); // 初始化时执行一次

  function _reorderPlayerPanelsOnMobile() {
    var slot = getCurrentPlayerSlot();
    if (slot === null) return;

    // 仅移动端生效（≤768px）
    var isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) {
      // 桌面端：重置所有面板 order
      for (var i = 0; i < 3; i++) {
        var panel = document.getElementById('pcard-' + i);
        if (panel) panel.style.order = '';
      }
      return;
    }

    // 移动端：选中的面板 order=0（置顶），其他按原顺序
    for (var i = 0; i < 3; i++) {
      var panel = document.getElementById('pcard-' + i);
      if (panel) {
        panel.style.order = (i === slot) ? '0' : String(i + 1);
      }
    }
  }

  // 监听窗口尺寸变化
  window.addEventListener('resize', function() {
    clearTimeout(window._resizeTimer);
    window._resizeTimer = setTimeout(_reorderPlayerPanelsOnMobile, 200);
  });
  // ↑↑↑ 工单结束 ↑↑↑
}

/**
 * 切换身份
 * @param {number} slot - 0=甲, 1=乙, 2=丙
 */
function switchIdentity(slot) {
  if (slot < 0 || slot > 2) return;

  // 保存到 localStorage
  localStorage.setItem('sg_current_slot', slot);

  // 更新全局变量
  window._currentPlayerSlot = slot;

  // 更新 UI
  updateIdentityUI(slot);

  // 重新渲染行动 Tab（应用权限控制）
  if (state.rounds.length > 0) {
    const latest = state.rounds[state.rounds.length - 1];
    renderActionTab(latest);
  }

  // Toast 提示
  const slotNames = ['甲', '乙', '丙'];
  const playerName = state.players[slot] ? state.players[slot].name : '城主' + slotNames[slot];
  showToast('✅ 已切换到 ' + playerName + ' [' + slotNames[slot] + ']');
}

/**
 * 更新身份选择器 UI 激活状态
 * @param {number} activeSlot - 当前激活的 slot
 */
function updateIdentityUI(activeSlot) {
  const selector = document.getElementById('identity-selector');
  if (!selector) return;

  // ↓↓↓ 工单 #identity-btn-class-fix ↓↓↓
  selector.querySelectorAll('.identity-btn, .identity-btn-mini').forEach(btn => {
    const slot = parseInt(btn.dataset.slot, 10);
    btn.classList.toggle('active', slot === activeSlot);
  });
  // ↑↑↑ 工单结束 ↑↑↑
}

/**
 * 获取当前玩家身份
 * @returns {number} 0=甲, 1=乙, 2=丙
 */
function getCurrentPlayerSlot() {
  return window._currentPlayerSlot !== undefined ? window._currentPlayerSlot : 0;
}

// ══════════════════════════════════════════
//  身份识别模块结束
// ══════════════════════════════════════════

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

// ══════════════════════════════════════════
//  三令提交界面渲染 v4.0
// ══════════════════════════════════════════

/**
 * 渲染三令提交界面
 * @param {Object} parsed - 解析后的回合数据
 */
function renderActionsPanel(parsed) {
  if (!parsed) return;

  // 渲染公共机遇
  renderOpportunities(parsed.opportunities || []);

  // 获取当前登录身份
  const currentRole = (window.SGRole && window.SGRole.get) ? window.SGRole.get() : null;
  if (!currentRole) {
    // 未登录：显示提示
    showActionsLoginHint();
    return;
  }

  // 渲染当前玩家的三令选项
  const playerActions = parsed.playerActions?.[currentRole];
  if (playerActions) {
    renderSanling(playerActions, parsed.opportunities || []);
  } else {
    showActionsEmptyHint();
  }
}

/**
 * 渲染公共机遇面板
 * @param {Array} opportunities - 机遇数组
 */
function renderOpportunities(opportunities) {
  const bodyEl = document.getElementById('opp-body');
  if (!bodyEl) return;

  if (!opportunities || opportunities.length === 0) {
    bodyEl.innerHTML = '<div class="opp-empty">本回合无公共机遇</div>';
    return;
  }

  bodyEl.innerHTML = '';
  opportunities.forEach(opp => {
    const card = document.createElement('div');
    card.className = `opp-card ${opp.type}`;

    const typeText = opp.type === 'compete' ? '争夺型' : '协力型';
    const typeClass = opp.type;
    const icon = opp.type === 'compete' ? '⚔️' : '🤝';

    card.innerHTML = `
      <div class="opp-card-icon">${icon}</div>
      <div class="opp-card-content">
        <div class="opp-card-head">
          <span class="opp-card-title">机遇${opp.id} · ${esc(opp.title)}</span>
          <span class="opp-card-type ${typeClass}">${typeText}</span>
        </div>
        <div class="opp-card-desc">${esc(opp.desc)}</div>
        <div class="opp-card-foot">
          <span class="opp-card-prestige">预估 +${opp.prestige} 威望</span>
        </div>
      </div>
      <div class="opp-card-actions">
        <button class="opp-select-btn ${typeClass}" data-opp-id="${opp.id}">
          选此机遇
        </button>
      </div>
    `;

    bodyEl.appendChild(card);
  });

  // 绑定"选此机遇"按钮
  bodyEl.querySelectorAll('.opp-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const oppId = btn.dataset.oppId;
      selectOpportunity(oppId);
    });
  });
}

/**
 * 渲染三令选项
 * @param {Object} playerActions - 当前玩家的三令数据 { wu, wen, ce }
 * @param {Array} opportunities - 公共机遇（用于策令改选机遇）
 */
function renderSanling(playerActions, opportunities) {
  // 渲染武令
  renderLingOptions('wu', playerActions.wu);
  // 渲染文令
  renderLingOptions('wen', playerActions.wen);
  // 渲染策令（含机遇选项）
  renderLingOptions('ce', playerActions.ce, opportunities);

  // 绑定自拟输入框交互
  bindCustomInputs();
}

/**
 * 渲染单个令的 A/B 选项
 * @param {String} lingType - 'wu' | 'wen' | 'ce'
 * @param {Object} lingData - { a: {...}, b: {...} }
 * @param {Array} opportunities - 公共机遇（仅策令需要）
 */
function renderLingOptions(lingType, lingData, opportunities) {
  if (!lingData) return;

  // 渲染 A 选项
  if (lingData.a) {
    fillLingOption(lingType, 'a', lingData.a);
  }

  // 渲染 B 选项
  if (lingData.b) {
    fillLingOption(lingType, 'b', lingData.b);
  }

  // 策令：渲染改选机遇选项
  if (lingType === 'ce' && opportunities && opportunities.length > 0) {
    const oppSelectEl = document.getElementById('ce-opp-select');
    const oppListEl = document.getElementById('ce-opp-list');
    if (oppSelectEl && oppListEl) {
      // 启用"改选机遇"单选按钮
      const oppRadio = oppSelectEl.querySelector('input[type="radio"][value="opp"]');
      if (oppRadio) oppRadio.disabled = false;

      // 动态渲染机遇选项
      oppListEl.innerHTML = '';
      opportunities.forEach(opp => {
        const label = document.createElement('label');
        label.className = 'ling-opp-item';
        label.innerHTML = `
          <input type="radio" name="ce-opp" value="${opp.id}">
          <span>机遇 ${opp.id} · ${esc(opp.title)}</span>
        `;
        oppListEl.appendChild(label);
      });

      // 启用机遇子选项
      oppListEl.querySelectorAll('input[type="radio"]').forEach(r => {
        r.disabled = false;
      });
    }
  }
}

/**
 * 填充单个令选项的内容
 * @param {String} lingType - 'wu' | 'wen' | 'ce'
 * @param {String} option - 'a' | 'b'
 * @param {Object} data - { name, desc, risk, prestige }
 */
function fillLingOption(lingType, option, data) {
  const nameEl = document.getElementById(`${lingType}-${option}-name`);
  const descEl = document.getElementById(`${lingType}-${option}-desc`);
  const riskEl = document.getElementById(`${lingType}-${option}-risk`);
  const prestigeEl = document.getElementById(`${lingType}-${option}-prestige`);

  if (nameEl) nameEl.textContent = data.name || '—';
  if (descEl) descEl.textContent = data.desc || '—';

  if (riskEl) {
    riskEl.textContent = data.risk || '—';
    // 设置风险等级样式
    riskEl.className = 'ling-risk-tag';
    if (data.risk === '稳') riskEl.classList.add('stable');
    else if (data.risk === '中') riskEl.classList.add('medium');
    else if (data.risk === '险') riskEl.classList.add('risky');
  }

  if (prestigeEl) {
    prestigeEl.innerHTML = `预估 <strong>+${data.prestige}</strong> 威望`;
  }
}

/**
 * 绑定自拟输入框交互
 */
function bindCustomInputs() {
  ['wu', 'wen', 'ce'].forEach(lingType => {
    const customRadio = document.querySelector(`input[name="${lingType}-ling"][value="custom"]`);
    const customInput = document.getElementById(`${lingType}-custom-input`);
    const customCount = document.getElementById(`${lingType}-custom-count`);

    if (!customRadio || !customInput) return;

    // 选中"自拟"时启用输入框
    customRadio.addEventListener('change', () => {
      if (customRadio.checked) {
        customInput.disabled = false;
        customInput.focus();
      }
    });

    // 其他选项选中时禁用输入框
    document.querySelectorAll(`input[name="${lingType}-ling"]:not([value="custom"])`).forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          customInput.disabled = true;
          customInput.value = '';
          if (customCount) customCount.textContent = '0';
        }
      });
    });

    // 字数计数
    if (customInput && customCount) {
      customInput.addEventListener('input', () => {
        customCount.textContent = customInput.value.length;
      });
    }
  });
}

/**
 * 选择公共机遇（点击"选此机遇"按钮）
 * @param {String} oppId - 机遇 ID
 */
function selectOpportunity(oppId) {
  // 自动勾选策令的"改选机遇"选项
  const oppRadio = document.querySelector('input[name="ce-ling"][value="opp"]');
  if (oppRadio) {
    oppRadio.checked = true;
    // 触发 change 事件
    oppRadio.dispatchEvent(new Event('change'));
  }

  // 勾选对应的机遇子选项
  const oppSubRadio = document.querySelector(`input[name="ce-opp"][value="${oppId}"]`);
  if (oppSubRadio) {
    oppSubRadio.checked = true;
  }

  // 滚动到策令区域
  const ceLingCard = document.querySelector('.ce-ling');
  if (ceLingCard) {
    ceLingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * 显示未登录提示
 */
function showActionsLoginHint() {
  const panelEl = document.getElementById('sanling-panel');
  if (panelEl) {
    panelEl.innerHTML = `
      <div class="actions-login-hint">
        <div class="hint-icon">🔐</div>
        <div class="hint-text">请先登录身份后查看专属行动令</div>
      </div>
    `;
  }
}

/**
 * 显示空态提示
 */
function showActionsEmptyHint() {
  const panelEl = document.getElementById('sanling-panel');
  if (panelEl) {
    panelEl.innerHTML = `
      <div class="actions-empty-hint">
        <div class="hint-icon">📜</div>
        <div class="hint-text">等待 GM 给出本回合行动令</div>
      </div>
    `;
  }
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyRoleGate);
  } else {
    applyRoleGate();
  }
  window.addEventListener('sg-role-changed', applyRoleGate);

  // 监听身份切换事件，重新渲染三令界面
  document.addEventListener('sg-role-changed', () => {
    if (state.rounds.length > 0) {
      const latest = state.rounds[state.rounds.length - 1];
      if (latest && latest.parsed) {
        if (typeof renderActionsPanel === 'function') {
          renderActionsPanel(latest.parsed);
        }
      }
    }
  });
})();

