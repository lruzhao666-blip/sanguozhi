/**
 * generals-organize-ui.js — 武将整队 UI v2
 * 工单 #gen-organize-v2-lineup
 *
 * 交互：
 *  1. 默认：武将标签按保存顺序平铺排列
 *  2. 本人 slot 显示「整队」按钮 → 点击进入整队模式
 *  3. 整队模式：标签可拖拽排序（桌面拖拽 + 移动端 touch）
 *  4. 点「完成」→ 保存到 Supabase → 退出整队模式
 *
 * 依赖：
 *  - window.SGGenOrg（generals-organize.js v2）
 *  - window.SGRole.get()（role-login.js）
 *  - window.SGState（main.js）
 *  - #pc-org-body-0/1/2、#pc-org-count-0/1/2（HTML）
 *
 * CSS class 前缀：.gor-*
 */
(function () {
  'use strict';

  var ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };

  // 整队模式状态：{ slot: true/false }
  var _editingSlot = {};

  // 拖拽状态
  var _dragEl = null;
  var _dragSlot = null;
  var _placeholder = null;

  // touch 拖拽状态
  var _touchDragEl = null;
  var _touchClone = null;
  var _touchSlot = null;
  var _touchStarted = false;
  var _touchLongTimer = null;

  function _isMySlot(slot) {
    var role = (window.SGRole && typeof window.SGRole.get === 'function')
      ? window.SGRole.get() : null;
    if (!role) return false;
    return ROLE_TO_SLOT[role] === slot;
  }

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  function _getCurrentGenerals(slot) {
    var st = window.SGState;
    if (!st || !st.rounds || !st.rounds.length) return [];
    var latest = st.rounds[st.rounds.length - 1];
    var players = (latest.parsed && latest.parsed.players) || [];
    if (!players[slot]) return [];
    return (players[slot].generals || []).map(function (g) {
      return g.name || '';
    }).filter(function (n) { return n; });
  }

  // ══════════════════════════════════════════
  //  渲染
  // ══════════════════════════════════════════
  function renderAll() {
    if (!window.SGGenOrg || !window.SGGenOrg.isLoaded()) return;
    for (var s = 0; s < 3; s++) renderSlot(s);
  }

  function renderSlot(slot) {
    var bodyEl = document.getElementById('pc-org-body-' + slot);
    var countEl = document.getElementById('pc-org-count-' + slot);
    if (!bodyEl) return;

    var editable = _isMySlot(slot);
    var editing = !!_editingSlot[slot];

    // 合并排序：已保存顺序优先，新武将追加末尾
    var savedOrder = window.SGGenOrg.getOrder(slot);
    var rosterNames = _getCurrentGenerals(slot);

    var ordered = [];
    var seen = {};
    savedOrder.forEach(function (n) {
      if (rosterNames.indexOf(n) !== -1 && !seen[n]) {
        ordered.push(n);
        seen[n] = true;
      }
    });
    rosterNames.forEach(function (n) {
      if (!seen[n]) {
        ordered.push(n);
        seen[n] = true;
      }
    });

    if (countEl) countEl.textContent = ordered.length + ' 将';

    var html = '';

    // 工具栏
    if (editable) {
      html += '<div class="gor-toolbar">';
      if (editing) {
        html += '<button class="gor-btn gor-btn-done" data-slot="' + slot + '" data-act="done" type="button">完成</button>';
      } else {
        html += '<button class="gor-btn gor-btn-edit" data-slot="' + slot + '" data-act="edit" type="button">整队</button>';
      }
      html += '</div>';
    }

    // 武将标签列表
    if (ordered.length) {
      html += '<div class="gor-list' + (editing ? ' gor-list-editing' : '') + '" data-slot="' + slot + '">';
      ordered.forEach(function (name) {
        html += '<span class="gor-tag gen-tag' + (editing ? ' gor-tag-draggable' : '') + '"'
          + ' data-name="' + _esc(name) + '"'
          + (editing ? ' draggable="true"' : '')
          + '>' + _esc(name) + '</span>';
      });
      html += '</div>';
    } else {
      html += '<div class="gor-empty">暂无武将</div>';
    }

    bodyEl.innerHTML = html;
  }

  // ══════════════════════════════════════════
  //  整队模式切换
  // ══════════════════════════════════════════
  function enterEdit(slot) {
    _editingSlot[slot] = true;
    renderSlot(slot);
  }

  function exitEdit(slot) {
    // 收集当前 DOM 顺序并保存
    var listEl = document.querySelector('.gor-list[data-slot="' + slot + '"]');
    if (listEl) {
      var names = [];
      var tags = listEl.querySelectorAll('.gor-tag');
      for (var i = 0; i < tags.length; i++) {
        var n = tags[i].getAttribute('data-name');
        if (n) names.push(n);
      }
      window.SGGenOrg.saveOrder(slot, names).then(function () {
        _toast('整队已保存');
      }).catch(function () {
        _toast('保存失败，请重试');
      });
    }
    _editingSlot[slot] = false;
    renderSlot(slot);
  }

  // ══════════════════════════════════════════
  //  桌面拖拽（HTML5 Drag and Drop）
  // ══════════════════════════════════════════
  function onDragStart(e) {
    var tag = e.target.closest('.gor-tag-draggable');
    if (!tag) return;
    _dragEl = tag;
    _dragSlot = tag.closest('.gor-list').getAttribute('data-slot');
    tag.classList.add('gor-tag-ghost');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tag.getAttribute('data-name'));

    // 创建占位符
    _placeholder = document.createElement('span');
    _placeholder.className = 'gor-tag-placeholder';
    _placeholder.textContent = '\u00A0';
  }

  function onDragOver(e) {
    if (!_dragEl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    var target = e.target.closest('.gor-tag-draggable');
    if (!target || target === _dragEl || target === _placeholder) return;

    var list = target.closest('.gor-list');
    if (!list) return;

    var rect = target.getBoundingClientRect();
    var midX = rect.left + rect.width / 2;
    if (e.clientX < midX) {
      list.insertBefore(_placeholder, target);
    } else {
      list.insertBefore(_placeholder, target.nextSibling);
    }
  }

  function onDragEnd(e) {
    if (!_dragEl) return;
    _dragEl.classList.remove('gor-tag-ghost');
    // 把拖拽元素放到 placeholder 位置
    if (_placeholder && _placeholder.parentNode) {
      _placeholder.parentNode.insertBefore(_dragEl, _placeholder);
      _placeholder.parentNode.removeChild(_placeholder);
    }
    _dragEl = null;
    _placeholder = null;
    _dragSlot = null;
  }

  // ══════════════════════════════════════════
  //  移动端 Touch 拖拽
  // ══════════════════════════════════════════
  function onTouchStart(e) {
    var tag = e.target.closest('.gor-tag-draggable');
    if (!tag) return;

    _touchDragEl = tag;
    _touchSlot = tag.closest('.gor-list').getAttribute('data-slot');
    _touchStarted = false;

    // 长按 300ms 触发拖拽
    _touchLongTimer = setTimeout(function () {
      _touchStarted = true;
      tag.classList.add('gor-tag-ghost');

      // 创建浮动副本
      _touchClone = tag.cloneNode(true);
      _touchClone.className = 'gor-tag gor-tag-clone';
      document.body.appendChild(_touchClone);

      var touch = e.touches[0];
      _touchClone.style.left = (touch.clientX - 30) + 'px';
      _touchClone.style.top = (touch.clientY - 16) + 'px';

      // 占位符
      _placeholder = document.createElement('span');
      _placeholder.className = 'gor-tag-placeholder';
      _placeholder.textContent = '\u00A0';
      tag.parentNode.insertBefore(_placeholder, tag);
    }, 300);
  }

  function onTouchMove(e) {
    if (!_touchStarted || !_touchDragEl) {
      if (_touchLongTimer) { clearTimeout(_touchLongTimer); _touchLongTimer = null; }
      return;
    }
    e.preventDefault();

    var touch = e.touches[0];
    if (_touchClone) {
      _touchClone.style.left = (touch.clientX - 30) + 'px';
      _touchClone.style.top = (touch.clientY - 16) + 'px';
    }

    // 找到手指下方的 tag
    if (_touchClone) _touchClone.style.pointerEvents = 'none';
    var el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (_touchClone) _touchClone.style.pointerEvents = '';

    var target = el ? el.closest('.gor-tag-draggable') : null;
    if (!target || target === _touchDragEl || target === _placeholder) return;

    var list = target.closest('.gor-list');
    if (!list) return;

    var rect = target.getBoundingClientRect();
    var midX = rect.left + rect.width / 2;
    if (touch.clientX < midX) {
      list.insertBefore(_placeholder, target);
    } else {
      list.insertBefore(_placeholder, target.nextSibling);
    }
  }

  function onTouchEnd(e) {
    if (_touchLongTimer) { clearTimeout(_touchLongTimer); _touchLongTimer = null; }

    if (_touchStarted && _touchDragEl) {
      _touchDragEl.classList.remove('gor-tag-ghost');
      if (_placeholder && _placeholder.parentNode) {
        _placeholder.parentNode.insertBefore(_touchDragEl, _placeholder);
        _placeholder.parentNode.removeChild(_placeholder);
      }
      if (_touchClone && _touchClone.parentNode) {
        _touchClone.parentNode.removeChild(_touchClone);
      }
    }

    _touchDragEl = null;
    _touchClone = null;
    _touchSlot = null;
    _touchStarted = false;
    _placeholder = null;
  }

  // ══════════════════════════════════════════
  //  事件委托
  // ══════════════════════════════════════════
  function bindEvents() {
    // 按钮点击
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.gor-btn');
      if (!btn) return;
      var slot = parseInt(btn.getAttribute('data-slot'), 10);
      var act = btn.getAttribute('data-act');
      if (isNaN(slot)) return;

      if (act === 'edit') enterEdit(slot);
      else if (act === 'done') exitEdit(slot);
    });

    // 桌面拖拽
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', onDragEnd);

    // 移动端触摸拖拽
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
  }

  function init() {
    bindEvents();
    if (window.SGGenOrg && window.SGGenOrg.isLoaded()) renderAll();

    window.addEventListener('sg-gen-org-updated', function () { renderAll(); });
    window.addEventListener('sg-rounds-updated', function () {
      setTimeout(function () { renderAll(); }, 100);
    });
    window.addEventListener('sg-role-changed', function () { renderAll(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
