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
 * v16 (2026-06-25): 渐变磨砂玻璃提交区UI；移除act-divider；提交摘要重设计
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
 * v37 (2026-XX-XX): 工单#warboard-smart-hide-v1 — 战情速报智能隐藏,
 *                    电脑端保留占位文案,手机端空栏/空块自动隐藏
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

  // 数据检查相关
  var DATA_CHECK_API_URL = 'https://smiifcbmmtolimtaxpip.supabase.co/functions/v1/barracks'; // 复用军帐 API
  var _dataCheckEnabled = true; // 默认开启
  var _lastCheckRound = 0;
  const POLL_MS  = 30000;
  const MAX_ROWS = 100;

  // ════ #sanguo-gm-gate-realtime-v1 ════
  const GM_PASSWORD = '0727';
  const SUPA_PROJECT_URL = 'https://smiifcbmmtolimtaxpip.supabase.co';
  const SUPA_TABLE_NAME  = 'sanguo_rounds';
  let _supaClient = null;
  let _realtimeChannel = null;
  let _actionRealtimeChannel = null;  // 行动提交实时监听

// ══════════════════════════════════════════
//  实时同步全局变量
// ══════════════════════════════════════════
let realtimeChannel = null;
let realtimeRoundsChannel = null;
let pollInterval = null;
let isRealtimeConnected = false;
let lastSubmissionCheck = {};
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
//  GM控制面板 - 功能开关
// ══════════════════════════════════════════

function initGMControls() {
  var barracksToggle = document.getElementById('gm-barracks-toggle');
  if (!barracksToggle) return;

  // 从localStorage读取上次的状态
  var savedState = localStorage.getItem('gm_barracks_enabled');
  var isEnabled = savedState === null ? true : savedState === 'true';

  barracksToggle.checked = isEnabled;
  updateBarracksVisibility(isEnabled);

  // 监听开关变化
  barracksToggle.addEventListener('change', function() {
    var enabled = this.checked;
    updateBarracksVisibility(enabled);

    // 保存状态到localStorage
    localStorage.setItem('gm_barracks_enabled', enabled);

    // 提示
    showToast(enabled ? '✅ 军帐功能已开启' : '❌ 军帐功能已关闭');
  });
}

