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

  var _activeTab = { 0: '全部武将', 1: '全部武将', 2: '全部武将' };

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

    // 「全部武将」是固定总览 tab，始终排在首位
    var tabNames = ['全部武将'].concat(groups.map(function (g) { return g.group_name; }));
    if (tabNames.indexOf(_activeTab[slot]) === -1) _activeTab[slot] = '全部武将';

    // 所有武将聚合（用于总览 tab）
    var allGenerals = [];
    var seenNames = {};
    groups.forEach(function (g) {
      (g.generals || []).forEach(function (gen) {
        if (!seenNames[gen.name]) {
          seenNames[gen.name] = true;
          allGenerals.push({ name: gen.name, order: gen.order, groupName: g.group_name });
        }
      });
    });
    // 加入无分组武将（在当前回合名册中但不在任何分组的）
    var currentGensAll = _getCurrentGenerals(slot);
    currentGensAll.forEach(function (gen, i) {
      if (!seenNames[gen.name]) {
        seenNames[gen.name] = true;
        allGenerals.push({ name: gen.name, order: 9000 + i, groupName: null });
      }
    });

    var html = '';

    // Tab 横条
    html += '<div class="gor-tabs" data-slot="' + slot + '">';
    // 固定总览 tab
    var isOverviewActive = _activeTab[slot] === '全部武将';
    html += '<button class="gor-tab gor-tab-overview' + (isOverviewActive ? ' gor-tab-active' : '') + '"'
      + ' data-slot="' + slot + '"'
      + ' data-group="全部武将"'
      + ' type="button">全部武将'
      + '<span class="gor-tab-cnt">' + allGenerals.length + '</span>'
      + '</button>';
    // 用户自定义分组
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
    if (_activeTab[slot] === '全部武将') {
      html += _renderOverviewContent(slot, allGenerals, groups, editable);
    } else {
      var activeGroup = null;
      groups.forEach(function (g) {
        if (g.group_name === _activeTab[slot]) activeGroup = g;
      });
      if (activeGroup) {
        html += _renderGroupContent(slot, activeGroup, groups, editable);
      }
    }

    bodyEl.innerHTML = html;
  }

  // 「全部武将」总览 tab 内容：聚合所有分组武将，只读展示
  function _renderOverviewContent(slot, allGenerals, allGroups, editable) {
    var html = '';
    var sorted = allGenerals.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    if (sorted.length) {
      html += '<div class="gor-gen-list">';
      sorted.forEach(function (gen) {
        html += '<span class="gor-gen-tag gen-tag"'
          + ' data-slot="' + slot + '"'
          + ' data-group="' + _esc(gen.groupName || '') + '"'
          + ' data-name="' + _esc(gen.name) + '"'
          + ' title="' + (gen.groupName ? '分组：' + _esc(gen.groupName) : '无分组') + '"'
          + '>' + _esc(gen.name) + '</span>';
      });
      html += '</div>';
    } else {
      html += '<div class="gor-empty">暂无武将</div>';
    }

    // 总览 tab 不提供添加控件（各分组内操作）
    return html;
  }

  function _renderGroupContent(slot, group, allGroups, editable) {
    var html = '';
    var gName = group.group_name;

    // 分组操作栏
    if (editable) {
      html += '<div class="gor-group-bar">';
      html += '<span class="gor-group-name">' + _esc(gName) + '</span>';
      html += '<div class="gor-group-actions">';
      html += '<button class="gor-pill-btn" data-act="rename" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="重命名"><span class="gor-pill-ico">✎</span><span class="gor-pill-txt">改名</span></button>';
      html += '<button class="gor-pill-btn" data-act="group-up" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="左移"><span class="gor-pill-ico">‹</span><span class="gor-pill-txt">左移</span></button>';
      html += '<button class="gor-pill-btn" data-act="group-down" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="右移"><span class="gor-pill-ico">›</span><span class="gor-pill-txt">右移</span></button>';
      html += '<button class="gor-pill-btn gor-pill-danger" data-act="delete" data-slot="' + slot + '" data-group="' + _esc(gName) + '" title="删除"><span class="gor-pill-ico">✕</span><span class="gor-pill-txt">删除</span></button>';
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
          var suffix = fromGroup ? '（' + fromGroup + '）' : '（无分组）';
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

    // 如果武将属于某分组，提供「取消分组」选项
    if (groupName) {
      items.push({ label: '取消分组（移到无分组）', act: 'remove-from-group' });
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
    } else if (act === 'remove-from-group' && group) {
      // 武将移出分组：从所属分组的 generals 数组中删除，变为无分组状态
      window.SGGenOrg.removeFromGroup(slot, gen, group).then(function () { renderSlot(slot); });
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

      var actBtn = ev.target.closest('.gor-pill-btn');
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
      if (fromGroup) {
        // 武将当前在某分组，移动到目标分组
        window.SGGenOrg.moveGeneral(slot, name, fromGroup, group).then(function () {
          renderSlot(slot);
        }).catch(function (e) { _toast('添加失败：' + e); });
      } else {
        // 武将当前无分组，直接添加到目标分组
        window.SGGenOrg.addToGroup(slot, name, group).then(function () {
          renderSlot(slot);
        }).catch(function (e) { _toast('添加失败：' + e); });
      }
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
      if (!confirm('确认删除分组「' + groupName + '」？\n组内武将将变为无分组状态。')) return;
      window.SGGenOrg.deleteGroup(slot, groupName).then(function () {
        _activeTab[slot] = '全部武将';
        renderSlot(slot);
        _toast('已删除分组「' + groupName + '」');
      }).catch(function (e) { _toast('删除失败：' + e); });

    } else if (act === 'group-up') {
      var _allUp = window.SGGenOrg.getGroups(slot);
      var _idxUp = _allUp.findIndex(function (g) { return g.group_name === groupName; });
      if (_idxUp <= 0) return; // 已是第一个分组
      window.SGGenOrg.reorderGroup(slot, groupName, 'up').then(function () { renderSlot(slot); });

    } else if (act === 'group-down') {
      var _allDn = window.SGGenOrg.getGroups(slot);
      var _idxDn = _allDn.findIndex(function (g) { return g.group_name === groupName; });
      if (_idxDn < 0 || _idxDn >= _allDn.length - 1) return; // 已是最后一个
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
