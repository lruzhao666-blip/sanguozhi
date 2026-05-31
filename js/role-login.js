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

  // ── 显示浮层 ──
  function showOverlay() {
    const overlay = document.getElementById('role-login-overlay');
    if (overlay) overlay.classList.add('show');
  }
  function hideOverlay() {
    const overlay = document.getElementById('role-login-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  // ── 渲染浮层内容 ──
  function renderOverlay() {
    const inner = document.getElementById('role-login-inner');
    if (!inner) return;

    const allOccupied = occupiedRoles.length >= 3;
    mode = allOccupied ? 'login' : 'register';

    if (mode === 'login') {
      inner.innerHTML = `
        <div class="rl-icon">⚔️</div>
        <div class="rl-title">密报阁</div>
        <div class="rl-sub">请输入您的口令</div>
        <input type="password" class="rl-input" id="rl-pwd" placeholder="口令" autocomplete="off" />
        <div class="rl-error" id="rl-err"></div>
        <button class="rl-btn" id="rl-submit">进 入</button>
        <div class="rl-hint">忘记口令？请联系房主重置</div>
      `;
    } else {
      const roleBtns = ['甲','乙','丙'].map(r => {
        const occ = occupiedRoles.includes(r);
        return `<button class="rl-role-btn ${occ ? 'rl-occupied' : ''} ${selectedRole===r?'rl-selected':''}"
          data-role="${r}" ${occ?'disabled':''}>${r}${occ?' · 已占':''}</button>`;
      }).join('');
      inner.innerHTML = `
        <div class="rl-icon">⚔️</div>
        <div class="rl-title">密报阁</div>
        <div class="rl-sub">请选择身份并设置口令</div>
        <div class="rl-role-group">${roleBtns}</div>
        <input type="password" class="rl-input" id="rl-pwd" placeholder="口令(至少 ${MIN_PWD} 字符)" autocomplete="off" />
        <div class="rl-error" id="rl-err"></div>
        <button class="rl-btn" id="rl-submit">注册并进入</button>
        <div class="rl-hint">口令一旦设定无法找回，请记牢</div>
      `;
      inner.querySelectorAll('.rl-role-btn:not(.rl-occupied)').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedRole = btn.dataset.role;
          inner.querySelectorAll('.rl-role-btn').forEach(b => b.classList.remove('rl-selected'));
          btn.classList.add('rl-selected');
        });
      });
    }

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

  // ── 提交 ──
  async function onSubmit() {
    const pwd = (document.getElementById('rl-pwd') || {}).value || '';
    const errEl = document.getElementById('rl-err');
    if (errEl) errEl.textContent = '';

    if (pwd.length < MIN_PWD) { showError(`口令至少 ${MIN_PWD} 字符`); return; }

    const submitBtn = document.getElementById('rl-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '处理中…'; }

    try {
      if (mode === 'register') {
        if (!selectedRole) { showError('请先选择身份'); return; }
        await registerRole(selectedRole, pwd);
        localStorage.setItem(LS_KEY, selectedRole);
        hideOverlay();
        updateFooterRole();
        // 触发后续模块感知身份
        window.dispatchEvent(new CustomEvent('sg-role-changed', { detail: { role: selectedRole } }));
      } else {
        const role = await loginByPassword(pwd);
        if (!role) { showError('口令错误，请重试'); return; }
        localStorage.setItem(LS_KEY, role);
        hideOverlay();
        updateFooterRole();
        window.dispatchEvent(new CustomEvent('sg-role-changed', { detail: { role } }));
      }
    } catch (e) {
      showError('网络错误：' + e.message);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'register' ? '注册并进入' : '进 入';
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