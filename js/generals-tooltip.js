/**
 * generals-tooltip.js — 武将悬浮档案面板 v2.1
 *
 * 功能：
 *  1. 鼠标悬停 .gen-tag 元素 → 查询 Supabase generals_static 表
 *  2. 显示武将姓名、字、外号、归属、档次、生平、适配职务
 *  3. 查询不到时显示"暂无档案"兜底，绝不报错
 *  4. 移出鼠标 200ms 后消失，避免抖动
 *  6. v2.1 新增人物立绘左栏（方向 A · 左像右档，无装饰，contain 完整显示）
 *
 * UI 设计语言与城池弹框（sgt-*）一致：
 *  - 顶部色条（档次色）
 *  - serif 字体、金色分割线
 *  - 全部使用 CSS class (.gtp-*)，无 inline style
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════
  //  Supabase 配置
  // ══════════════════════════════════════════
  var SUPABASE_URL = 'https://smiifcbmmtolimtaxpip.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';

  // ══════════════════════════════════════════
  //  档次 → 顶部色条 & 徽章配色
  // ══════════════════════════════════════════
  var TIER_STYLE = {
    '神话': { bar: 'linear-gradient(90deg,#9b30e0,#cc66ff,#9b30e0)', bg: 'rgba(100,20,160,.25)', bd: 'rgba(180,80,240,.55)', c: '#cc88ff' },
    '传奇': { bar: 'linear-gradient(90deg,#b05000,#e08020,#b05000)', bg: 'rgba(130,60,0,.25)',   bd: 'rgba(220,120,20,.55)', c: '#f0a040' },
    '精英': { bar: 'linear-gradient(90deg,#1a4ca0,#4490e0,#1a4ca0)', bg: 'rgba(20,60,130,.25)',  bd: 'rgba(70,140,230,.55)', c: '#70aaee' },
    '常规': { bar: 'rgba(120,120,120,.5)',                            bg: 'rgba(50,50,50,.25)',   bd: 'rgba(120,120,120,.45)', c: '#a0a0a0' },
  };

  // ══════════════════════════════════════════
  //  势力 → 徽章配色
  // ══════════════════════════════════════════
  var FACTION_STYLE = {
    '魏':   { bg: 'rgba(30,80,160,.22)',  bd: 'rgba(80,140,220,.50)', c: '#7ab4f0' },
    '蜀':   { bg: 'rgba(140,20,20,.22)',  bd: 'rgba(220,60,60,.50)',  c: '#f08080' },
    '吴':   { bg: 'rgba(10,100,40,.22)',  bd: 'rgba(40,180,80,.50)',  c: '#6dcc88' },
    '群雄': { bg: 'rgba(60,60,60,.22)',   bd: 'rgba(140,140,140,.45)', c: '#b0b0b0' },
    '汉室': { bg: 'rgba(120,90,10,.22)',  bd: 'rgba(210,170,40,.50)', c: '#d4b040' },
  };

  // ══════════════════════════════════════════
  //  反向警示关键词正则
  // ══════════════════════════════════════════
  var WARNING_RE = /^(不宜|不可|慎用|慎于|慎防)/;

  // ══════════════════════════════════════════
  //  内存缓存 + 请求去重
  // ══════════════════════════════════════════
  var _cache   = {};  // { name: data | null }
  var _pending = {};  // { name: true }

  // ══════════════════════════════════════════
  //  Tooltip DOM（懒创建，全局唯一）
  // ══════════════════════════════════════════
  var _tip        = null;
  var _hideTimer  = null;
  var _curTarget  = null;

  function ensureTip() {
    if (_tip) return;
    _tip = document.createElement('div');
    _tip.id = 'gen-tooltip';
    document.body.appendChild(_tip);
  }

  // ══════════════════════════════════════════
  //  位置计算：贴近鼠标，不超出视口
  // ══════════════════════════════════════════
  function positionTip(e) {
    if (!_tip) return;
    var W  = window.innerWidth;
    var H  = window.innerHeight;
    var tw = _tip.offsetWidth  || 320;
    var th = _tip.offsetHeight || 220;
    var x  = e.clientX + 16;
    var y  = e.clientY + 16;
    if (x + tw > W - 8) x = e.clientX - tw - 12;
    if (y + th > H - 8) y = e.clientY - th - 12;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    _tip.style.left = x + 'px';
    _tip.style.top  = y + 'px';
  }

  // ══════════════════════════════════════════
  //  HTML 转义
  // ══════════════════════════════════════════
  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ══════════════════════════════════════════
  //  Tooltip 内容渲染
  // ══════════════════════════════════════════
  function renderTip(name, data) {
    ensureTip();

    // ── 无档案兜底 ──────────────────────────
    if (!data) {
      var emptyChar = _esc((name || '？').charAt(0));
      _tip.innerHTML =
        '<div class="gtp-tier-bar" style="background:rgba(120,120,120,.4)"></div>' +
        '<div class="gtp-body">' +
          '<div class="gtp-portrait-wrap">' +
            '<div class="gtp-portrait-fallback">' + emptyChar + '</div>' +
          '</div>' +
          '<div class="gtp-info">' +
            '<div class="gtp-header">' +
              '<span class="gtp-name">' + _esc(name) + '</span>' +
            '</div>' +
            '<div class="gtp-divider"></div>' +
            '<div class="gtp-empty">暂无档案，正在补录中。</div>' +
          '</div>' +
        '</div>';
      return;
    }

    var ts = TIER_STYLE[data.tier]       || TIER_STYLE['常规'];
    var fs = FACTION_STYLE[data.faction_hint] || FACTION_STYLE['群雄'];

    // ── 立绘左栏（v2.1 新增）──────────────
    var portraitHtml = '';
    var portraitUrl = data.portrait_url || '';
    if (portraitUrl) {
      var fallbackChar = _esc((data.name || '？').charAt(0));
      portraitHtml =
        '<div class="gtp-portrait-wrap">' +
          '<img class="gtp-portrait-img" src="' + _esc(portraitUrl) + '" alt="" ' +
            'onerror="this.parentNode.innerHTML=\'<div class=&quot;gtp-portrait-fallback&quot;>' + fallbackChar + '</div>\'">' +
        '</div>';
    } else {
      var firstChar = _esc((data.name || '？').charAt(0));
      portraitHtml =
        '<div class="gtp-portrait-wrap">' +
          '<div class="gtp-portrait-fallback">' + firstChar + '</div>' +
        '</div>';
    }

    // ── 顶部色条 ────────────────────────────
    var barHtml = '<div class="gtp-tier-bar" style="background:' + ts.bar + '"></div>';

    // ── body 容器开 ──────────────────────────
    var bodyOpen = '<div class="gtp-body">';

    // ── 标题行：姓名 + 字 ────────────────────
    var headerHtml = '<div class="gtp-header">' +
      '<span class="gtp-name">' + _esc(data.name) + '</span>';
    if (data.courtesy_name) {
      headerHtml += '<span class="gtp-courtesy">字&thinsp;' + _esc(data.courtesy_name) + '</span>';
    }
    headerHtml += '</div>';

    // ── 外号行 ──────────────────────────────
    var nicknameHtml = '';
    if (data.nickname) {
      nicknameHtml = '<div class="gtp-nickname">「' + _esc(data.nickname) + '」</div>';
    }

    // ── 徽章行 ──────────────────────────────
    var badgeHtml = '<div class="gtp-badges">' +
      _badge('归属：' + data.faction_hint, fs) +
      _badge('档次：' + data.tier, ts) +
      '</div>';

    // ── 分割线 ──────────────────────────────
    var divHtml = '<div class="gtp-divider"></div>';

    // ── 生平 ────────────────────────────────
    var bioHtml = '<div class="gtp-bio">' + _esc(data.biography) + '</div>';

    // ── 适配职务 ─────────────────────────────
    var rolesHtml = '';
    var roles = data.suitable_roles || [];
    if (roles.length > 0) {
      rolesHtml = '<div class="gtp-roles-label">适配职务</div><div class="gtp-roles">';
      var POLICY_RE = /^擅长(屯田|开市|军训|招贤|工造)$/;
      roles.forEach(function (r) {
        var cls;
        if (WARNING_RE.test(r)) {
          cls = 'gtp-role gtp-role-warn';
        } else if (POLICY_RE.test(r)) {
          cls = 'gtp-role gtp-role-normal';
        } else {
          cls = 'gtp-role gtp-role-normal';
        }
        rolesHtml += '<span class="' + cls + '">' + _esc(r) + '</span>';
      });
      rolesHtml += '</div>';
    }

    // ── body 容器关 ──────────────────────────
    var bodyClose = '</div>';

    _tip.innerHTML = barHtml + bodyOpen +
      portraitHtml +
      '<div class="gtp-info">' +
        headerHtml + nicknameHtml + badgeHtml + divHtml + bioHtml + rolesHtml +
      '</div>' +
      bodyClose;
  }

  // 徽章 span（带 inline bg/border/color，复用 faction/tier 色对象）
  function _badge(text, colorObj) {
    return '<span class="gtp-badge" style="' +
      'background:' + colorObj.bg + ';' +
      'border-color:' + colorObj.bd + ';' +
      'color:' + colorObj.c +
      '">' + _esc(text) + '</span>';
  }

  // ══════════════════════════════════════════
  //  显示 / 隐藏
  // ══════════════════════════════════════════
  function showTip(name, e) {
    ensureTip();
    clearTimeout(_hideTimer);

    // 缓存命中 → 立即渲染
    if (_cache.hasOwnProperty(name)) {
      renderTip(name, _cache[name]);
      _tip.classList.add('gtp-visible');
      positionTip(e);
      return;
    }

    // 先渲染占位（兜底样式），同时发起查询
    renderTip(name, null);
    _tip.classList.add('gtp-visible');
    positionTip(e);

    if (!_pending[name]) {
      _pending[name] = true;
      fetchGeneral(name);
    }
  }

  function hideTip() {
    clearTimeout(_hideTimer);
    _hideTimer = setTimeout(function () {
      if (_tip) _tip.classList.remove('gtp-visible');
      _curTarget = null;
    }, 200);
  }

  // ══════════════════════════════════════════
  //  Supabase 查询
  // ══════════════════════════════════════════
  function fetchGeneral(name) {
    var url = SUPABASE_URL + '/rest/v1/generals_static'
      + '?name=eq.' + encodeURIComponent(name)
      + '&select=name,courtesy_name,nickname,faction_hint,tier,biography,suitable_roles,portrait_url'
      + '&limit=1';

    fetch(url, {
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json',
      }
    })
    .then(function (res) { return res.json(); })
    .then(function (rows) {
      var data = (rows && rows.length > 0) ? rows[0] : null;
      _cache[name] = data;
      delete _pending[name];
      window._generalsCache = window._generalsCache || {};
      window._generalsCache[name] = data;
      // 若用户还在悬停同一武将 → 刷新内容
      if (_curTarget === name && _tip && _tip.classList.contains('gtp-visible')) {
        renderTip(name, data);
      }
    })
    .catch(function () {
      _cache[name] = null;
      delete _pending[name];
    });
  }

  // ══════════════════════════════════════════
  //  事件委托：document 层捕获，兼容动态渲染
  // ══════════════════════════════════════════
  function onMouseOver(e) {
    var tag = e.target.closest ? e.target.closest('.gen-tag') : null;
    if (!tag) return;
    var name = tag.dataset.name;
    if (!name) return;

    // 提取纯武将名（去掉状态后缀，如"法正(疲劳)"→"法正"）
    var cleanName = name;
    var match = name.match(/^(.+?)\((.+?)\)$/);
    if (match) {
      cleanName = match[1];
    }

    _curTarget = cleanName;
    showTip(cleanName, e);
  }

  function onMouseMove(e) {
    if (!_tip || !_tip.classList.contains('gtp-visible')) return;
    var tag = e.target.closest ? e.target.closest('.gen-tag') : null;
    if (!tag) return;
    positionTip(e);
  }

  function onMouseOut(e) {
    var tag = e.target.closest ? e.target.closest('.gen-tag') : null;
    if (!tag) return;
    // 检查是否移向子元素（不触发隐藏）
    if (tag.contains(e.relatedTarget)) return;
    hideTip();
  }

  // ── 初始化 ──
  function init() {
    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseout',  onMouseOut);
    ensureTip();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
