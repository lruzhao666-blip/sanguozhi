/**
 * generals-organize.js — 武将排序模块 v2
 * 工单 #gen-organize-v2-lineup
 *
 * 职责：
 *  1. 读取/保存 Supabase generals_organize 表中每个 slot 的武将排序
 *  2. 每个 slot 只读取一行（第一行），generals 字段存 [{name,order}]
 *  3. 对外暴露 window.SGGenOrg API 供 UI 层调用
 *
 * 数据模型：
 *  _data[slot] = { id: uuid|null, generals: [{name,order}] }
 *
 * 依赖：
 *  - window.SGState（main.js）
 *  - SGRole.get()（身份判定）
 *  - sg-rounds-updated 事件
 */
(function () {
  'use strict';

  var SUPA_URL = 'https://smiifcbmmtolimtaxpip.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  var TABLE = 'generals_organize';
  var HEADERS = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  var _data = {
    0: { id: null, generals: [] },
    1: { id: null, generals: [] },
    2: { id: null, generals: [] }
  };
  var _loaded = false;
  var _loading = false;

  // Realtime
  var _realtimeChannel = null;
  var _realtimeReloadTimer = null;
  var _suppressReloadUntil = 0;

  function setupRealtime() {
    if (typeof window.supabase === 'undefined' ||
        typeof window.supabase.createClient !== 'function') return;
    try {
      var client = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } }
      });
      _realtimeChannel = client
        .channel('gen-organize-changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: TABLE },
          function () { _debouncedReload(); })
        .subscribe();
    } catch (e) {
      console.warn('[SGGenOrg] Realtime 初始化失败:', e);
    }
  }

  function _debouncedReload() {
    if (_realtimeReloadTimer) clearTimeout(_realtimeReloadTimer);
    _realtimeReloadTimer = setTimeout(function () {
      _realtimeReloadTimer = null;
      if (Date.now() < _suppressReloadUntil) return;
      loadAll().then(function () { _broadcast('sg-gen-org-updated'); });
    }, 600);
  }

  function _fetch(url, opts) {
    opts = opts || {};
    opts.headers = HEADERS;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);
    opts.signal = controller.signal;
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  function _apiUrl(query) {
    return SUPA_URL + '/rest/v1/' + TABLE + (query || '');
  }

  function _parseGenerals(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (e) { return []; }
    }
    return [];
  }

  // ── 加载：每个 slot 只取第一行 ──
  function loadAll() {
    if (_loading) return Promise.resolve();
    _loading = true;
    return _fetch(_apiUrl('?select=*&order=created_at.asc&limit=200'))
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        var seen = {};
        _data = {
          0: { id: null, generals: [] },
          1: { id: null, generals: [] },
          2: { id: null, generals: [] }
        };
        (rows || []).forEach(function (row) {
          var s = row.slot;
          if ((s === 0 || s === 1 || s === 2) && !seen[s]) {
            seen[s] = true;
            _data[s] = {
              id: row.id,
              generals: _parseGenerals(row.generals)
            };
          }
        });
        _loaded = true;
        _loading = false;
      })
      .catch(function (e) {
        console.error('[SGGenOrg] 加载失败:', e);
        _loading = false;
      });
  }

  // ── 获取排序后的武将名列表 ──
  function getOrder(slot) {
    if (slot !== 0 && slot !== 1 && slot !== 2) return [];
    return _data[slot].generals
      .slice()
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .map(function (g) { return g.name; });
  }

  // ── 保存排序（传入有序的武将名数组）──
  function saveOrder(slot, orderedNames) {
    if (slot !== 0 && slot !== 1 && slot !== 2) return Promise.reject('invalid slot');

    var generals = orderedNames.map(function (name, i) {
      return { name: name, order: i };
    });

    _suppressReloadUntil = Date.now() + 2000;

    var rowId = _data[slot].id;
    if (rowId) {
      // 更新已有行
      return _fetch(_apiUrl('?id=eq.' + rowId), {
        method: 'PATCH',
        body: JSON.stringify({ generals: generals })
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _data[slot].generals = generals;
        _broadcast('sg-gen-org-updated');
      });
    } else {
      // 创建新行
      return _fetch(_apiUrl(), {
        method: 'POST',
        body: JSON.stringify({
          slot: slot,
          group_name: '_lineup',
          group_order: 0,
          generals: generals
        })
      }).then(function (res) { return res.json(); })
        .then(function (rows) {
          if (rows && rows.length) {
            _data[slot].id = rows[0].id;
            _data[slot].generals = _parseGenerals(rows[0].generals);
          }
          _broadcast('sg-gen-org-updated');
        });
    }
  }

  // ── 同步当前回合名册：移除不在册的，保留排序 ──
  function syncWithRoster(slot, currentGenerals) {
    if (slot !== 0 && slot !== 1 && slot !== 2) return Promise.resolve();
    if (!_loaded) return Promise.resolve();

    var currentNames = {};
    (currentGenerals || []).forEach(function (g) {
      if (g && g.name) currentNames[g.name] = true;
    });

    var kept = _data[slot].generals.filter(function (g) {
      return currentNames[g.name];
    });

    // 名册中有但排序里没有的，追加到末尾
    var knownNames = {};
    kept.forEach(function (g) { knownNames[g.name] = true; });
    var maxOrder = 0;
    kept.forEach(function (g) { if (g.order > maxOrder) maxOrder = g.order; });

    (currentGenerals || []).forEach(function (g) {
      if (g && g.name && !knownNames[g.name]) {
        maxOrder++;
        kept.push({ name: g.name, order: maxOrder });
      }
    });

    var changed = (kept.length !== _data[slot].generals.length) ||
      kept.some(function (g, i) {
        var old = _data[slot].generals[i];
        return !old || old.name !== g.name;
      });

    if (!changed) return Promise.resolve();

    _data[slot].generals = kept;

    if (!_data[slot].id) return Promise.resolve(); // 无行则不写
    return _fetch(_apiUrl('?id=eq.' + _data[slot].id), {
      method: 'PATCH',
      body: JSON.stringify({ generals: kept })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _broadcast('sg-gen-org-updated');
    }).catch(function () { /* 静默 */ });
  }

  function isLoaded() { return _loaded; }

  function _broadcast(eventName) {
    try { window.dispatchEvent(new CustomEvent(eventName)); } catch (e) {}
  }

  // ── 启动 ──
  function init() {
    loadAll().then(function () {
      _broadcast('sg-gen-org-updated');
      setupRealtime();
    });
    window.addEventListener('sg-rounds-updated', function () {
      if (!_loaded) return;
      var state = window.SGState;
      if (!state || !state.rounds || !state.rounds.length) return;
      var latest = state.rounds[state.rounds.length - 1];
      var players = (latest.parsed && latest.parsed.players) || [];
      [0, 1, 2].forEach(function (slot) {
        var gens = (players[slot] && players[slot].generals) || [];
        syncWithRoster(slot, gens);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SGGenOrg = {
    loadAll: loadAll,
    getOrder: getOrder,
    saveOrder: saveOrder,
    syncWithRoster: syncWithRoster,
    isLoaded: isLoaded
  };

})();