function updateBarracksVisibility(enabled) {
  var body = document.body;
  if (enabled) {
    body.classList.remove('barracks-hidden');
  } else {
    body.classList.add('barracks-hidden');
  }
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
    initGMControls();
    initParticles();
    initTipsCard();
    bindFogToggle();
    loadFromCloud();
    bindActionTab();
    initIdentitySelector();
    initDataCheck();
  }

  // 初始化数据检查交互
  function initDataCheck() {
    var modalClose = document.getElementById('modal-close');
    var modalBtnClose = document.getElementById('modal-btn-close');
    var checkResultModal = document.getElementById('check-result-modal');
    var gmTextarea = document.getElementById('gm-content');

    if (modalClose) {
      modalClose.addEventListener('click', function() {
        checkResultModal.style.display = 'none';
      });
    }

    if (modalBtnClose) {
      modalBtnClose.addEventListener('click', function() {
        checkResultModal.style.display = 'none';
      });
    }


    if (checkResultModal) {
      checkResultModal.addEventListener('click', function(e) {
        if (e.target === this) {
          this.style.display = 'none';
        }
      });
    }

    if (gmTextarea) {
      gmTextarea.addEventListener('paste', function(e) {
        var text = (e.clipboardData || window.clipboardData).getData('text');

        // 检测：是否是纯数据区（以 [回合] 开头且无 ====）
        if (text.trim().startsWith('[回合]') && text.indexOf('====') === -1) {
          e.preventDefault(); // 阻止默认粘贴

          // 自动合并剧情区
          _autoMergeDataZone(text);
        }
      });
    }
  }

  // 自动合并数据区
  function _autoMergeDataZone(newDataZone) {
    // 获取最后一个回合的剧情区
    var lastRound = state.rounds[state.rounds.length - 1];
    if (!lastRound || !lastRound.rawContent) {
      showToast('无法获取原剧情区，请手动合并');
      return;
    }

    var rawContent = lastRound.rawContent;
    var sepIndex = rawContent.indexOf('====================================');
    var storyZone = sepIndex > -1 ? rawContent.slice(0, sepIndex).trim() : '';

    if (!storyZone) {
      showToast('无法提取原剧情区，请手动合并');
      return;
    }

    // 合并：剧情区 + ==== + 新数据区
    var merged = storyZone + '\n' + '====================================\n' + newDataZone;

    // 填入文本框
    var textarea = document.getElementById('gm-content');
    textarea.value = merged;

    // 自动触发预览
    setTimeout(function() {
      var btnPreview = document.getElementById('btn-preview');
      if (btnPreview) btnPreview.click();
    }, 100);

    // 提示
    showToast('🔧 数据已自动合并剧情区，请预览确认');
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
                facilities: c.facilities || [],
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
      settlement_json:     JSON.stringify(rd.parsed.settlement    || null),
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

      _lastCheckRound = rd.round;

      return res.json();
    } else {
      // INSERT
      const res = await fetchWithTimeout(SUPA_URL, {
        method: 'POST',
        headers: SUPA_HEADERS,
        body: JSON.stringify(payload),
      }, 12000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      _lastCheckRound = rd.round;

      return res.json();
    }
  }


  // 开始数据检查
  function _startDataCheck(roundNum) {
    var btn = document.getElementById('btn-check-data');
    btn.disabled = true;
    btn.textContent = '⏳ 检查中...';

    // 提取数据
    var checkData = _extractCheckData(roundNum);
    if (!checkData) {
      showToast('提取数据失败');
      btn.disabled = false;
      btn.textContent = '🔍 检查数据';
      return;
    }

    // 调用 API
    _callDataCheckAPI(checkData).then(function(result) {
      _showCheckResult(result);
    }).catch(function(err) {
      console.error('数据检查异常:', err);
      // Fallback for unexpected errors not handled inside _callDataCheckAPI
      showToast('检查发生异常：' + err.message);
      btn.disabled = false;
      btn.textContent = '🔍 检查数据';
    });
  }

  // 提取检查数据
  function _extractCheckData(roundNum) {
    // 优先从已发布回合中提取
    var currentRound = state.rounds.find(function(r) { return r.round === roundNum; });
    var rawContent = null;

    if (currentRound) {
      rawContent = currentRound.rawContent || '';
    } else {
      // 如果回合未发布，从 GM 输入框提取
      var gmInput = document.getElementById('gm-content');
      if (gmInput && gmInput.value.trim()) {
        rawContent = gmInput.value.trim();
      } else {
        return null;
      }
    }

    var prevRound = state.rounds.find(function(r) { return r.round === roundNum - 1; });

    // 提取上回合资源
    var prevData = {
      甲: null,
      乙: null,
      丙: null
    };

    if (prevRound && prevRound.parsed && prevRound.parsed.players) {
      prevRound.parsed.players.forEach(function(p) {
        if (p && p.slot) {
          var slotKey = ['甲', '乙', '丙'][p.slot];
          prevData[slotKey] = {
            金: p.gold || 0,
            粮: p.food || 0,
            兵: p.troop || 0,
            民心: p.morale || 0,
            城: p.cities || 0,
            武将: (p.generals || []).map(function(g) {
              return typeof g === 'object' ? g.name : g;
            }).filter(Boolean)
          };
        }
      });
    }

    // 提取本回合完整数据区（从原始内容中提取）
    var sepIndex = rawContent.indexOf('====================================');
    var dataZone = sepIndex > -1 ? rawContent.slice(sepIndex + 36).trim() : '';

    return {
      round: roundNum,
      prevData: prevData,
      dataZone: dataZone
    };
  }

  // 调用数据检查 API
  function _callDataCheckAPI(checkData) {
    var systemPrompt = _buildCheckSystemPrompt();
    var userMessage = _buildCheckUserMessage(checkData);

    var messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    return fetchWithTimeout(DATA_CHECK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPA_KEY,
        'apikey': SUPA_KEY
      },
      body: JSON.stringify({
        messages: messages,
        max_tokens: 4000,
        temperature: 0.3
      })
    }, 120000).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(data) {
      if (data.error) throw new Error(data.error);

      // 解析 API 响应格式（优先读取实际返回的格式）
      var content = '';
      if (data.reply) {
        // 当前 Edge Function 返回格式
        content = data.reply;
      } else if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        // 标准 OpenAI 格式兼容
        content = data.choices[0].message.content;
      } else {
        throw new Error('API 返回数据格式异常');
      }

      return _parseCheckResult(content);
    }).catch(function(err) {
      console.error('数据检查失败:', err);

      // 返回友好的错误结果
      return {
        status: 'error',
        issues: [{
          priority: 'P0',
          type: 'API 调用失败',
          location: '系统',
          description: 'DeepSeek API 调用失败：' + err.message,
          original: '',
          fixed: ''
        }],
        fixedDataZone: '',
        notes: [
          '可能原因：网络超时、API 配额不足、服务异常',
          '请稍后重试，或检查控制台查看详细错误信息'
        ]
      };
    });
  }

  // 构建检查 System Prompt（精简版）
  function _buildCheckSystemPrompt() {
    return [
      '你是《三国志文字版》数据校验助手。检查 GM 输出的数据区是否符合格式规范。',
      '',
      '━━━ 检查项目（按优先级）━━━',
      '',
      '【P0 严重错误 — 必须修复】',
      '',
      '1. 格式完整性',
      '   检查点：',
      '   · 段落标签完整：[回合][NPC][战报][威望][调度][变动][甲][乙][丙]',
      '   · 段落顺序正确：必须按上述顺序排列',
      '   · 必需分隔符存在：冒号、竖线、括号、逗号',
      '',
      '2. 资源数值闭环',
      '   检查点：上回合资源 + 本回合变动△ = 本回合资源',
      '   检查资源：金、粮、兵、民心、城',
      '   示例：上回合金1200 + 变动金△+150 = 本回合金1350',
      '   容差：±5 以内视为合理误差',
      '',
      '3. 城池数量匹配',
      '   检查点：',
      '   · [甲]城:3 则城池列表必须恰好 3 个',
      '   · 城池列表：城:襄阳,新野,江夏 → 实际 3 个',
      '',
      '4. 武将数量与落点',
      '   检查点：',
      '   · [甲]武将:关羽,张飞,赵云 → 数据区必须出现这 3 位',
      '   · 不得出现未在名单中的武将名（幽灵武将）',
      '   · 每位武将必须落在：城池守将括号 或 [调度]段',
      '',
      '【P1 次要问题 — 建议修复】',
      '',
      '5. 武将状态白名单',
      '   合法值：健康(空) / 疲劳 / 受伤 / 患病 / 阵亡',
      '   常见错误：重伤→受伤 / 战死→阵亡 / 轻伤→受伤',
      '',
      '6. 战报档位白名单',
      '   合法值：大胜 / 小胜 / 惨胜 / 平局 / 小负 / 大败 / 胜',
      '   常见错误：全胜→大胜 / 险胜→小胜 / 惨败→大败',
      '',
      '7. 兵种白名单',
      '   合法值：步 / 弓 / 骑 / 水 / 蛮',
      '   常见错误：枪→步 / 盾→步 / 重步→步 / 轻骑→骑',
      '',
      '8. 调度状态白名单',
      '   位移态（带"剩N"）：剩N / 攻城中 / 交战中 / 客驻',
      '   驻扎态（不带"剩N"）：巡防 / 围城中 / 伏兵 / 客驻 / 封锁 / 警戒',
      '   常见错误：对峙中→交战中 / 客途→在野',
      '',
      '━━━ 输出格式 ━━━',
      '',
      '返回严格的 JSON 格式：',
      '{',
      '  "status": "ok",  // 无任何错误时为 "ok"，有错误时为 "error"',
      '  "issues": [  // 错误列表，无错误时为空数组 []',
      '    {',
      '      "priority": "P0",  // 或 "P1"',
      '      "type": "资源闭环错误",  // 错误类型简述',
      '      "location": "甲 金",  // 错误位置',
      '      "description": "上回合金1200，本回合变动+150，应该等于1350，但你写成了1360。请把「金:1360」改为「金:1350」",',
      '      "howToFix": "找到 [甲] 段落，将「金:1360」改为「金:1350」"  // 修改指导（自然语气）',
      '    }',
      '  ],',
      '  "summary": ""  // 总结性建议（自然语气，如"发现 3 个错误，主要是资源闭环问题，建议重新核对变动△的计算"）',
      '}',
      '',
      '━━━ 检查规则 ━━━',
      '',
      '· status="ok" 当且仅当 issues 为空数组',
      '· 每个错误都要提供清晰的修改指导（howToFix），用自然语气告诉 GM 怎么改',
      '· description 要说明错误原因和正确值应该是什么',
      '· 如果有多个错误，在 summary 中给出总体建议',
      '· 不要输出完整的修正数据区，只需要告诉 GM 哪里错了、怎么改',
      '',
      '━━━ 重要提醒 ━━━',
      '',
      '· 你的任务是检查并指导修改，不是替 GM 重写整个数据区',
      '· 用自然语气，就像在和 GM 对话："你这里算错了，应该是 X"',
      '· 如果错误很多，优先指出最严重的 P0 错误',
      '',
      '数据区格式示例：',
      '[回合]第5回合·荆襄逐鹿',
      '[NPC]',
      '袁绍(3城)|金:2400/粮:3200/兵:18000/民心:52/武将:颜良,文丑',
      '[战报]',
      '襄阳 | 平局 | 甲 关羽5000 vs 乙 夏侯惇4800 | 甲兵-800·乙兵-750',
      '[威望]',
      '甲 威望:55',
      '[调度]',
      '甲 关羽 襄阳→江夏 步:3000,弓:2000 剩2回合',
      '[变动]',
      '甲 收支△',
      '金:产出+200,战利+50,行动-100,维护-80,合计+70',
      '[甲]',
      '金:1350/粮:1680/兵:7200/民心:47/城:3',
      '城:襄阳,新野,江夏',
      '武将:关羽,张飞,赵云',
      '襄阳(郡城)|步:2000,弓:1500|守将:张飞',
      '',
      '请严格按上述格式和规则检查数据区。'
    ].join('\n');
  }

  // 构建检查 User Message
  function _buildCheckUserMessage(checkData) {
    var msg = '请检查第 ' + checkData.round + ' 回合数据：\n\n';
    msg += '【上回合资源】\n';
    msg += JSON.stringify(checkData.prevData, null, 2) + '\n\n';
    msg += '【本回合数据区】\n';
    msg += checkData.dataZone;
    return msg;
  }

  // 解析检查结果
  function _parseCheckResult(reply) {
    try {
      // 1. 尝试直接解析（如果 DeepSeek 直接返回 JSON）
      try {
        return JSON.parse(reply);
      } catch (e) {
        // 继续尝试其他方式
      }

      // 2. 尝试提取 Markdown 代码块中的 JSON
      var codeBlockMatch = reply.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1]);
      }

      // 3. 尝试提取第一个完整的 JSON 对象（贪婪匹配）
      var jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // 尝试找到最外层的完整 JSON
        var text = jsonMatch[0];
        var depth = 0;
        var start = -1;
        var end = -1;

        for (var i = 0; i < text.length; i++) {
          if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
          } else if (text[i] === '}') {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }

        if (start >= 0 && end > start) {
          var jsonStr = text.slice(start, end);
          return JSON.parse(jsonStr);
        }
      }

      throw new Error('返回格式错误');
    } catch (e) {
      console.error('解析检查结果失败:', e);
      console.error('DeepSeek 原始返回:', reply);

      // 返回一个友好的错误结果，而不是直接抛出异常
      return {
        status: 'error',
        issues: [{
          priority: 'P0',
          type: '解析失败',
          location: '系统',
          description: 'DeepSeek 返回内容无法解析，可能是 API 异常或返回格式不符合预期。',
          original: '',
          fixed: ''
        }],
        fixedDataZone: '',
        notes: [
          '请检查 F12 控制台查看 DeepSeek 原始返回内容',
          '如果问题持续，可能需要调整 System Prompt 或检查 API 配置'
        ]
      };
    }
  }

  // 显示检查结果
  function _showCheckResult(result) {
    var modal = document.getElementById('check-result-modal');
    var successContent = document.getElementById('check-success-content');
    var errorContent = document.getElementById('check-error-content');
    var modalIcon = document.getElementById('modal-icon');
    var modalTitle = document.getElementById('modal-title');
    var copyReportBtn = document.getElementById('modal-btn-copy-report');

    if (result.status === 'ok') {
      // 检查通过
      successContent.style.display = 'block';
      errorContent.style.display = 'none';
      modalIcon.textContent = '✓';
      modalTitle.textContent = '数据检查通过';
      if (copyReportBtn) copyReportBtn.style.display = 'none';

      // 更新按钮区状态
      var btn = document.getElementById('btn-check-data');
      if (btn) {
        btn.textContent = '✓ 数据无误';
        btn.disabled = false;
      }
    } else {
      // 发现问题
      successContent.style.display = 'none';
      errorContent.style.display = 'block';
      modalIcon.textContent = '⚠️';
      modalTitle.textContent = '发现 ' + (result.issues ? result.issues.length : 0) + ' 个数据问题';

      // 检查是否是解析失败
      var isParseError = result.issues && result.issues.length > 0 &&
                         result.issues[0].type === '解析失败';

      if (copyReportBtn) {
        if (isParseError) {
          copyReportBtn.style.display = 'none';
        } else {
          copyReportBtn.style.display = 'inline-block';
          copyReportBtn.onclick = function() {
            _copyCheckReport(result, _lastCheckRound);
          };
        }
      }

      // 渲染问题列表
      var issuesList = document.getElementById('issues-list');
      issuesList.innerHTML = (result.issues || []).map(function(issue, idx) {
        return [
          '<div style="background:rgba(231,111,81,0.08); border:1px solid rgba(231,111,81,0.25); border-radius:4px; padding:12px; margin-bottom:10px;">',
          '  <div style="display:flex; gap:8px; margin-bottom:8px;">',
          '    <span style="font-weight:700; color:#e76f51;">' + (idx + 1) + '.</span>',
          '    <div style="flex:1;">',
          '      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">',
          '        <span style="display:inline-block; background:rgba(231,111,81,0.2); color:#e76f51; padding:2px 8px; border-radius:3px; font-size:0.7rem; font-weight:600;">' + (issue.priority || 'P0') + '</span>',
          '        <span style="font-size:0.85rem; color:#999;">位置：' + escapeHtml(issue.location || '') + '</span>',
          '      </div>',
          '      <div style="font-size:0.9rem; color:var(--text-main); margin-bottom:8px; line-height:1.6;">' + escapeHtml(issue.description || '') + '</div>',
          (issue.howToFix ? '<div style="background:rgba(46,160,67,0.08); border-left:3px solid #2ea043; padding:8px 12px; font-size:0.85rem; color:var(--text-main); line-height:1.5; border-radius:3px;">💡 ' + escapeHtml(issue.howToFix) + '</div>' : ''),
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');

      // 如果有总结，显示在列表后
      if (result.summary) {
        issuesList.innerHTML += '<div style="background:rgba(100,149,237,0.08); border:1px solid rgba(100,149,237,0.25); border-radius:4px; padding:12px; margin-top:16px; font-size:0.9rem; color:var(--text-main); line-height:1.6;">📌 ' + escapeHtml(result.summary) + '</div>';
      }

      var importantNotice = document.getElementById('important-notice');
      if (importantNotice) {
        importantNotice.innerHTML = [
          '<div style="background:rgba(231,111,81,0.1); border:1px solid rgba(231,111,81,0.3); border-radius:6px; padding:16px; margin:16px 0;">',
          '  <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">',
          '    <span style="font-size:1.3rem;">⚠️</span>',
          '    <span style="font-weight:700; color:#e76f51; font-size:0.95rem;">重要提示</span>',
          '  </div>',
          '  <div style="font-size:0.85rem; line-height:1.6; color:var(--text-main); margin-bottom:12px;">',
          '    请将上述问题报告<strong style="color:var(--gold);">发给 AI 主持人</strong>，让主持人重新输出修正后的数据。',
          '  </div>',
          '  <div style="font-size:0.85rem; line-height:1.6; color:var(--text-main);">',
          '    <strong style="color:#e76f51;">不要直接在网站上修复</strong>，否则 AI 主持人会继续使用错误数据推演下一回合。',
          '  </div>',
          '</div>',
          '',
          '<div style="background:rgba(212,165,116,0.08); border:1px solid rgba(212,165,116,0.25); border-radius:6px; padding:16px; margin:16px 0;">',
          '  <div style="font-weight:700; color:var(--gold); font-size:0.9rem; margin-bottom:10px;">📋 操作建议</div>',
          '  <div style="font-size:0.85rem; line-height:1.6; color:var(--text-main);">',
          '    <strong>方案 A（少量错误，1-3 个）：</strong><br>',
          '    告诉 AI 主持人具体哪些字段需要修改，主持人单独输出修正值。',
          '  </div>',
          '  <div style="font-size:0.85rem; line-height:1.6; color:var(--text-main); margin-top:10px;">',
          '    <strong>方案 B（大量错误，4+ 个）：</strong><br>',
          '    让 AI 主持人重新输出完整数据区（从 [回合] 到 [丙]）。',
          '  </div>',
          '</div>'
        ].join('');
        importantNotice.style.display = 'block';
      }

      // 填充修复后的数据区（如果有）
      var fixedTextarea = document.getElementById('fixed-data-zone');
      if (isParseError || !result.fixedDataZone) {
        // 解析失败或无修复数据时，隐藏数据区
        fixedTextarea.parentElement.style.display = 'none';
      } else {
        fixedTextarea.parentElement.style.display = 'block';
        fixedTextarea.previousElementSibling.textContent = 'Deepseek 建议的修复内容（仅供参考，请发给 AI 主持人）';
        fixedTextarea.value = result.fixedDataZone || '';
      }

      // 显示备注（如果有）
      var notesSection = document.getElementById('notes-section');
      var notesContent = document.getElementById('notes-content');
      if (result.notes && result.notes.length > 0) {
        notesSection.style.display = 'block';
        notesContent.innerHTML = result.notes.map(function(note) {
          return '• ' + escapeHtml(note);
        }).join('<br>');
      } else {
        notesSection.style.display = 'none';
      }

      // 更新按钮区状态
      var btn = document.getElementById('btn-check-data');
      if (btn) {
        btn.textContent = '⚠️ 查看发现的 ' + (result.issues ? result.issues.length : 0) + ' 个问题';
        btn.disabled = false;
        btn.onclick = function() {
          modal.style.display = 'flex';
        };
      }
    }

    // 显示弹窗
    modal.style.display = 'flex';

    // 重新绑定关闭事件（确保每次显示时都能正确关闭）
    var modalClose = document.getElementById('modal-close');
    var modalBtnClose = document.getElementById('modal-btn-close');

    if (modalClose) {
      modalClose.onclick = function() {
        modal.style.display = 'none';
      };
    }

    if (modalBtnClose) {
      modalBtnClose.onclick = function() {
        modal.style.display = 'none';
      };
    }

    // 点击弹窗背景也可以关闭
    modal.onclick = function(e) {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    };
  }

  /**
   * 复制检查报告（格式化的文本，方便发给 AI 主持人）
   * @param {object} result - Deepseek 检查结果
   * @param {number} roundNum - 回合号
   */
  function _copyCheckReport(result, roundNum) {
    if (!result || !result.issues || result.issues.length === 0) {
      showToast('没有问题需要报告');
      return;
    }

    // 构建报告文本
    var report = [
      '【第 ' + roundNum + ' 回合 Deepseek 检查报告】',
      '',
      '发现 ' + result.issues.length + ' 个问题，需要修正：',
      '',
      '━━━━━━━━━━━━━━━━━━━━'
    ];

    // 按优先级分组
    var p0Issues = result.issues.filter(function(i) { return i.priority === 'P0'; });
    var p1Issues = result.issues.filter(function(i) { return i.priority === 'P1'; });

    if (p0Issues.length > 0) {
      report.push('P0 严重错误');
      report.push('━━━━━━━━━━━━━━━━━━━━');
      report.push('');

      p0Issues.forEach(function(issue, idx) {
        report.push((idx + 1) + '. ' + (issue.type || '未知错误') + ' — ' + (issue.location || ''));
        if (issue.original) {
          report.push('   当前值：' + issue.original);
        }
        if (issue.fixed) {
          report.push('   正确值：' + issue.fixed);
        }
        if (issue.description) {
          report.push('   原因：' + issue.description);
        }
        report.push('');
      });
    }

    if (p1Issues.length > 0) {
      report.push('━━━━━━━━━━━━━━━━━━━━');
      report.push('P1 中等问题');
      report.push('━━━━━━━━━━━━━━━━━━━━');
      report.push('');

      p1Issues.forEach(function(issue, idx) {
        report.push((idx + 1) + '. ' + (issue.type || '未知错误') + ' — ' + (issue.location || ''));
        if (issue.original) {
          report.push('   当前值：' + issue.original);
        }
        if (issue.fixed) {
          report.push('   正确值：' + issue.fixed);
        }
        if (issue.description) {
          report.push('   原因：' + issue.description);
        }
        report.push('');
      });
    }

    report.push('━━━━━━━━━━━━━━━━━━━━');
    report.push('请修正上述问题后重新输出');
    report.push('━━━━━━━━━━━━━━━━━━━━');
    report.push('');

    var issueCount = result.issues.length;
    if (issueCount <= 3) {
      report.push('【建议】错误较少（' + issueCount + ' 个），可以只输出修正值：');
      report.push('');
      result.issues.forEach(function(issue) {
        if (issue.fixed) {
          report.push('  ' + (issue.location || '') + ' ' + issue.fixed);
        }
      });
    } else {
      report.push('【建议】错误较多（' + issueCount + ' 个），请重新输出完整数据区（从 [回合] 到 [丙]）。');
    }

    if (result.notes && result.notes.length > 0) {
      report.push('');
      report.push('━━━━━━━━━━━━━━━━━━━━');
      report.push('需要人工确认的事项');
      report.push('━━━━━━━━━━━━━━━━━━━━');
      result.notes.forEach(function(note) {
        report.push('• ' + note);
      });
    }

    var reportText = report.join('\n');

    // 复制到剪贴板
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(reportText).then(function() {
        showToast('✓ 报告已复制，可发给 AI 主持人');
      }).catch(function(err) {
        console.error('复制失败:', err);
        _fallbackCopyText(reportText);
      });
    } else {
      _fallbackCopyText(reportText);
    }
  }

  // 降级复制方法
  function _fallbackCopyText(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('✓ 报告已复制，可发给 AI 主持人');
    } catch (err) {
      console.error('复制失败:', err);
      showToast('复制失败，请手动选择复制');
    }
    document.body.removeChild(textarea);
  }

  function _hideCheckResultModal() {
    var modal = document.getElementById('check-result-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // HTML 转义
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
            settlement:    safeJson(row.settlement_json, null),
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

    // 绑定检查数据按钮
    document.getElementById('btn-check-data').addEventListener('click', function() {
      var raw = document.getElementById('gm-content').value.trim();
      if (!raw) {
        showToast('⚠️ 请先粘贴 AI 输出内容');
        return;
      }

      // 解析输入内容
      var parsed = SGParser.parse(raw);
      if (!parsed || !parsed.round) {
        showToast('⚠️ 无法识别回合号，请检查格式');
        return;
      }

      _startDataCheck(parsed.round);
    });

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
    btn.disabled = true; btn.textContent = '⏳ 发布中…';

    // ↓↓↓ 修改2：拆分发布和后续操作，精准捕获发布失败 ↓↓↓
    let publishSuccess = false;
    try {
      const rd = { round: roundNum, roundTitle: '', parsed, rawContent: finalRaw };
      await publishRound(rd);
      publishSuccess = true;  // 标记发布成功
    } catch (e) {
      console.error('[SG] 发布回合到数据库失败:', e);
      showToast(isDataOnly ? '❌ 修复失败,请重试' : '❌ 发布失败,请检查网络');
      state.publishing = false;
      btn.disabled = false; btn.textContent = '🚀 发布回合';
      return;  // 发布失败，直接返回
    }

    // 发布成功后的后续操作
    /* [legacy start]
    try {
      await fetchAllRounds();
      renderAll();
      switchTab('arena');

      document.getElementById('gm-content').value = '';
      document.getElementById('parse-preview').classList.add('hidden');

      updateUndoBtn();

      // 清除该回合的所有草稿，避免新回合加载旧选择
      _clearRoundDrafts(roundNum);

      // 清除该回合的所有行动提交数据，避免显示旧提交
      await _act10ClearRoundSubmissions(roundNum);

      // ↓↓↓ 修改1：清空行动面板 UI 状态，避免显示上一回合的内容 ↓↓↓
      _act10ResetUIAfterPublish();
    [legacy end] */
    /* [legacy start]
    try {
      await fetchAllRounds();

      // #action-panel-clear-fix-v1: 清理动作必须先于 renderAll，
      // 否则 renderAll → renderActionTab → _act10LoadSubmissions
      // 会先把脏数据渲染到 UI。
      _clearRoundDrafts(roundNum);
      await _act10ClearRoundSubmissions(roundNum);
      window._act10Submitted = {};
      window._act10AllSubmittedNotified = false;

      renderAll();
      switchTab('arena');

      document.getElementById('gm-content').value = '';
      document.getElementById('parse-preview').classList.add('hidden');

      updateUndoBtn();

      // 防御性兜底：renderAll 内部已通过 _act10LoadSubmissions 重置过 UI,
      // 这里再强制重置一次,保证 100% 干净。
      _act10ResetUIAfterPublish();

      // [legacy v1] showToast(`✅ 第 ${roundNum} 回合已发布！`);
    [legacy end] */
    // #action-publish-clean-v1: 发布成功后的清场流程
    try {
      // 步骤 1: 开启发布期屏蔽,Realtime 回调在此期间全部忽略
      window._sgPublishing = true;

      // 步骤 2: 重新拉取所有回合(更新 state.rounds)
      await fetchAllRounds();

      // 步骤 3: 清空整张 action 表(不分回合,全部清掉)
      // await _act10ClearAllSubmissions(); // ← 保留草稿：不清空玩家行动

      // 步骤 4: 清空所有 localStorage 草稿(不分回合)
      // ← 保留草稿：不清空玩家行动，当做备用草稿
      /*
      try {
        var keys = Object.keys(localStorage);
        keys.forEach(function(k) {
          if (k.indexOf('sg_draft_') === 0) {
            localStorage.removeItem(k);
          }
        });
        console.log('[act10] 已清空所有 sg_draft_ 草稿');
      } catch (e) {
        console.warn('[act10] 清草稿异常:', e);
      }
      */

      // 步骤 5: 清空内存缓存
      window._act10Submitted = {};
      window._act10AllSubmittedNotified = false;

      // 步骤 6: 渲染新回合
      renderAll();
      switchTab('arena');

      document.getElementById('gm-content').value = '';
      document.getElementById('parse-preview').classList.add('hidden');
      updateUndoBtn();

      // 步骤 7: 强制重置 UI(兜底)
      _act10ResetUIAfterPublish();

      // 步骤 8: 1.5 秒后解除屏蔽,让 Realtime 恢复正常工作
      setTimeout(function() {
        window._sgPublishing = false;
        console.log('[act10] 发布期屏蔽已解除');
      }, 1500);

      /* [legacy v1] showToast(`✅ 第 ${roundNum} 回合已发布！`); */
      /* #gm-data-only-mode-v1: 区分两种模式的成功提示 */
      showToast(isDataOnly
        ? `🔧 第 ${roundNum} 回合数据已修复(剧情区保留)`
        : `✅ 第 ${roundNum} 回合已发布！`);
    } catch (e) {
      console.error('[SG] 发布后局部刷新失败,转为整页刷新:', e);
      // #publish-autoreload-v1: 发布已成功,局部刷新出错时不打扰用户,
      // 短暂提示后自动整页刷新,确保拿到最新数据(含机遇/清理旧行动)
      showToast('✅ 第 ' + roundNum + ' 回合已发布，正在刷新…');
      setTimeout(function () { location.reload(); }, 800);
      return; // 即将刷新,不再恢复按钮状态
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
  function esc(text) {
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
  var ACT10_LING_NUMS = ['①', '②', '③', '④', '④'];

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
    _act10Columns(parsed);

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

  // ── 三家行动面板（v8 预览页对齐版）──
  function _act10Columns(parsed) {
    var el = document.getElementById('act10-cols-grid');
    if (!el) return;
    var actions = parsed.playerActions || {};
    var opps    = parsed.opportunities || [];
    var pres    = parsed.prestige;
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

      h += '<div class="col-panel" data-slot="' + i + '" data-editable="' + isEditable + '">';
      // 面板头
      h += '<div class="col-head">';
      h += '<span class="col-name">' + _act10Esc(pn) + '</span>';
      h += '<span class="col-slot-tag">[' + sk + ']</span>';
      if (pp !== '') h += '<div class="col-pres-val"><span class="col-pres-num">' + pp + '</span><span class="col-pres-lbl"> 威望</span></div>';
      h += '</div>';

      // 已提交摘要区
      h += '<div class="col-summary" id="act10-summary-' + i + '" style="display:none"></div>';

      // 额度计数条
      h += '<div class="quota-bar" id="act10-quota-' + i + '">';
      h += '<span class="quota-label">行动额度</span>';
      h += '<div class="quota-dots">';
      h += '<div class="quota-dot" id="act10-qdot-' + i + '-0">1</div>';
      h += '<div class="quota-dot" id="act10-qdot-' + i + '-1">2</div>';
      h += '<div class="quota-dot" id="act10-qdot-' + i + '-2">3</div>';
      h += '</div>';
      h += '<span class="quota-hint" id="act10-qhint-' + i + '">已选 0 / 最多 3</span>';
      h += '</div>';

      // 面板体
      h += '<div class="col-body" id="act10-body-' + i + '">';

      if (!sa) {
        h += '<div style="text-align:center;padding:28px 10px;color:var(--text-dim);font-size:.82rem;">等待 GM 发布行动选项…</div>';
      } else {
        // ①②③④ 四大类行动令
        var lingItems = sa.items || [];
        if (lingItems.length) {
          lingItems.forEach(function(item, li) {
            h += _act10BuildCat(item, li, i);
          });
        } else {
          var lingKeys = ['wu', 'wen', 'ce'];
          lingKeys.forEach(function(key, li) {
            var ling = sa[key];
            if (!ling) return;
            h += _act10BuildCat(ling, li, i);
          });
        }
        // ⑤ 自定军令 — 始终显示
        h += _act10BuildCustomOrder(i);

        // 机遇选取区
        h += _act10BuildOppSelect(opps, i);
      }

      // 提交区
      h += '<div class="submit-area" id="act10-submit-' + i + '">';
      h += '<button class="submit-btn" data-slot="' + i + '" disabled>提交行动</button>';
      h += '<span class="submit-hint" id="act10-hint-' + i + '">从 ①②③④ 中选 1–3 个行动分支</span>';
      h += '<div class="val-toast" id="act10-toast-' + i + '"></div>';
      h += '</div>';

      h += '</div></div>'; // col-body / col-panel
    }
    el.innerHTML = h;
    _act10BindAll();
  }

  // ── 构建单个大类行动卡（对齐 action-preview.html）──
  function _act10BuildCat(ling, lingIdx, slotIdx) {
    var catNums  = ['①','②','③','④'];
    var catCls   = ['cat-mil','cat-gov','cat-tal','cat-dip'];
    var catId    = 'act10-cat-' + slotIdx + '-' + lingIdx;
    var remId    = 'act10-remark-' + slotIdx + '-' + lingIdx;
    var num      = ling.num || catNums[lingIdx] || String(lingIdx+1);
    var name     = ling.title || ling.name || '';
    var quote    = ling.quote || '';
    var risk     = ling.risk || '';
    var prestige = ling.prestige || '';
    var cls      = catCls[lingIdx] || 'cat-mil';
    var rc       = risk === '稳' ? 'risk-s' : risk === '险' ? 'risk-r' : 'risk-m';

    var h = '<div class="act-cat ' + cls + '" id="' + catId + '">';

    // 大类头
    h += '<div class="act-cat-hd">';
    h += '<span class="act-cat-num">' + _act10Esc(num) + '</span>';
    h += '<span class="act-cat-name">' + _act10Esc(name) + '</span>';
    if (risk || prestige) {
      h += '<div class="act-cat-meta">';
      if (risk)     h += '<span class="risk-chip ' + rc + '">' + _act10Esc(risk) + '</span>';
      if (prestige) h += '<span class="act-cat-pres">预估 <span class="pn">+' + _act10Esc(prestige) + '</span> 威望</span>';
      h += '</div>';
    }
    if (quote) h += '<span class="act-cat-quote">' + _act10Esc(quote) + '</span>';
    h += '</div>';

    // 大类体
    h += '<div class="act-cat-body">';
    var opts = ling.options || [];
    opts.forEach(function(opt, oi) {
      var hasSub  = opt.sub && opt.sub.length > 0;
      var brId    = 'act10-branch-' + slotIdx + '-' + lingIdx + '-' + oi;
      var subId   = 'act10-sub-' + slotIdx + '-' + lingIdx + '-' + oi;
      var optRc   = opt.risk === '稳' ? 'risk-s' : opt.risk === '险' ? 'risk-r' : 'risk-m';

      h += '<div class="act-branch-l1 expanded" id="' + brId + '">';
      if (hasSub) {
        // 有二级：点击展开折叠
        h += '<div class="act-opt-l1" data-action="toggle" data-brid="' + brId + '" data-subid="' + subId + '" data-catid="' + catId + '">';
      } else {
        // 无二级：直接选中
        h += '<div class="act-opt-l1" data-action="select" data-slot="' + slotIdx + '" data-cat="' + lingIdx + '" data-val="' + _act10Esc(opt.label || opt.name) + '" data-remid="' + remId + '">';
      }
      h += '<div class="rdot-v8"></div>';
      h += '<div class="act-opt-body-l1">';
      h += '<div class="act-opt-top-l1">';
      if (opt.label) h += '<span class="act-opt-lbl-l1">' + _act10Esc(opt.label) + '.</span>';
      h += '<span class="act-opt-name-l1">' + _act10Esc(opt.name) + '</span>';
      h += '</div>';
      if (opt.risk || opt.prestige || opt.cond) {
        h += '<div class="act-opt-meta-l1">';
        if (opt.cond)     h += '<span class="act-cond-tag">需:' + _act10Esc(opt.cond) + '</span>';
        if (opt.risk)     h += '<span class="risk-chip ' + optRc + '">' + _act10Esc(opt.risk) + '</span>';
        if (opt.prestige) h += '<span class="act-cat-pres"><span class="pn">+' + _act10Esc(opt.prestige) + '</span></span>';
        h += '</div>';
      }
      if (opt.desc) h += '<div class="act-opt-desc-l1">' + _act10Esc(opt.desc) + '</div>';
      h += '</div>';
      if (hasSub) h += '<span class="act-expand-arrow">▶</span>';
      h += '</div>'; // .act-opt-l1

      // 二级分支
      if (hasSub) {
        h += '<div class="act-sub-list expanded" id="' + subId + '">';
        opt.sub.forEach(function(sub) {
          var subRc  = sub.risk === '稳' ? 'risk-s' : sub.risk === '险' ? 'risk-r' : 'risk-m';
          var isCond = !!sub.cond;
          h += '<div class="act-opt-l2' + (isCond ? ' cond-branch' : '') + '" data-action="select-l2" data-slot="' + slotIdx + '" data-cat="' + lingIdx + '" data-val="' + _act10Esc(sub.label || sub.name) + '" data-brid="' + brId + '" data-remid="' + remId + '">';
          h += '<div class="rdot-v8-sm"></div>';
          h += '<div class="act-opt-body-l2">';
          h += '<div class="act-opt-top-l2">';
          if (sub.label) h += '<span class="act-opt-lbl-l2">' + _act10Esc(sub.label) + '.</span>';
          h += '<span class="act-opt-name-l2">' + _act10Esc(sub.name) + '</span>';
          if (sub.cond)  h += '<span class="act-cond-tag">需:' + _act10Esc(sub.cond) + '</span>';
          h += '</div>';
          if (sub.risk || sub.prestige) {
            h += '<div class="act-opt-meta-l2">';
            if (sub.risk)     h += '<span class="risk-chip ' + subRc + '">' + _act10Esc(sub.risk) + '</span>';
            if (sub.prestige) h += '<span class="act-cat-pres"><span class="pn">+' + _act10Esc(sub.prestige) + '</span></span>';
            h += '</div>';
          }
          if (sub.desc) h += '<div class="act-opt-desc-l2">' + _act10Esc(sub.desc) + '</div>';
          h += '</div></div>'; // act-opt-body-l2 / act-opt-l2
        });
        h += '</div>'; // .act-sub-list
      }

      h += '</div>'; // .act-branch-l1
    });

    // 备注区（选中一级/二级后显示）
    h += '<div class="act-remark-block" id="' + remId + '">';
    h += '<div class="act-remark-hd"><span class="act-remark-lbl">💬 备注（可选，不占额度）</span></div>';
    h += '<textarea class="act-remark-ta" rows="2" placeholder="对此行动的补充说明…" maxlength="60"></textarea>';
    h += '</div>';

    h += '</div></div>'; // .act-cat-body / .act-cat
    return h;
  }

  // ── 旧函数别名（兼容内部调用）──
  function _act10BuildLing(ling, lingIdx, slotIdx, lingKey) {
    return _act10BuildCat(ling, lingIdx, slotIdx);
  }

  // ── 构建⑤自定军令（单框，随内容自动扩展）──
  function _act10BuildCustomOrder(slotIdx) {
    var h = '<div class="act-custom-block" id="act10-custom-' + slotIdx + '">';
    h += '<div class="act-custom-hd">';
    h += '<span class="act-custom-num">④</span>';
    h += '<span class="act-custom-name">自定军令</span>';
    h += '</div>';
    h += '<div class="act-custom-body">';
    h += '<div class="act-custom-slot" id="act10-cslot-' + slotIdx + '">';
    h += '<div class="rdot-v8" id="act10-cdot-' + slotIdx + '"></div>';
    h += '<div class="act-custom-inner">';
    h += '<textarea class="act-custom-ta" placeholder="填写自定军令内容…"></textarea>';
    h += '</div></div>';
    h += '</div></div>';
    return h;
  }

  // ── 自定军令输入处理 ──
  function _act10CustomInput(ta, slotIdx) {
    var dot  = document.getElementById('act10-cdot-' + slotIdx);
    var slot = document.getElementById('act10-cslot-' + slotIdx);
    var len  = ta.value.trim().length;
    if (dot) {
      dot.style.borderColor = len > 0 ? 'var(--gold)' : '';
      dot.style.background  = len > 0 ? 'var(--gold)' : '';
    }
    if (slot) slot.classList.toggle('checked', len > 0);
    // 自动高度
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    _act10UpdateQuota(slotIdx);
  }

  // ── 构建机遇选取区 ──
  function _act10BuildOppSelect(opps, slotIdx) {
    if (!opps || !opps.length) return '';
    var TI = { encounter: '🎭', bond: '🏮', gamble: '🎲', recruit: '🐴' };
    var TT = { encounter: '奇遇', bond: '交谊', gamble: '赌局', recruit: '访贤' };
    var h = '<div class="opp-select-block" id="act10-opp-' + slotIdx + '">';
    h += '<div class="opp-select-hd">';
    h += '<span style="font-size:.72rem;color:#c888e8;">机遇</span>';
    h += '<span class="opp-select-title">选取机遇（可选）</span>';
    h += '<span class="opp-select-hint">占1个行动额度</span>';
    h += '</div>';
    h += '<div class="opp-opts-list">';
    opps.forEach(function(o) {
      h += '<div class="opp-opt-row" data-action="select-opp" data-slot="' + slotIdx + '" data-opp-id="' + o.id + '">';
      h += '<div class="opp-rdot"></div>';
      h += '<div class="opp-opt-body">';
      h += '<span class="opp-opt-name">' + (TI[o.type] || '🎭') + ' 机遇' + o.id + ' · ' + _act10Esc(o.title) + '</span>';
      if (o.desc) h += '<div class="opp-opt-desc">' + _act10Esc(o.desc) + '</div>';
      h += '</div>';
      h += '<span class="opp-opt-pres">' + _act10WrapPrestige(String(o.prestige || '')) + '</span>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="opp-empty" style="font-size:.64rem;color:var(--text-dim);padding:4px 10px 6px;">占1个行动额度 · 每人每回合最多选1条</div>';
    h += '</div>';
    return h;
  }

  // ══════════════════════════════════════════
  //  交互绑定
  // ══════════════════════════════════════════
  function _act10BindAll() {
    var root = document.getElementById('act10-root');
    if (!root) return;

    // ── 一级分支（data-action="select" 或 "toggle"）──
    root.querySelectorAll('.act-opt-l1').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.tagName === 'TEXTAREA') return;
        var panel = this.closest('.col-panel');
        if (panel && panel.dataset.editable === 'false') {
          showToast('⚠️ 无法编辑其他玩家的行动'); return;
        }
        var action  = this.dataset.action;
        var slotIdx = parseInt(this.dataset.slot);
        var catIdx  = parseInt(this.dataset.cat);

        if (action === 'toggle') {
          // 有二级：展开/收起
          var brEl  = document.getElementById(this.dataset.brid);
          var subEl = document.getElementById(this.dataset.subid);
          var catEl = document.getElementById(this.dataset.catid);
          if (!brEl || !subEl) return;
          var isExpanded = brEl.classList.contains('expanded');
          if (isExpanded) {
            brEl.classList.remove('expanded');
            subEl.classList.remove('expanded');
          } else {
            brEl.classList.add('expanded');
            subEl.classList.add('expanded');
          }
        } else {
          // 无二级：直接单选
          var catEl2 = panel ? panel.querySelector('#act10-cat-' + panel.dataset.slot + '-' + catIdx) : null;
          var already = this.classList.contains('checked');
          // 清除此大类内所有选中
          if (catEl2) {
            catEl2.querySelectorAll('.act-opt-l1.checked, .act-opt-l2.checked').forEach(function(c) { c.classList.remove('checked'); });
            catEl2.querySelectorAll('.act-branch-l1').forEach(function(b) { b.classList.remove('expanded'); });
            catEl2.querySelectorAll('.act-sub-list').forEach(function(s) { s.classList.remove('expanded'); });
            catEl2.querySelectorAll('.act-remark-block').forEach(function(r) { r.classList.remove('visible'); });
          }
          if (!already) {
            this.classList.add('checked');
            var rem = document.getElementById(this.dataset.remid);
            if (rem) rem.classList.add('visible');
          }
          _act10UpdateQuota(isNaN(slotIdx) ? null : slotIdx);
          _act10HideToast(slotIdx);
        }
      });
    });

    // ── 二级分支（data-action="select-l2"）──
    root.querySelectorAll('.act-opt-l2').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.tagName === 'TEXTAREA') return;
        var panel = this.closest('.col-panel');
        if (panel && panel.dataset.editable === 'false') {
          showToast('⚠️ 无法编辑其他玩家的行动'); return;
        }
        var slotIdx = parseInt(this.dataset.slot);
        var catIdx  = parseInt(this.dataset.cat);
        var catEl   = panel ? panel.querySelector('#act10-cat-' + panel.dataset.slot + '-' + catIdx) : null;
        var already = this.classList.contains('checked');

        if (catEl) {
          catEl.querySelectorAll('.act-opt-l1.checked, .act-opt-l2.checked').forEach(function(c) { c.classList.remove('checked'); });
          catEl.querySelectorAll('.act-remark-block').forEach(function(r) { r.classList.remove('visible'); });
        }
        if (!already) {
          this.classList.add('checked');
          // 联动点亮父级一级行
          var brEl = document.getElementById(this.dataset.brid);
          if (brEl) brEl.querySelector('.act-opt-l1').classList.add('checked');
          var rem = document.getElementById(this.dataset.remid);
          if (rem) rem.classList.add('visible');
        }
        _act10UpdateQuota(slotIdx);
        _act10HideToast(slotIdx);
      });
    });

    // ── 机遇单选 ──
    root.querySelectorAll('.opp-opt-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var panel = this.closest('.col-panel');
        if (panel && panel.dataset.editable === 'false') {
          showToast('⚠️ 无法编辑其他玩家的行动'); return;
        }
        var si = parseInt(this.dataset.slot);
        var already = this.classList.contains('checked');
        var oppBlock = this.closest('.opp-select-block');
        if (oppBlock) oppBlock.querySelectorAll('.opp-opt-row.checked').forEach(function(c) { c.classList.remove('checked'); });
        if (!already) this.classList.add('checked');
        _act10UpdateQuota(si);
        _act10HideToast(si);
      });
    });

    // ── textarea 阻止冒泡 + 自定军令自动高度 ──
    root.querySelectorAll('textarea').forEach(function(ta) {
      ta.addEventListener('click', function(e) { e.stopPropagation(); });
    });
    root.querySelectorAll('.act-custom-ta').forEach(function(ta) {
      // 找到所属 slot 的 data-slot（向上找 .col-panel）
      var panel = ta.closest('.col-panel');
      var si = panel ? parseInt(panel.dataset.slot) : 0;
      ta.addEventListener('input', function() {
        _act10CustomInput(ta, si);
      });
    });

    // ── 提交按钮 ──
    root.querySelectorAll('.submit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slotIdx = parseInt(this.dataset.slot);
        if (slotIdx !== getCurrentPlayerSlot()) {
          showToast('⚠️ 无法提交其他玩家的行动'); return;
        }
        _act10Submit(slotIdx);
      });
    });

    // ── 修改按钮 ──
    root.querySelectorAll('.col-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slotIdx = parseInt(this.dataset.slot);
        var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
        if (!panel) return;
        panel.classList.remove('submitted', 'submitted-locked');
        var summary = document.getElementById('act10-summary-' + slotIdx);
        if (summary) { summary.style.display = 'none'; summary.innerHTML = ''; }
        var colBody = panel.querySelector('.col-body');
        if (colBody) { void colBody.offsetHeight; colBody.style.pointerEvents = 'auto'; }
        // 清除选中态
        panel.querySelectorAll('.act-opt-l1.checked, .act-opt-l2.checked, .opp-opt-row.checked').forEach(function(el) { el.classList.remove('checked'); });
        panel.querySelectorAll('.act-remark-block.visible').forEach(function(r) { r.classList.remove('visible'); });
        panel.querySelectorAll('textarea').forEach(function(ta) { ta.value = ''; ta.style.height = ''; });
        _act10UpdateQuota(slotIdx);
        showToast('📝 已解锁，可重新选择行动');
      });
    });

  }

  // ── 草稿保存 ──
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

  // 清除指定回合的所有草稿
  function _clearRoundDrafts(roundNum) {
    if (!roundNum) return;
    try {
      var keys = Object.keys(localStorage);
      var draftKeys = keys.filter(function(k) { return k.startsWith('sg_draft_'); });
      draftKeys.forEach(function(key) {
        localStorage.removeItem(key);
        console.log('[act10] 草稿已清除:', key);
      });
      if (draftKeys.length > 0) {
        console.log('[act10] 共清除 ' + draftKeys.length + ' 条草稿');
      }
    } catch (e) {
      console.warn('[act10] 草稿清除失败:', e);
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
    var root = document.getElementById('act10-root');
    if (!root) return;
    var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
    if (!panel) return;

    // 恢复机遇选择
    if (draft.opp_selection && draft.opp_selection.type === 'opp') {
      var oppRow = panel.querySelector('.opp-opt-row[data-opp-id="' + draft.opp_selection.oppId + '"]');
      if (oppRow) oppRow.click();
    }
  }

  // ── 额度计数条更新（对齐预览页）──
  function _act10UpdateQuota(slotIdx) {
    if (slotIdx === null || isNaN(slotIdx)) return;
    var root = document.getElementById('act10-root');
    if (!root) return;
    var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
    if (!panel) return;

    // 统计：每个大类最多1个选中（一级或二级），机遇占1，自定军令占1
    var catCount = 0;
    for (var ci = 0; ci < 4; ci++) {
      var catEl = panel.querySelector('#act10-cat-' + slotIdx + '-' + ci);
      if (catEl && (catEl.querySelector('.act-opt-l1.checked') || catEl.querySelector('.act-opt-l2.checked'))) {
        catCount++;
      }
    }
    var customEl = panel.querySelector('.act-custom-slot');
    var customFilled = customEl && customEl.classList.contains('checked') ? 1 : 0;
    var oppChecked = panel.querySelector('.opp-opt-row.checked') ? 1 : 0;
    var total = catCount + customFilled + oppChecked;

    // 更新点
    for (var d = 0; d < 3; d++) {
      var dot = document.getElementById('act10-qdot-' + slotIdx + '-' + d);
      if (dot) dot.classList.toggle('filled', d < total);
    }

    // 更新提示和按钮
    var hint    = document.getElementById('act10-qhint-' + slotIdx);
    var submitBtn = panel.querySelector('.submit-btn');
    var submitHint = document.getElementById('act10-hint-' + slotIdx);

    if (total >= 1 && total <= 3) {
      if (hint) { hint.textContent = '已选 ' + total + ' 个行动'; hint.className = 'quota-hint ok'; }
      if (submitBtn) submitBtn.disabled = false;
      if (submitHint) { submitHint.textContent = '确认后提交给 GM'; submitHint.style.color = '#7dd87d'; }
    } else if (total > 3) {
      if (hint) { hint.textContent = '行动超过 3 个'; hint.className = 'quota-hint err'; }
      if (submitBtn) submitBtn.disabled = true;
      if (submitHint) { submitHint.textContent = '最多选 3 个行动，请取消部分选项'; submitHint.style.color = '#e87060'; }
    } else {
      if (hint) { hint.textContent = '已选 0 / 最多 3'; hint.className = 'quota-hint'; }
      if (submitBtn) submitBtn.disabled = true;
      if (submitHint) { submitHint.textContent = '从 ①②③④ 中选 1–3 个行动分支'; submitHint.style.color = ''; }
    }
  }

  function _act10UpdateBadge(si, total) { _act10UpdateQuota(si); }

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

    // 四大类
    for (var ci = 0; ci < 4; ci++) {
      var catEl = panel.querySelector('#act10-cat-' + slotIdx + '-' + ci);
      if (!catEl) continue;
      var checkedL2 = catEl.querySelector('.act-opt-l2.checked');
      var checkedL1 = catEl.querySelector('.act-opt-l1.checked');
      var chosen = checkedL2 || checkedL1;
      if (!chosen) continue;
      var val = chosen.dataset.val || '';
      lingSelections.push({ lingIdx: ci, choice: val, customText: null });
      var rem = document.getElementById('act10-remark-' + slotIdx + '-' + ci);
      if (rem) {
        var remTa = rem.querySelector('.act-remark-ta');
        if (remTa && remTa.value.trim()) remarks.push({ lingIdx: ci, text: remTa.value.trim() });
      }
    }

    // 自定军令
    var cSlot = panel.querySelector('#act10-cslot-' + slotIdx);
    if (cSlot && cSlot.classList.contains('checked')) {
      var cTa = cSlot.querySelector('.act-custom-ta');
      var cText = cTa ? cTa.value.trim() : '';
      if (cText) lingSelections.push({ lingIdx: 4, choice: 'custom', customText: cText });
    }

    // 机遇
    var oppSel = { type: 'none' };
    var oppChecked = panel.querySelector('.opp-opt-row.checked');
    if (oppChecked) oppSel = { type: 'opp', oppId: oppChecked.dataset.oppId || '' };

    return {
      ling_selections: lingSelections,
      opp_selection: oppSel,
      zero_cost: '',
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

    // 校验：1–3 个行动（含机遇），自定军令有内容才计数
    var reasons = [];

    // 用 _act10UpdateQuota 同款逻辑统计
    var catCount = 0;
    for (var ci = 0; ci < 4; ci++) {
      var catEl = panel.querySelector('#act10-cat-' + slotIdx + '-' + ci);
      if (catEl && (catEl.querySelector('.act-opt-l1.checked') || catEl.querySelector('.act-opt-l2.checked'))) {
        catCount++;
      }
    }
    var customEl = panel.querySelector('.act-custom-slot');
    var customFilled = customEl && customEl.classList.contains('checked') ? 1 : 0;
    var oppChecked = panel.querySelector('.opp-opt-row.checked');
    var oppCount = oppChecked ? 1 : 0;
    var totalCount = catCount + customFilled + oppCount;

    // 自定军令勾选但内容空
    if (customEl && customEl.classList.contains('checked')) {
      var cTa = customEl.querySelector('.act-custom-ta');
      if (!cTa || !cTa.value.trim()) {
        reasons.push('已勾选「自定军令」但内容为空，请填写后再提交');
      }
    }

    if (totalCount === 0) {
      reasons.push('请至少选择 1 个行动（从 ①②③④ 中选分支，或选取机遇）');
    }
    if (totalCount > 3) {
      reasons.push('行动总数超过 3 个（当前共 ' + totalCount + ' 个），请取消部分选项');
    }

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
  // #act-restore-selection-v1: 刷新后从提交数据恢复选中态/备注/机遇/额度
  function _act10RestoreSelection(slotIdx, sub) {
    var root = document.getElementById('act10-root');
    if (!root || !sub) return;
    var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
    if (!panel) return;

    var sels = [];
    try { sels = typeof sub.ling_selections === 'string' ? JSON.parse(sub.ling_selections) : (sub.ling_selections || []); } catch (e) { sels = []; }
    var rems = [];
    try { rems = typeof sub.remarks === 'string' ? JSON.parse(sub.remarks) : (sub.remarks || []); } catch (e) { rems = []; }
    var opp = {};
    try { opp = typeof sub.opp_selection === 'string' ? JSON.parse(sub.opp_selection) : (sub.opp_selection || {}); } catch (e) { opp = {}; }

    var remarkMap = {};
    rems.forEach(function(r) { remarkMap[r.lingIdx] = r.text; });

    sels.forEach(function(sel) {
      // 自定军令
      if (sel.lingIdx === 4 || sel.choice === 'custom') {
        var cSlot = panel.querySelector('#act10-cslot-' + slotIdx);
        var cTa = panel.querySelector('.act-custom-ta');
        if (cTa) { cTa.value = sel.customText || ''; }
        if (cSlot) cSlot.classList.add('checked');
        return;
      }
      var catEl = panel.querySelector('#act10-cat-' + slotIdx + '-' + sel.lingIdx);
      if (!catEl) return;
      // 先找二级
      var target = catEl.querySelector('.act-opt-l2[data-val="' + sel.choice + '"]');
      if (target) {
        target.classList.add('checked');
        var brEl = target.closest('.act-branch-l1');
        if (brEl) {
          brEl.classList.add('expanded');
          var l1 = brEl.querySelector('.act-opt-l1');
          if (l1) l1.classList.add('checked');
          var subList = brEl.querySelector('.act-sub-list');
          if (subList) subList.classList.add('expanded');
        }
      } else {
        // 一级
        var t1 = catEl.querySelector('.act-opt-l1[data-val="' + sel.choice + '"]');
        if (t1) t1.classList.add('checked');
      }
      // 备注回填 + 显示备注块
      if (remarkMap[sel.lingIdx]) {
        var remBlock = panel.querySelector('#act10-remark-' + slotIdx + '-' + sel.lingIdx);
        if (remBlock) {
          remBlock.classList.add('visible');
          var remTa = remBlock.querySelector('.act-remark-ta');
          if (remTa) remTa.value = remarkMap[sel.lingIdx];
        }
      }
    });

    // 机遇
    if (opp && opp.type === 'opp' && opp.oppId) {
      var oppRow = panel.querySelector('.opp-opt-row[data-opp-id="' + opp.oppId + '"]');
      if (oppRow) oppRow.classList.add('checked');
    }

    // 刷新额度条
    _act10UpdateQuota(slotIdx);
  }

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
          _act10RestoreSelection(i, sub);
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
            subArea.innerHTML = '<div class="submitted-tag">已提交行动</div>'
              + '<button class="withdraw-btn" data-slot="' + i + '">修改</button>';
            subArea.querySelector('.withdraw-btn').addEventListener('click', function() {
              _act10Withdraw(parseInt(this.dataset.slot));
            });
          }
        } else {
          /* [legacy start]
          if (sumEl) sumEl.style.display = 'none';
          [legacy end] */
          // #action-keep-draft-v1: 软重置 — 仅在该 slot 之前显示过"已提交"
          // 状态时才恢复按钮区,不动选中态/输入框,避免清空其他玩家的草稿。
          // 草稿清空只在 onPublish 时由 _act10ResetUIAfterPublish 统一处理。
          if (sumEl) {
            sumEl.style.display = 'none';
            sumEl.innerHTML = '';
          }
          var panel = document.querySelector('.col-panel[data-slot="' + i + '"]');
          if (panel) {
            panel.classList.remove('submitted-locked');
          }
          // 判断:subArea 当前是否含"已提交"标签?有则说明此 slot 刚撤回,需要恢复按钮区。
          // 无则说明此 slot 处于草稿编辑态,不动任何 UI。
          var wasSubmitted = subArea && subArea.querySelector('.submitted-tag');
          if (subArea && wasSubmitted) {
            subArea.innerHTML = '<button class="submit-btn" data-slot="' + i + '">提交行动</button>'
              + '<span class="submit-hint" id="act10-hint-' + i + '">选满3个行动额度后提交</span>'
              + '<div class="val-toast" id="act10-toast-' + i + '"></div>';
            var newSubmitBtn = subArea.querySelector('.submit-btn');
            if (newSubmitBtn) {
              newSubmitBtn.addEventListener('click', function() {
                var slotIdx = parseInt(this.dataset.slot);
                var currentSlot = getCurrentPlayerSlot();
                if (slotIdx !== currentSlot) {
                  showToast('⚠️ 无法提交其他玩家的行动');
                  return;
                }
                _act10Submit(slotIdx);
              });
            }
            var newEditBtn = subArea.querySelector('.col-edit-btn');
            if (newEditBtn) {
              newEditBtn.addEventListener('click', function() {
                var slotIdx = parseInt(this.dataset.slot);
                var p2 = document.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
                if (!p2) return;
                p2.classList.remove('submitted-locked');
                var sm = document.getElementById('act10-summary-' + slotIdx);
                if (sm) { sm.style.display = 'none'; sm.innerHTML = ''; }
                showToast('📝 已解锁，可重新选择行动');
              });
            }
          }
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

  // ↓↓↓ 在这里添加新函数 ↓↓↓
  // 清理指定回合的所有行动提交数据
  async function _act10ClearRoundSubmissions(roundNum) {
    if (!roundNum) return;

    try {
      // 删除该回合的所有提交记录
      var res = await fetchWithTimeout(
        ACT10_SUPA_URL + '?round=eq.' + roundNum,
        {
          method: 'DELETE',
          headers: SUPA_HEADERS
        },
        8000
      );

      if (res.ok) {
        console.log('[act10] 已清理第 ' + roundNum + ' 回合的旧提交数据');
      } else {
        console.warn('[act10] 清理提交数据失败: HTTP ' + res.status);
      }
    } catch (e) {
      console.warn('[act10] 清理提交数据异常:', e);
    }
  }
  // ↑↑↑ 新函数结束 ↑↑↑

  // #action-publish-clean-v1: 清空整张 action_submissions_v2 表
  // 不分回合,全部删除。发布新回合时调用,避免任何残留。
  async function _act10ClearAllSubmissions() {
    try {
      // 删条件 round=gte.0 等价于全表删除（PostgREST 要求必须带 filter）
      var res = await fetchWithTimeout(
        ACT10_SUPA_URL + '?round=gte.0',
        { method: 'DELETE', headers: SUPA_HEADERS },
        8000
      );
      if (res.ok) {
        console.log('[act10] 已清空整张 action_submissions_v2 表');
      } else {
        console.warn('[act10] 清空表失败: HTTP ' + res.status);
      }
    } catch (e) {
      console.warn('[act10] 清空表异常:', e);
    }
  }

  // ↓↓↓ 修改1：新增函数 — 发布新回合后重置行动面板 UI ↓↓↓
  function _act10ResetUIAfterPublish() {
    console.log('[act10] 重置行动面板 UI');

    // 清空所有玩家的输入框
    for (var i = 0; i < 3; i++) {
      var slot = ACT10_SLOT_NAMES[i];

      // 清空行动输入框
      var textarea = document.getElementById('act10-ta-' + slot);
      if (textarea) textarea.value = '';

      // 清空机遇选择
      var oppSelect = document.getElementById('act10-opp-' + slot);
      if (oppSelect) oppSelect.value = '';

      // 隐藏"已提交"标识
      var badge = document.getElementById('act10-submitted-badge-' + slot);
      if (badge) badge.classList.add('hidden');

      // 重置提交按钮状态
      var submitBtn = document.getElementById('act10-submit-' + slot);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ 提交行动';
      }

      // 移除面板高亮状态
      var panel = document.querySelector('.col-panel[data-slot="' + i + '"]');
      if (panel) panel.classList.remove('submitted');

      // 清除所有行动选项的选中状态
      if (panel) {
        panel.querySelectorAll('.opt.checked').forEach(function(opt) {
          opt.classList.remove('checked');
        });
        panel.querySelectorAll('.opp-opt-row.checked').forEach(function(row) {
          row.classList.remove('checked');
        });
        // 清空自定军令和备注输入框
        panel.querySelectorAll('.zdjl-ta').forEach(function(ta) {
          ta.value = '';
        });
        panel.querySelectorAll('.remark-ta').forEach(function(ta) {
          ta.value = '';
          ta.classList.remove('visible');
        });
      }

      // 清除摘要区（"已提交行动"显示）
      var summary = document.getElementById('act10-summary-' + i);
      if (summary) {
        summary.style.display = 'none';
        summary.innerHTML = '';
      }

      // 恢复提交按钮区的初始状态
      var submitArea = document.getElementById('act10-submit-' + i);
      if (submitArea) {
        submitArea.innerHTML = '<button class="submit-btn" data-slot="' + i + '">提交行动</button>'
          + '<span class="submit-hint" id="act10-hint-' + i + '">选满3个行动额度后提交</span>'
          + '<div class="val-toast" id="act10-toast-' + i + '"></div>';

        // 重新绑定提交按钮事件
        var submitBtn = submitArea.querySelector('.submit-btn');
        if (submitBtn) {
          submitBtn.addEventListener('click', function() {
            var slotIdx = parseInt(this.dataset.slot);
            var currentSlot = getCurrentPlayerSlot();
            if (slotIdx !== currentSlot) {
              showToast('⚠️ 无法提交其他玩家的行动');
              return;
            }
            _act10Submit(slotIdx);
          });
        }

        // 重新绑定修改按钮事件（复用现有逻辑）
        var editBtn = submitArea.querySelector('.col-edit-btn');
        if (editBtn) {
          editBtn.addEventListener('click', function() {
            var slotIdx = parseInt(this.dataset.slot);
            var panel = document.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
            if (!panel) return;
            panel.classList.remove('submitted-locked');
            var summary = document.getElementById('act10-summary-' + slotIdx);
            if (summary) {
              summary.style.display = 'none';
              summary.innerHTML = '';
            }
            var colBody = panel.querySelector('.col-body');
            if (colBody) {
              void colBody.offsetHeight;
              colBody.style.pointerEvents = 'auto';
            }
            panel.querySelectorAll('.opt.checked, .opp-opt-row.checked').forEach(function(el) {
              el.classList.remove('checked');
            });
            panel.querySelectorAll('.zdjl-ta, .remark-ta').forEach(function(ta) {
              ta.value = '';
            });
            showToast('📝 已解锁，可重新选择行动');
          });
        }
      }

      // 移除面板锁定类（补充）
      if (panel) {
        panel.classList.remove('submitted-locked');
      }
    }

    // 重置全局提交数据缓存
    window._act10Submitted = {};
    window._act10AllSubmittedNotified = false;

    // 禁用 GM 复制按钮
    var gmCopyBtn = document.getElementById('btn-gm-copy-all-actions');
    if (gmCopyBtn) gmCopyBtn.disabled = true;

    console.log('[act10] UI 重置完成');
  }

  // ══════════════════════════════════════════
  //  行动提交实时变更回调
  // ══════════════════════════════════════════
  /* [legacy start]
  async function _onActionSubmissionChanged(payload) {
    var currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
    if (!currentRound) return;
  [legacy end] */

  async function _onActionSubmissionChanged(payload) {
    // #action-publish-clean-v1: 发布回合期间,所有 action 表变更事件全部忽略,
    // 避免 DELETE 事件回调把已清干净的 UI 又复原。
    if (window._sgPublishing) {
      console.log('[act10] 发布期间忽略 Realtime 事件');
      return;
    }
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

    // ↓↓↓ 修改3：强制更新 GM 复制按钮状态（兜底机制） ↓↓↓
    var submitted = window._act10Submitted || {};
    var allDone = ACT10_SLOT_NAMES.every(function(s) { return !!submitted[s]; });
    var gmCopyBtn = document.getElementById('btn-gm-copy-all-actions');
    if (gmCopyBtn) {
      gmCopyBtn.disabled = !allDone;
      console.log('[act10] 强制更新复制按钮状态:', allDone ? '已启用' : '已禁用');
    }

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
  // #act-summary-realname-v1: 根据 choice(label 或 name) 反查完整行动名
  function _act10ResolveActionName(slotIdx, lingIdx, choice) {
    if (!choice) return '';
    try {
      var last = state.rounds.length ? state.rounds[state.rounds.length - 1] : null;
      if (!last || !last.parsed) return choice;
      var sk = ACT10_SLOT_NAMES[slotIdx];
      var pa = (last.parsed.playerActions && last.parsed.playerActions[sk]) || {};
      var items = pa.items || [];
      var item = items[lingIdx];
      if (!item || !item.options) return choice;
      for (var oi = 0; oi < item.options.length; oi++) {
        var opt = item.options[oi];
        // 二级分支匹配
        if (opt.sub && opt.sub.length) {
          for (var si = 0; si < opt.sub.length; si++) {
            var sub = opt.sub[si];
            if ((sub.label || sub.name) === choice) {
              return (opt.name || '') + ' · ' + (sub.name || sub.label || '');
            }
          }
        }
        // 一级匹配
        if ((opt.label || opt.name) === choice) {
          return opt.name || opt.label || choice;
        }
      }
    } catch (e) {}
    return choice;
  }

  function _act10BuildSummary(sub, slotIdx) {
        var sels = [];
    try { sels = typeof sub.ling_selections === 'string' ? JSON.parse(sub.ling_selections) : (sub.ling_selections || []); } catch (e) { sels = []; }
    var opp = {};
    try { opp = typeof sub.opp_selection === 'string' ? JSON.parse(sub.opp_selection) : (sub.opp_selection || {}); } catch (e) { opp = {}; }
    var rems = [];
    try { rems = typeof sub.remarks === 'string' ? JSON.parse(sub.remarks) : (sub.remarks || []); } catch (e) { rems = []; }

    // 解析备注
    var remarks = {};
    rems.forEach(function(rem) {
      remarks[rem.lingIdx] = rem.text;
    });

    var h = '<div class="col-summary-hd">已提交行动</div>';
    sels.forEach(function(sel) {
      var lingNum = ACT10_LING_NUMS[sel.lingIdx] || '⑩';
      var label = '行动' + lingNum;
      var val = sel.choice === 'custom'
        ? '<span class="sum-custom-order">自定军令: ' + _act10Esc(sel.customText || '') + '</span>'
      : _act10Esc(_act10ResolveActionName(slotIdx, sel.lingIdx, sel.choice));

      // 拼接备注
      var remarkText = remarks[sel.lingIdx] ? ' <span class="sum-remark">备注：' + _act10Esc(remarks[sel.lingIdx]) + '</span>' : '';

      h += '<div class="col-summary-row"><span class="sum-lbl">' + label + '</span><span class="sum-val">' + val + remarkText + '</span></div>';
    });

    if (opp.type === 'opp') {
      var oppVal = '机遇' + _act10Esc(opp.oppId);
      // ↓↓↓ 新增：显示决策 ↓↓↓
      if (opp.decision) {
        oppVal += ' <span class="sum-remark">决策：' + _act10Esc(opp.decision) + '</span>';
      }
      // ↑↑↑ 新增结束 ↑↑↑
      h += '<div class="col-summary-row"><span class="sum-lbl">机遇</span><span class="sum-val">' + oppVal + '</span></div>';
    }

    if (sub.zero_cost) {
      h += '<div class="col-summary-row"><span class="sum-lbl">零消耗</span><span class="sum-val dim">' + _act10Esc(sub.zero_cost) + '</span></div>';
    }

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

    // 移除锁定状态（重要：让面板恢复可编辑）
    panel.classList.remove('submitted-locked');

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

        // ↓↓↓ 新增：恢复决策内容 ↓↓↓
        if (oppSel.decision) {
          var oppDecisionTa = panel.querySelector('.opp-decision-ta');
          if (oppDecisionTa) {
            oppDecisionTa.value = oppSel.decision;
          }
        }
        // ↑↑↑ 新增结束 ↑↑↑
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

    var lines = [];

    ACT10_SLOT_NAMES.forEach(function(sk, i) {
      var name = state.players[i] ? state.players[i].name : sk;
      var sub = submitted[sk];

      lines.push(name + ' [' + sk + ']');

      if (!sub) {
        lines.push('（未提交）');
        lines.push('');
        return;
      }

      var sels = [];
      try { sels = typeof sub.ling_selections === 'string' ? JSON.parse(sub.ling_selections) : (sub.ling_selections || []); } catch (e) {}
      var opp = {};
      try { opp = typeof sub.opp_selection === 'string' ? JSON.parse(sub.opp_selection) : (sub.opp_selection || {}); } catch (e) {}
      var rems = [];
      try { rems = typeof sub.remarks === 'string' ? JSON.parse(sub.remarks) : (sub.remarks || []); } catch (e) {}

      // 建立备注映射
      var remarksMap = {};
      rems.forEach(function(rem) {
        remarksMap[rem.lingIdx] = rem.text;
      });

      // 按顺序输出选中的令
      sels.forEach(function(sel) {
        var lingNum = ACT10_LING_NUMS[sel.lingIdx] || '';
        var line = lingNum;

        if (sel.choice === 'custom') {
          // 自定军令单独一行
          lines.push('自定军令:' + (sel.customText || ''));
        } else {
          // 普通选项：①A 备注：XXXX
          line += sel.choice.toUpperCase();
          if (remarksMap[sel.lingIdx]) {
            line += ' 备注：' + remarksMap[sel.lingIdx];
          }
          lines.push(line);
        }
      });

      // 机遇
      if (opp.type === 'opp') {
        var oppLine = '机遇: 机遇' + (opp.oppId || '');
        // ↓↓↓ 新增：包含决策 ↓↓↓
        if (opp.decision) {
          oppLine += ' 决策：' + opp.decision;
        }
        // ↑↑↑ 新增结束 ↑↑↑
        lines.push(oppLine);
      }

      lines.push(''); // 玩家之间空一行
    });

    var text = lines.join('\n').trim();

    try {
      await navigator.clipboard.writeText(text);
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

  // ── 威望范围符包裹工具函数 ──
  function _act10WrapPrestige(str) {
    if (!str) return '';
    return _act10Esc(String(str)).replace(/~/g, '<span class="range-sep">~</span>');
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
      renderSettlement(latest);
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
    const totalCities   = Object.keys(cm).length;
    const qhCnt         = totalCities - playerTotal - namedNpcTotal;
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

  // ══════════════════════════════════════════
  //  渲染结算板块（v6.5 新增）
  // ══════════════════════════════════════════
  function renderSettlement(rd) {
    const block = document.getElementById('block-settlement');
    const body = document.getElementById('settlement-body');
    if (!block || !body) return;

    const settlement = rd.parsed.settlement;

    // 如果没有结算数据，隐藏整个板块
    if (!settlement ||
        (!settlement.players[0].actions.length &&
         !settlement.players[1].actions.length &&
         !settlement.players[2].actions.length)) {
      block.classList.add('hidden');
      return;
    }

    block.classList.remove('hidden');

    let html = '<div class="settlement-grid">';

    // 三家玩家结算
    ['甲', '乙', '丙'].forEach((slot, idx) => {
      const data = settlement.players[idx];
      if (!data || !data.actions || !data.actions.length) return;

      const playerName = state.players[idx] ? state.players[idx].name : '城主' + slot;
      const slotColor = idx === 0 ? 'p0' : idx === 1 ? 'p1' : 'p2';

      html += `<div class="settlement-player sp-${slotColor}">`;
      html += `<div class="sp-header">`;
      html += `<span class="sp-slot">${slot}</span>`;
      html += `<span class="sp-name">${esc(playerName)}</span>`;
      html += `</div>`;
      html += `<div class="sp-actions">`;

      // 遍历该玩家的所有行动（1-3条不等）
      data.actions.forEach((act, actIdx) => {
        const labelText = actIdx === 0 ? '行动一' : actIdx === 1 ? '行动二' : '行动三';
        html += `<div class="sp-action">`;
        html += `<div class="sp-action-header">`;
        html += `<span class="sp-label">${labelText}</span>`;
        html += `<span class="sp-action-name">${esc(act.action)}</span>`;
        html += `</div>`;
        html += `<div class="sp-action-body">`;
        html += `<span class="sp-result">${esc(act.result)}</span>`;
        html += `<span class="sp-prestige">${esc(act.prestige)}</span>`;
        html += `</div>`;
        html += `</div>`;
      });

      html += `</div></div>`;
    });

    html += '</div>';

    // 机遇结算（如果有）
    if (settlement.opportunities && settlement.opportunities.length) {
      html += '<div class="settlement-opps">';
      html += '<div class="so-header">机遇结算</div>';
      settlement.opportunities.forEach(opp => {
        html += `<div class="so-item">`;
        html += `<span class="so-name">机遇${opp.id} · ${esc(opp.title)}</span>`;
        html += `<span class="so-result">${esc(opp.result)}</span>`;
        html += `</div>`;
      });
      html += '</div>';
    }

    body.innerHTML = html;
  }

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

  function _normalizeStatus(s) {
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
  const rawStatus = (g && g.status) || '健康';
  // data-status 直接使用中文状态，供 CSS 选择器匹配
  const status = rawStatus;

  // 只输出 class + data-status + data-name，样式完全由 CSS 控制
  let html = '<span class="gen-tag" data-status="' + esc(status)
    + '" data-name="' + esc(name) + '">'
    + esc(name);

  html += '</span>';
  return html;
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

    // 标记空态：电脑端保留占位，手机端通过CSS隐藏
    const battlesEmpty = !battles.length;
    const transitEmpty = !transit.length;
    const allEmpty = battlesEmpty && transitEmpty;

    // 给区块和栏目添加空态标记
    block.classList.toggle('all-empty', allEmpty);

    const battlesCol = document.getElementById('wb-col-battles');
    const transitCol = document.getElementById('wb-col-transit');
    if (battlesCol) battlesCol.classList.toggle('empty', battlesEmpty);
    if (transitCol) transitCol.classList.toggle('empty', transitEmpty);

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

  // ── 战情速报：单张战报卡片（VS 精修版 v20261201a）──
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
    var atkNameRaw = b.attackerGeneral || _junbaoStripPrefix(b.attacker, atkBadge);
    var defNameRaw = b.defenderGeneral || _junbaoStripPrefix(b.defender, defBadge);
    var city     = b.defenderCity || b.city || '';

    // 多武将：按 / 或 、拆分，逐个包 span，支持换行
    function _wbNames(raw) {
      var parts = String(raw || '').split(/[\/、]/).map(function(s){ return s.trim(); }).filter(Boolean);
      if (!parts.length) return '<span class="wb-br-name">—</span>';
      return parts.map(function(n){ return '<span class="wb-br-name">' + esc(n) + '</span>'; }).join('');
    }

    var atkLoss = b.attacker_loss != null ? b.attacker_loss : 0;
    var defLoss = b.defender_loss != null ? b.defender_loss : 0;

    return '<div class="wb-br-card ' + cardCls + '">'
      + '<span class="wb-br-tag">' + esc(b.result || '') + '</span>'
      + (city ? '<div class="wb-br-place">' + esc(city) + '</div>' : '')
      + '<div class="wb-br-arena">'
        + '<div class="wb-br-side atk">'
          + '<div class="wb-br-top">'
            + '<span class="wb-br-badge" style="color:' + atkColor.glow + ';border-color:' + atkColor.stroke + '">' + esc(atkBadge) + '</span>'
            + '<div class="wb-br-names">' + _wbNames(atkNameRaw) + '</div>'
          + '</div>'
          + '<div class="wb-br-loss"><span class="lbl">攻损</span><span class="num">' + atkLoss + '</span></div>'
        + '</div>'
        + '<div class="wb-br-clash"><span class="sw">⚔️</span></div>'
        + '<div class="wb-br-side def">'
          + '<div class="wb-br-top">'
            + '<span class="wb-br-badge" style="color:' + defColor.glow + ';border-color:' + defColor.stroke + '">' + esc(defBadge) + '</span>'
            + '<div class="wb-br-names">' + _wbNames(defNameRaw) + '</div>'
          + '</div>'
          + '<div class="wb-br-loss"><span class="lbl">守损</span><span class="num">' + defLoss + '</span></div>'
        + '</div>'
      + '</div>'
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

    var modeIsEnroute = (t && t.moveType === 'enroute');
    var modeText = modeIsEnroute ? '在途' : '驻屯';
    var modeCls = modeIsEnroute ? 'wb-dp-mode--enroute' : 'wb-dp-mode--stationed';

    return '<div class="wb-dp-card" style="--wb-strip-c:' + color + '">'
      + '<div class="wb-dp-line1">'
        + '<span class="wb-dp-badge" style="color:' + color + ';border-color:' + color + '">' + esc(label) + '</span>'
        + '<span class="wb-dp-general">' + esc(t.general || '') + '</span>'
        + '<span class="wb-dp-mode ' + modeCls + '">' + modeText + '</span>'
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


  // ══════════════════════════════════════════
  //  军帐 AI 问策模块  #barracks-v1
  //  - 三栏玩家卡各一个「💬 军帐」按钮
  //  - 抽屉:武将芯片 + 对话气泡 + 预设问题标签 + 输入框
  //  - AI 经 Supabase Edge Function 中转(带 anon key)
  //  - 对话历史 localStorage 持久化(key 带 回合+slot+武将)
  //  - 预设问题:本地规则按当前局势生成,点击填入输入框(不自动发送)
  // ══════════════════════════════════════════

  var BARRACKS_API_URL = 'https://smiifcbmmtolimtaxpip.supabase.co/functions/v1/barracks';
  var BARRACKS_SLOT_KEYS = ['甲', '乙', '丙'];

  // 当前军帐会话状态
  var _barracksState = {
    slotIdx: 0,
    round: 0,
    generalName: '',
    chatHistory: [],   // [{role:'general'|'user', name?, text}]
    loading: false,
    systemPromptSent: false,  // 🆕 标记：本次对话是否已发送过完整System Prompt
    lastRound: 0,             // 🆕 记录上次发送时的回合数
    lastGeneral: ''           // 🆕 记录上次的武将
  };

  // ── 打开军帐 ──
  function openBarracks(slotIdx) {
    if (slotIdx == null || slotIdx < 0 || slotIdx > 2) return;
    initBarracksDrawer();
    _barracksState.slotIdx = slotIdx;
    _barracksState.round = state.rounds.length
      ? state.rounds[state.rounds.length - 1].round : 0;
    _barracksState.generalName = '';
    _barracksState.chatHistory = [];

    // 身份色标记到抽屉根
    var overlay = document.getElementById('barracks-overlay');
    if (overlay) {
      overlay.setAttribute('data-pcolor', slotIdx);
      overlay.classList.remove('hidden');
      requestAnimationFrame(function() { overlay.classList.add('visible'); });
    }

    renderBarracksGenerals(slotIdx);
    _barracksRenderChat();      // 空态
    _barracksRenderPresets();   // 局势预设问题
    _barracksUpdateTitle(slotIdx);
  }

  function closeBarracks() {
    _barracksState.systemPromptSent = false;
    _barracksState.lastRound = 0;
    _barracksState.lastGeneral = '';
    var overlay = document.getElementById('barracks-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(function() { overlay.classList.add('hidden'); }, 200);
  }

  // ── 创建抽屉 DOM(幂等,只建一次)──
  function initBarracksDrawer() {
    if (document.getElementById('barracks-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'barracks-overlay';
    ov.className = 'barracks-overlay hidden';
    ov.innerHTML =
      '<div class="barracks-panel">' +
        '<div class="barracks-header">' +
          '<div class="barracks-title-row">' +
            '<span class="barracks-title">💬 军帐</span>' +
            '<div class="barracks-toolbar">' +
              '<button class="barracks-tool-btn" id="barracks-refresh-btn" title="刷新上下文">🔄</button>' +
              '<button class="barracks-tool-btn" id="barracks-clear-btn" title="清空对话">🗑️</button>' +
              '<button class="barracks-close" id="barracks-close-btn">✕</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="barracks-generals" id="barracks-generals"></div>' +
        '<div class="barracks-body" id="barracks-body"></div>' +
        '<div class="barracks-footer">' +
          '<div class="barracks-presets" id="barracks-presets"></div>' +
          '<div class="barracks-input-row">' +
            '<textarea class="barracks-input" id="barracks-input" rows="1" placeholder="点击上方武将后,向他问策…"></textarea>' +
            '<button class="barracks-toggle-preset" id="barracks-toggle-preset" title="预设问题">💡</button>' +
            '<button class="barracks-send" id="barracks-send-btn">发送</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    // 点遮罩空白关闭
    ov.addEventListener('click', function(e) {
      if (e.target === ov) closeBarracks();
    });
    document.getElementById('barracks-close-btn').addEventListener('click', closeBarracks);

    // 刷新按钮
    var refreshBtn = document.getElementById('barracks-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        if (!_barracksState.generalName) {
          showToast('请先选择一位武将');
          return;
        }
        _barracksState.systemPromptSent = false;
        _barracksState.lastRound = 0;
        _barracksState.lastGeneral = '';
        showToast('✅ 已刷新上下文');
      });
    }

    // 清空按钮
    var clearBtn = document.getElementById('barracks-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (!_barracksState.generalName) {
          showToast('请先选择一位武将');
          return;
        }
        if (!confirm('确定要清空与【' + _barracksState.generalName + '】的所有对话记录吗？')) {
          return;
        }
        _barracksState.chatHistory = [];
        var key = _barracksStorageKey(_barracksState.generalName);
        try { localStorage.removeItem(key); } catch (e) {}
        _barracksState.systemPromptSent = false;
        _barracksRenderChat();
        showToast('✅ 已清空对话记录');
      });
    }

    document.getElementById('barracks-toggle-preset').addEventListener('click', function () {
      var pp = document.getElementById('barracks-presets');
      if (pp) pp.classList.toggle('expanded');
    });
    document.getElementById('barracks-send-btn').addEventListener('click', sendBarracksMessage);
    var barracksInput = document.getElementById('barracks-input');
    barracksInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBarracksMessage();
      }
    });

    // 输入框焦点处理（解决移动端键盘遮挡问题）
    barracksInput.addEventListener('focus', function() {
      // 移动端检测
      var isMobile = window.innerWidth <= 768;
      if (isMobile) {
        // 延迟执行，等待键盘弹出动画完成
        setTimeout(function() {
          // 滚动到输入框位置
          barracksInput.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          // 确保父容器也滚动到底部
          var barracksBody = document.querySelector('.barracks-body');
          if (barracksBody) {
            barracksBody.scrollTop = barracksBody.scrollHeight;
          }
        }, 300);
      }
    });

    // 输入时持续保持可见
    barracksInput.addEventListener('input', function() {
      var isMobile = window.innerWidth <= 768;
      if (isMobile) {
        var barracksBody = document.querySelector('.barracks-body');
        if (barracksBody) {
          barracksBody.scrollTop = barracksBody.scrollHeight;
        }
      }
    });

    // 刷新上下文按钮
    var refreshBtn = document.getElementById('barracks-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        if (!_barracksState.generalName) {
          showToast('请先选择一位武将');
          return;
        }

        // 重置Token优化标记
        _barracksState.systemPromptSent = false;
        _barracksState.lastRound = 0;
        _barracksState.lastGeneral = '';

        showToast('✅ 已刷新上下文，下次发消息将重新加载完整战局数据');
      });
    }

    // 清空对话按钮
    var clearBtn = document.getElementById('barracks-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (!_barracksState.generalName) {
          showToast('请先选择一位武将');
          return;
        }

        // 二次确认
        if (!confirm('确定要清空与【' + _barracksState.generalName + '】的所有对话记录吗？\n\n此操作不可撤销。')) {
          return;
        }

        // 清空聊天记录
        _barracksState.chatHistory = [];

        // 清空localStorage
        var key = _barracksStorageKey(_barracksState.generalName);
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn('Failed to clear chat history:', e);
        }

        // 重置Token优化标记
        _barracksState.systemPromptSent = false;
        _barracksState.lastRound = 0;
        _barracksState.lastGeneral = '';

        // 重新渲染
        _barracksRenderChat();

        showToast('✅ 已清空对话记录');
      });
    }
  }

  function _barracksUpdateTitle(slotIdx) {
    var titleEl = document.querySelector('#barracks-overlay .barracks-title');
    if (!titleEl) return;
    var pn = state.players[slotIdx] ? state.players[slotIdx].name : '城主' + BARRACKS_SLOT_KEYS[slotIdx];
    titleEl.textContent = '💬 ' + pn + ' · 军帐';
  }

  // ── 渲染武将芯片 ──
  function renderBarracksGenerals(slotIdx) {
    var el = document.getElementById('barracks-generals');
    if (!el) return;
    var player = state.players[slotIdx];
    var generals = (player && player.generals) || [];
    var names = generals.map(function(g) {
      return (g && typeof g === 'object') ? g.name : g;
    }).filter(Boolean);

    if (!names.length) {
      el.innerHTML = '<span class="barracks-no-gen">主公麾下尚无武将</span>';
      return;
    }
    el.innerHTML = names.map(function(n) {
      return '<button class="barracks-gen-chip" data-name="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');

    el.querySelectorAll('.barracks-gen-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var name = this.dataset.name;
        selectBarracksGeneral(name);
      });
    });
  }

  // ── 选择武将 ──
  function selectBarracksGeneral(name) {
    // 如果切换了武将，重置标记
    if (_barracksState.generalName !== name) {
      _barracksState.systemPromptSent = false;
    }
    _barracksState.generalName = name;
    // 高亮
    document.querySelectorAll('#barracks-generals .barracks-gen-chip').forEach(function(c) {
      c.classList.toggle('active', c.dataset.name === name);
    });

    // 给弹窗添加class（显示操作按钮）
    var panel = document.querySelector('.barracks-panel');
    if (panel && name) {
      panel.classList.add('has-general');
    }
    // 读历史(不自动调 AI)
    _barracksState.chatHistory = loadBarracksChatHistory(name);
    _barracksRenderChat();
    var input = document.getElementById('barracks-input');
    if (input) {
      input.placeholder = '向 ' + name + ' 问策…';
      input.focus();
    }
  }

  // ── localStorage key ──
  function _barracksStorageKey(name) {
    return 'barracks_round' + _barracksState.round +
           '_slot' + _barracksState.slotIdx +
           '_general' + name;
  }
  function loadBarracksChatHistory(name) {
    try {
      var raw = localStorage.getItem(_barracksStorageKey(name));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveBarracksChatHistory() {
    try {
      localStorage.setItem(
        _barracksStorageKey(_barracksState.generalName),
        JSON.stringify(_barracksState.chatHistory)
      );
    } catch (e) {}
  }

  // ── 渲染对话区 ──
  function _barracksRenderChat() {
    var container = document.getElementById('barracks-chat-container');
    if (!container) {
      container = document.getElementById('barracks-body');
    }
    if (!container) return;

    var html = '';

    if (!_barracksState.chatHistory || _barracksState.chatHistory.length === 0) {
      html = '<div class="barracks-empty">点击上方武将,听取建议</div>';
    } else {
      _barracksState.chatHistory.forEach(function(msg) {
        if (msg.role === 'user') {
          // 用户消息
          html += '<div class="barracks-msg-user">';
          html += '  <div class="msg-content">';
          html += '    <div class="msg-bubble">';
          html += '      <div class="msg-text">' + esc(msg.text) + '</div>';
          html += '    </div>';
          html += '    <div class="msg-avatar">👤</div>';
          html += '  </div>';
          html += '</div>';
        } else if (msg.role === 'general') {
          // AI消息
          var isThinking = msg.text.indexOf('思量中') > -1 || msg.text.indexOf('...') === msg.text.length - 3;

          html += '<div class="barracks-msg-ai">';
          html += '  <div class="msg-content">';
          html += '    <div class="msg-avatar">📜</div>';
          html += '    <div class="msg-bubble">';
          html += '      <div class="msg-name">' + esc(msg.name || '武将') + '</div>';

          if (isThinking) {
            html += '      <div class="barracks-msg-thinking">';
            html += '        <span></span><span></span><span></span>';
            html += '      </div>';
          } else {
            html += '      <div class="msg-text">' + esc(msg.text) + '</div>';
          }

          html += '    </div>';
          html += '  </div>';
          html += '</div>';
        }
      });
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }



  // ── 抓取局势数据(用于 prompt 与预设问题)──
  function extractBarracksSituation(slotIdx) {
  var latest = state.rounds.length ? state.rounds[state.rounds.length - 1] : null;
  var parsed = latest ? latest.parsed : {};
  var slotKey = BARRACKS_SLOT_KEYS[slotIdx];
  var player = state.players[slotIdx] || {};

  // ═══ 原有数据 ═══

  // 威望
  var myPrestige = null, prestigeRank = null;
  var entries = (parsed.prestige && parsed.prestige.entries) || [];
  entries.forEach(function(e, idx) {
    if (e.name === slotKey) { myPrestige = e.score; prestigeRank = idx + 1; }
  });

  // 行动选项
  var myActions = (parsed.playerActions && parsed.playerActions[slotKey]) || {};
  var actionItems = myActions.items || [];

  // 机遇
  var opps = parsed.opportunities || [];

  // ═══ 新增：最近3回合局势段 ═══
  var situationHistory = [];
  var startIdx = Math.max(0, state.rounds.length - 3);
  for (var i = startIdx; i < state.rounds.length; i++) {
    var rd = state.rounds[i];
    if (rd && rd.parsed && rd.parsed.situation) {
      situationHistory.push({
        round: rd.round,
        situation: rd.parsed.situation
      });
    }
  }

  // ═══ 新增：最近3回合事件（标题+▸影响）═══
  var eventsHistory = [];
  for (var i = startIdx; i < state.rounds.length; i++) {
    var rd = state.rounds[i];
    if (rd && rd.parsed && rd.parsed.rawDigest) {
      var eventsText = rd.parsed.rawDigest;
      var eventsList = [];

      // 正则提取：📜 事件X · 标题 ... ▸ 影响:...
      var eventMatches = eventsText.match(/📜\s*事件[^·]*·\s*([^\n]+)[\s\S]*?▸\s*影响[:：]([^\n]+)/g);
      if (eventMatches) {
        eventMatches.forEach(function(match) {
          var titleMatch = match.match(/📜\s*事件[^·]*·\s*([^\n]+)/);
          var impactMatch = match.match(/▸\s*影响[:：]([^\n]+)/);
          if (titleMatch && impactMatch) {
            eventsList.push({
              title: titleMatch[1].trim(),
              impact: impactMatch[1].trim()
            });
          }
        });
      }

      if (eventsList.length > 0) {
        eventsHistory.push({
          round: rd.round,
          events: eventsList
        });
      }
    }
  }

  // ═══ 新增：当前回合战报 ═══
  var battlesList = (parsed.battles || []).map(function(b) {
    return {
      attackerLabel: b.attackerLabel || '',
      defenderLabel: b.defenderLabel || '',
      attackerGenerals: b.attackerGenerals || '',
      defenderGenerals: b.defenderGenerals || '',
      attackerCity: b.attackerCity || '',
      defenderCity: b.defenderCity || '',
      outcome: b.outcome || '',
      casualties: b.casualties || ''
    };
  });

  // ═══ 新增：当前回合调度 ═══
  var transitList = (parsed.transit || []).filter(function(t) {
    return t.player === slotKey;
  }).map(function(t) {
    return {
      generals: t.generals || '',
      location: t.location || '',
      troops: t.troops || '',
      status: t.status || ''
    };
  });

  // ═══ 新增：城池详情（含守将+兵力）═══
  var citiesDetail = (player.cities_list || []).map(function(city) {
    return {
      name: city.name || '',
      generals: city.generals || '',
      troops: city.troops || ''
    };
  });

  // ═══ 新增：机遇全文 ═══
  var opportunitiesFullText = opps.map(function(o) {
    var text = '机遇' + (o.id || '') + '·' + (o.title || '');
    if (o.type) text += ' · ' + o.type;
    if (o.description) text += '\n' + o.description;
    if (o.note) text += '\n▸ ' + o.note;
    return text;
  });

  // ═══ 新增：本回合军令全文 ═══
  var myActionsFullText = actionItems.map(function(item) {
    var text = (item.num || '') + ' ' + (item.title || '');
    if (item.advisor) text += ': ' + item.advisor;
    if (item.quote) text += ' 「' + item.quote + '」';
    if (item.note) text += ' (' + item.note + ')';
    if (item.branches && item.branches.length) {
      text += '\n选项:';
      item.branches.forEach(function(br) {
        text += '\n  ' + (br.label || '') + '.' + (br.name || '');
        if (br.description) text += ':' + br.description;
      });
    }
    return text;
  });

  // ═══ 新增：武将归属信息 ═══
  var generalOwnership = {
    players: {},
    npcs: [],
    free: []
  };

  ['甲', '乙', '丙'].forEach(function(slot, idx) {
    var p = state.players[idx];
    if (p && p.generals && p.generals.length) {
      var genList = p.generals.map(function(g) {
        return g && typeof g === 'object' ? g.name : g;
      }).filter(Boolean);
      generalOwnership.players[slot] = {
        name: p.name || slot,
        generals: genList
      };
    }
  });

  var npcGeneralsFromEvents = [];
  var knownNpcGenerals = [
    '曹操', '夏侯惇', '夏侯渊', '曹仁', '曹洪', '荀彧', '荀攸', '郭嘉', '程昱',
    '袁绍', '袁术', '袁熙', '袁谭', '田丰', '沮授', '审配', '颜良', '文丑',
    '孙权', '周瑜', '鲁肃', '太史慈', '周泰', '黄盖', '程普', '甘宁',
    '刘表', '刘璋', '张鲁', '韩遂', '马腾', '公孙瓒'
  ];

  if (eventsHistory && eventsHistory.length) {
    eventsHistory.forEach(function(eh) {
      eh.events.forEach(function(evt) {
        var text = evt.title + ' ' + evt.impact;
        knownNpcGenerals.forEach(function(gen) {
          if (text.indexOf(gen) > -1 && npcGeneralsFromEvents.indexOf(gen) === -1) {
            npcGeneralsFromEvents.push(gen);
          }
        });
      });
    });
  }

  var npcHoldersMap = {};
  if (parsed.npcCities && parsed.npcCities.length) {
    parsed.npcCities.forEach(function(c) {
      if (c.holders && c.holders.length) {
        var factionName = c.faction || c.name || '未知势力';
        if (!npcHoldersMap[factionName]) npcHoldersMap[factionName] = [];
        c.holders.forEach(function(h) {
          if (h && h !== '无' && h !== '未知' && npcHoldersMap[factionName].indexOf(h) === -1) {
            npcHoldersMap[factionName].push(h);
          }
        });
      }
    });
  }

  Object.keys(npcHoldersMap).forEach(function(faction) {
    var gens = npcHoldersMap[faction];
    if (gens.length) {
      generalOwnership.npcs.push({
        name: faction,
        generals: gens
      });
      gens.forEach(function(g) {
        var idx = npcGeneralsFromEvents.indexOf(g);
        if (idx > -1) npcGeneralsFromEvents.splice(idx, 1);
      });
    }
  });

  var allPlayerGenerals = [];
  Object.keys(generalOwnership.players).forEach(function(slot) {
    var info = generalOwnership.players[slot];
    if (info && info.generals) {
      allPlayerGenerals = allPlayerGenerals.concat(info.generals);
    }
  });

  npcGeneralsFromEvents = npcGeneralsFromEvents.filter(function(gen) {
    return allPlayerGenerals.indexOf(gen) === -1;
  });

  if (npcGeneralsFromEvents.length > 0) {
    generalOwnership.npcs.push({
      name: 'NPC势力',
      generals: npcGeneralsFromEvents
    });
  }

  return {
    round: latest ? latest.round : 0,
    slotKey: slotKey,
    name: player.name || ('城主' + slotKey),
    gold: player.gold,
    food: player.food,
    troop: player.troop,
    morale: player.morale,
    cities: player.cities,
    generals: player.generals || [],
    citiesList: player.cities_list || [],
    prestige: myPrestige,
    prestigeRank: prestigeRank,
    prestigeEntries: entries,
    actionItems: actionItems,
    opportunities: opps,

    // ═══ 新增字段 ═══
    situationHistory: situationHistory,
    eventsHistory: eventsHistory,
    battles: battlesList,
    transit: transitList,
    citiesDetail: citiesDetail,
    opportunitiesFullText: opportunitiesFullText,
    myActionsFullText: myActionsFullText,
    generalOwnership: generalOwnership
  };
}
  // ── 本地规则生成预设问题(按局势)──
  function _barracksBuildPresets(slotIdx) {
    var s = extractBarracksSituation(slotIdx);
    var qs = [];

    if (s.actionItems && s.actionItems.length) {
      qs.push('本回合这几道军令,该如何取舍?');
    }
    if (s.opportunities && s.opportunities.length) {
      qs.push('公共机遇值得去争吗?该选哪条?');
    }
    if (s.prestigeRank && s.prestigeRank > 1) {
      qs.push('我威望暂时落后,如何追赶?');
    }
    if (s.food != null && s.food < 1000) {
      qs.push('粮草吃紧,当如何筹措?');
    }
    if (s.troop != null && s.troop < 2000) {
      qs.push('兵力单薄,该募兵还是固守?');
    }
    // 武将状态
    var hasBadStatus = (s.generals || []).some(function(g) {
      return g && g.status && g.status !== '健康' && g.status !== null;
    });
    if (hasBadStatus) {
      qs.push('军中有将不在状态,要紧吗?');
    }
    // 通用兜底(总保证有几条)
    qs.push('依眼下局势,我当务之急是什么?');
    qs.push('三家之中,我该提防谁?');

    // 去重 + 最多 5 条
    var seen = {}, out = [];
    qs.forEach(function(q) { if (!seen[q]) { seen[q] = 1; out.push(q); } });
    return out.slice(0, 5);
  }

  function _barracksRenderPresets() {
    var el = document.getElementById('barracks-presets');
    if (!el) return;
    var presets = _barracksBuildPresets(_barracksState.slotIdx);
    if (!presets.length) { el.innerHTML = ''; return; }
    el.innerHTML = presets.map(function(q, idx) {
      return '<button class="barracks-preset-chip" style="--bp-delay:' + (idx * 60) + 'ms" data-q="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('');
    el.querySelectorAll('.barracks-preset-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var input = document.getElementById('barracks-input');
        if (!input) return;
        if (!_barracksState.generalName) {
          showToast('请先点选一位武将');
          return;
        }
        input.value = this.dataset.q;   // 填入输入框,不自动发送
        input.focus();
      });
    });
  }

  // ── 组装 system prompt ──
function getBarracksSystemPrompt(generalName, slotIdx) {
  var s = extractBarracksSituation(slotIdx);

  // ═══ 🆕 玩家身份信息 ═══
  var playerSlotName = ['甲', '乙', '丙'][slotIdx] || '甲'; // 槽位：甲/乙/丙
  var playerTitle = s.name || '主公'; // 名号：昭公/高公/许公

  // ═══ 武将列表（带状态）═══
  var genStr = (s.generals || []).map(function(g) {
    var st = (g && g.status && g.status !== '健康') ? '(' + g.status + ')' : '';
    return (g && typeof g === 'object' ? g.name : g) + st;
  }).join('、') || '无';

  // ═══ 城池简略列表 ═══
  var cityStr = (s.citiesList || []).map(function(c) { return c.name; }).join('、') || '无';

  // ═══ 城池详情（含守将+兵力）═══
  var citiesDetailStr = (s.citiesDetail || []).map(function(c) {
    var line = '· ' + c.name;
    if (c.generals) line += ':' + c.generals;
    if (c.troops) line += ' | ' + c.troops;
    return line;
  }).join('\n') || '无详情';

  // ═══ 战报摘要 ═══
  var battlesStr = (s.battles || []).map(function(b) {
    return '· ' + b.attackerLabel + '攻' + b.defenderLabel + ' ' +
           b.outcome + (b.casualties ? ' 伤亡:' + b.casualties : '');
  }).join('\n') || '本回合无战事';

  // ═══ 调度摘要 ═══
  var transitStr = (s.transit || []).map(function(t) {
    return '· ' + t.generals + ' ' + t.location + ' ' + t.troops +
           (t.status ? ' (' + t.status + ')' : '');
  }).join('\n') || '无部队在途';

  // ═══ 威望对比 ═══
  var prestigeCompare = '';
  if (s.prestigeRank === 1) {
    var gap = s.prestige - (s.prestigeEntries[1] ? s.prestigeEntries[1].score : 0);
    prestigeCompare = '(排名第1·领先第2名' + gap + '分)';
  } else if (s.prestigeRank > 1) {
    var topScore = s.prestigeEntries[0] ? s.prestigeEntries[0].score : 0;
    var gap = topScore - s.prestige;
    prestigeCompare = '(排名第' + s.prestigeRank + '·落后榜首' + gap + '分)';
  }

  // ═══ 机遇全文 ═══
  var oppsFullStr = (s.opportunitiesFullText || []).join('\n\n') || '无';

  // ═══ 军令全文 ═══
  var actionsFullStr = (s.myActionsFullText || []).join('\n\n') || '无';

  // ═══ 最近3回合局势段 ═══
  var situationHistoryStr = (s.situationHistory || []).map(function(sh) {
    return '【第' + sh.round + '回合】\n' + sh.situation;
  }).join('\n\n') || '（暂无历史局势）';

  // ═══ 最近3回合事件（标题+影响）═══
  var eventsHistoryStr = (s.eventsHistory || []).map(function(eh) {
    var eventsLines = eh.events.map(function(evt) {
      return '• ' + evt.title + ': ' + evt.impact;
    }).join('\n');
    return '【第' + eh.round + '回合】\n' + eventsLines;
  }).join('\n\n') || '（暂无历史事件）';

  // ═══ 天下武将归属 ═══
  var ownershipLines = [];
  if (s.generalOwnership) {
    Object.keys(s.generalOwnership.players || {}).forEach(function(slot) {
      var info = s.generalOwnership.players[slot];
      if (info && info.generals && info.generals.length) {
        ownershipLines.push('• ' + slot + '(' + info.name + '):' + info.generals.join('、'));
      }
    });
    (s.generalOwnership.npcs || []).forEach(function(npc) {
      if (npc.generals && npc.generals.length) {
        ownershipLines.push('• ' + npc.name + ':' + npc.generals.join('、'));
      }
    });
  }
  var ownershipStr = ownershipLines.join('\n') || '（暂无详细信息）';

  return [
    '你是《三国志文字版》中的【' + generalName + '】本人——不是扮演者,不是AI,就是【' + generalName + '】本人。',
    '此刻主公【' + playerTitle + '】(' + playerSlotName + ')在军帐召你议事。',
    '',
    '━━━ 第一步:自我画像(在心里完成,不要输出) ━━━',
    '',
    '在开口前,你必须先在心里基于历史与演义中【' + generalName + '】的真实形象,确认这份档案:',
    '',
    '1. 智力刻度(1-10):你能看穿多深的局?',
    '   · 顶级谋士(诸葛亮/郭嘉/贾诩/法正/荀彧/陈群)= 9-10:算到三步之外',
    '   · 一流谋士(陈宫/田丰/沮授/庞统/荀攸)= 7-8',
    '   · 智勇兼备的统帅(周瑜/陆逊/司马懿/曹操/周郎)= 8-9',
    '   · 普通武将(关羽/张辽/赵云/黄忠/张郃)= 4-6:能判战场,不深算谋略',
    '   · 有勇无谋型(吕布/张飞/许褚/典韦/夏侯惇)= 2-3:凭直觉拍板',
    '   · 莽撞型(颜良/文丑/华雄/纪灵)= 1-2',
    '',
    '2. 武勇刻度(1-10):同理自己掂量。',
    '',
    '3. 性格关键词(3-5 个,你最鲜明的标签):',
    '   例:诸葛亮=「谨慎/苛细/忠贞/算无遗策」',
    '   例:吕布=「骄狂/反复/重利/勇而无谋」',
    '   例:张飞=「暴烈/忠义/嗜酒/敬贤憎卒」',
    '   例:司马懿=「隐忍/多疑/深沉/老谋」',
    '   例:赵云=「沉稳/寡言/忠勇/不矜功」',
    '',
    '4. 说话特征:',
    '   · 智者:多用「臣窃以为」「以理度之」「窃观」「此中有三虑」',
    '   · 普通武将:多用「末将看来」「依某之见」「这有何难」',
    '   · 暴烈型(张飞/吕布):句短,常带骂语或不耐烦,常省略客套',
    '   · 阴沉型(司马懿/贾诩):多用反问、留半句、话里有话',
    '   · 忠厚型(赵云/黄忠):话直不绕弯,常说「但凭主公裁夺」',
    '',
    '5. 认知边界:',
    '   · 智力刻度决定你能看穿什么。',
    '   · 智力低于 5 的武将,不要主动算粮草细账、不要谈外交大局、',
    '     不要预判第二回合之后的连锁——这些不是你能掌握的。',
    '   · 你只评论你看得见的东西:当面厮杀、眼前兵力、',
    '     主公方才提的那几条具体军令。',
    '',
    '━━━ 第二步:沉浸应答(这部分才输出给主公) ━━━',
    '',
    '【活人不是答案机】',
    '· 你不是给"最优解",你是给【你这个人】的看法。',
    '  同一件事,法正会说"取之"、贾诩会说"缓之"、张飞会说"打他娘的"——',
    '  三种回答都对,因为各自符合那个人。',
    '· 允许带情绪:不耐烦、激动、犹豫、不满、自得,都可流露。',
    '· 允许反问主公,允许表达"此事不该问我":',
    '   · 吕布被问粮草:「这等鸡毛蒜皮,问陈宫去!」',
    '   · 关羽被问外交:「关某只知斩将夺旗,纵横捭阖另请高明。」',
    '   · 诸葛亮被问单挑:「临阵厮杀非亮所长,当询赵将军。」',
    '· 允许智力分层:',
    '   · 高智者(9-10):指出主公未见之隐患、算三步、引典故',
    '   · 中智者(6-8):就当下给靠谱判断,不算太远',
    '   · 低智者(2-4):直觉判断,看见啥说啥,可能说错,但有他的味道',
    '   · 莽夫型若是【' + generalName + '】的本色,哪怕局势复杂,也只用最直白的话拍板,不要装聪明。',
    '',
    '【绝对禁忌】',
    '× 不要每次都"主公,臣以为…"开头——这是法正才会说的话。',
    '  张飞会说「俺看…」「大哥…」,吕布会说「哼,本将以为…」或直接骂街,',
    '  关羽多用「关某…」「依某看…」。务必匹配【' + generalName + '】的口吻。',
    '× 不要用"先分析形势 → 再给建议 → 最后提风险"的三段式。',
    '  这是问答机的套路,不是活人说话。活人可以一句话甩观点,也可以先骂两句再说正事。',
    '× 不要 Markdown,不要列「优点1/优点2」,不要写「综上所述」「另外」「最后」。',
    '× 不要现代词汇:策略、方案、风险评估、性价比、机制、系统、ROI、性价比。',
    '× 不要超过你智力刻度允许的洞察。莽夫不会说出谋士的话。',
    '× 招募/调动武将时,只能从【天下武将归属】中尚未归属的人里推荐。',
    '  不确定就直说「臣不知此人下落」。',
    '× 建议的具体行动必须来自【本回合军令】或【公共机遇池】,不可编造。',
    '× 任何情况下不要写出"作为AI"、"我作为【' + generalName + '】"——你就是他本人。',
    '',
    '【说话长度】',
    '60-180 字。话痨型(诸葛亮/陈宫/田丰)可到上限。',
    '寡言型(赵云/典韦/夏侯惇)往往 50-90 字。',
    '暴烈型(吕布/张飞/许褚)常常 30-60 字甩一句拍板。',
    '',
    '【没有标准答案】',
    '主公问你的是【你的看法】,不是【最优解】。',
    '你这个人是什么样,就给什么样的回答。',
    '哪怕你的判断后来被证明是错的——那也是【' + generalName + '】本人会犯的错。',
    '忠于角色,胜过忠于"正确"。',
    '',
    '━━━ 以下是主公此刻的局势 ━━━',
    '',
    '【当前局势】',
    '回合:第' + s.round + '回合',
    '主公:' + playerTitle + '(' + playerSlotName + ') | 威望:' + (s.prestige != null ? s.prestige : '未知') + ' ' + prestigeCompare,
    '资源 金:' + s.gold + ' 粮:' + s.food + ' 兵:' + s.troop + ' 民心:' + s.morale + ' 城:' + s.cities,
    '',
    '【战局态势·最近3回合】',
    situationHistoryStr,
    '',
    '【战局事件·最近3回合】',
    eventsHistoryStr,
    '',
    '【本回合战报】',
    battlesStr,
    '',
    '【我方调度】',
    transitStr,
    '',
    '【城池详情】',
    citiesDetailStr,
    '',
    '【麾下武将】',
    genStr,
    '',
    '【天下武将归属】',
    ownershipStr,
    '',
    '【本回合军令】',
    actionsFullStr,
    '',
    '【公共机遇池】',
    oppsFullStr
  ].join('\n');
}

  // ── 调用 Edge Function ──
  function _barracksCallAI(messages, maxTokens) {
    return fetchWithTimeout(BARRACKS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPA_KEY,
        'apikey': SUPA_KEY
      },
      body: JSON.stringify({
        messages: messages,
        max_tokens: maxTokens || 600,
        temperature: 0.8
      })
    }, 40000).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(data) {
      if (data.error) throw new Error(data.error);
      return data.reply || '';
    });
  }

  // ── 发送追问 ──
