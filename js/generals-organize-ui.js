/**
 * generals-organize-ui.js — 麾下武将 UI 模块 v1-A
 * 工单 #gen-organize-v1-restore-A1
 *
 * 职责：
 *  1. 渲染三张玩家卡内的「麾下武将」折叠区
 *  2. 分组 tab 横条 + 组内武将列表 + 操作菜单 + 下拉添加
 *  3. 新建/重命名/删除/排序分组
 *  4. 权限控制：仅本人 slot 可编辑，其他 slot 只读
 *  5. 监听 sg-gen-org-updated / sg-rounds-updated / sg-role-changed 自动刷新
 *
 * 依赖：
 *  - window.SGGenOrg（generals-organize.js）
 *  - window.SGRole.get()（role-login.js）
 *  - window.SGState（main.js）
 *  - #pc-org-body-0/1/2、#pc-org-count-0/1/2（HTML）
 *
 * 命名空间：所有 CSS class 使用 .gor-* 前缀
 */
(function () {
  'use strict';

  var SLOT_NAMES = ['甲', '乙', '丙'];
  var ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };

  var _activeTab = { 0: '未分组', 1: '未分组', 2: '未分组' };

  var _menuEl = null;
  var _menuSlot = null;
  var _menuGroup = null;
  var _menuGeneral = null;

  var _longPressTimer = null;
  var _longPressTriggered = false;

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  function renderAll() {
    if (!window.SGGenOrg || !window.SGGenOrg.isLoaded()) return;
    for (var s = 0; s < 3; s++) renderSlot(s);
  }

  function renderSlot(slot) {
    var bodyEl = document.getElementById('pc-org-body-' + slot);
    var countEl = document.getElementById('pc-org-count-' + slot);
    if (!bodyEl) return;

    var groups = window.SGGenOrg.getGroups(slot);
    var editable = _isMySlot(slot);

    if (countEl) countEl.textContent = groups.length + ' 组';

    var tabNames = groups.map(function (g) { return g.group_name; });
    if (tabNames.indexOf(_activeTab[slot]) === -1) _activeTab[slot] = '未分组';

    var html = '';

    // Tab 横条
    html += '<div class="gor-tabs" data-slot="' + slot + '">';
    groups.forEach(function (g) {
      var isActive = g.group_name === _activeTab[slot];
      html += '<button class="gor-tab' + (isActive ? ' gor-tab-active' : '') + '"'
        + ' data-slot="' + slot + '"'
        + ' data-group="' + _esc(g.group_name) + '"'
        + ' type="button">'
        + _esc(g.group_name)
        + '<span class="gor-tab-cnt">' + (g.generals ? g.generals.length : 0) + '</span>'
        + '</button>';
    });
    if (editable) {
      html += '<button class="gor-tab gor-tab-add" data-slot="' + slot + '" type="button">+</button>';
    }
    html += '</div>';

    // 当前选中分组内容
    var activeGroup = null;
    groups.forEach(function (g) {
      if (g.group_name === _activeTab[slot]) activeGroup = g;
    });

    if (activeGroup) {
      html += _renderGroupContent(slot, activeGroup, groups, editable);
    }

    bodyEl.innerHTML = html;
  }

  function _renderGroupContent(slot, group, allGroups, editable) {
    var html = '';
    var gName = group.group_name;
    var isDefault = gName === '未分组';

    // 分组操作栏
    if (editable && !isDefault) {
      html += '<div class="gor-group-bar">';
      html += '<span class="gor-group-name">' + _esc(gName) + '</span>';
      html += '<div class="gor-group-actions">';
      html += '<button class="gor-btn-icon" data-act="rename" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="重命名">改名</button>';
      html += '<button class="gor-btn-icon" data-act="group-up" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="左移">←</button>';
      html += '<button class="gor-btn-icon" data-act="group-down" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="右移">→</button>';
      html += '<button class="gor-btn-icon gor-btn-danger" data-act="delete" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="删除">删除</button>';
      html += '</div></div>';
    }

    // 武将列表
    var sorted = (group.generals || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });

    if (sorted.length) {
      html += '<div class="gor-gen-list">';
      sorted.forEach(function (g) {
        html += '<span class="gor-gen-tag gen-tag"'
          + ' data-slot="' + slot + '"'
          + ' data-group="' + _esc(gName) + '"'
          + ' data-name="' + _esc(g.name) + '"'
          + '>' + _esc(g.name) + '</span>';
      });
      html += '</div>';
    } else {
      html += '<div class="gor-empty">暂无武将</div>';
    }

    // 下拉添加
    if (editable) {
      var currentGens = _getCurrentGenerals(slot);
      var inThisGroup = {};
      (group.generals || []).forEach(function (g) { inThisGroup[g.name] = true; });
      var available = currentGens.filter(function (g) { return !inThisGroup[g.name]; });

      if (available.length) {
        html += '<div class="gor-add-wrap">';
        html += '<select class="gor-add-select" data-slot="' + slot + '" data-group="' + _esc(gName) + '">';
        html += '<option value="">+ 添加武将到此分组…</option>';
        available.forEach(function (g) {
          var fromGroup = window.SGGenOrg.findGeneralGroup(slot, g.name);
          var suffix = fromGroup !== gName ? '（' + fromGroup + '）' : '';
          html += '<option value="' + _esc(g.name) + '">' + _esc(g.name) + suffix + '</option>';
        });
        html += '</select></div>';
      }
    }

    return html;
  }

  function _getCurrentGenerals(slot) {
    var st = window.SGState;
    if (!st || !st.rounds || !st.rounds.length) return [];
    var latest = st.rounds[st.rounds.length - 1];
    var players = (latest.parsed && latest.parsed.players) || [];
    if (!players[slot]) return [];
    return (players[slot].generals || []).map(function (g) {
      return { name: g.name || '' };
    }).filter(function (g) { return g.name; });
  }

  // 长按菜单
  function _showMenu(slot, groupName, generalName, x, y) {
    _hideMenu();
    if (!_isMySlot(slot)) return;

    _menuSlot = slot;
    _menuGroup = groupName;
    _menuGeneral = generalName;

    var groups = window.SGGenOrg.getGroups(slot);
    var currentGroup = null;
    groups.forEach(function (g) { if (g.group_name === groupName) currentGroup = g; });
    var sorted = [];
    if (currentGroup && currentGroup.generals) {
      sorted = currentGroup.generals.slice().sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
    }
    var idx = -1;
    sorted.forEach(function (g, i) { if (g.name === generalName) idx = i; });

    var menu = document.createElement('div');
    menu.className = 'gor-menu';
    var items = [];

    if (idx > 0) items.push({ label: '↑ 上移', act: 'move-up' });
    if (idx >= 0 && idx < sorted.length - 1) items.push({ label: '↓ 下移', act: 'move-down' });

    groups.forEach(function (g) {
      if (g.group_name === groupName) return;
      items.push({ label: '移到「' + g.group_name + '」', act: 'move-to', target: g.group_name });
    });

    if (groupName !== '未分组') {
      var hasDefault = items.some(function (it) { return it.target === '未分组'; });
      if (!hasDefault) items.push({ label: '移出到「未分组」', act: 'move-to', target: '未分组' });
    }

    items.forEach(function (it) {
      var btn = document.createElement('button');
      btn.className = 'gor-menu-item';
      btn.textContent = it.label;
      btn.setAttribute('data-act', it.act);
      if (it.target) btn.setAttribute('data-target', it.target);
      menu.appendChild(btn);
    });

    var W = window.innerWidth, H = window.innerHeight;
    menu.style.position = 'fixed';
    menu.style.left = Math.min(x, W - 200) + 'px';
    menu.style.top = Math.min(y, H - (items.length * 36 + 16)) + 'px';
    menu.style.zIndex = '9800';

    document.body.appendChild(menu);
    _menuEl = menu;

    menu.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.gor-menu-item');
      if (!btn) return;
      _handleMenuAction(btn.getAttribute('data-act'), btn.getAttribute('data-target'));
    });

    setTimeout(function () {
      document.addEventListener('click', _onDocClickCloseMenu, true);
      document.addEventListener('touchstart', _onDocClickCloseMenu, true);
    }, 10);
  }

  function _hideMenu() {
    if (_menuEl && _menuEl.parentNode) _menuEl.parentNode.removeChild(_menuEl);
    _menuEl = null;
    document.removeEventListener('click', _onDocClickCloseMenu, true);
    document.removeEventListener('touchstart', _onDocClickCloseMenu, true);
  }

  function _onDocClickCloseMenu(ev) {
    if (_menuEl && !_menuEl.contains(ev.target)) _hideMenu();
  }

  function _handleMenuAction(act, target) {
    var slot = _menuSlot, group = _menuGroup, gen = _menuGeneral;
    _hideMenu();
    if (!window.SGGenOrg) return;

    if (act === 'move-up') {
      window.SGGenOrg.reorderGeneral(slot, group, gen, 'up').then(function () { renderSlot(slot); });
    } else if (act === 'move-down') {
      window.SGGenOrg.reorderGeneral(slot, group, gen, 'down').then(function () { renderSlot(slot); });
    } else if (act === 'move-to' && target) {
      window.SGGenOrg.moveGeneral(slot, gen, group, target).then(function () { renderSlot(slot); });
    }
  }

  // 事件委托
  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var tab = ev.target.closest('.gor-tab:not(.gor-tab-add)');
      if (tab) {
        var slot = parseInt(tab.getAttribute('data-slot'), 10);
        var group = tab.getAttribute('data-group');
        if (group != null && !isNaN(slot)) {
          _activeTab[slot] = group;
          renderSlot(slot);
        }
        return;
      }

      var addBtn = ev.target.closest('.gor-tab-add');
      if (addBtn) {
        var s = parseInt(addBtn.getAttribute('data-slot'), 10);
        if (!isNaN(s)) _onCreateGroup(s);
        return;
      }

      var actBtn = ev.target.closest('.gor-btn-icon');
      if (actBtn) {
        var act = actBtn.getAttribute('data-act');
        var sl = parseInt(actBtn.getAttribute('data-slot'), 10);
        var gn = actBtn.getAttribute('data-group');
        if (act && !isNaN(sl) && gn) _onGroupAction(act, sl, gn);
        return;
      }
    });

    document.addEventListener('change', function (ev) {
      var sel = ev.target.closest('.gor-add-select');
      if (!sel) return;
      var slot = parseInt(sel.getAttribute('data-slot'), 10);
      var group = sel.getAttribute('data-group');
      var name = sel.value;
      if (!name || isNaN(slot) || !group) return;

      var fromGroup = window.SGGenOrg.findGeneralGroup(slot, name);
      window.SGGenOrg.moveGeneral(slot, name, fromGroup, group).then(function () {
        renderSlot(slot);
      }).catch(function (e) { _toast('添加失败：' + e); });
    });

    // 右键菜单
    document.addEventListener('contextmenu', function (ev) {
      var tag = ev.target.closest('.gor-gen-tag');
      if (!tag) return;
      var slot = parseInt(tag.getAttribute('data-slot'), 10);
      if (isNaN(slot) || !_isMySlot(slot)) return;
      ev.preventDefault();
      _showMenu(slot, tag.getAttribute('data-group'), tag.getAttribute('data-name'), ev.clientX, ev.clientY);
    });

    // 移动端长按
    document.addEventListener('touchstart', function (ev) {
      var tag = ev.target.closest('.gor-gen-tag');
      if (!tag) return;
      var slot = parseInt(tag.getAttribute('data-slot'), 10);
      if (isNaN(slot) || !_isMySlot(slot)) return;

      _longPressTriggered = false;
      var touch = ev.touches[0];
      _longPressTimer = setTimeout(function () {
        _longPressTriggered = true;
        _showMenu(slot, tag.getAttribute('data-group'), tag.getAttribute('data-name'), touch.clientX, touch.clientY);
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
        var tag = ev.target.closest('.gor-gen-tag');
        if (tag) { ev.preventDefault(); ev.stopPropagation(); _longPressTriggered = false; }
      }
    }, true);
  }

  function _onCreateGroup(slot) {
    var name = prompt('请输入新分组名称（不超过 20 字）：');
    if (!name || !name.trim()) return;
    name = name.trim();
    if (name.length > 20) { _toast('分组名不能超过 20 字'); return; }
    window.SGGenOrg.createGroup(slot, name).then(function () {
      _activeTab[slot] = name;
      renderSlot(slot);
      _toast('已创建分组「' + name + '」');
    }).catch(function (e) {
      _toast(e === 'duplicate' ? '已存在同名分组' : '创建失败：' + e);
    });
  }

  function _onGroupAction(act, slot, groupName) {
    if (!window.SGGenOrg) return;

    if (act === 'rename') {
      var newName = prompt('重命名分组「' + groupName + '」为：', groupName);
      if (!newName || !newName.trim() || newName.trim() === groupName) return;
      newName = newName.trim();
      if (newName.length > 20) { _toast('分组名不能超过 20 字'); return; }
      window.SGGenOrg.renameGroup(slot, groupName, newName).then(function () {
        _activeTab[slot] = newName;
        renderSlot(slot);
        _toast('已重命名为「' + newName + '」');
      }).catch(function (e) {
        _toast(e === 'duplicate' ? '已存在同名分组' : '重命名失败：' + e);
      });

    } else if (act === 'delete') {
      if (!confirm('确认删除分组「' + groupName + '」？\n组内武将将移回「未分组」。')) return;
      window.SGGenOrg.deleteGroup(slot, groupName).then(function () {
        _activeTab[slot] = '未分组';
        renderSlot(slot);
        _toast('已删除分组「' + groupName + '」');
      }).catch(function (e) { _toast('删除失败：' + e); });

    } else if (act === 'group-up') {
      // 在可移动的用户分组列表（排除「未分组」）中检查边界
      var _allUp = window.SGGenOrg.getGroups(slot);
      var _userUp = _allUp.filter(function (g) { return g.group_name !== '未分组'; });
      var _idxUp = _userUp.findIndex(function (g) { return g.group_name === groupName; });
      if (_idxUp <= 0) return; // 已是第一个用户分组，无法继续左移
      // 若 SGGenOrg.reorderGroup 会与「未分组」交换，需连续调用两次
      var _fullIdx = _allUp.findIndex(function (g) { return g.group_name === groupName; });
      var _swapTarget = _allUp[_fullIdx - 1];
      if (_swapTarget && _swapTarget.group_name === '未分组') {
        // 相邻的是「未分组」，连续交换两次让它跳过去
        window.SGGenOrg.reorderGroup(slot, groupName, 'up')
          .then(function () { return window.SGGenOrg.reorderGroup(slot, groupName, 'up'); })
          .then(function () { renderSlot(slot); });
      } else {
        window.SGGenOrg.reorderGroup(slot, groupName, 'up').then(function () { renderSlot(slot); });
      }

    } else if (act === 'group-down') {
      var _allDn = window.SGGenOrg.getGroups(slot);
      var _userDn = _allDn.filter(function (g) { return g.group_name !== '未分组'; });
      var _idxDn = _userDn.findIndex(function (g) { return g.group_name === groupName; });
      if (_idxDn < 0 || _idxDn >= _userDn.length - 1) return; // 已是最后一个，无法继续右移
      window.SGGenOrg.reorderGroup(slot, groupName, 'down').then(function () { renderSlot(slot); });
    }
  }

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

  function init() {
    bindEvents();

    if (window.SGGenOrg && window.SGGenOrg.isLoaded()) {
      syncAllSlots();
      renderAll();
    }

    window.addEventListener('sg-gen-org-updated', function () { renderAll(); });
    window.addEventListener('sg-rounds-updated', function () {
      setTimeout(function () { syncAllSlots(); renderAll(); }, 100);
    });
    window.addEventListener('sg-role-changed', function () { renderAll(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
