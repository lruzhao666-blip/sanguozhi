/* ============================================================
   secret-bureau.js · 密报阁渲染模块 v1.0
   ------------------------------------------------------------
   数据源:
   - 当前回合: window.SGState.rounds[last].parsed.secrets
   - 历史回合: window.SGState.rounds[].parsed.secrets

   身份源:
   - window.SGRole.get() → '甲' | '乙' | '丙' | null
   - 监听 sg-role-changed 事件触发重渲染

   回合源:
   - 监听 sg-rounds-updated 事件触发重渲染

   渲染规则:
   - 当前玩家在 secret.slots 内 → 渲染
   - 否则跳过
   - 密令选项 isCmd:true → 渲染为按钮卡
   - 普通密报 → 渲染为文字卡
   - 共享密报(slots.length > 1)→ 标题区追加 🤝 标记
   ============================================================ */

(function () {
  'use strict';

  // ── 工具:HTML 转义 ──
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 工具:Toast ──
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(el._sbTimer);
    el._sbTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 320);
    }, 2400);
  }

  // ── 取当前身份 ──
  function getCurrentRole() {
    return (window.SGRole && SGRole.get) ? SGRole.get() : null;
  }

  // ── 取回合数据(从 main.js 暴露的 SGState 读)──
  function getRounds() {
    if (!window.SGState || !Array.isArray(SGState.rounds)) return [];
    return SGState.rounds;
  }

  // ── 过滤密报:仅返回当前玩家可见的 ──
  function filterSecrets(secrets, role) {
    if (!Array.isArray(secrets) || !role) return [];
    return secrets.filter(s => Array.isArray(s.slots) && s.slots.indexOf(role) !== -1);
  }

  // ── 复制密令到剪贴板 ──
  function copyCmd(name, note) {
    const text = '【密】' + name + (note ? ' —— ' + note : '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast('📋 已复制密令'),
        () => fallbackCopy(text)
      );
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('📋 已复制密令'); }
    catch (e) { showToast('⚠️ 复制失败'); }
    document.body.removeChild(ta);
  }

  // 暴露给 onclick 用
  window.__sbCopyCmd = copyCmd;

  // ── 渲染单条普通密报 ──
  function renderSecretItem(s, currentRole) {
    const isShared = Array.isArray(s.slots) && s.slots.length > 1;
    let sharedTagHtml = '';
    if (isShared) {
      const others = s.slots.filter(x => x !== currentRole);
      const withWho = others.join('、');
      // data-with 用第一个 other 决定底色(玩家色)
      const dataWith = others[0] || '';
      sharedTagHtml = `<span class="si-shared-tag" data-with="${esc(dataWith)}">🤝 与${esc(withWho)}共享</span>`;
    }
    const bodyHtml = esc(s.body || '').replace(/\n/g, '<br>');
    return `
      <div class="secret-item">
        <div class="si-head">
          <span class="si-lock">🔒</span>
          <span class="si-title">${esc(s.title || '密报')}</span>
          ${sharedTagHtml}
        </div>
        <div class="si-body">${bodyHtml}</div>
      </div>
    `;
  }

  // ── 渲染密令选项块(整块封装) ──
  // [secret-adopt-v1] 复制按钮 → 采纳按钮(对齐军帐 SGAdvice 交互)
  // 行为:点击 → 调 SGArmyCouncil.acceptToFirstEmpty(slot, text, adviceKey, {secret:true})
  //       已采纳 → 显示"撤销"按钮 + "✓ 已采纳到 N 军令框"标签
  //       槽位锁定 → 按钮 disabled
  /* [legacy v1]
  function renderCmdBlock(s, currentRole, roundNum, secretIdx) {
    const items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) return '';

    const ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
    const ICONS = ['①','②','③','④'];
    const slot = ROLE_TO_SLOT[currentRole];
    const hasSAC = !!(window.SGArmyCouncil);
    const locked = hasSAC && typeof SGArmyCouncil.isSlotLocked === 'function'
      ? SGArmyCouncil.isSlotLocked(slot) : false;

    const html = items.map((it, itemIdx) => {
      const name = it.name || '';
      const note = it.note || '';
      const num  = it.num  || '';
      const adviceKey = `secret::r${roundNum}::s${secretIdx}::i${itemIdx}`;

      // 反查是否已采纳
      let acceptedOrderIdx = -1;
      if (hasSAC && typeof SGArmyCouncil.findAcceptedOrderIdx === 'function' && slot !== undefined) {
        try { acceptedOrderIdx = SGArmyCouncil.findAcceptedOrderIdx(slot, adviceKey); }
        catch (e) { acceptedOrderIdx = -1; }
      }
      const isAccepted = acceptedOrderIdx >= 0;

      // 按钮 HTML(使用独立类 .sb-cmd-adopt-btn,视觉规格照搬军帐采纳按钮)
      let btnHtml;
      if (isAccepted) {
        btnHtml = `<button class="sb-cmd-adopt-btn is-undo"
          data-act="undo" data-advice-key="${esc(adviceKey)}"
          data-name="${esc(name)}" data-note="${esc(note)}"
          ${locked ? 'disabled' : ''}>撤销</button>`;
      } else {
        btnHtml = `<button class="sb-cmd-adopt-btn"
          data-act="accept" data-advice-key="${esc(adviceKey)}"
          data-name="${esc(name)}" data-note="${esc(note)}"
          ${locked ? 'disabled' : ''}>采纳</button>`;
      }

      // 已采纳标签(使用独立类 .sb-cmd-accepted-tag)
      const acceptedTag = isAccepted
        ? `<span class="sb-cmd-accepted-tag">✓ 已采纳到 ${ICONS[acceptedOrderIdx] || (acceptedOrderIdx + 1)} 军令框</span>`
        : '';

      return \`
        <div class="sb-cmd-row\${isAccepted ? ' is-accepted' : ''}">
          <span class="sb-cmd-num">\${esc(num)}</span>
          <span class="sb-cmd-name">\${esc(name)}</span>
          \${note ? \`<span class="sb-cmd-sep">——</span><span class="sb-cmd-note">\${esc(note)}</span>\` : ''}
          \${acceptedTag}
          \${btnHtml}
        </div>
      \`;
    }).join('');
    return html;
  }
  */
  function renderCmdBlock(s, currentRole, roundNum, secretIdx) {
    const items = Array.isArray(s.items) ? s.items : [];
    if (!items.length) return '';

    const ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
    const ICONS = ['①','②','③','④','⑤','⑥'];
    const slot = ROLE_TO_SLOT[currentRole];
    const hasSAC = !!(window.SGArmyCouncil);
    const locked = hasSAC && typeof SGArmyCouncil.isSlotLocked === 'function'
      ? SGArmyCouncil.isSlotLocked(slot) : false;

    let html = '<div class="sa-advice-list">';
    items.forEach((it, itemIdx) => {
      const name = it.name || '';
      const note = it.note || '';
      const num  = it.num  || ICONS[itemIdx] || '';
      const branches = Array.isArray(it.branches) ? it.branches : [];
      const hasBranch = branches.length > 0;
      const adviceKey = `secret::r${roundNum}::s${secretIdx}::i${itemIdx}`;

      // 反查是否已采纳
      let acceptedOrderIdx = -1;
      if (hasSAC && typeof SGArmyCouncil.findAcceptedOrderIdx === 'function' && slot !== undefined) {
        try { acceptedOrderIdx = SGArmyCouncil.findAcceptedOrderIdx(slot, adviceKey); }
        catch (e) { acceptedOrderIdx = -1; }
      }
      const isAccepted = acceptedOrderIdx >= 0;

      html += `<div class="sa-advice-card${isAccepted ? ' is-accepted' : ''}" data-advice-key="${esc(adviceKey)}" data-idx="${itemIdx}">`;
      html += `<div>`;

      // 头部
      html += `<div class="sa-advice-head">`;
      html += `<span class="sa-advice-num">${esc(num)}</span>`;
      html += `<span class="sa-advice-name">${esc(name)}</span>`;
      if (isAccepted) {
        const orderNum = ICONS[acceptedOrderIdx] || (acceptedOrderIdx + 1);
        html += `<span class="sa-advice-accepted-tag">✓ 已采纳到 ${orderNum} 军令框</span>`;
      }
      html += `</div>`;

      // 注解
      if (note) {
        html += `<div class="sa-advice-note">${esc(note)}</div>`;
      }

      // 分支列表
      if (hasBranch) {
        html += `<div class="sa-advice-branches">`;
        branches.forEach(br => {
          html += `<div class="sa-advice-branch">`;
          html += `<span class="sa-advice-branch-label">${esc(br.key)}</span>`;
          html += `<span class="sa-advice-branch-text">${esc(br.text)}</span>`;
          html += `</div>`;
        });
        html += `</div>`;
      }

      html += `</div>`;

      // 操作按钮区
      html += `<div class="sa-advice-actions">`;
      if (isAccepted) {
        html += `<button class="sa-advice-btn is-undo sb-cmd-adopt-btn" data-act="undo" data-advice-key="${esc(adviceKey)}" data-name="${esc(name)}" data-note="${esc(note)}"${locked ? ' disabled' : ''}>撤销</button>`;
      } else {
        html += `<button class="sa-advice-btn sb-cmd-adopt-btn" data-act="${hasBranch ? 'accept-branch' : 'accept'}" data-advice-key="${esc(adviceKey)}" data-name="${esc(name)}" data-note="${esc(note)}" data-branches='${hasBranch ? JSON.stringify(branches).replace(/'/g, "&#39;") : ""}'${locked ? ' disabled' : ''}>${hasBranch ? '采纳…' : '采纳'}</button>`;
      }
      html += `</div>`;

      html += `</div>`;
    });
    html += '</div>';
    return html;
  }

  // ── 渲染主入口 ──
  function render() {
    const block = document.getElementById('block-secret-bureau');
    const body  = document.getElementById('secret-bureau-body');
    const meta  = document.getElementById('sb-meta-role');
    if (!block || !body) return;

    const role = getCurrentRole();

    // 未登录:整块隐藏
    if (!role) {
      block.classList.add('hidden');
      return;
    }
    block.classList.remove('hidden');
    if (meta) meta.innerHTML = '当前身份 · <b>' + esc(role) + '</b>';

    const rounds = getRounds();
    if (!rounds.length) {
      body.innerHTML = `
        <div class="sb-empty">
          <div class="sb-empty-icon">🔒</div>
          <div class="sb-empty-title">尚未开局</div>
          <div class="sb-empty-sub">等待 GM 发布第一回合</div>
        </div>
      `;
      return;
    }

    // 当前回合密报(过滤当前身份)
    const latest = rounds[rounds.length - 1];
    const latestSecrets = filterSecrets(
      latest.parsed && latest.parsed.secrets, role
    );

    // 历史密报(除最后一回合,按回合倒序)
    const historyRounds = [];
    for (let i = rounds.length - 2; i >= 0; i--) {
      const rd = rounds[i];
      const items = filterSecrets(
        rd.parsed && rd.parsed.secrets, role
      );
      if (items.length) historyRounds.push({ round: rd.round, items });
    }

    // ── 构建当前回合区 ──
    let bodyHtml = '';

    if (latestSecrets.length) {
      const normalSecrets = latestSecrets.filter(s => !s.isCmd);
      const cmdSecrets    = latestSecrets.filter(s => s.isCmd);

      if (normalSecrets.length) {
        bodyHtml += '<div class="sb-group">';
        bodyHtml += '<div class="sb-group-title">本回合密报</div>';
        bodyHtml += normalSecrets.map(s => renderSecretItem(s, role)).join('');
        bodyHtml += '</div>';
      }

      if (cmdSecrets.length) {
        bodyHtml += '<div class="sb-group">';
        bodyHtml += '<div class="sb-group-title">密令选项</div>';
        // [secret-adopt-v1] 传入 role / round / secretIdx 用于构造 adviceKey
        // secretIdx 需基于过滤前的原数组定位,避免 normal/cmd 拆分后索引错位
        const allSecrets = (latest.parsed && latest.parsed.secrets) || [];
        bodyHtml += cmdSecrets.map(s => {
          const secretIdx = allSecrets.indexOf(s);
          return renderCmdBlock(s, role, latest.round, secretIdx);
        }).join('');
        bodyHtml += '</div>';
      }
    } else {
      bodyHtml += `
        <div class="sb-empty">
          <div class="sb-empty-icon">🔒</div>
          <div class="sb-empty-title">本回合无密报</div>
          <div class="sb-empty-sub">明面层已包含你所需的全部信息</div>
        </div>
      `;
    }

    // ── 历史密报折叠区 ──
    if (historyRounds.length) {
      // [cmd-polish-1] 排除密令选项,徽章数应 = 实际渲染数(历史密令不重复渲染)
      const totalCount = historyRounds.reduce(
        (a, b) => a + b.items.filter(s => !s.isCmd).length,
        0
      );
      bodyHtml += `
        <details class="sb-history">
          <summary>📜 历史密报
            <span class="sb-history-badge">${totalCount} 条 · 跨 ${historyRounds.length} 回合</span>
          </summary>
          <div class="sb-history-body">
            ${historyRounds.map(hr => `
              <div class="sb-history-round">
                <div class="sb-history-round-label">第 ${esc(hr.round)} 回合</div>
                ${hr.items.map(s => {
                  if (s.isCmd) return ''; // 历史密令不重复渲染(已无操作意义)
                  return renderSecretItem(s, role);
                }).join('')}
              </div>
            `).join('')}
          </div>
        </details>
      `;
    }

    body.innerHTML = bodyHtml;
  }

  // ── 监听身份变化 + 回合更新 ──
  window.addEventListener('sg-role-changed', render);
  window.addEventListener('sg-rounds-updated', render);

  // ── 启动:首次渲染(等 DOM + main.js 都就绪)──
  function init() {
    render();
    // 再延一帧,确保 main.js 的 loadFromCloud 至少跑过一轮
    setTimeout(render, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── [secret-adopt-v1] 采纳/撤销事件委托 ──
  // 委托到 #secret-bureau-body,处理 .sb-cmd-adopt-btn 点击
  function bindAdoptEvents() {
    const body = document.getElementById('secret-bureau-body');
    if (!body || body._sbAdoptBound) return;
    body._sbAdoptBound = true;

    body.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.sb-cmd-adopt-btn');
      if (!btn || btn.disabled) return;

      const SAC = window.SGArmyCouncil;
      if (!SAC) { showToast('⚠️ 军帐模块未就绪'); return; }

      const role = getCurrentRole();
      const ROLE_TO_SLOT = { '甲': 0, '乙': 1, '丙': 2 };
      const slot = ROLE_TO_SLOT[role];
      if (slot === undefined) { showToast('⚠️ 请先登录身份'); return; }

      if (typeof SAC.isSlotLocked === 'function' && SAC.isSlotLocked(slot)) {
        showToast('⚠️ 该方军令已锁定,请先解除锁定');
        return;
      }

      const act = btn.getAttribute('data-act');
      const adviceKey = btn.getAttribute('data-advice-key');
      const name = btn.getAttribute('data-name') || '';
      const note = btn.getAttribute('data-note') || '';

      if (act === 'undo') {
        SAC.undoAccept(slot, adviceKey);
        render();
        showToast('✓ 已撤销采纳');
        return;
      }

      if (act === 'accept-branch') {
        // 有分支:复用军帐弹窗 #sa-branch-overlay
        const branchesRaw = btn.getAttribute('data-branches') || '[]';
        let branches = [];
        try { branches = JSON.parse(branchesRaw); } catch (e) { branches = []; }
        if (!branches.length) {
          // 降级:无分支数据则当普通采纳
          const text = (typeof SAC.buildAcceptText === 'function')
            ? SAC.buildAcceptText(name, note)
            : (note ? name + ' - ' + note : name);
          const r = SAC.acceptToFirstEmpty(slot, text, adviceKey, { secret: true });
          _handleAdoptResult(r);
          return;
        }
        // 打开分支弹窗
        _openBranchModal(slot, adviceKey, name, note, branches);
        return;
      }

      if (act === 'accept') {
        const text = (typeof SAC.buildAcceptText === 'function')
          ? SAC.buildAcceptText(name, note)
          : (note ? `${name} - ${note}` : name);
        const ICONS = ['①','②','③','④'];
        // 第 4 参数 {secret:true} 让采纳后默认勾选密令
        const r = SAC.acceptToFirstEmpty(slot, text, adviceKey, { secret: true });
        if (r && r.ok) {
          render();
          const orderNum = ICONS[r.orderIdx] || (r.orderIdx + 1);
          showToast(`✓ 已采纳到 ${orderNum} 军令框`);
        } else if (r && r.reason === 'full') {
          showToast('⚠️ 军令已满,请先清空一个框再采纳');
        } else if (r && r.reason === 'locked') {
          showToast('⚠️ 该方军令已锁定,请先解除锁定');
        } else {
          showToast('⚠️ 采纳失败');
        }
      }
    });
  }

  // ── 分支弹窗(复用 #sa-branch-overlay)──
  function _openBranchModal(slot, adviceKey, name, note, branches) {
    const overlay = document.getElementById('sa-branch-overlay');
    const titleEl = document.getElementById('sa-branch-title');
    const optsEl  = document.getElementById('sa-branch-options');
    const confirmBtn = document.getElementById('sa-branch-confirm');
    const cancelBtn  = document.getElementById('sa-branch-cancel');

    if (!overlay || !optsEl || !confirmBtn) {
      // DOM 不存在 → 降级 prompt
      const keys = branches.map(b => b.key).join('/');
      const pick = (prompt('选择「' + name + '」的分支(' + keys + '):', branches[0].key) || '').trim().toUpperCase();
      const br = branches.find(b => b.key === pick);
      if (!br) return;
      _doAcceptWithBranch(slot, adviceKey, name, note, br);
      return;
    }

    if (titleEl) titleEl.textContent = '选择「' + name + '」的分支';

    let html = '';
    branches.forEach(br => {
      html += '<div class="sa-branch-opt" data-key="' + esc(br.key) + '">';
      html += '<div class="sa-branch-opt-radio"></div>';
      html += '<div class="sa-branch-opt-body">';
      html += '<div class="sa-branch-opt-label">' + esc(br.key) + '</div>';
      html += '<div class="sa-branch-opt-text">' + esc(br.text) + '</div>';
      html += '</div></div>';
    });
    optsEl.innerHTML = html;
    confirmBtn.disabled = true;
    overlay.classList.remove('hidden');

    // 状态
    const state = { slot, adviceKey, name, note, branches, selectedKey: null };

    // 选项点击(每次重绑,用一次性 handler)
    const optHandler = function (ev) {
      const opt = ev.target.closest('.sa-branch-opt');
      if (!opt) return;
      state.selectedKey = opt.getAttribute('data-key');
      optsEl.querySelectorAll('.sa-branch-opt').forEach(el => {
        el.classList.toggle('selected', el.getAttribute('data-key') === state.selectedKey);
      });
      confirmBtn.disabled = false;
    };
    optsEl.addEventListener('click', optHandler);

    // 确定
    const confirmHandler = function () {
      if (!state.selectedKey) return;
      const br = state.branches.find(b => b.key === state.selectedKey);
      cleanup();
      if (br) _doAcceptWithBranch(state.slot, state.adviceKey, state.name, state.note, br);
    };
    confirmBtn.addEventListener('click', confirmHandler);

    // 取消
    const cancelHandler = function () { cleanup(); };
    if (cancelBtn) cancelBtn.addEventListener('click', cancelHandler);

    // 遮罩点击关闭
    const overlayHandler = function (ev) { if (ev.target === overlay) cleanup(); };
    overlay.addEventListener('click', overlayHandler);

    // ESC
    const escHandler = function (ev) { if (ev.key === 'Escape') cleanup(); };
    document.addEventListener('keydown', escHandler);

    function cleanup() {
      overlay.classList.add('hidden');
      optsEl.removeEventListener('click', optHandler);
      confirmBtn.removeEventListener('click', confirmHandler);
      if (cancelBtn) cancelBtn.removeEventListener('click', cancelHandler);
      overlay.removeEventListener('click', overlayHandler);
      document.removeEventListener('keydown', escHandler);
    }
  }

  function _doAcceptWithBranch(slot, adviceKey, name, note, br) {
    const SAC = window.SGArmyCouncil;
    if (!SAC || typeof SAC.acceptToFirstEmpty !== 'function') return;
    const text = (typeof SAC.buildAcceptText === 'function')
      ? SAC.buildAcceptText(name, br.text)
      : name + ' - ' + br.text;
    const r = SAC.acceptToFirstEmpty(slot, text, adviceKey, { secret: true });
    _handleAdoptResult(r);
  }

  function _handleAdoptResult(r) {
    const ICONS = ['①','②','③','④','⑤','⑥'];
    if (!r || typeof r !== 'object') { render(); return; }
    if (r.ok) {
      render();
      const orderNum = ICONS[r.orderIdx] || (r.orderIdx + 1);
      showToast('✓ 已采纳到 ' + orderNum + ' 军令框');
      return;
    }
    if (r.reason === 'full') {
      showToast('⚠️ 军令已满,请先清空一个框再采纳');
    } else if (r.reason === 'locked') {
      showToast('⚠️ 该方军令已锁定,请先解除锁定');
    } else {
      showToast('⚠️ 采纳失败');
    }
    render();
  }

  // 在 render() 后自动绑(幂等,只绑一次)
  const _origRender_sbAdopt = render;
  render = function () {
    _origRender_sbAdopt.apply(this, arguments);
    bindAdoptEvents();
  };

  // 暴露给其他模块手动触发
  window.SGSecretBureau = { render };
})();