/**
 * generals-organize.js — 武将整理模块 v1
 * 工单 #gen-organizer-v1-step1
 *
 * 职责：
 *  1. CRUD：读取/创建/更新/删除 Supabase generals_organize 表
 *  2. 内存缓存 + Realtime 订阅实时同步
 *  3. 对外暴露 window.SGGenOrg API 供 UI 层调用
 *
 * 数据模型：
 *  _data[slot] = [
 *    { id, group_name, group_order, generals: [{name,order}] },
 *    ...
 *  ]
 *
 * 依赖：
 *  - window.supabase（CDN 已加载）
 *  - SGRole.get()（身份判定）
 *  - sg-rounds-updated 事件（回合更新时刷新武将列表）
 */
(function () {
  'use strict';

  // ══════════════════════════════════════════
  //  Supabase 配置（与 main.js 共用同一项目）
  // ══════════════════════════════════════════
  var SUPA_URL = 'https://smiifcbmmtolimtaxpip.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  var TABLE = 'generals_organize';
  var HEADERS = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // ══════════════════════════════════════════
  //  内存缓存
  // ══════════════════════════════════════════
  var _data = { 0: [], 1: [], 2: [] };
  var _loaded = false;
  var _loading = false;

  // ══════════════════════════════════════════
  //  Realtime 订阅
  // ══════════════════════════════════════════
  var _realtimeChannel = null;
  var _realtimeReloadTimer = null;
  var _suppressReloadUntil = 0;

  function setupRealtime() {
    if (typeof window.supabase === 'undefined' ||
        typeof window.supabase.createClient !== 'function') {
      return;
    }
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
      loadAll().then(function () {
        _broadcast('sg-gen-org-updated');
      });
    }, 600);
  }

  // ══════════════════════════════════════════
  //  REST API 封装
  // ══════════════════════════════════════════
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

  // ══════════════════════════════════════════
  //  加载全部数据
  // ══════════════════════════════════════════
  function loadAll() {
    if (_loading) return Promise.resolve();
    _loading = true;
    return _fetch(_apiUrl('?select=*&order=group_order.asc,created_at.asc&limit=200'))
      .then(function (res) { return res.json(); })
      .then(function (rows) {
        _data = { 0: [], 1: [], 2: [] };
        (rows || []).forEach(function (row) {
          var s = row.slot;
          if (s === 0 || s === 1 || s === 2) {
            _data[s].push({
              id: row.id,
              group_name: row.group_name,
              group_order: row.group_order,
              generals: _parseGenerals(row.generals)
            });
          }
        });
        // 「全部武将」是纯 UI 总览 tab，数据层不存在该分组
        _loaded = true;
        _loading = false;
      })
      .catch(function (e) {
        console.error('[SGGenOrg] 加载失败:', e);
        _loading = false;
      });
  }

  function _parseGenerals(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (e) { return []; }
    }
    return [];
  }

  // ══════════════════════════════════════════
  //  创建分组
  // ══════════════════════════════════════════
  function createGroup(slot, name) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');
    name = (name || '').trim();
    if (!name) return Promise.reject('empty name');
    if (name.length > 20) return Promise.reject('name too long');

    // 检查重名
    var exists = _data[slot].some(function (g) { return g.group_name === name; });
    if (exists) return Promise.reject('duplicate');

    // 新分组排在末尾
    var maxOrder = 0;
    _data[slot].forEach(function (g) {
      if (g.group_order > maxOrder) maxOrder = g.group_order;
    });

    return _createGroup(slot, name, maxOrder + 1).then(function () {
      _broadcast('sg-gen-org-updated');
    });
  }

  function _createGroup(slot, name, order) {
    var payload = {
      slot: slot,
      group_name: name,
      group_order: order,
      generals: []
    };
    return _fetch(_apiUrl(), {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(function (res) { return res.json(); })
    .then(function (rows) {
      if (rows && rows.length) {
        var row = rows[0];
        _data[slot].push({
          id: row.id,
          group_name: row.group_name,
          group_order: row.group_order,
          generals: _parseGenerals(row.generals)
        });
      }
    });
  }

  // ══════════════════════════════════════════
  //  重命名分组
  // ══════════════════════════════════════════
  function renameGroup(slot, oldName, newName) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');
    newName = (newName || '').trim();
    if (!newName) return Promise.reject('empty name');
    if (newName.length > 20) return Promise.reject('name too long');
    if (oldName === newName) return Promise.resolve();

    var dup = _data[slot].some(function (g) { return g.group_name === newName; });
    if (dup) return Promise.reject('duplicate');

    var group = _findGroup(slot, oldName);
    if (!group) return Promise.reject('not found');

    return _fetch(_apiUrl('?id=eq.' + group.id), {
      method: 'PATCH',
      body: JSON.stringify({ group_name: newName })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      group.group_name = newName;
      _broadcast('sg-gen-org-updated');
    });
  }

  // ══════════════════════════════════════════
  //  删除分组（武将移回「未分组」）
  // ══════════════════════════════════════════
  function deleteGroup(slot, name) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');

    var group = _findGroup(slot, name);
    if (!group) return Promise.reject('not found');

    // 删除该分组（组内武将变为无分组，「全部武将」总览 tab 仍可见）
    return _fetch(_apiUrl('?id=eq.' + group.id), { method: 'DELETE' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _data[slot] = _data[slot].filter(function (g) { return g.id !== group.id; });
        _broadcast('sg-gen-org-updated');
      });
  }

  // ══════════════════════════════════════════
  //  移动武将到指定分组
  // ══════════════════════════════════════════
  function moveGeneral(slot, generalName, fromGroup, toGroup) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');
    if (fromGroup === toGroup) return Promise.resolve();

    var srcGrp = _findGroup(slot, fromGroup);
    var dstGrp = _findGroup(slot, toGroup);
    if (!srcGrp || !dstGrp) return Promise.reject('group not found');

    // 从源移除
    srcGrp.generals = srcGrp.generals.filter(function (g) { return g.name !== generalName; });

    // 加到目标末尾
    var maxOrder = 0;
    dstGrp.generals.forEach(function (g) {
      if (g.order > maxOrder) maxOrder = g.order;
    });
    dstGrp.generals.push({ name: generalName, order: maxOrder + 1 });

    // 批量更新两个分组
    return Promise.all([
      _updateGroupGenerals(slot, srcGrp),
      _updateGroupGenerals(slot, dstGrp)
    ]).then(function () {
      _broadcast('sg-gen-org-updated');
    });
  }

  // ══════════════════════════════════════════
  //  将无分组武将添加到指定分组
  // ══════════════════════════════════════════
  function addToGroup(slot, generalName, targetGroupName) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');
    var dstGrp = _findGroup(slot, targetGroupName);
    if (!dstGrp) return Promise.reject('group not found');

    // 检查是否已在该分组
    var already = dstGrp.generals.some(function (g) { return g.name === generalName; });
    if (already) return Promise.resolve();

    var maxOrder = 0;
    dstGrp.generals.forEach(function (g) {
      if (g.order > maxOrder) maxOrder = g.order;
    });
    dstGrp.generals.push({ name: generalName, order: maxOrder + 1 });

    return _updateGroupGenerals(slot, dstGrp).then(function () {
      _broadcast('sg-gen-org-updated');
    });
  }

  // ══════════════════════════════════════════
  //  将武将从分组中移出（变为无分组状态）
  // ══════════════════════════════════════════
  function removeFromGroup(slot, generalName, groupName) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');
    var group = _findGroup(slot, groupName);
    if (!group) return Promise.reject('group not found');

    group.generals = group.generals.filter(function (g) { return g.name !== generalName; });

    return _updateGroupGenerals(slot, group).then(function () {
      _broadcast('sg-gen-org-updated');
    });
  }

  // ══════════════════════════════════════════
  //  调整武将在分组内的顺序（上移/下移）
  // ══════════════════════════════════════════
  function reorderGeneral(slot, groupName, generalName, direction) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');
    var group = _findGroup(slot, groupName);
    if (!group) return Promise.reject('group not found');

    var sorted = group.generals.slice().sort(function (a, b) { return a.order - b.order; });
    var idx = -1;
    sorted.forEach(function (g, i) { if (g.name === generalName) idx = i; });
    if (idx === -1) return Promise.reject('general not found');

    var swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return Promise.resolve();

    // 交换 order 值
    var tmpOrder = sorted[idx].order;
    sorted[idx].order = sorted[swapIdx].order;
    sorted[swapIdx].order = tmpOrder;

    group.generals = sorted;

    return _updateGroupGenerals(slot, group).then(function () {
      _broadcast('sg-gen-org-updated');
    });
  }

  // ══════════════════════════════════════════
  //  调整分组顺序（上移/下移）
  // ══════════════════════════════════════════
  function reorderGroup(slot, groupName, direction) {
    if (!_isValidSlot(slot)) return Promise.reject('invalid slot');

    var groups = _data[slot].slice().sort(function (a, b) { return a.group_order - b.group_order; });
    var idx = -1;
    groups.forEach(function (g, i) { if (g.group_name === groupName) idx = i; });
    if (idx === -1) return Promise.reject('not found');

    var swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= groups.length) return Promise.resolve();

    // 交换 group_order
    var tmpOrder = groups[idx].group_order;
    groups[idx].group_order = groups[swapIdx].group_order;
    groups[swapIdx].group_order = tmpOrder;

    // 如果交换后两者 order 相同（初始数据全为 0 的边界情况），强制拉开
    if (groups[idx].group_order === groups[swapIdx].group_order) {
      groups[swapIdx].group_order = groups[idx].group_order + 1;
    }

    // 抑制 Realtime reload 2 秒，防止覆盖刚写入的内存
    _suppressReloadUntil = Date.now() + 2000;

    return Promise.all([
      _fetch(_apiUrl('?id=eq.' + groups[idx].id), {
        method: 'PATCH',
        body: JSON.stringify({ group_order: groups[idx].group_order })
      }),
      _fetch(_apiUrl('?id=eq.' + groups[swapIdx].id), {
        method: 'PATCH',
        body: JSON.stringify({ group_order: groups[swapIdx].group_order })
      })
    ]).then(function () {
      // 重新排序内存数据，确保下次操作读到最新顺序
      _data[slot].sort(function (a, b) { return a.group_order - b.group_order; });
      _broadcast('sg-gen-org-updated');
    });
  }

  // ══════════════════════════════════════════
  //  同步当前回合武将列表
  //  把不在任何分组的武将塞进「未分组」,
  //  把已不在册的武将从分组中移除
  // ══════════════════════════════════════════
  function syncWithRoster(slot, currentGenerals) {
    if (!_isValidSlot(slot)) return Promise.resolve();
    if (!_loaded) return Promise.resolve();

    var currentNames = {};
    (currentGenerals || []).forEach(function (g) {
      if (g && g.name) currentNames[g.name] = true;
    });

    var assignedNames = {};
    var dirty = [];

    // 收集已分配的武将名 + 清理不在册的
    _data[slot].forEach(function (group) {
      var before = group.generals.length;
      group.generals = group.generals.filter(function (g) {
        if (currentNames[g.name]) {
          assignedNames[g.name] = true;
          return true;
        }
        return false; // 不在册，移除
      });
      if (group.generals.length !== before) {
        dirty.push(group);
      }
    });

    // 未分配的武将不归属任何分组，「全部武将」总览 tab 会聚合显示它们

    if (!dirty.length) return Promise.resolve();

    return Promise.all(dirty.map(function (g) {
      return _updateGroupGenerals(slot, g);
    })).then(function () {
      _broadcast('sg-gen-org-updated');
    });
  }

  // ══════════════════════════════════════════
  //  内部工具
  // ══════════════════════════════════════════
  function _updateGroupGenerals(slot, group) {
    return _fetch(_apiUrl('?id=eq.' + group.id), {
      method: 'PATCH',
      body: JSON.stringify({ generals: group.generals })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
    });
  }

  function _findGroup(slot, name) {
    var result = null;
    _data[slot].forEach(function (g) {
      if (g.group_name === name) result = g;
    });
    return result;
  }

  function _isValidSlot(s) {
    return s === 0 || s === 1 || s === 2;
  }

  function _broadcast(eventName) {
    try {
      window.dispatchEvent(new CustomEvent(eventName));
    } catch (e) { /* 兜底 */ }
  }

  // ══════════════════════════════════════════
  //  读取 API（供 UI 层调用）
  // ══════════════════════════════════════════
  function getGroups(slot) {
    if (!_isValidSlot(slot)) return [];
    return _data[slot].slice().sort(function (a, b) { return a.group_order - b.group_order; });
  }

  function getGroupNames(slot) {
    return getGroups(slot).map(function (g) { return g.group_name; });
  }

  function findGeneralGroup(slot, generalName) {
    var result = null; // null 表示无分组（会在「全部武将」总览中显示）
    _data[slot].forEach(function (g) {
      g.generals.forEach(function (gen) {
        if (gen.name === generalName) result = g.group_name;
      });
    });
    return result;
  }

  function isLoaded() { return _loaded; }

  // ══════════════════════════════════════════
  //  启动
  // ══════════════════════════════════════════
  function init() {
    loadAll().then(function () {
      _broadcast('sg-gen-org-updated');
      setupRealtime();
    });

    // 回合更新时，同步武将列表
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

  // ══════════════════════════════════════════
  //  对外 API
  // ══════════════════════════════════════════
  window.SGGenOrg = {
    loadAll: loadAll,
    getGroups: getGroups,
    getGroupNames: getGroupNames,
    findGeneralGroup: findGeneralGroup,
    createGroup: createGroup,
    renameGroup: renameGroup,
    deleteGroup: deleteGroup,
    moveGeneral: moveGeneral,
    addToGroup: addToGroup,
    removeFromGroup: removeFromGroup,
    reorderGeneral: reorderGeneral,
    reorderGroup: reorderGroup,
    syncWithRoster: syncWithRoster,
    isLoaded: isLoaded
  };

})();