/* ============================================================
   achievement-sync.js · 自选展示成就实时同步 v1
   ------------------------------------------------------------
   职责：
   - 把"自选展示成就"从 localStorage 升级为 Supabase 实时同步
   - 三方玩家通过 SGRole 身份判定，只能改自己 slot 的展示
   - 未登录观战者只能看，不能改
   - 网络/SGRole 不可用时降级回 localStorage（不影响离线体验）

   依赖：
   - window.SGRole.get()：返回 '甲'|'乙'|'丙'|null
   - window.SGAch._list：成就静态定义表（main.js 暴露）
   - window.SGAch（API 见 main.js）

   表结构（PR1 已执行）：
   public.achievement_pins
   ├─ slot              smallint PK CHECK (0,1,2)
   ├─ achievement_code  text NOT NULL
   └─ updated_at        timestamptz DEFAULT now()
   ============================================================ */
(function () {
  'use strict';

  const BASE_URL = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/achievement_pins';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  const HEADERS = {
    'apikey':        SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
  const POLL_MS = 10000;
  const ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };

  // 远端镜像：{ [slot]: code }
  const remotePins = { 0: null, 1: null, 2: null };
  let _pollTimer = null;
  let _realtimeOk = false;
  let _supaClient = null;
  let _realtimeChannel = null;

  function fetchSync(url, opts = {}, ms = 6000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  function getMySlot() {
    if (!window.SGRole || typeof window.SGRole.get !== 'function') return -1;
    const role = window.SGRole.get();
    return (role && ROLE_TO_SLOT[role] !== undefined) ? ROLE_TO_SLOT[role] : -1;
  }

  /* ─── 拉取远端全量（3 行） ─── */
  async function pullRemote() {
    try {
      const res = await fetchSync(
        `${BASE_URL}?select=slot,achievement_code&order=slot.asc`,
        { headers: { ...HEADERS, 'Prefer': '' } }
      );
      if (!res.ok) return;
      const rows = await res.json();
      // 重置
      remotePins[0] = null;
      remotePins[1] = null;
      remotePins[2] = null;
      rows.forEach(r => {
        const s = Number(r.slot);
        if (s === 0 || s === 1 || s === 2) {
          remotePins[s] = r.achievement_code || null;
        }
      });
      // 广播：玩家卡徽章需要重渲染
      try { window.dispatchEvent(new CustomEvent('sg-ach-unlocked')); }
      catch (e) {}
    } catch (e) { /* 静默 */ }
  }

  /* ─── 写入：UPSERT ─── */
  async function pushPin(slot, code) {
    // 幂等：先删后插（沿用 secret-action.js 的写法）
    try {
      await fetchSync(
        `${BASE_URL}?slot=eq.${slot}`,
        { method: 'DELETE', headers: HEADERS }
      );
      if (code) {
        await fetchSync(BASE_URL, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ slot, achievement_code: code }),
        });
      }
      // 立即本地反映
      remotePins[slot] = code || null;
      try { window.dispatchEvent(new CustomEvent('sg-ach-unlocked')); }
      catch (e) {}
      return true;
    } catch (e) {
      console.warn('[SGAchSync] push failed:', e);
      return false;
    }
  }

  /* ─── Realtime 订阅（可选，失败则纯轮询） ─── */
  function trySetupRealtime() {
    if (typeof window.supabase === 'undefined' ||
        typeof window.supabase.createClient !== 'function') {
      return false;
    }
    try {
      _supaClient = window.supabase.createClient(
        'https://smiifcbmmtolimtaxpip.supabase.co',
        SUPA_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          realtime: { params: { eventsPerSecond: 2 } },
        }
      );
      _realtimeChannel = _supaClient
        .channel('achievement-pins-changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'achievement_pins' },
          function () { pullRemote(); })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            _realtimeOk = true;
            console.log('[SGAchSync] Realtime 就绪');
          }
        });
      return true;
    } catch (e) {
      console.warn('[SGAchSync] Realtime init failed:', e);
      return false;
    }
  }

  function startPoll() {
    if (_pollTimer) clearInterval(_pollTimer);
    const realtimeStarted = trySetupRealtime();
    const interval = realtimeStarted ? 30000 : POLL_MS;
    _pollTimer = setInterval(pullRemote, interval);
    pullRemote();
  }

  /* ─── 对外 API ─── */
  window.SGAchSync = {
    // 取某 slot 的展示成就 code（远端优先，无则 null）
    getPinned: function (slot) {
      return remotePins[slot] || null;
    },
    // 设置某 slot 的展示成就（仅本人可设；强制远端写入）
    setPinned: function (slot, code) {
      const mySlot = getMySlot();
      if (mySlot < 0) {
        console.warn('[SGAchSync] 未登录，无法设置展示成就');
        return Promise.resolve(false);
      }
      if (slot !== mySlot) {
        console.warn('[SGAchSync] 只能设置自己 slot 的展示成就');
        return Promise.resolve(false);
      }
      return pushPin(slot, code);
    },
    // 是否本人 slot（用于 UI 显隐按钮）
    isMineSlot: function (slot) {
      return getMySlot() === slot;
    },
    // 主动拉取（供调试）
    refresh: pullRemote,
  };

  /* ─── 启动 ─── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPoll);
  } else {
    startPoll();
  }

  // 身份切换 → 重新拉取（虽然数据没变，但确保 isMineSlot 判定更新）
  window.addEventListener('sg-role-changed', () => {
    pullRemote();
  });
})();