function sendBarracksMessage() {
  var input = document.getElementById('barracks-input');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  if (!_barracksState.generalName) {
    showToast('请先点选一位武将');
    return;
  }
  if (_barracksState.loading) return;

  var generalName = _barracksState.generalName;
  var slotIdx = _barracksState.slotIdx;
  var currentRound = state.rounds.length ? state.rounds[state.rounds.length - 1].round : 0;

  _barracksState.chatHistory.push({ role: 'user', text: text });
  _barracksState.chatHistory.push({ role: 'general', name: generalName, text: '思量中...' });

  input.value = '';
  _barracksState.loading = true;
  _barracksRenderChat();

  // ═══ Token优化：判断是否需要重新发送完整System Prompt ═══
  var needFullPrompt =
    !_barracksState.systemPromptSent ||           // 从未发送过
    _barracksState.lastRound !== currentRound ||  // 回合变了
    _barracksState.lastGeneral !== generalName;   // 换武将了

  var msgs = [];

  if (needFullPrompt) {
    // 发送完整战局数据
    msgs.push({
      role: 'system',
      content: getBarracksSystemPrompt(generalName, slotIdx)
    });

    // 更新标记
    _barracksState.systemPromptSent = true;
    _barracksState.lastRound = currentRound;
    _barracksState.lastGeneral = generalName;
  } else {
    // 追问态:保留人设核心约束,省掉局势数据(节省Token)
    msgs.push({
      role: 'system',
      content: [
        '你是《三国志文字版》中的【' + generalName + '】本人,继续为主公议事。',
        '',
        '保持你的本色:',
        '· 按你历史/演义中的智力与武勇刻度作答,不超出认知边界',
        '· 保持你的说话特征(谋士/武将/暴烈/阴沉/忠厚 之一,匹配你这个人)',
        '· 不要用"主公,臣以为"开头(除非你本就是法正/诸葛亮那类口吻)',
        '· 不要三段式套路,不要 Markdown,不要现代词汇',
        '· 允许情绪/反问/拒答("此事不该问我")',
        '· 没有标准答案——你这个人是什么样,就给什么样的回答',
        '· 60-180 字,寡言型与暴烈型可更短'
      ].join('\n')
    });
  }

  // 加上最近6条对话历史
  var recent = _barracksState.chatHistory.slice(-6);
  recent.forEach(function(m) {
    msgs.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    });
  });

  _barracksCallAI(msgs, 500).then(function(reply) {
    _barracksState.loading = false;
    _barracksState.chatHistory.pop(); // 移除思量中
    _barracksState.chatHistory.push({ role: 'general', name: generalName, text: reply || '（无言）' });
    saveBarracksChatHistory();
    _barracksRenderChat();
    }).catch(function(err) {
    _barracksState.loading = false;
    _barracksState.chatHistory.pop();
    _barracksState.chatHistory.push({
      role: 'general', name: generalName,
      text: '❌ ' + generalName + '一时思绪受阻,请主公稍后再问…'
    });
    _barracksRenderChat();
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

// ══════════════════════════════════════════
//  输入框弹出功能 v1
// ══════════════════════════════════════════
(function() {
  'use strict';

  var _popupWindows = {}; // 缓存已弹出的窗口：{ key: { win, ta, originalParent, isDragging } }
  var _dragState = null;  // { key, startX, startY, winX, winY }

  // 事件委托：监听所有弹出按钮点击
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.pop-btn');
    if (!btn) return;

    e.stopPropagation();
    var target = btn.dataset.target;
    var slot = btn.dataset.slot;
    var ling = btn.dataset.ling || '';
    var key = target + '-' + slot + (ling ? '-' + ling : '');

    if (_popupWindows[key]) {
      // 已弹出，收回
      _closePopup(key);
    } else {
      // 弹出
      _openPopup(key, target, slot, ling, btn);
    }
  });

  function _openPopup(key, target, slot, ling, btn) {
    var ta;
    var title;

    // 定位原始输入框
    if (target === 'remark') {
      var remarkBlock = document.getElementById('act10-remark-' + slot + '-' + ling);
      ta = remarkBlock ? remarkBlock.querySelector('.remark-ta') : null;
      title = '备注';
    } else if (target === 'zdjl') {
      var panel = document.querySelector('.col-panel[data-slot="' + slot + '"]');
      ta = panel ? panel.querySelector('.zdjl-ta') : null;
      title = '自定军令';
    } else if (target === 'opp-decision') {
      var panel = document.querySelector('.col-panel[data-slot="' + slot + '"]');
      ta = panel ? panel.querySelector('.opp-decision-ta') : null;
      title = '机遇决策';
    }

    if (!ta) return;

    // 创建浮动窗口
    var win = document.createElement('div');
    win.className = 'input-popup-win';
    win.innerHTML =
      '<div class="input-popup-hd">' +
        '<span class="input-popup-title">' + _esc(title) + '</span>' +
        '<button class="input-popup-close" data-key="' + key + '">×</button>' +
      '</div>' +
      '<div class="input-popup-body"></div>';

    document.body.appendChild(win);

    // 移动输入框到窗口内
    var body = win.querySelector('.input-popup-body');
    var originalParent = ta.parentNode;
    body.appendChild(ta);

    // 初始位置（移动端适配）
    var isMobile = window.innerWidth <= 768;
    if (isMobile) {
      win.style.left = '16px';
      win.style.top = '80px';
    } else {
      win.style.left = (window.innerWidth / 2 + 100) + 'px';
      win.style.top = '120px';
    }

    // 缓存
    _popupWindows[key] = {
      win: win,
      ta: ta,
      originalParent: originalParent,
      isDragging: false
    };

    // 绑定拖拽（桌面端鼠标 + 移动端触摸）
    var hd = win.querySelector('.input-popup-hd');
    hd.addEventListener('mousedown', function(e) { _onDragStart(e, key); });
    hd.addEventListener('touchstart', function(e) { _onTouchStart(e, key); }, { passive: false });

    // 绑定关闭按钮
    win.querySelector('.input-popup-close').addEventListener('click', function() {
      _closePopup(key);
    });

    // 聚焦输入框
    setTimeout(function() { ta.focus(); }, 100);
  }

  function _closePopup(key) {
    var popup = _popupWindows[key];
    if (!popup) return;

    // 输入框移回原位
    popup.originalParent.appendChild(popup.ta);

    // 移除窗口
    popup.win.remove();

    // 清除缓存
    delete _popupWindows[key];
  }

  function _onDragStart(e, key) {
    e.preventDefault();
    var popup = _popupWindows[key];
    if (!popup) return;

    popup.isDragging = true;
    var rect = popup.win.getBoundingClientRect();
    _dragState = {
      key: key,
      startX: e.clientX,
      startY: e.clientY,
      winX: rect.left,
      winY: rect.top
    };

    document.addEventListener('mousemove', _onDragMove);
    document.addEventListener('mouseup', _onDragEnd);
  }

  function _onDragMove(e) {
    if (!_dragState) return;
    var dx = e.clientX - _dragState.startX;
    var dy = e.clientY - _dragState.startY;
    var popup = _popupWindows[_dragState.key];
    if (popup) {
      popup.win.style.left = (_dragState.winX + dx) + 'px';
      popup.win.style.top = (_dragState.winY + dy) + 'px';
    }
  }

  function _onDragEnd() {
    if (_dragState) {
      var popup = _popupWindows[_dragState.key];
      if (popup) popup.isDragging = false;
    }
    _dragState = null;
    document.removeEventListener('mousemove', _onDragMove);
    document.removeEventListener('mouseup', _onDragEnd);
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ══════════════════════════════════════════
  //  移动端触摸拖拽
  // ══════════════════════════════════════════
  function _onTouchStart(e, key) {
    e.preventDefault();
    var popup = _popupWindows[key];
    if (!popup) return;

    var rect = popup.win.getBoundingClientRect();
    var touch = e.touches[0];
    _dragState = {
      key: key,
      startX: touch.clientX,
      startY: touch.clientY,
      winX: rect.left,
      winY: rect.top
    };

    document.addEventListener('touchmove', _onTouchMove, { passive: false });
    document.addEventListener('touchend', _onTouchEnd);
  }

  function _onTouchMove(e) {
    if (!_dragState) return;
    e.preventDefault();
    var touch = e.touches[0];
    var dx = touch.clientX - _dragState.startX;
    var dy = touch.clientY - _dragState.startY;
    var popup = _popupWindows[_dragState.key];
    if (popup) {
      popup.win.style.left = (_dragState.winX + dx) + 'px';
      popup.win.style.top = (_dragState.winY + dy) + 'px';
    }
  }

  function _onTouchEnd() {
    _dragState = null;
    document.removeEventListener('touchmove', _onTouchMove);
    document.removeEventListener('touchend', _onTouchEnd);
  }
})();


// ══════════════════════════════════════════════════════════
//  Textarea 自动高度调整
// ══════════════════════════════════════════════════════════

/**
 * 为 textarea 添加自动高度调整
 */
function autoResizeTextarea(textarea) {
  if (!textarea) return;

  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

/**
 * 绑定 textarea 自动高度
 */
function bindAutoResizeTextareas() {
  var textareas = document.querySelectorAll('.remark-ta, .zdjl-ta, .zero-ta, .opp-decision-ta');

  textareas.forEach(function(ta) {
    // 输入时调整高度
    ta.addEventListener('input', function() {
      autoResizeTextarea(this);
    });

    // 初始化时调整高度（如果有预填值）
    if (ta.value) {
      autoResizeTextarea(ta);
    }
  });
}

// 在行动面板渲染后调用
document.addEventListener('DOMContentLoaded', function() {
  // 使用 MutationObserver 监听行动面板的 DOM 变化
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length) {
        bindAutoResizeTextareas();
      }
    });
  });

  var actRoot = document.getElementById('act10-root');
  if (actRoot) {
    observer.observe(actRoot, { childList: true, subtree: true });
  }

  // 监听视口变化（键盘弹出/收起）
  if (window.visualViewport) {
    var lastViewportHeight = window.visualViewport.height;

    window.visualViewport.addEventListener('resize', function() {
      var currentHeight = window.visualViewport.height;
      var isMobile = window.innerWidth <= 768;

      if (isMobile) {
        var barracksPanel = document.querySelector('.barracks-panel');
        if (barracksPanel) {
          // 键盘弹出时（视口高度变小）
          if (currentHeight < lastViewportHeight) {
            // 调整弹窗高度为当前可视高度
            barracksPanel.style.height = currentHeight + 'px';

            // 滚动到底部，确保输入框可见
            setTimeout(function() {
              var barracksBody = document.querySelector('.barracks-body');
              if (barracksBody) {
                barracksBody.scrollTop = barracksBody.scrollHeight;
              }
            }, 100);
          }
          // 键盘收起时（视口高度恢复）
          else if (currentHeight > lastViewportHeight) {
            barracksPanel.style.height = '100dvh';
          }
        }
      }

      lastViewportHeight = currentHeight;
    });
  }
});

// ══════════════════════════════════════════════════════════
//  Textarea 自动高度调整结束
// ══════════════════════════════════════════════════════════

// 自定军令编号动态更新
function updateCustomOrderNumber() {
  document.querySelectorAll('.col-panel').forEach(panel => {
    const catCount = panel.querySelectorAll('.act-cat').length;
    const customNum = panel.querySelector('.act-custom-num');
    if (customNum) {
      const circleNums = ['⓪','①','②','③','④','⑤','⑥','⑦','⑧','⑨'];
      customNum.textContent = circleNums[catCount + 1] || '⑤';
    }
  });
}
// 在行动面板渲染后调用
if (document.getElementById('tab-action')) {
  const observer = new MutationObserver(() => {
    if (document.querySelector('.act-custom-num')) {
      updateCustomOrderNumber();
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById('act10-cols-grid'), { childList: true, subtree: true });
}
