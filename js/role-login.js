/* ============================================================
   role-login.js · 身份登录系统 v1.0
   ------------------------------------------------------------
   表结构(已建好):
     public.player_roles(id uuid, role text, password_hash text,
                         registered_at timestamptz, UNIQUE(role))

   逻辑:
   - 检查 localStorage.sg_role,有 → 跳过浮层,直接进入
   - 无 → 拉取 player_roles 全表 → 判断哪些身份已被占用
   - 首次进入(未占用全部 3 个) → 浮层显示"选身份+设口令"模式
   - 全部占用 → 浮层显示"输口令登录"模式
   - 口令前端 SHA-256 hash 后存/比对
   - 至少 4 字符
   ============================================================ */

(function () {
  'use strict';

  const BASE_URL = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/player_roles';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
  const HEADERS = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
  const MIN_PWD = 4;
  const LS_KEY = 'sg_role';

  let occupiedRoles = []; // ['甲','乙'] 等
  let mode = 'register';  // 'register' | 'login'
  let selectedRole = null;

  // ── SHA-256 hash(浏览器原生 SubtleCrypto)──
  async function sha256(text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── 拉取已注册身份 ──
  async function fetchOccupied() {
    try {
      const res = await fetch(BASE_URL + '?select=role', { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      occupiedRoles = rows.map(r => r.role);
      return true;
    } catch (e) {
      console.error('[role-login] fetchOccupied failed:', e);
      return false;
    }
  }

  // ── 注册新身份 ──
  async function registerRole(role, password) {
    const hash = await sha256(password);
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ role, password_hash: hash }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || ('HTTP ' + res.status));
    }
    return true;
  }

  // ── 登录(输口令识别身份)──
  async function loginByPassword(password) {
    const hash = await sha256(password);
    const res = await fetch(BASE_URL + '?select=role,password_hash', { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    const matched = rows.find(r => r.password_hash === hash);
    return matched ? matched.role : null;
  }

  // ── 按指定身份登录(比对该身份的口令 hash)──
  async function loginBySpecificRole(role, password) {
    const hash = await sha256(password);
    const res = await fetch(BASE_URL + '?select=role,password_hash&role=eq.' + encodeURIComponent(role), { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!rows.length) return null;
    return rows[0].password_hash === hash ? rows[0].role : null;
  }

  // ── 显示浮层 ──
  function showOverlay() {
    const overlay = document.getElementById('role-login-overlay');
    if (overlay) overlay.classList.add('show');
  }
  function hideOverlay() {
    const overlay = document.getElementById('role-login-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  // ── 渲染浮层内容(统一混合模式)──
  function renderOverlay() {
    const inner = document.getElementById('role-login-inner');
    if (!inner) return;

    // 默认无身份选中,等用户点
    if (selectedRole === null) selectedRole = '';

    const roleBtns = ['甲','乙','丙'].map(r => {
      const occ = occupiedRoles.includes(r);
      const sel = selectedRole === r;
      // 占用态:仍可点,加 "·已注册" 提示,样式偏暗但不 disabled
      return `<button class="rl-role-btn ${occ ? 'rl-registered' : ''} ${sel ? 'rl-selected' : ''}"
        data-role="${r}" data-occ="${occ ? '1' : '0'}">${r}${occ ? ' · 已注册' : ''}</button>`;
    }).join('');

    // 根据当前选中的身份动态切换 placeholder / 按钮文字
    let placeholder, btnText, hintText;
    if (!selectedRole) {
      placeholder = `请先选择身份`;
      btnText     = `进 入`;
      hintText    = `首次选择身份将设定口令<br>之后可在任意设备用同一口令登录`;
    } else {
      const isOcc = occupiedRoles.includes(selectedRole);
      if (isOcc) {
        placeholder = `请输入「${selectedRole}」的口令登录`;
        btnText     = `登录进入`;
        hintText    = `该身份已在其他设备注册<br>输入正确口令即可在本设备登录`;
      } else {
        placeholder = `为「${selectedRole}」设置口令(至少 ${MIN_PWD} 字符)`;
        btnText     = `注册并进入`;
        hintText    = `口令一旦设定无法找回,请记牢<br>之后可在任意设备用此口令登录`;
      }
    }

    inner.innerHTML = `
      <div class="rl-icon">⚔️</div>
      <div class="rl-title">密报阁</div>
      <div class="rl-sub">请选择身份并输入口令</div>
      <div class="rl-role-group">${roleBtns}</div>
      <input type="password" class="rl-input" id="rl-pwd" placeholder="${placeholder}" autocomplete="off" />
      <div class="rl-error" id="rl-err"></div>
      <button class="rl-btn" id="rl-submit">${btnText}</button>
      <div class="rl-hint">${hintText}</div>
    `;

    // 身份按钮点击 → 更新 selectedRole → 重渲染(刷新 placeholder/按钮文字)
    inner.querySelectorAll('.rl-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedRole = btn.dataset.role;
        renderOverlay();
      });
    });

    const submitBtn = document.getElementById('rl-submit');
    const pwdInput  = document.getElementById('rl-pwd');
    if (submitBtn) submitBtn.addEventListener('click', onSubmit);
    if (pwdInput) pwdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') onSubmit();
    });
    setTimeout(() => { if (pwdInput) pwdInput.focus(); }, 80);
  }

  // ── 错误提示 ──
  function showError(msg) {
    const err = document.getElementById('rl-err');
    const input = document.getElementById('rl-pwd');
    if (err) err.textContent = msg;
    if (input) {
      input.classList.add('rl-error-shake');
      setTimeout(() => input.classList.remove('rl-error-shake'), 400);
    }
  }

  // ── 提交(按身份占用状态分流)──
  async function onSubmit() {
    const pwd = (document.getElementById('rl-pwd') || {}).value || '';
    const errEl = document.getElementById('rl-err');
    if (errEl) errEl.textContent = '';

    if (!selectedRole) { showError('请先选择身份'); return; }
    if (pwd.length < MIN_PWD) { showError(`口令至少 ${MIN_PWD} 字符`); return; }

    const submitBtn = document.getElementById('rl-submit');
    const isOcc = occupiedRoles.includes(selectedRole);
    const oldText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '处理中…'; }

    try {
      if (isOcc) {
        // 已占用 → 走登录流程,比对该身份口令
        const matchedRole = await loginBySpecificRole(selectedRole, pwd);
        if (!matchedRole) {
          showError(`「${selectedRole}」口令错误,请重试`);
          return;
        }
        localStorage.setItem(LS_KEY, matchedRole);
        hideOverlay();
        updateFooterRole();
        window.dispatchEvent(new CustomEvent('sg-role-changed', { detail: { role: matchedRole } }));
      } else {
        // 未占用 → 走注册流程
        await registerRole(selectedRole, pwd);
        localStorage.setItem(LS_KEY, selectedRole);
        hideOverlay();
        updateFooterRole();
        window.dispatchEvent(new CustomEvent('sg-role-changed', { detail: { role: selectedRole } }));
      }
    } catch (e) {
      showError('网络错误:' + e.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = oldText || '进 入';
      }
    }
  }

  // ── 更新页脚身份显示 ──
  function updateFooterRole() {
    const el = document.getElementById('role-footer-info');
    if (!el) return;
    const role = localStorage.getItem(LS_KEY);
    if (role) {
      el.innerHTML = `当前身份：<b>${role}</b> <button class="role-switch-btn" id="role-switch-btn">切换</button>`;
      const btn = document.getElementById('role-switch-btn');
      if (btn) btn.addEventListener('click', onSwitchRole);
    } else {
      el.textContent = '未登录';
    }
  }

  // ── 切换身份(清 localStorage 重新登录)──
  function onSwitchRole() {
    if (!confirm('确认切换身份？将重新登录。')) return;
    localStorage.removeItem(LS_KEY);
    init();
  }

  // ── 启动 ──
  async function init() {
    const role = localStorage.getItem(LS_KEY);
    updateFooterRole();
    if (role) {
      // 已登录,直接广播身份
      window.dispatchEvent(new CustomEvent('sg-role-changed', { detail: { role } }));
      return;
    }
    showOverlay();
    const ok = await fetchOccupied();
    if (!ok) {
      const inner = document.getElementById('role-login-inner');
      if (inner) inner.innerHTML = '<div class="rl-title">网络错误</div><div class="rl-sub">请刷新重试</div>';
      return;
    }
    renderOverlay();
  }

  // 暴露给其他模块读取当前身份
  window.SGRole = {
    get: () => localStorage.getItem(LS_KEY),
    refresh: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();