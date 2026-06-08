/**
 * generals-organize-ui.js v2 — 武将整理 UI（融入武将列表区）
 * 工单 #gen-organizer-v2-rebuild-B
 *
 * 设计：
 *  - 直接接管 #gen-list-0/1/2 的 innerHTML
 *  - 武将按分组渲染，每组一个小标题行 + gen-tag 列表
 *  - gen-tag 保持 class="gen-tag" + data-name + data-status，
 *    generals-tooltip.js 悬浮卡自动生效
 *  - 分组管理 / 武将移动 全部走右键（桌面）/ 长按（移动端）菜单
 *  - 预设分组：首次加载自动创建「前锋」「内政」
 *  - 仅本人 slot 可编辑，其他 slot 只读展示分组
 *
 * 依赖：
 *  - window.SGGenOrg（generals-organize.js）
 *  - window.SGRole.get()（role-login.js）
 *  - window.SGState（main.js）
 *  - #gen-list-0/1/2（index.html 现有节点）
 *
 * CSS class 前缀：.gou-*（generals-organize-ui 缩写）
 */
(function () {
  'use strict';

  // ══════════════════════════════════════════
  //  常量
  // ══════════════════════════════════════════
  var ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
  var PRESET_GROUPS = ['前锋', '内政'];

  // 菜单状态
  var _menuEl = null;
  var _longPressTimer = null;
  var _longPressTriggered = false;

  // 防止 main.js renderGenList 覆盖我们的输出
  // 通过标记 + MutationObserver 实现
  var _rendering = { 0: false, 1: false, 2: false };

  // ══════════════════════════════════════════
  //  工具函数
  // ══════════════════════════════════════════
  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
  //  获取当前回合武将列表（含 status）
  // ══════════════════════════════════════════
  function _getCurrentGenerals(slot) {
    var st = window.SGState;
    if (!st || !st.rounds || !st.rounds.length) return [];
    var latest = st.rounds[st.rounds.length - 1];
    var players = (latest.parsed && latest.parsed.players) || [];
    if (!players[slot]) return [];
    return (players[slot].generals || []).filter(function (g) {
      return g && g.name;
    });
  }

  // 建立 name → status 映射表
  function _buildStatusMap(slot) {
    var map = {};
    _getCurrentGenerals(slot).forEach(function (g) {
      map[g.name] = g.status || '健康';
    });
    return map;
  }

  // ══════════════════════════════════════════
  //  预设分组（首次自动创建）
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
  //  主渲染入口
  // ══════════════════════════════════════════
  function renderAll() {
    if (!window.SGGenOrg || !window.SGGenOrg.isLoaded()) return;
    for (var s = 0; s < 3; s++) {
      renderSlot(s);
    }
  }

  function renderSlot(slot) {
    var listEl = document.getElementById('gen-list-' + slot);
    if (!listEl) return;

    var groups = window.SGGenOrg.getGroups(slot);
    var statusMap = _buildStatusMap(slot);
    var editable = _isMySlot(slot);
    var totalCount = 0;

    var html = '';

    // 按 group_order 排序渲染每个分组
    groups.forEach(function (group) {
      var sorted = (group.generals || []).slice().sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });

      // 只有武将的才渲染（「未分组」空也渲染，作为兜底）
      if (!sorted.length && group.group_name !== '未分组') return;

      totalCount += sorted.length;

      // 分组标题行
      html += '<div class="gou-group" data-slot="' + slot + '" data-group="' + _esc(group.group_name) + '">';
      html += '<div class="gou-group-hd">';
      html += '<span class="gou-group-label">' + _esc(group.group_name) + '</span>';
      html += '<span class="gou-group-cnt">' + sorted.length + '</span>';
      html += '</div>';

      // 武将 tag 列表
      if (sorted.length) {
        html += '<div class="gou-group-tags">';
        sorted.forEach(function (g) {
          var status = statusMap[g.name] || '健康';
          html += '<span class="gen-tag"'
            + ' data-name="' + _esc(g.name) + '"'
            + ' data-status="' + _esc(status) + '"'
            + ' data-gou-slot="' + slot + '"'
            + ' data-gou-group="' + _esc(group.group_name) + '"'
            + '>' + _esc(g.name) + '</span>';
        });
        html += '</div>';
      } else {
        html += '<div class="gou-group-empty">拖入武将或右键添加</div>';
      }

      html += '</div>';
    });

    // 底部：新建分组按钮（仅本人可见）
    if (editable) {
      html += '<div class="gou-add-group" data-slot="' + slot + '">+ 新建分组</div>';
    }

    // 标记正在渲染，防止 main.js 的 renderGenList 覆盖
    _rendering[slot] = true;
    listEl.innerHTML = html;
    // 用 setTimeout 让 main.js 的 renderAll 链先跑完
    setTimeout(function () { _rendering[slot] = false; }, 50);
  }

  // ══════════════════════════════════════════
  //  拦截 main.js 的 renderGenList 覆盖
  //  策略：MutationObserver 监控 gen-list 节点，
  //  若被 main.js 重写（不含 .gou-group 子节点），立即重渲染
  // ══════════════════════════════════════════
  function _setupOverrideGuard() {
    for (var s = 0; s < 3; s++) {
      (function (slot) {
        var el = document.getElementById('gen-list-' + slot);
        if (!el) return;
        var observer = new MutationObserver(function () {
          if (_rendering[slot]) return;
          // 检查是否被 main.js 覆盖（不含我们的分组节点）
          if (!el.querySelector('.gou-group') && window.SGGenOrg && window.SGGenOrg.isLoaded()) {
            renderSlot(slot);
          }
        });
        observer.observe(el, { childList: true });
      })(s);
    }
  }

  // ══════════════════════════════════════════
  //  右键 / 长按菜单
  // ══════════════════════════════════════════
  function _hideMenu() {
    if (_menuEl && _menuEl.parentNode) {
      _menuEl.parentNode.removeChild(_menuEl);
    }
    _menuEl = null;
    document.removeEventListener('click', _onDocClick, true);
    document.removeEventListener('touchstart', _onDocClick, true);
  }

  function _onDocClick(ev) {
    if (_menuEl && !_menuEl.contains(ev.target)) {
      _hideMenu();
    }
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

    // 定位
    var W = window.innerWidth;
    var H = window.innerHeight;
    menu.style.position = 'fixed';
    menu.style.zIndex = '9800';
    document.body.appendChild(menu);
    // 获取实际尺寸后调整
    var mw = menu.offsetWidth || 180;
    var mh = menu.offsetHeight || 100;
    menu.style.left = Math.min(x, W - mw - 8) + 'px';
    menu.style.top = Math.min(y, H - mh - 8) + 'px';

    _menuEl = menu;
    setTimeout(function () {
      document.addEventListener('click', _onDocClick, true);
      document.addEventListener('touchstart', _onDocClick, true);
    }, 10);
  }

  // ── 武将 tag 的菜单 ──
  function _showGenMenu(slot, groupName, genName, x, y) {
    if (!_isMySlot(slot)) return;
    var groups = window.SGGenOrg.getGroups(slot);

    // 当前组内排序信息
    var currentGroup = null;
    groups.forEach(function (g) { if (g.group_name === groupName) currentGroup = g; });
    var sorted = [];
    if (currentGroup && currentGroup.generals) {
      sorted = currentGroup.generals.slice().sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
    }
    var idx = -1;
    sorted.forEach(function (g, i) { if (g.name === genName) idx = i; });

    var items = [];

    // 上移/下移
    if (idx > 0) {
      items.push({
        label: '上移',
        fn: function () {
          window.SGGenOrg.reorderGeneral(slot, groupName, genName, 'up')
            .then(function () { renderSlot(slot); });
        }
      });
    }
    if (idx >= 0 && idx < sorted.length - 1) {
      items.push({
        label: '下移',
        fn: function () {
          window.SGGenOrg.reorderGeneral(slot, groupName, genName, 'down')
            .then(function () { renderSlot(slot); });
        }
      });
    }

    if (items.length) items.push({ divider: true });

    // 移到其他分组
    groups.forEach(function (g) {
      if (g.group_name === groupName) return;
      items.push({
        label: '移到「' + g.group_name + '」',
        fn: function () {
          window.SGGenOrg.moveGeneral(slot, genName, groupName, g.group_name)
            .then(function () { renderSlot(slot); });
        }
      });
    });

    _showMenu(items, x, y);
  }

  // ── 分组标题的菜单 ──
  function _showGroupMenu(slot, groupName, x, y) {
    if (!_isMySlot(slot)) return;
    var isDefault = groupName === '未分组';
    var items = [];

    if (!isDefault) {
      items.push({
        label: '重命名',
        fn: function () {
          var n = prompt('重命名分组「' + groupName + '」为：', groupName);
          if (!n || !n.trim() || n.trim() === groupName) return;
          n = n.trim();
          if (n.length > 20) { _toast('不能超过 20 字'); return; }
          window.SGGenOrg.renameGroup(slot, groupName, n)
            .then(function () { renderSlot(slot); })
            .catch(function (e) {
              _toast(e === 'duplicate' ? '已有同名分组' : '重命名失败');
            });
        }
      });
    }

    // 分组排序
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
      items.push({ divider: true });
      items.push({
        label: '删除分组',
        danger: true,
        fn: function () {
          if (!confirm('删除「' + groupName + '」？武将将移回未分组。')) return;
          window.SGGenOrg.deleteGroup(slot, groupName)
            .then(function () { renderSlot(slot); _toast('已删除'); })
            .catch(function () { _toast('删除失败'); });
        }
      });
    }

    if (items.length) _showMenu(items, x, y);
  }

  // ══════════════════════════════════════════
  //  事件绑定（全局委托）
  // ══════════════════════════════════════════
  function bindEvents() {
    // ── 桌面右键 ──
    document.addEventListener('contextmenu', function (ev) {
      // 武将 tag 右键
      var tag = ev.target.closest('.gen-tag[data-gou-slot]');
      if (tag) {
        var slot = parseInt(tag.getAttribute('data-gou-slot'), 10);
        if (!isNaN(slot) && _isMySlot(slot)) {
          ev.preventDefault();
          _showGenMenu(
            slot,
            tag.getAttribute('data-gou-group'),
            tag.getAttribute('data-name'),
            ev.clientX, ev.clientY
          );
        }
        return;
      }

      // 分组标题右键
      var hd = ev.target.closest('.gou-group-hd');
      if (hd) {
        var grp = hd.closest('.gou-group');
        if (grp) {
          var s = parseInt(grp.getAttribute('data-slot'), 10);
          if (!isNaN(s) && _isMySlot(s)) {
            ev.preventDefault();
            _showGroupMenu(s, grp.getAttribute('data-group'), ev.clientX, ev.clientY);
          }
        }
        return;
      }
    });

    // ── 移动端长按 ──
    var _lpTarget = null;
    var _lpX = 0, _lpY = 0;

    document.addEventListener('touchstart', function (ev) {
      var tag = ev.target.closest('.gen-tag[data-gou-slot]');
      var hd = ev.target.closest('.gou-group-hd');
      if (!tag && !hd) return;

      _longPressTriggered = false;
      var touch = ev.touches[0];
      _lpX = touch.clientX;
      _lpY = touch.clientY;
      _lpTarget = tag || hd;

      _longPressTimer = setTimeout(function () {
        _longPressTriggered = true;
        if (tag) {
          var slot = parseInt(tag.getAttribute('data-gou-slot'), 10);
          if (!isNaN(slot) && _isMySlot(slot)) {
            _showGenMenu(slot, tag.getAttribute('data-gou-group'),
              tag.getAttribute('data-name'), _lpX, _lpY);
          }
        } else if (hd) {
          var grp = hd.closest('.gou-group');
          if (grp) {
            var s = parseInt(grp.getAttribute('data-slot'), 10);
            if (!isNaN(s) && _isMySlot(s)) {
              _showGroupMenu(s, grp.getAttribute('data-group'), _lpX, _lpY);
            }
          }
        }
      }, 500);
    }, { passive: true });

    document.addEventListener('touchend', function () {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
    });
    document.addEventListener('touchmove', function () {
      if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
    });

    // 阻止长按后的 click 穿透
    document.addEventListener('click', function (ev) {
      if (_longPressTriggered) {
        var t = ev.target.closest('.gen-tag[data-gou-slot]') || ev.target.closest('.gou-group-hd');
        if (t) {
          ev.preventDefault();
          ev.stopPropagation();
          _longPressTriggered = false;
        }
      }
    }, true);

    // ── 新建分组按钮 ──
    document.addEventListener('click', function (ev) {
      var addBtn = ev.target.closest('.gou-add-group');
      if (!addBtn) return;
      var slot = parseInt(addBtn.getAttribute('data-slot'), 10);
      if (isNaN(slot) || !_isMySlot(slot)) return;

      var name = prompt('新建分组名称（不超过 20 字）：');
      if (!name || !name.trim()) return;
      name = name.trim();
      if (name.length > 20) { _toast('不能超过 20 字'); return; }

      window.SGGenOrg.createGroup(slot, name)
        .then(function () { renderSlot(slot); _toast('已创建「' + name + '」'); })
        .catch(function (e) {
          _toast(e === 'duplicate' ? '已有同名分组' : '创建失败');
        });
    });
  }

  // ══════════════════════════════════════════
  //  武将同步
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

    // 等 SGGenOrg 就绪
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

    // 监听数据层变化
    window.addEventListener('sg-gen-org-updated', function () {
      renderAll();
    });

    // 监听回合更新
    window.addEventListener('sg-rounds-updated', function () {
      setTimeout(function () {
        syncAllSlots();
        renderAll();
      }, 150);
    });

    // 监听身份切换
    window.addEventListener('sg-role-changed', function () {
      renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
