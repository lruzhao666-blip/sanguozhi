/**
 * generals-organize-ui.js v3 — 武将整理 UI（编辑模式隔离）
 * 工单 #gen-organizer-v2-fix-D
 *
 * 核心变化（v2 → v3）：
 *  - 移除武将标签上的右键/长按菜单，消除与悬浮卡的冲突
 *  - 分组标题行右侧加「编辑」文字按钮
 *  - 编辑态：武将标签浮现 × 号（移回未分组）+ 底部下拉添加
 *  - 非编辑态：武将标签完全干净，悬浮卡正常
 *  - 分组管理（重命名/删除/排序）仍走分组标题右键/长按菜单
 *
 * 依赖不变：SGGenOrg / SGRole / SGState / #gen-list-0/1/2
 * CSS class 前缀：.gou-*
 */
(function () {
  'use strict';

  var ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
  var PRESET_GROUPS = ['前锋', '内政'];

  // 每个 slot 的编辑状态：{ slot: groupName | null }
  var _editingGroup = { 0: null, 1: null, 2: null };

  // 菜单
  var _menuEl = null;

  // 长按
  var _longPressTimer = null;
  var _longPressTriggered = false;

  // 防 main.js 覆盖
  var _rendering = { 0: false, 1: false, 2: false };

  // ══════════════════════════════════════════
  //  工具
  // ══════════════════════════════════════════
  function _esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _isMySlot(slot) {
    var role = (window.SGRole && typeof window.SGRole.get === 'function')
      ? window.SGRole.get() : null;
    if (!role) return false;
    return ROLE_TO_SLOT[role] === slot;
  }

  function _toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.classList.add('hidden'); }, 320);
    }, 2800);
  }

  // ══════════════════════════════════════════
  //  数据
  // ══════════════════════════════════════════
  function _getCurrentGenerals(slot) {
    var st = window.SGState;
    if (!st || !st.rounds || !st.rounds.length) return [];
    var latest = st.rounds[st.rounds.length - 1];
    var players = (latest.parsed && latest.parsed.players) || [];
    if (!players[slot]) return [];
    return (players[slot].generals || []).filter(function (g) { return g && g.name; });
  }

  function _buildStatusMap(slot) {
    var map = {};
    _getCurrentGenerals(slot).forEach(function (g) {
      map[g.name] = g.status || '健康';
    });
    return map;
  }

  // ══════════════════════════════════════════
  //  预设分组
  // ══════════════════════════════════════════
  function _ensurePresetGroups() {
    if (!window.SGGenOrg || !window.SGGenOrg.isLoaded()) return;
    for (var s = 0; s < 3; s++) {
      var existing = window.SGGenOrg.getGroupNames(s);
      for (var i = 0; i < PRESET_GROUPS.length; i++) {
        if (existing.indexOf(PRESET_GROUPS[i]) === -1) {
          window.SGGenOrg.createGroup(s, PRESET_GROUPS[i]);
        }
      }
    }
  }

  // ══════════════════════════════════════════
  //  渲染
  // ══════════════════════════════════════════
  function renderAll() {
    if (!window.SGGenOrg || !window.SGGenOrg.isLoaded()) return;
    for (var s = 0; s < 3; s++) renderSlot(s);
  }

  function renderSlot(slot) {
    var listEl = document.getElementById('gen-list-' + slot);
    if (!listEl) return;

    var groups = window.SGGenOrg.getGroups(slot);
    var statusMap = _buildStatusMap(slot);
    var editable = _isMySlot(slot);
    var editingGroupName = _editingGroup[slot];

    var html = '';

    groups.forEach(function (group) {
      var gName = group.group_name;
      var isDefault = gName === '未分组';
      var isEditing = editable && editingGroupName === gName;
      var sorted = (group.generals || []).slice().sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });

      // 空分组（非未分组、非编辑态）跳过
      if (!sorted.length && !isDefault && !isEditing) return;

      html += '<div class="gou-group' + (isEditing ? ' gou-editing' : '') + '"'
        + ' data-slot="' + slot + '"'
        + ' data-group="' + _esc(gName) + '">';

      // ── 分组标题行 ──
      html += '<div class="gou-group-hd">';
      html += '<span class="gou-group-label">' + _esc(gName) + '</span>';
      html += '<span class="gou-group-cnt">' + sorted.length + '</span>';

      // 编辑/完成 按钮（仅本人 slot）
      if (editable) {
        if (isEditing) {
          html += '<span class="gou-edit-btn gou-edit-done" data-slot="' + slot + '" data-group="' + _esc(gName) + '">完成</span>';
        } else {
          html += '<span class="gou-edit-btn" data-slot="' + slot + '" data-group="' + _esc(gName) + '">编辑</span>';
        }
      }
      html += '</div>';

      // ── 武将标签列表 ──
      if (sorted.length) {
        html += '<div class="gou-group-tags">';
        sorted.forEach(function (g) {
          var status = statusMap[g.name] || '健康';

          if (isEditing) {
            // 编辑态：标签 + × 按钮（包裹在容器里）
            html += '<span class="gou-tag-wrap">'
              + '<span class="gen-tag" data-name="' + _esc(g.name) + '" data-status="' + _esc(status) + '">'
              + _esc(g.name)
              + '</span>'
              + '<span class="gou-remove-btn" data-slot="' + slot + '" data-group="' + _esc(gName) + '" data-name="' + _esc(g.name) + '"></span>'
              + '</span>';
          } else {
            // 浏览态：纯 gen-tag，悬浮卡正常
            html += '<span class="gen-tag" data-name="' + _esc(g.name) + '" data-status="' + _esc(status) + '"'
              + ' data-gou-slot="' + slot + '"'
              + ' data-gou-group="' + _esc(gName) + '"'
              + '>' + _esc(g.name) + '</span>';
          }
        });
        html += '</div>';
      } else {
        if (isEditing) {
          html += '<div class="gou-group-empty">从下方选择武将添加</div>';
        } else if (isDefault) {
          html += '<div class="gou-group-empty">全部武将已分组</div>';
        }
      }

      // ── 编辑态：底部下拉添加 ──
      if (isEditing) {
        var allGens = _getCurrentGenerals(slot);
        var inThisGroup = {};
        sorted.forEach(function (g) { inThisGroup[g.name] = true; });
        var available = allGens.filter(function (g) { return !inThisGroup[g.name]; });

        if (available.length) {
          html += '<div class="gou-add-wrap">';
          html += '<select class="gou-add-select" data-slot="' + slot + '" data-group="' + _esc(gName) + '">';
          html += '<option value="">+ 添加武将…</option>';
          available.forEach(function (g) {
            var from = window.SGGenOrg.findGeneralGroup(slot, g.name);
            var suffix = from !== gName ? ' (' + from + ')' : '';
            html += '<option value="' + _esc(g.name) + '">' + _esc(g.name) + suffix + '</option>';
          });
          html += '</select>';
          html += '</div>';
        }
      }

      html += '</div>';
    });

    // ── 新建分组 ──
    if (editable) {
      html += '<div class="gou-add-group" data-slot="' + slot + '">+ 新建分组</div>';
    }

    _rendering[slot] = true;
    listEl.innerHTML = html;
    setTimeout(function () { _rendering[slot] = false; }, 50);
  }

  // ══════════════════════════════════════════
  //  MutationObserver 防覆盖
  // ══════════════════════════════════════════
  function _setupOverrideGuard() {
    for (var s = 0; s < 3; s++) {
      (function (slot) {
        var el = document.getElementById('gen-list-' + slot);
        if (!el) return;
        var observer = new MutationObserver(function () {
          if (_rendering[slot]) return;
          if (!el.querySelector('.gou-group') && window.SGGenOrg && window.SGGenOrg.isLoaded()) {
            renderSlot(slot);
          }
        });
        observer.observe(el, { childList: true });
      })(s);
    }
  }

  // ══════════════════════════════════════════
  //  分组标题右键/长按菜单（仅管理分组本身）
  // ══════════════════════════════════════════
  function _hideMenu() {
    if (_menuEl && _menuEl.parentNode) _menuEl.parentNode.removeChild(_menuEl);
    _menuEl = null;
    document.removeEventListener('click', _onDocClick, true);
    document.removeEventListener('touchstart', _onDocClick, true);
  }

  function _onDocClick(ev) {
    if (_menuEl && !_menuEl.contains(ev.target)) _hideMenu();
  }

  function _showMenu(items, x, y) {
    _hideMenu();
    if (!items.length) return;

    var menu = document.createElement('div');
    menu.className = 'gou-menu';

    items.forEach(function (it) {
      if (it.divider) {
        var d = document.createElement('div');
        d.className = 'gou-menu-divider';
        menu.appendChild(d);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'gou-menu-item' + (it.danger ? ' gou-menu-danger' : '');
      btn.textContent = it.label;
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        _hideMenu();
        if (typeof it.fn === 'function') it.fn();
      });
      menu.appendChild(btn);
    });

    menu.style.position = 'fixed';
    menu.style.zIndex = '9800';
    document.body.appendChild(menu);
    var W = window.innerWidth, H = window.innerHeight;
    var mw = menu.offsetWidth || 160, mh = menu.offsetHeight || 80;
    menu.style.left = Math.min(x, W - mw - 8) + 'px';
    menu.style.top = Math.min(y, H - mh - 8) + 'px';
    _menuEl = menu;

    setTimeout(function () {
      document.addEventListener('click', _onDocClick, true);
      document.addEventListener('touchstart', _onDocClick, true);
    }, 10);
  }

  function _showGroupMenu(slot, groupName, x, y) {
    if (!_isMySlot(slot)) return;
    var isDefault = groupName === '未分组';
    var items = [];

    if (!isDefault) {
      items.push({
        label: '重命名',
        fn: function () {
          var n = prompt('重命名「' + groupName + '」为：', groupName);
          if (!n || !n.trim() || n.trim() === groupName) return;
          n = n.trim();
          if (n.length > 20) { _toast('不能超过 20 字'); return; }
          window.SGGenOrg.renameGroup(slot, groupName, n)
            .then(function () {
              if (_editingGroup[slot] === groupName) _editingGroup[slot] = n;
              renderSlot(slot);
            })
            .catch(function (e) { _toast(e === 'duplicate' ? '已有同名' : '失败'); });
        }
      });
    }

    var groups = window.SGGenOrg.getGroups(slot);
    var gIdx = -1;
    groups.forEach(function (g, i) { if (g.group_name === groupName) gIdx = i; });

    if (gIdx > 0) {
      items.push({
        label: '上移分组',
        fn: function () {
          window.SGGenOrg.reorderGroup(slot, groupName, 'up')
            .then(function () { renderSlot(slot); });
        }
      });
    }
    if (gIdx >= 0 && gIdx < groups.length - 1) {
      items.push({
        label: '下移分组',
        fn: function () {
          window.SGGenOrg.reorderGroup(slot, groupName, 'down')
            .then(function () { renderSlot(slot); });
        }
      });
    }

    if (!isDefault) {
      if (items.length) items.push({ divider: true });
      items.push({
        label: '删除分组',
        danger: true,
        fn: function () {
          if (!confirm('删除「' + groupName + '」？武将移回未分组。')) return;
          window.SGGenOrg.deleteGroup(slot, groupName)
            .then(function () {
              if (_editingGroup[slot] === groupName) _editingGroup[slot] = null;
              renderSlot(slot);
            })
            .catch(function () { _toast('删除失败'); });
        }
      });
    }

    if (items.length) _showMenu(items, x, y);
  }

  // ══════════════════════════════════════════
  //  事件绑定
  // ══════════════════════════════════════════
  function bindEvents() {

    // ── 编辑/完成 按钮 ──
    document.addEventListener('click', function (ev) {
      var editBtn = ev.target.closest('.gou-edit-btn');
      if (editBtn) {
        var slot = parseInt(editBtn.getAttribute('data-slot'), 10);
        var group = editBtn.getAttribute('data-group');
        if (isNaN(slot)) return;

        if (editBtn.classList.contains('gou-edit-done')) {
          // 完成
          _editingGroup[slot] = null;
        } else {
          // 进入编辑
          _editingGroup[slot] = group;
        }
        renderSlot(slot);
        return;
      }

      // ── × 移出按钮 ──
      var removeBtn = ev.target.closest('.gou-remove-btn');
      if (removeBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        var rSlot = parseInt(removeBtn.getAttribute('data-slot'), 10);
        var rGroup = removeBtn.getAttribute('data-group');
        var rName = removeBtn.getAttribute('data-name');
        if (isNaN(rSlot) || !rGroup || !rName) return;

        window.SGGenOrg.moveGeneral(rSlot, rName, rGroup, '未分组')
          .then(function () { renderSlot(rSlot); });
        return;
      }

      // ── 新建分组 ──
      var addBtn = ev.target.closest('.gou-add-group');
      if (addBtn) {
        var aSlot = parseInt(addBtn.getAttribute('data-slot'), 10);
        if (isNaN(aSlot) || !_isMySlot(aSlot)) return;

        var name = prompt('新建分组名称（不超过 20 字）：');
        if (!name || !name.trim()) return;
        name = name.trim();
        if (name.length > 20) { _toast('不能超过 20 字'); return; }

        window.SGGenOrg.createGroup(aSlot, name)
          .then(function () { renderSlot(aSlot); _toast('已创建「' + name + '」'); })
          .catch(function (e) { _toast(e === 'duplicate' ? '已有同名' : '创建失败'); });
        return;
      }
    });

    // ── 下拉添加武将 ──
    document.addEventListener('change', function (ev) {
      var sel = ev.target.closest('.gou-add-select');
      if (!sel) return;
      var slot = parseInt(sel.getAttribute('data-slot'), 10);
      var group = sel.getAttribute('data-group');
      var name = sel.value;
      if (!name || isNaN(slot) || !group) return;

      var fromGroup = window.SGGenOrg.findGeneralGroup(slot, name);
      window.SGGenOrg.moveGeneral(slot, name, fromGroup, group)
        .then(function () { renderSlot(slot); })
        .catch(function (e) { _toast('添加失败'); });
    });

    // ── 分组标题：桌面右键 ──
    document.addEventListener('contextmenu', function (ev) {
      var hd = ev.target.closest('.gou-group-hd');
      if (!hd) return;
      var grp = hd.closest('.gou-group');
      if (!grp) return;
      var s = parseInt(grp.getAttribute('data-slot'), 10);
      if (isNaN(s) || !_isMySlot(s)) return;
      ev.preventDefault();
      _showGroupMenu(s, grp.getAttribute('data-group'), ev.clientX, ev.clientY);
    });

    // ── 分组标题：移动端长按 ──
    document.addEventListener('touchstart', function (ev) {
      var hd = ev.target.closest('.gou-group-hd');
      if (!hd) return;
      var grp = hd.closest('.gou-group');
      if (!grp) return;
      var s = parseInt(grp.getAttribute('data-slot'), 10);
      if (isNaN(s) || !_isMySlot(s)) return;

      _longPressTriggered = false;
      var touch = ev.touches[0];
      var tx = touch.clientX, ty = touch.clientY;

      _longPressTimer = setTimeout(function () {
        _longPressTriggered = true;
        _showGroupMenu(s, grp.getAttribute('data-group'), tx, ty);
      }, 500);
    }, { passive: true });

    document.addEventListener('touchend', function () {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
    });
    document.addEventListener('touchmove', function () {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
    });

    document.addEventListener('click', function (ev) {
      if (_longPressTriggered) {
        var hd = ev.target.closest('.gou-group-hd');
        if (hd) {
          ev.preventDefault();
          ev.stopPropagation();
          _longPressTriggered = false;
        }
      }
    }, true);
  }

  // ══════════════════════════════════════════
  //  同步
  // ══════════════════════════════════════════
  function syncAllSlots() {
    if (!window.SGGenOrg || !window.SGGenOrg.isLoaded()) return;
    var st = window.SGState;
    if (!st || !st.rounds || !st.rounds.length) return;
    var latest = st.rounds[st.rounds.length - 1];
    var players = (latest.parsed && latest.parsed.players) || [];
    for (var s = 0; s < 3; s++) {
      var gens = (players[s] && players[s].generals) || [];
      window.SGGenOrg.syncWithRoster(s, gens);
    }
  }

  // ══════════════════════════════════════════
  //  初始化
  // ══════════════════════════════════════════
  function init() {
    bindEvents();

    var _waitCount = 0;
    function tryStart() {
      if (window.SGGenOrg && window.SGGenOrg.isLoaded()) {
        _ensurePresetGroups();
        syncAllSlots();
        renderAll();
        _setupOverrideGuard();
      } else if (_waitCount < 30) {
        _waitCount++;
        setTimeout(tryStart, 200);
      }
    }
    tryStart();

    window.addEventListener('sg-gen-org-updated', function () { renderAll(); });
    window.addEventListener('sg-rounds-updated', function () {
      setTimeout(function () { syncAllSlots(); renderAll(); }, 150);
    });
    window.addEventListener('sg-role-changed', function () { renderAll(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
