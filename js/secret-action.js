/* ============================================================
   secret-action.js  ·  军帐板块  v5  (v20260920a)
   ------------------------------------------------------------
   由「加密行动 / 密令」板块升级而来。
   核心变更:
   - 每位玩家 4 个独立军令框(原单 textarea)
   - 每框可勾选「□ 改为密令」,明面/密令双层
   - Supabase 新增 secret_text 列,与 content 同行配对
   - 三家全部锁定才解锁复制;复制后清空云端本局
   - 复制格式:=== 城主X === \n ① 内容 \n\n 【密】内容
   - 术语:「封印」全部替换为「锁定」
   - 规则速览 / 我的建议 折叠条 localStorage 记忆
   - 暴露 window.SGArmyCouncil 接口供 main.js(PR5)调用

   兼容:
   - 旧记录(secret_text=NULL)按"该 slot 本回合无密令"渲染
   - sessionId 仍固定 'global',跨设备共享
   - 所有现有 ID 保留(#sa-card-i / #sa-submit-i / #sa-locked-mask-i
     / #sa-seal-badge-i / #sa-status-dot-i / #sa-status-txt-i /
     #sa-player-name-i / #sa-player-name-status-i /
     #sa-progress-badge / #sa-copy-btn / #sa-new-session /
     #sa-table-error / #sa-all-ready-banner /
     #sa-fallback-overlay / #sa-fallback-ta / #sa-fallback-close)

   表结构(PR1 已执行):
   public.secret_actions
   ├─ id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
   ├─ slot          smallint NOT NULL CHECK (slot IN (0,1,2))
   ├─ content       text     NOT NULL DEFAULT ''   ← 明令拼合
   ├─ secret_text   text     NULL                  ← 密令拼合(NEW)
   ├─ session_id    text     NOT NULL DEFAULT ''
   └─ submitted_at  timestamptz DEFAULT now()
   ============================================================ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     常量
  ───────────────────────────────────────────── */
  const BASE_URL  = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/secret_actions';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  const HEADERS   = {
    'apikey':        SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
  const POLL_MS   = 4000;          // 轮询间隔
  const ORDER_NUMS = ['①','②','③','④'];
  const ORDERS_PER_CARD = 4;

  // 跨设备同步:固定全局 ID(与旧版一致)
  const sessionId = 'global';

  // localStorage 键
  const LS_RULES_COLLAPSED  = 'sa-rules-collapsed';   // 默认 '1'(收起)
  const LS_ADVICE_COLLAPSED = 'sa-advice-collapsed';  // 默认 '0'(展开)

  /* ─────────────────────────────────────────────
     本地状态
  ───────────────────────────────────────────── */
  // 每个 slot 的本地数据模型:
  //   { orders: [{text, secret}, {text, secret}, {text, secret}, {text, secret}],
  //     locked: bool,
  //     fromAdvice: { [adviceKey]: orderIdx }  ← PR5 注入,记录哪些条来自建议采纳
  //   }
  const localState = {
    slots: [makeEmptySlot(), makeEmptySlot(), makeEmptySlot()],
    allDone:     false,
    pollTimer:   null,
    tableError:  false,
    remoteSlots: [],
  };

  function makeEmptySlot() {
    return {
      orders: [
        { text: '', secret: false },
        { text: '', secret: false },
        { text: '', secret: false },
        { text: '', secret: false },
      ],
      locked: false,
      fromAdvice: {},
    };
  }

  /* ─────────────────────────────────────────────
     工具函数
  ───────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  function fetchSA(url, opts = {}, ms = 8000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  function saShowToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 320);
    }, 2800);
  }

  /* ─────────────────────────────────────────────
     初始化入口
  ───────────────────────────────────────────── */
  function init() {
    bindUI();
    refreshPlayerNames();
    initToggles();
    renderAllCards();
    startPoll();
    checkTableExists();
  }

  /* ─────────────────────────────────────────────
     折叠条:规则速览 + 我的建议
     localStorage 记忆,默认值见常量
  ───────────────────────────────────────────── */
  function initToggles() {
    // 规则速览(默认收起)
    bindToggle({
      toggleEl: $('sa-rules-toggle'),
      panelEl:  $('sa-rules-panel'),
      arrowEl:  $('sa-rules-arrow'),
      lsKey:    LS_RULES_COLLAPSED,
      defaultCollapsed: true,
      expandClass: 'sa-rules-expanded',
    });

    // 我的建议(默认展开)
    bindToggle({
      toggleEl: $('sa-advice-toggle'),
      panelEl:  $('sa-advice-panel'),
      arrowEl:  $('sa-advice-arrow'),
      lsKey:    LS_ADVICE_COLLAPSED,
      defaultCollapsed: false,
      expandClass: 'sa-advice-expanded',
    });
  }

  function bindToggle({ toggleEl, panelEl, arrowEl, lsKey, defaultCollapsed, expandClass }) {
    if (!toggleEl || !panelEl || !arrowEl) return;

    // 读取记忆(未设置时走默认)
    let stored = null;
    try { stored = localStorage.getItem(lsKey); } catch (e) {}
    let collapsed = (stored === null) ? defaultCollapsed : (stored === '1');

    const apply = () => {
      if (collapsed) {
        panelEl.classList.remove(expandClass);
        arrowEl.textContent = '[展开 ▼]';
      } else {
        panelEl.classList.add(expandClass);
        arrowEl.textContent = '[收起 ▲]';
      }
      toggleEl.setAttribute('data-collapsed', collapsed ? '1' : '0');
    };
    apply();

    toggleEl.addEventListener('click', () => {
      collapsed = !collapsed;
      try { localStorage.setItem(lsKey, collapsed ? '1' : '0'); } catch (e) {}
      apply();
    });
  }

  /* ─────────────────────────────────────────────
     绑定 UI 事件
  ───────────────────────────────────────────── */
  function bindUI() {
    // 三个锁定/解锁按钮
    [0, 1, 2].forEach(slot => {
      const btn = $(`sa-submit-${slot}`);
      if (btn) btn.addEventListener('click', () => onToggleLock(slot));
    });

    // 一键复制
    const copyBtn = $('sa-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', onCopyAll);

    // 新一轮
    const newBtn = $('sa-new-session');
    if (newBtn) newBtn.addEventListener('click', onNewSession);

    // 降级复制弹窗关闭
    document.addEventListener('click', e => {
      if (e.target && (e.target.id === 'sa-fallback-close' || e.target.id === 'sa-fallback-overlay')) {
        const overlay = $('sa-fallback-overlay');
        if (overlay) overlay.classList.add('hidden');
      }
    });
  }

  /* ─────────────────────────────────────────────
     渲染玩家名(从 #pname-{i} / #ptitle-{i} 读)
  ───────────────────────────────────────────── */
  function refreshPlayerNames() {
    [0, 1, 2].forEach(slot => {
      const nameEl  = document.getElementById(`pname-${slot}`);
      const name    = nameEl ? nameEl.textContent.trim() : `城主${'甲乙丙'[slot]}`;

      const titleEl = document.getElementById(`ptitle-${slot}`);
      const title   = (titleEl && titleEl.textContent.trim()) || '';

      const displayName = title || name;

      const headEl = $(`sa-player-name-${slot}`);
      if (headEl) headEl.textContent = displayName;

      const statusNameEl = $(`sa-player-name-status-${slot}`);
      if (statusNameEl) statusNameEl.textContent = displayName;
    });
  }

  /* ─────────────────────────────────────────────
     卡片渲染:把 localState 同步到 DOM
     注意:由于 HTML 已经有静态结构,这里只更新 textarea 值
           + checkbox 状态 + 行高度,不重建 DOM
  ───────────────────────────────────────────── */
  function renderAllCards() {
    [0, 1, 2].forEach(renderCard);
    updateProgress();
  }

  function renderCard(slot) {
    const data = localState.slots[slot];
    const card = $(`sa-card-${slot}`);
    if (!card) return;

    // 4 个军令行
    data.orders.forEach((o, idx) => {
      const row = card.querySelector(`.sa-order-row[data-slot="${slot}"][data-idx="${idx}"]`);
      if (!row) return;
      const ta  = row.querySelector('.sa-order-input');
      const cb  = row.querySelector('.sa-secret-checkbox');

      if (ta) {
        if (ta.value !== o.text) ta.value = o.text;
        ta.disabled = data.locked;
        ta.placeholder = o.secret ? '写下一条密令…' : '写下一条军令…';
        // 自适应高度
        ta.style.height = 'auto';
        ta.style.height = (ta.scrollHeight) + 'px';

        // 绑定 input 监听(幂等)
        if (!ta._saBound) {
          ta.addEventListener('input', onOrderInput);
          ta._saBound = true;
        }
      }
      if (cb) {
        cb.checked = !!o.secret;
        cb.disabled = data.locked;
        if (!cb._saBound) {
          cb.addEventListener('change', onSecretToggle);
          cb._saBound = true;
        }
      }
      row.classList.toggle('is-secret', !!o.secret);
    });

    // 卡片整体锁定态
    card.classList.toggle('sa-card-locked', data.locked);

    // 锁定遮罩
    const mask = $(`sa-locked-mask-${slot}`);
    if (mask) mask.classList.toggle('hidden', !data.locked);

    // 已锁定徽章
    const seal = $(`sa-seal-badge-${slot}`);
    if (seal) seal.classList.toggle('hidden', !data.locked);

    // 锁定/解锁按钮
    const btn = $(`sa-submit-${slot}`);
    if (btn) {
      btn.disabled = false;
      if (data.locked) {
        btn.textContent = '解除锁定';
        btn.classList.add('sa-btn-unlock');
      } else {
        btn.textContent = '锁定行动 🔒';
        btn.classList.remove('sa-btn-unlock');
      }
    }

    // 额度条
    updateQuota(slot);
  }

  function onOrderInput(e) {
    const ta   = e.currentTarget;
    const slot = parseInt(ta.dataset.slot, 10);
    const idx  = parseInt(ta.dataset.idx, 10);
    if (isNaN(slot) || isNaN(idx)) return;
    localState.slots[slot].orders[idx].text = ta.value;

    // 自适应高度
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight) + 'px';

    // 用户手动改了此框 → 解绑该框上挂的"我来自某条建议"标记
    clearAdviceMapForOrder(slot, idx);

    updateQuota(slot);

    // 通知 PR5 重渲染建议区(撤销已采纳态)
    notifyAdviceMaybeChanged(slot);
  }

  function onSecretToggle(e) {
    const cb   = e.currentTarget;
    const slot = parseInt(cb.dataset.slot, 10);
    const idx  = parseInt(cb.dataset.idx, 10);
    if (isNaN(slot) || isNaN(idx)) return;
    localState.slots[slot].orders[idx].secret = cb.checked;

    const row = cb.closest('.sa-order-row');
    if (row) row.classList.toggle('is-secret', cb.checked);

    const ta = row && row.querySelector('.sa-order-input');
    if (ta) ta.placeholder = cb.checked ? '写下一条密令…' : '写下一条军令…';

    updateQuota(slot);
  }

  /* ─────────────────────────────────────────────
     额度条更新:明令/密令分别计数,三态色
     - ≤2 ✓ 绿
     - =3 ⚠️ 金
     - ≥4 ❌ 红
     - 空内容不计入(即便勾了密令)
  ───────────────────────────────────────────── */
  function updateQuota(slot) {
    const data = localState.slots[slot];
    let pub = 0, sec = 0;
    data.orders.forEach(o => {
      if (!o.text || !o.text.trim()) return;
      if (o.secret) sec++; else pub++;
    });
    const bar     = $(`sa-quota-bar-${slot}`);
    const pubEl   = $(`sa-quota-public-${slot}`);
    const secEl   = $(`sa-quota-secret-${slot}`);
    const tipEl   = $(`sa-quota-tip-${slot}`);
    if (!bar || !pubEl || !secEl || !tipEl) return;

    pubEl.textContent = pub;
    secEl.textContent = sec;

    const tone = n => n <= 2 ? 'tone-ok' : (n === 3 ? 'tone-warn' : 'tone-error');
    pubEl.className = 'sa-quota-value ' + tone(pub);
    secEl.className = 'sa-quota-value ' + tone(sec);

    bar.classList.remove('bar-warn', 'bar-error');
    if (pub >= 4 || sec >= 4)       bar.classList.add('bar-error');
    else if (pub === 3 || sec === 3) bar.classList.add('bar-warn');

    let tipText = `合计 ${pub + sec} 条`;
    if (pub >= 4 && sec >= 4)      tipText = '⚠️ 明令与密令均过多,建议合并';
    else if (pub >= 4)             tipText = '⚠️ 明令过多,建议精简';
    else if (sec >= 4)             tipText = '⚠️ 密令过多,部分可能被婉拒';
    else if (pub === 3 && sec === 3) tipText = '⚠️ 行动偏多,GM 可能聚合';
    else if (pub === 3)            tipText = '提醒:明令偏多';
    else if (sec === 3)            tipText = '提醒:密令偏多';
    tipEl.textContent = tipText;
  }

  /* ─────────────────────────────────────────────
     建表错误检查
  ───────────────────────────────────────────── */
  async function checkTableExists() {
    try {
      const res = await fetchSA(`${BASE_URL}?select=secret_text&limit=0`, { headers: HEADERS }, 5000);
      if (res.status === 404 || res.status === 400) {
        localState.tableError = true;
        const el = $('sa-table-error');
        if (el) {
          el.classList.remove('hidden');
          const body = el.querySelector('.sa-te-body');
          if (body) {
            body.innerHTML = '<b>数据表未就绪</b> — secret_text 列尚未添加,请在 Supabase SQL Editor 执行 PR1 工单后刷新。';
          }
        }
      }
    } catch (e) { /* 静默 */ }
  }

  /* ─────────────────────────────────────────────
     锁定 / 解锁切换
  ───────────────────────────────────────────── */
  async function onToggleLock(slot) {
    const data = localState.slots[slot];
    if (data.locked) {
      await onUnlock(slot);
    } else {
      await onLock(slot);
    }
  }

  async function onLock(slot) {
    if (localState.tableError) {
      saShowToast('⚠️ 数据表未就绪,请先建表');
      return;
    }
    const data = localState.slots[slot];

    // 拼合明令与密令
    const publicText = data.orders
      .filter(o => !o.secret && o.text && o.text.trim())
      .map((o, i, arr) => `${ORDER_NUMS[i]} ${o.text.trim()}`)
      .join('\n');
    const secretArr = data.orders
      .filter(o => o.secret && o.text && o.text.trim())
      .map(o => o.text.trim());
    const secretText = secretArr.length ? secretArr.map(t => `【密】${t}`).join('\n') : null;

    // 全空仍允许锁定(代表"本回合无行动")— 与原版语义一致

    const btn = $(`sa-submit-${slot}`);
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

    try {
      // 幂等删除旧记录
      await fetchSA(
        `${BASE_URL}?session_id=eq.${encodeURIComponent(sessionId)}&slot=eq.${slot}`,
        { method: 'DELETE', headers: HEADERS }, 5000
      );
      // 写入新记录(明面 + 密令)
      const payload = {
        slot,
        content:     publicText,
        secret_text: secretText,
        session_id:  sessionId,
      };
      const res = await fetchSA(BASE_URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload),
      }, 8000);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.status);
      }

      data.locked = true;
      renderCard(slot);
      updateProgress();
      saShowToast('🔒 行动已锁定');
    } catch (e) {
      saShowToast('❌ 锁定失败:' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '锁定行动 🔒'; }
    }
  }

  // 解除锁定:直接生效,无二次确认
  async function onUnlock(slot) {
    const btn = $(`sa-submit-${slot}`);
    if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }
    try {
      await fetchSA(
        `${BASE_URL}?session_id=eq.${encodeURIComponent(sessionId)}&slot=eq.${slot}`,
        { method: 'DELETE', headers: HEADERS }, 5000
      );
      localState.slots[slot].locked = false;
      // allDone 若已置位需重置(因为不再三家齐)
      if (localState.allDone) {
        localState.allDone = false;
        startPoll();
      }
      renderCard(slot);
      updateProgress();
      saShowToast('🔓 已解除锁定');
    } catch (e) {
      saShowToast('❌ 解锁失败:' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '解除锁定'; }
    }
  }

  /* ─────────────────────────────────────────────
     进度刷新 + 状态点
  ───────────────────────────────────────────── */
  function updateProgress() {
    const localCount = localState.slots.filter(s => s.locked).length;
    const remoteSet  = new Set(localState.remoteSlots || []);
    // 综合本地与远端,任意一处显示"已锁定"
    const merged = [0, 1, 2].map(i => localState.slots[i].locked || remoteSet.has(i));

    const lockedCount = merged.filter(Boolean).length;
    const badge = $('sa-progress-badge');
    if (badge) badge.textContent = `${lockedCount} / 3`;

    [0, 1, 2].forEach(slot => {
      const dot = $(`sa-status-dot-${slot}`);
      const txt = $(`sa-status-txt-${slot}`);
      const done = merged[slot];
      if (dot) dot.className = 'sa-status-dot' + (done ? ' sa-dot-done' : ' sa-dot-pending');
      if (txt) txt.textContent = done ? '已锁定' : '待行动';
    });

    // 复制按钮 / 提示语 / banner
    const copyBtn = $('sa-copy-btn');
    const hint    = $('sa-copy-disabled-hint');
    const banner  = $('sa-all-ready-banner');

    if (lockedCount >= 3) {
      if (copyBtn) copyBtn.disabled = false;
      if (hint)    hint.style.display = 'none';
      if (banner)  banner.classList.remove('hidden');
    } else {
      if (copyBtn) copyBtn.disabled = true;
      if (hint)    hint.style.display = '';
      if (banner)  banner.classList.add('hidden');
    }
  }

  /* ─────────────────────────────────────────────
     轮询远端,同步其他设备的锁定
  ───────────────────────────────────────────── */
  function startPoll() {
    if (localState.pollTimer) clearInterval(localState.pollTimer);
    localState.pollTimer = setInterval(pollRemote, POLL_MS);
    pollRemote();
  }

  async function pollRemote() {
    if (localState.allDone) return;
    try {
      const res = await fetchSA(
        `${BASE_URL}?session_id=eq.${encodeURIComponent(sessionId)}&select=slot,content,secret_text&order=slot.asc`,
        { headers: { ...HEADERS, 'Prefer': '' } }, 6000
      );
      if (!res.ok) return;
      const rows = await res.json();
      localState.remoteSlots = rows.map(r => Number(r.slot));

      // 远端三家齐 → 触发就绪态
      if (localState.remoteSlots.length >= 3) {
        // 把远端内容缓存,方便复制时使用(避免远端是其他设备提交的)
        localState._remoteRows = rows;
        onAllReady();
      }
      updateProgress();
    } catch (e) { /* 静默 */ }
  }

  function onAllReady() {
    if (localState.allDone) return;
    localState.allDone = true;
    if (localState.pollTimer) {
      clearInterval(localState.pollTimer);
      localState.pollTimer = null;
    }
    saShowToast('⚔️ 三方行动已全部锁定!');
  }

  /* ─────────────────────────────────────────────
     一键复制:格式 === 城主X === \n ① 内容 \n\n 【密】内容
     - 仅在三家全部锁定时可点
     - 空内容跳过
     - 全空时写 (本回合无行动)
     - 优先用本地缓存内容;远端同步的他人内容用 _remoteRows
     - 复制成功后清空云端
  ───────────────────────────────────────────── */
  async function onCopyAll() {
    const text = buildCopyText();
    try {
      await navigator.clipboard.writeText(text);
      saShowToast('📋 已复制,正在清空云端…');
      await clearRemote();
      resetLocal();
      saShowToast('✅ 云端已清空,可开始下一轮');
    } catch (e) {
      // 降级
      showFallbackCopy(text);
    }
  }

  function buildCopyText() {
    const names = [0, 1, 2].map(slot => {
      const el = $(`sa-player-name-${slot}`);
      return el ? el.textContent.trim() : `城主${'甲乙丙'[slot]}`;
    });

    // 把本地与远端合并:本地 locked 用本地数据;否则用远端
    const remoteMap = {};
    (localState._remoteRows || []).forEach(r => {
      remoteMap[Number(r.slot)] = r;
    });

    const parts = [0, 1, 2].map(slot => {
      const localSlot = localState.slots[slot];
      let pubLines = [];
      let secLines = [];

      if (localSlot.locked) {
        // 用本地数据(本设备锁定的)
        let pubIdx = 0;
        localSlot.orders.forEach(o => {
          if (!o.text || !o.text.trim()) return;
          if (o.secret) {
            secLines.push(`【密】${o.text.trim()}`);
          } else {
            pubLines.push(`${ORDER_NUMS[pubIdx]} ${o.text.trim()}`);
            pubIdx++;
          }
        });
      } else if (remoteMap[slot]) {
        // 用远端数据(其他设备锁定的)
        const c = (remoteMap[slot].content  || '').trim();
        const s = (remoteMap[slot].secret_text || '').trim();
        if (c) pubLines = c.split('\n').filter(Boolean);
        if (s) secLines = s.split('\n').filter(Boolean);
      }

      const head = `=== ${names[slot]} ===`;
      if (!pubLines.length && !secLines.length) {
        return `${head}\n(本回合无行动)`;
      }
      let body = pubLines.join('\n');
      if (secLines.length) {
        body += (pubLines.length ? '\n\n' : '') + secLines.join('\n');
      }
      return `${head}\n${body}`;
    });

    return parts.join('\n\n');
  }

  async function clearRemote() {
    try {
      await fetchSA(
        `${BASE_URL}?session_id=eq.${encodeURIComponent(sessionId)}`,
        { method: 'DELETE', headers: HEADERS }, 8000
      );
    } catch (e) { /* 失败不影响 UX */ }
  }

  /* ─────────────────────────────────────────────
     重置本地,开启新一轮
  ───────────────────────────────────────────── */
  function resetLocal() {
    localState.slots = [makeEmptySlot(), makeEmptySlot(), makeEmptySlot()];
    localState.allDone     = false;
    localState.remoteSlots = [];
    localState._remoteRows = [];

    renderAllCards();

    const copyBtn = $('sa-copy-btn');
    if (copyBtn) copyBtn.disabled = true;
    const banner = $('sa-all-ready-banner');
    if (banner) banner.classList.add('hidden');
    const hint = $('sa-copy-disabled-hint');
    if (hint) hint.style.display = '';

    startPoll();
    notifyAdviceMaybeChanged(null); // 全局重渲染建议区(撤销所有已采纳态)
  }

  async function onNewSession() {
    const ok = confirm('确认清空当前所有行动,开始新一轮?\n(此操作不可撤回)');
    if (!ok) return;
    await clearRemote();
    resetLocal();
    saShowToast('🆕 新一轮已开始');
  }

  /* ─────────────────────────────────────────────
     降级复制(剪贴板 API 不可用时)
  ───────────────────────────────────────────── */
  function showFallbackCopy(text) {
    const overlay = $('sa-fallback-overlay');
    const ta      = $('sa-fallback-ta');
    if (overlay) overlay.classList.remove('hidden');
    if (ta) { ta.value = text; ta.select(); }
  }

  /* ─────────────────────────────────────────────
     ★ 暴露接口给 main.js(PR5「我的建议」模块)★
     接口规约见文末 SGArmyCouncil API。
  ───────────────────────────────────────────── */

  // 把建议内容写入第一个空军令框
  // text:已经组装好的字符串(行动名 或 行动名 - 分支名)
  // adviceKey:唯一标识(如 "slot0::①"),用于撤销时定位
  // 返回:{ ok:true, orderIdx:N } 或 { ok:false, reason:'full'/'locked'/'no-role' }
  function acceptToFirstEmpty(slot, text, adviceKey) {
    if (slot < 0 || slot > 2) return { ok: false, reason: 'bad-slot' };
    const data = localState.slots[slot];
    if (data.locked) return { ok: false, reason: 'locked' };

    const emptyIdx = data.orders.findIndex(o => !o.text || !o.text.trim());
    if (emptyIdx === -1) return { ok: false, reason: 'full' };

    data.orders[emptyIdx].text = text;
    data.orders[emptyIdx].secret = false; // 采纳建议默认明令
    if (adviceKey) data.fromAdvice[adviceKey] = emptyIdx;

    renderCard(slot);
    return { ok: true, orderIdx: emptyIdx };
  }

  // 撤销采纳:清空对应 order
  function undoAccept(slot, adviceKey) {
    if (slot < 0 || slot > 2) return false;
    const data = localState.slots[slot];
    if (data.locked) return false;
    const idx = data.fromAdvice[adviceKey];
    if (idx === undefined) return false;
    data.orders[idx] = { text: '', secret: false };
    delete data.fromAdvice[adviceKey];
    renderCard(slot);
    return true;
  }

  // 查询某 advice 是否已被采纳到当前 slot
  // 返回 orderIdx(0..3) 或 -1
  function findAcceptedOrderIdx(slot, adviceKey) {
    if (slot < 0 || slot > 2) return -1;
    const data = localState.slots[slot];
    const idx = data.fromAdvice[adviceKey];
    if (idx === undefined) return -1;
    // 验证:该 order 仍然存在且非空(用户可能手改清空)
    const o = data.orders[idx];
    if (!o || !o.text || !o.text.trim()) {
      delete data.fromAdvice[adviceKey];
      return -1;
    }
    return idx;
  }

  // 当用户手改某框时,清掉所有指向该框的 advice 映射
  function clearAdviceMapForOrder(slot, idx) {
    const data = localState.slots[slot];
    Object.keys(data.fromAdvice).forEach(k => {
      if (data.fromAdvice[k] === idx) delete data.fromAdvice[k];
    });
  }

  // 通知 PR5 模块重渲染建议区
  // 若 PR5 尚未加载,本调用静默忽略
  function notifyAdviceMaybeChanged(slot) {
    if (window.SGAdvice && typeof window.SGAdvice.render === 'function') {
      try { window.SGAdvice.render(); } catch (e) {}
    }
  }

  // 暴露给外部读取:当前 slot 的锁定状态
  function isSlotLocked(slot) {
    if (slot < 0 || slot > 2) return false;
    return !!localState.slots[slot].locked;
  }

  // 暴露格式化的「行动名 / 行动名 - 分支名」串构造器,供 PR5 直接调
  // 这里只是一个纯函数,不依赖内部 state,放这里集中维护文案规约
  function buildAcceptText(actionName, branchName) {
    const a = (actionName || '').trim();
    const b = (branchName || '').trim();
    if (a && b) return `${a} - ${b}`;
    return a;
  }

  window.SGArmyCouncil = {
    acceptToFirstEmpty,
    undoAccept,
    findAcceptedOrderIdx,
    isSlotLocked,
    buildAcceptText,
  };

  /* ─────────────────────────────────────────────
     启动
  ───────────────────────────────────────────── */
  // 切换 tab 时刷新玩家名(沿用旧版)
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-tab="arena"]');
    if (btn) setTimeout(refreshPlayerNames, 50);
  });

  // 主模块完成数据加载后刷新(玩家名/称号可能在此时变更)
  window.addEventListener('sg-rounds-updated', () => {
    refreshPlayerNames();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();