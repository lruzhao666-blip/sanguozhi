/**
 * generals-organize-ui.js — 武将整队 UI v2.1
 * 工单 #gen-organize-v2-B1
 *
 * 改动（相对 v2）：
 *  - 「整队/完成」按钮从 body 区 .gor-toolbar 移到 <summary> 行内
 *    （紧跟在 .pcs-count 后面、.pcs-chevron 前面）
 *  - 删除 .gor-toolbar
 *  - 仅本人 slot 且已登录时注入按钮
 *
 * 依赖：
 *  - window.SGGenOrg（generals-organize.js v2）
 *  - window.SGRole.get()（role-login.js）
 *  - window.SGState（main.js）
 *  - #pc-org-body-0/1/2、#pc-org-count-0/1/2（HTML）
 *  - #pc-organize-0/1/2 > summary（HTML，按钮注入目标）
 *
 * CSS class 前缀：.gor-*
 */
(function () {
  'use strict';

  var ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
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
      var name = g.name || '';
      if (!name) return '';

      // 如果有状态字段，拼接状态后缀
      if (g.status) {
        var statusMap = {
          'tired': '疲劳',
          'injured': '受伤',
          'sick': '患病',
          'dead': '阵亡'
        };
        var statusText = statusMap[g.status];
        if (statusText) {
          return name + '(' + statusText + ')';
        }
      }

      return name;
    }).filter(function (n) { return n; });
  }

  // ══════════════════════════════════════════
  //  summary 行内按钮注入
  // ══════════════════════════════════════════
  var _BTN_ID_PREFIX = 'gor-summary-btn-';

  function _injectSummaryBtn(slot) {
    var details = document.getElementById('pc-organize-' + slot);
    if (!details) return;
    var summary = details.querySelector('summary');
    if (!summary) return;

    // 移除旧按钮
    var oldBtn = document.getElementById(_BTN_ID_PREFIX + slot);
    if (oldBtn) oldBtn.parentNode.removeChild(oldBtn);

    // 仅本人 slot 才注入
    if (!_isMySlot(slot)) return;

    var editing = !!_editingSlot[slot];
    var btn = document.createElement('button');
    btn.id = _BTN_ID_PREFIX + slot;
    btn.type = 'button';
    btn.setAttribute('data-slot', slot);

    if (editing) {
      btn.className = 'gor-summary-btn gor-summary-btn-done';
      btn.setAttribute('data-act', 'done');
      btn.textContent = '完成';
    } else {
      btn.className = 'gor-summary-btn gor-summary-btn-edit';
      btn.setAttribute('data-act', 'edit');
      btn.textContent = '整队';
    }

    // 阻止按钮点击触发 details 的展开/收起
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (editing) {
        exitEdit(slot);
      } else {
        // 确保 details 是展开的
        details.open = true;
        enterEdit(slot);
      }
    });

    // 插入到 .pcs-chevron 前面
    var chevron = summary.querySelector('.pcs-chevron');
    if (chevron) {
      summary.insertBefore(btn, chevron);
    } else {
      summary.appendChild(btn);
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
    var bodyEl = document.getElementById('pc-org-body-' + slot);
    var countEl = document.getElementById('pc-org-count-' + slot);
    if (!bodyEl) return;

    var editing = !!_editingSlot[slot];

    // 合并排序
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

    // 注入/更新 summary 行内按钮
    _injectSummaryBtn(slot);

    // body 区：只放标签列表，不放按钮
    var html = '';
    if (ordered.length) {
      html += '<div class="gor-list' + (editing ? ' gor-list-editing' : '') + '" data-slot="' + slot + '">';
      ordered.forEach(function (name) {
        // 解析武将名和状态（格式：李通(受伤)、沮授(患病)）
        var cleanName = name;
        var statusText = '';
        var statusClass = '';
        var isDeadGeneral = false;

        var match = name.match(/^(.+?)\((.+?)\)$/);
        if (match) {
          cleanName = match[1];
          var status = match[2];

          // 状态映射
          if (/受伤|伤/.test(status)) {
            statusClass = 'injured';
            statusText = '伤';
          } else if (/患病|病/.test(status)) {
            statusClass = 'sick';
            statusText = '病';
          } else if (/疲劳|疲/.test(status)) {
            statusClass = 'tired';
            statusText = '疲';
          } else if (/阵亡|亡|死/.test(status)) {
            statusClass = 'dead';
            statusText = '亡';
            isDeadGeneral = true;
          }
        }

        // 构建武将按钮HTML
        var tagClasses = 'gor-tag gen-tag';
        if (editing) tagClasses += ' gor-tag-draggable';
        if (isDeadGeneral) tagClasses += ' dead-general';

        html += '<span class="' + tagClasses + '"'
          + ' data-name="' + _esc(name) + '"'
          + (editing ? ' draggable="true"' : '')
          + '>';

        // 武将名（阵亡时需要加 .gen-name 类用于删除线）
        if (isDeadGeneral) {
          html += '<span class="gen-name">' + _esc(cleanName) + '</span>';
        } else {
          html += _esc(cleanName);
        }

        // 状态标签
        if (statusClass && statusText) {
          html += '<span class="status-label ' + statusClass + '">' + statusText + '</span>';
        }

        html += '</span>';
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

    _touchLongTimer = setTimeout(function () {
      _touchStarted = true;
      tag.classList.add('gor-tag-ghost');

      _touchClone = tag.cloneNode(true);
      _touchClone.className = 'gor-tag gor-tag-clone';
      document.body.appendChild(_touchClone);

      var touch = e.touches[0];
      _touchClone.style.left = (touch.clientX - 30) + 'px';
      _touchClone.style.top = (touch.clientY - 16) + 'px';

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
  //  武将胶囊点击复制
  // ══════════════════════════════════════════
  function onGeneralTagClick(e) {
    var tag = e.target.closest('.gor-tag');
    if (!tag) return;

    // 避免拖拽模式下触发复制
    if (tag.classList.contains('gor-tag-draggable')) return;

    var fullName = tag.getAttribute('data-name');
    if (!fullName) return;

    // 提取纯武将名（去除状态后缀，如"李通(受伤)"→"李通"）
    var cleanName = fullName;
    var match = fullName.match(/^(.+?)\((.+?)\)$/);
    if (match) {
      cleanName = match[1];
    }

    // 复制到剪贴板
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cleanName).then(function () {
        _toast('✓ 已复制「' + cleanName + '」');
      }).catch(function () {
        _toastFallback(cleanName);
      });
    } else {
      _toastFallback(cleanName);
    }
  }

  function _toastFallback(name) {
    // 兜底：旧浏览器用 execCommand
    var input = document.createElement('input');
    input.value = name;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      _toast('✓ 已复制「' + name + '」');
    } catch (e) {
      _toast('⚠️ 复制失败，请手动复制');
    }
    document.body.removeChild(input);
  }

  // ══════════════════════════════════════════
  //  事件委托
  // ══════════════════════════════════════════
  function bindEvents() {
    // summary 按钮的点击由 _injectSummaryBtn 中的 addEventListener 处理，
    // 不需要在这里做额外委托

    // 桌面拖拽
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', onDragEnd);

    // 移动端触摸拖拽
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    // 武将胶囊点击复制
    document.addEventListener('click', onGeneralTagClick);
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
