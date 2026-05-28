/* ============================================================
   secret-action.js  ·  加密行动板块  v1.0
   ------------------------------------------------------------
   表结构（需在 Supabase SQL Editor 执行一次）：

   CREATE TABLE IF NOT EXISTS public.secret_actions (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     slot       smallint NOT NULL CHECK (slot IN (0,1,2)),
     content    text     NOT NULL DEFAULT '',
     session_id text     NOT NULL DEFAULT '',
     submitted_at timestamptz DEFAULT now()
   );
   ALTER TABLE public.secret_actions ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "anon all" ON public.secret_actions FOR ALL USING (true) WITH CHECK (true);

   逻辑：
   - 每次打开页面生成一个 sessionId（存 sessionStorage），
     作为本回合"局"标识，避免跨回合串数据
   - 每个 slot (0/1/2) 提交后不可撤回，远端写入，本地锁定
   - 轮询检测三方是否全部提交
   - 全员提交后，一键复制按钮亮起；复制后自动清空本局所有行
   ============================================================ */

(function () {
  'use strict';

  /* ── 常量 ── */
  const BASE_URL  = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/secret_actions';
  const SUPA_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  const HEADERS   = {
    'apikey':        SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
  const POLL_MS   = 4000;   // 轮询间隔（毫秒）
  const MAX_CHARS = 2000;   // 单条行动最大字数

  /* ── 本局会话 ID（刷新重置）── */
  let sessionId = sessionStorage.getItem('sa_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('sa_session_id', sessionId);
  }

  /* ── 本地状态 ── */
  const localState = {
    submitted: [false, false, false],   // 本设备已提交
    contents:  ['', '', ''],            // 提交的文案（用于拼接）
    allDone:   false,                   // 三方全部提交
    pollTimer: null,
    tableError: false,                  // 表不存在
  };

  /* ── 工具函数 ── */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fetchSA(url, opts = {}, ms = 8000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }
  function saShowToast(msg) {
    const el = document.getElementById('toast');
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
     DOM 快捷获取
  ───────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  /* ─────────────────────────────────────────────
     初始化入口（等 DOM ready）
  ───────────────────────────────────────────── */
  function init() {
    bindUI();
    refreshPlayerNames();   // 读取主模块中已渲染的玩家名
    startPoll();
    checkTableExists();
  }

  /* ─────────────────────────────────────────────
     绑定 UI 事件
  ───────────────────────────────────────────── */
  function bindUI() {
    // 三个提交按钮
    [0, 1, 2].forEach(slot => {
      const btn = $(`sa-submit-${slot}`);
      if (btn) btn.addEventListener('click', () => onSubmit(slot));
    });

    // 一键复制
    const copyBtn = $('sa-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', onCopyAll);

    // 新建一局（重置本地 session，重新开始）
    const newBtn = $('sa-new-session');
    if (newBtn) newBtn.addEventListener('click', onNewSession);

    // 字符计数
    [0, 1, 2].forEach(slot => {
      const ta = $(`sa-ta-${slot}`);
      const counter = $(`sa-char-count-${slot}`);
      if (ta && counter) {
        ta.addEventListener('input', () => {
          const len = ta.value.length;
          counter.textContent = `${len} / ${MAX_CHARS}`;
          counter.classList.toggle('sa-char-warn', len > MAX_CHARS * 0.85);
        });
      }
    });
  }

  /* ─────────────────────────────────────────────
     从主模块读取玩家名并更新卡头
  ───────────────────────────────────────────── */
  function refreshPlayerNames() {
    [0, 1, 2].forEach(slot => {
      // 读 pcard 上已渲染的玩家名
      const nameEl = document.getElementById(`pname-${slot}`);
      const name   = nameEl ? nameEl.textContent.trim() : `城主${'甲乙丙'[slot]}`;

      // 卡头名字
      const headEl = $(`sa-player-name-${slot}`);
      if (headEl) headEl.textContent = name;

      // 状态栏名字
      const statusNameEl = $(`sa-player-name-status-${slot}`);
      if (statusNameEl) statusNameEl.textContent = name;

      // textarea label
      const labelEl = $(`sa-label-${slot}`);
      if (labelEl) labelEl.textContent = `${name} 的行动`;
    });
  }

  /* ─────────────────────────────────────────────
     检查表是否存在
  ───────────────────────────────────────────── */
  async function checkTableExists() {
    try {
      const res = await fetchSA(`${BASE_URL}?limit=0`, { headers: HEADERS }, 5000);
      if (res.status === 404 || res.status === 400) {
        localState.tableError = true;
        showTableError();
      }
    } catch (e) { /* 网络错误忽略 */ }
  }

  function showTableError() {
    const el = $('sa-table-error');
    if (el) el.classList.remove('hidden');
  }

  /* ─────────────────────────────────────────────
     提交行动（单个玩家）
  ───────────────────────────────────────────── */
  async function onSubmit(slot) {
    if (localState.submitted[slot]) return;
    if (localState.tableError) {
      saShowToast('⚠️ 数据表未就绪，请先建表');
      return;
    }

    const ta = $(`sa-ta-${slot}`);
    const content = ta ? ta.value.trim() : '';
    if (!content) { saShowToast('⚠️ 请先填写行动内容'); return; }
    if (content.length > MAX_CHARS) { saShowToast(`⚠️ 超出 ${MAX_CHARS} 字上限`); return; }

    const btn = $(`sa-submit-${slot}`);
    if (btn) { btn.disabled = true; btn.textContent = '提交中…'; }

    try {
      // 先删除本 session 该 slot 的旧记录（幂等）
      await fetchSA(
        `${BASE_URL}?session_id=eq.${encodeURIComponent(sessionId)}&slot=eq.${slot}`,
        { method: 'DELETE', headers: HEADERS }, 5000
      );
      // 写入新记录
      const res = await fetchSA(BASE_URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ slot, content, session_id: sessionId }),
      }, 8000);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.status);
      }

      // 本地锁定
      localState.submitted[slot] = true;
      localState.contents[slot]  = content;
      lockSlot(slot);
      updateProgress();
      saShowToast('✅ 行动已封印，不可更改');

    } catch (e) {
      saShowToast('❌ 提交失败：' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = '封印行动 🔒'; }
    }
  }

  /* ─────────────────────────────────────────────
     锁定单个槽位 UI
  ───────────────────────────────────────────── */
  function lockSlot(slot) {
    const ta  = $(`sa-ta-${slot}`);
    const btn = $(`sa-submit-${slot}`);
    const card = $(`sa-card-${slot}`);
    const mask = $(`sa-locked-mask-${slot}`);

    if (ta)   { ta.disabled = true; ta.value = ''; }  // 清空显示，内容已上云
    if (btn)  { btn.disabled = true; btn.textContent = '已封印 🔒'; btn.classList.add('sa-btn-locked'); }
    if (card) card.classList.add('sa-card-locked');
    if (mask) mask.classList.remove('hidden');
  }

  /* ─────────────────────────────────────────────
     进度更新（徽章数量）
  ───────────────────────────────────────────── */
  function updateProgress() {
    const count = localState.submitted.filter(Boolean).length;
    const badge = $('sa-progress-badge');
    if (badge) badge.textContent = `${count} / 3`;

    // 同步本地已知的远端状态
    renderReadyState(localState.remoteSlots || []);
  }

  /* ─────────────────────────────────────────────
     轮询：检测三方是否全部提交
  ───────────────────────────────────────────── */
  function startPoll() {
    if (localState.pollTimer) clearInterval(localState.pollTimer);
    localState.pollTimer = setInterval(pollRemote, POLL_MS);
    pollRemote(); // 立即执行一次
  }

  async function pollRemote() {
    if (localState.allDone) return;
    try {
      const res = await fetchSA(
        `${BASE_URL}?session_id=eq.${encodeURIComponent(sessionId)}&select=slot,content&order=slot.asc`,
        { headers: { ...HEADERS, 'Prefer': '' } }, 6000
      );
      if (!res.ok) return;
      const rows = await res.json();

      // 记录已提交的 slots（远端）
      const slots = rows.map(r => Number(r.slot));
      localState.remoteSlots = slots;

      // 远端已提交但本地未知的 → 更新本地状态（其他设备提交的）
      slots.forEach(s => {
        if (!localState.submitted[s]) {
          localState.submitted[s] = true;
          lockSlot(s);
        }
      });

      renderReadyState(slots);

      if (slots.length >= 3) {
        // 三方全部提交：缓存内容，亮起复制按钮
        rows.forEach(r => { localState.contents[Number(r.slot)] = r.content; });
        onAllReady();
      }

      updateProgress();
    } catch (e) { /* 网络抖动忽略 */ }
  }

  /* ─────────────────────────────────────────────
     渲染各槽状态（远端已提交 ≠ 本设备提交）
  ───────────────────────────────────────────── */
  function renderReadyState(slots) {
    [0, 1, 2].forEach(slot => {
      const dot = $(`sa-status-dot-${slot}`);
      const txt = $(`sa-status-txt-${slot}`);
      const done = slots.includes(slot);
      if (dot) dot.className = 'sa-status-dot' + (done ? ' sa-dot-done' : ' sa-dot-pending');
      if (txt) txt.textContent = done ? '已封印' : '待行动';
    });
  }

  /* ─────────────────────────────────────────────
     三方全部就绪
  ───────────────────────────────────────────── */
  function onAllReady() {
    if (localState.allDone) return;
    localState.allDone = true;

    // 停止轮询
    clearInterval(localState.pollTimer);
    localState.pollTimer = null;

    // 亮起复制按钮
    const copyBtn = $('sa-copy-btn');
    if (copyBtn) {
      copyBtn.disabled = false;
      copyBtn.classList.add('sa-btn-ready');
    }

    // 全员状态区提示
    const allReadyBanner = $('sa-all-ready-banner');
    if (allReadyBanner) allReadyBanner.classList.remove('hidden');

    saShowToast('⚔️ 三方行动已全部封印！');
  }

  /* ─────────────────────────────────────────────
     一键复制
  ───────────────────────────────────────────── */
  async function onCopyAll() {
    const names = [0, 1, 2].map(slot => {
      const el = $(`sa-player-name-${slot}`);
      return el ? el.textContent.trim() : `城主${'甲乙丙'[slot]}`;
    });

    const text = [0, 1, 2].map(slot => {
      const name = names[slot];
      const content = (localState.contents[slot] || '').trim();
      return `【${name}】\n${content}`;
    }).join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      saShowToast('📋 已复制！正在清空云端记录…');

      // 复制成功后清空云端
      await clearRemote();

      // 重置本局
      resetLocal();
      saShowToast('✅ 云端已清空，可开始下一轮');

    } catch (e) {
      // 降级：弹出文本框让用户手动复制
      showFallbackCopy(text);
    }
  }

  /* ─────────────────────────────────────────────
     清空云端本局记录
  ───────────────────────────────────────────── */
  async function clearRemote() {
    try {
      await fetchSA(
        `${BASE_URL}?session_id=eq.${encodeURIComponent(sessionId)}`,
        { method: 'DELETE', headers: HEADERS }, 8000
      );
    } catch (e) { /* 清空失败不影响体验 */ }
  }

  /* ─────────────────────────────────────────────
     重置本地，开启新一轮
  ───────────────────────────────────────────── */
  function resetLocal() {
    localState.submitted = [false, false, false];
    localState.contents  = ['', '', ''];
    localState.allDone   = false;
    localState.remoteSlots = [];

    // 生成新 sessionId
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('sa_session_id', sessionId);

    // 恢复 UI
    [0, 1, 2].forEach(slot => {
      const ta   = $(`sa-ta-${slot}`);
      const btn  = $(`sa-submit-${slot}`);
      const card = $(`sa-card-${slot}`);
      const mask = $(`sa-locked-mask-${slot}`);

      if (ta)   { ta.disabled = false; ta.value = ''; }
      if (btn)  { btn.disabled = false; btn.textContent = '封印行动 🔒'; btn.classList.remove('sa-btn-locked'); }
      if (card) card.classList.remove('sa-card-locked');
      if (mask) mask.classList.add('hidden');
    });

    const copyBtn = $('sa-copy-btn');
    if (copyBtn) { copyBtn.disabled = true; copyBtn.classList.remove('sa-btn-ready'); }

    const banner = $('sa-all-ready-banner');
    if (banner) banner.classList.add('hidden');

    // 重置进度
    const badge = $('sa-progress-badge');
    if (badge) badge.textContent = '0 / 3';

    renderReadyState([]);
    updateProgress();

    // 重新轮询
    startPoll();
  }

  /* ─────────────────────────────────────────────
     新建一局（手动）
  ───────────────────────────────────────────── */
  async function onNewSession() {
    const ok = confirm('确认清空当前所有行动，开始新一轮？\n（此操作不可撤回）');
    if (!ok) return;
    await clearRemote();
    resetLocal();
    saShowToast('🆕 新一轮已开始');
  }

  /* ─────────────────────────────────────────────
     降级复制（不支持 clipboard API 时）
  ───────────────────────────────────────────── */
  function showFallbackCopy(text) {
    const overlay = $('sa-fallback-overlay');
    const ta      = $('sa-fallback-ta');
    if (overlay) overlay.classList.remove('hidden');
    if (ta) {
      ta.value = text;
      ta.select();
    }
  }

  /* ─────────────────────────────────────────────
     当切换到"加密行动"tab 时刷新玩家名
  ───────────────────────────────────────────── */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-tab="secret"]');
    if (btn) {
      setTimeout(refreshPlayerNames, 50); // 等主模块渲染完
    }
  });

  /* ─────────────────────────────────────────────
     关闭降级弹窗
  ───────────────────────────────────────────── */
  document.addEventListener('click', e => {
    if (e.target.id === 'sa-fallback-close' || e.target.id === 'sa-fallback-overlay') {
      const overlay = $('sa-fallback-overlay');
      if (overlay) overlay.classList.add('hidden');
    }
  });

  /* ─────────────────────────────────────────────
     启动
  ───────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
