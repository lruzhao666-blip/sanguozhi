import re

with open('js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Action Tab v2 module with Action Tab v3 module
pattern = re.compile(r'// ══════════════════════════════════════════\n\s*//\s*行动 Tab 模块 v2\n.*?// ── HTML 转义 ──.*?}\n', re.DOTALL)
replacement = r"""// ══════════════════════════════════════════
  //  行动 Tab 模块 v3
  //  工单 #action-collab-v1
  //  - 无身份验证，三家面板全部公开可操作
  //  - 每家独立提交按钮
  //  - 公共机遇与应变令联动
  //  - GM 录入台一键复制（三家全提交后亮起）
  // ══════════════════════════════════════════

  const ACTION_SUPA_URL = 'https://smiifcbmmtolimtaxpip.supabase.co/rest/v1/action_submissions';
  const SLOT_NAMES = ['甲', '乙', '丙'];

  // ── 绑定行动 tab 交互 ──
  function bindActionTab() {
    // 玩家 tab 切换
    const tabs = document.querySelectorAll('.cmd-ptab');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = parseInt(btn.dataset.slot);
        tabs.forEach(b => b.classList.toggle('active', b === btn));
        for (let i = 0; i < 3; i++) {
          const panel = document.getElementById('cmd-slot-' + i);
          if (panel) panel.classList.toggle('hidden', i !== slot);
        }
      });
    });

    // GM 录入台一键复制按钮
    const gmCopyBtn = document.getElementById('btn-gm-copy-all-actions');
    if (gmCopyBtn) {
      gmCopyBtn.addEventListener('click', onGMCopyActions);
    }
  }

  // ── 行动 tab 总渲染入口 ──
  async function renderActionTab(rd) {
    if (!rd || !rd.parsed) return;
    const parsed = rd.parsed;

    renderRefBar(parsed);
    renderOppPanel(parsed);
    renderCmdPanels(parsed);
    await checkAndRenderSubmissions(rd.round || parsed.round);
  }

  // ── 渲染决策参考栏 ──
  function renderRefBar(parsed) {
    // 威望
    if (parsed.prestige && parsed.prestige.players.length) {
      const maxScore = Math.max(...parsed.prestige.players.map(p => p.total), 1);
      parsed.prestige.players.forEach((p, i) => {
        const valEl = document.getElementById('p-val-' + i);
        const fillEl = document.getElementById('p-fill-' + i);
        if (valEl) valEl.textContent = p.total;
        if (fillEl) fillEl.style.width = Math.round((p.total / maxScore) * 100) + '%';
      });
      const npcNameEl = document.getElementById('ref-npc-name');
      const npcScoreEl = document.getElementById('ref-npc-score');
      if (npcNameEl) npcNameEl.textContent = parsed.prestige.npcHighest.name || '—';
      if (npcScoreEl) npcScoreEl.textContent = parsed.prestige.npcHighest.score || '—';
    }

    // 先手
    const fmEl = document.getElementById('ref-first-mover');
    if (fmEl) fmEl.textContent = parsed.firstMove || '等待GM数据';

    // 世界状态
    const wsEl = document.getElementById('ref-world-status');
    if (wsEl) {
      if (parsed.worldStatus) {
        wsEl.textContent = parsed.worldStatus.raw || (parsed.worldStatus.name + ' | ' + parsed.worldStatus.endgame);
      } else {
        wsEl.textContent = '等待GM数据';
      }
    }
  }

  // ── 渲染公共机遇池 ──
  function renderOppPanel(parsed) {
    const listEl = document.getElementById('action-opp-list');
    if (!listEl) return;

    const opps = parsed.opportunities || [];
    if (!opps.length) {
      listEl.innerHTML = '<div class="opp-empty">本回合无公共机遇</div>';
      return;
    }

    let html = '';
    opps.forEach(opp => {
      const typeClass = opp.type === 'compete' ? 'opp-compete' :
                        opp.type === 'cooperate' ? 'opp-cooperate' :
                        opp.type === 'epic' ? 'opp-epic' : 'opp-gamble';
      const typeText = opp.type === 'compete' ? '争夺' :
                       opp.type === 'cooperate' ? '协力' :
                       opp.type === 'epic' ? '史诗' : '赌博';
      html += `<div class="opp-card ${typeClass}" data-opp-id="${opp.id}">
        <div class="opp-card-top">
          <span class="opp-card-title">机遇${opp.id} · ${_escHtml(opp.title)}</span>
          <span class="opp-card-type">${typeText}</span>
        </div>
        <div class="opp-card-desc">${_escHtml(opp.desc)}</div>
        <div class="opp-card-prestige">预估 +${opp.prestige} 威望</div>
      </div>`;
    });
    listEl.innerHTML = html;
  }

  // ── 渲染三家行动指令面板 ──
  function renderCmdPanels(parsed) {
    const actions = parsed.playerActions || {};
    const opps = parsed.opportunities || [];

    for (let i = 0; i < 3; i++) {
      const slotKey = SLOT_NAMES[i];
      const panelEl = document.getElementById('cmd-slot-' + i);
      if (!panelEl) continue;

      const slotActions = actions[slotKey];

      if (!slotActions) {
        panelEl.innerHTML = '<div class="cmd-waiting">等待 GM 发布行动选项…</div>';
        continue;
      }

      // 确保 wu/wen/ce 存在
      if (!slotActions.wu) slotActions.wu = {};
      if (!slotActions.wen) slotActions.wen = {};
      if (!slotActions.ce) slotActions.ce = {};

      // 渲染三令选项
      let html = '';
      html += _renderLingSection('wu', '⚔ 主令', '军事行动', slotActions.wu, i);
      html += _renderLingSection('wen', '🏛 副令', '内政建设', slotActions.wen, i);
      html += _renderCeLingSection(slotActions.ce, opps, i);

      // 零消耗补充栏
      html += `<div class="cmd-zero-section">
        <label class="cmd-zero-label">零消耗补充（可选）</label>
        <input type="text" class="cmd-zero-input" id="cmd-zero-${i}" placeholder="额外说明，如外交意向等" maxlength="60" />
      </div>`;

      // 独立提交按钮
      html += `<div class="cmd-submit-slot" id="cmd-submit-slot-${i}">
        <button class="action-submit-btn cmd-slot-submit-btn" data-slot="${i}">
          提交 ${slotKey} 的行动
        </button>
        <div class="cmd-slot-submit-hint">选择三令后提交，提交后不可修改</div>
      </div>`;

      panelEl.innerHTML = html;

      // 绑定提交按钮
      const submitBtn = panelEl.querySelector('.cmd-slot-submit-btn');
      if (submitBtn) {
        submitBtn.addEventListener('click', () => onSlotSubmit(i));
      }
    }

    // 更新 tab 文字为玩家名号
    const tabBtns = document.querySelectorAll('.cmd-ptab');
    state.players.forEach((p, i) => {
      if (tabBtns[i] && p.name && p.name !== '城主甲' && p.name !== '城主乙' && p.name !== '城主丙') {
        tabBtns[i].textContent = SLOT_NAMES[i] + ' · ' + p.name;
      }
    });

    // 绑定机遇-应变令联动
    _bindCeLingInteraction();
    // 绑定自拟 radio 联动
    _bindCustomRadioToggle();
  }

  // ── 渲染主令/副令选项区 ──
  function _renderLingSection(type, icon, subtitle, options, slotIdx) {
    let html = `<div class="cmd-ling-section" data-ling="${type}" data-slot="${slotIdx}">
      <div class="ling-header"><span class="ling-icon">${icon}</span><span class="ling-sub">(${subtitle})</span></div>
      <div class="ling-options">`;

    if (!options || Object.keys(options).length === 0) {
      html += '<div class="ling-empty">暂无选项</div>';
    } else {
      const keys = Object.keys(options).sort();
      keys.forEach(key => {
        const opt = options[key];
        const label = key.toUpperCase();
        const riskClass = opt.risk === '稳' ? 'risk-stable' :
                          opt.risk === '中' ? 'risk-medium' : 'risk-risky';
        html += `<label class="ling-option-card">
          <input type="radio" name="ling-${type}-${slotIdx}" value="${label}" class="ling-radio" />
          <div class="ling-option-body">
            <div class="ling-opt-top">
              <span class="ling-opt-label">${label}.</span>
              <span class="ling-opt-name">${_escHtml(opt.name)}</span>
            </div>
            <div class="ling-opt-desc">${_escHtml(opt.desc)}</div>
            <div class="ling-opt-meta">
              <span class="ling-opt-risk ${riskClass}">${_escHtml(opt.risk)}</span>
              <span class="ling-opt-prestige">+${_escHtml(opt.prestige)} 威望</span>
            </div>
          </div>
        </label>`;
      });
    }

    // 自拟选项
    html += `<label class="ling-option-card ling-custom-card">
      <input type="radio" name="ling-${type}-${slotIdx}" value="custom" class="ling-radio" />
      <div class="ling-option-body">
        <div class="ling-opt-top"><span class="ling-opt-label">自拟</span></div>
        <input type="text" class="ling-custom-input" id="ling-custom-${type}-${slotIdx}" placeholder="输入自拟内容(≤30字)" maxlength="30" disabled />
      </div>
    </label>`;

    html += '</div></div>';
    return html;
  }

  // ── 渲染应变令区（含机遇联动）──
  function _renderCeLingSection(ceOptions, opps, slotIdx) {
    let html = `<div class="cmd-ling-section" data-ling="ce" data-slot="${slotIdx}">
      <div class="ling-header"><span class="ling-icon">🎯 应变令</span><span class="ling-sub">(奇谋/机遇/配合)</span></div>
      <div class="ling-options">`;

    // 公共机遇选项（如果有机遇的话）
    if (opps && opps.length > 0) {
      opps.forEach(opp => {
        const typeText = opp.type === 'compete' ? '争夺' :
                         opp.type === 'cooperate' ? '协力' :
                         opp.type === 'epic' ? '史诗' : '赌博';
        html += `<label class="ling-option-card ling-opp-card">
          <input type="radio" name="ling-ce-${slotIdx}" value="opp_${opp.id}" class="ling-radio ling-ce-radio" data-is-opp="1" />
          <div class="ling-option-body">
            <div class="ling-opt-top">
              <span class="ling-opt-label">机遇${opp.id}.</span>
              <span class="ling-opt-name">${_escHtml(opp.title)}</span>
            </div>
            <div class="ling-opt-desc">${_escHtml(opp.desc)}</div>
            <div class="ling-opt-meta">
              <span class="ling-opt-risk risk-medium">${typeText}</span>
              <span class="ling-opt-prestige">+${opp.prestige} 威望</span>
            </div>
          </div>
        </label>`;
      });

      // 分隔线
      html += '<div class="ling-divider"><span>— 或选择以下应变令 —</span></div>';
    }

    // 常规应变令选项 A/B
    if (ceOptions && Object.keys(ceOptions).length > 0) {
      const keys = Object.keys(ceOptions).sort();
      keys.forEach(key => {
        const opt = ceOptions[key];
        const label = key.toUpperCase();
        const riskClass = opt.risk === '稳' ? 'risk-stable' :
                          opt.risk === '中' ? 'risk-medium' : 'risk-risky';
        html += `<label class="ling-option-card">
          <input type="radio" name="ling-ce-${slotIdx}" value="${label}" class="ling-radio ling-ce-radio" data-is-opp="0" />
          <div class="ling-option-body">
            <div class="ling-opt-top">
              <span class="ling-opt-label">${label}.</span>
              <span class="ling-opt-name">${_escHtml(opt.name)}</span>
            </div>
            <div class="ling-opt-desc">${_escHtml(opt.desc)}</div>
            <div class="ling-opt-meta">
              <span class="ling-opt-risk ${riskClass}">${_escHtml(opt.risk)}</span>
              <span class="ling-opt-prestige">+${_escHtml(opt.prestige)} 威望</span>
            </div>
          </div>
        </label>`;
      });
    }

    // 自拟选项
    html += `<label class="ling-option-card ling-custom-card">
      <input type="radio" name="ling-ce-${slotIdx}" value="custom" class="ling-radio ling-ce-radio" data-is-opp="0" />
      <div class="ling-option-body">
        <div class="ling-opt-top"><span class="ling-opt-label">自拟</span></div>
        <input type="text" class="ling-custom-input" id="ling-custom-ce-${slotIdx}" placeholder="输入自拟内容(≤30字)" maxlength="30" disabled />
      </div>
    </label>`;

    html += '</div></div>';
    return html;
  }

  // ── 机遇-应变令联动绑定 ──
  function _bindCeLingInteraction() {
    // 机遇卡片点击 → 自动选中对应 slot 的应变令机遇 radio
    document.querySelectorAll('.opp-card').forEach(card => {
      card.addEventListener('click', function() {
        const oppId = this.dataset.oppId;
        // 在所有三个 slot 中高亮这个机遇卡（视觉提示）
        document.querySelectorAll('.opp-card').forEach(c => c.classList.remove('opp-selected'));
        this.classList.add('opp-selected');
      });
    });
  }

  // ── 自拟 radio 联动 ──
  function _bindCustomRadioToggle() {
    document.querySelectorAll('.ling-radio').forEach(radio => {
      radio.addEventListener('change', function() {
        const name = this.name;
        const parts = name.split('-'); // ['ling', 'wu', '0']
        const type = parts[1];
        const slot = parts[2];
        const customInput = document.getElementById('ling-custom-' + type + '-' + slot);
        if (customInput) {
          customInput.disabled = (this.value !== 'custom');
          if (this.value === 'custom') customInput.focus();
        }
      });
    });
  }

  // ── 单家提交行动 ──
  async function onSlotSubmit(slotIdx) {
    const slotKey = SLOT_NAMES[slotIdx];
    const currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
    if (!currentRound) { showToast('当前无回合数据'); return; }

    // 收集选择
    const wu = _getSelectedLing('wu', slotIdx);
    const wen = _getSelectedLing('wen', slotIdx);
    const ce = _getSelectedLing('ce', slotIdx);

    if (!wu.choice) { showToast('请选择主令'); return; }
    if (!wen.choice) { showToast('请选择副令'); return; }
    if (!ce.choice) { showToast('请选择应变令'); return; }

    if (wu.choice === 'custom' && !wu.custom) { showToast('请填写自拟主令内容'); return; }
    if (wen.choice === 'custom' && !wen.custom) { showToast('请填写自拟副令内容'); return; }
    if (ce.choice === 'custom' && !ce.custom) { showToast('请填写自拟应变令内容'); return; }

    const payload = {
      round: currentRound,
      slot: slotKey,
      wu_choice: wu.choice,
      wu_custom: wu.custom || null,
      wen_choice: wen.choice,
      wen_custom: wen.custom || null,
      ce_choice: ce.choice,
      ce_custom: ce.custom || null,
    };

    const submitBtn = document.querySelector(`#cmd-slot-${slotIdx} .cmd-slot-submit-btn`);
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ 提交中…'; }

    try {
      const res = await fetchWithTimeout(ACTION_SUPA_URL, {
        method: 'POST',
        headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(payload),
      }, 10000);
      if (!res.ok) throw new Error('HTTP ' + res.status);

      showToast(`✅ ${slotKey} 的行动已提交！`);
      _lockSlotPanel(slotIdx);
      await checkAndRenderSubmissions(currentRound);
    } catch (e) {
      console.error('[SG] 行动提交失败:', e);
      showToast('❌ 提交失败，请重试');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = `提交 ${slotKey} 的行动`; }
    }
  }

  // ── 获取单令选择 ──
  function _getSelectedLing(type, slotIdx) {
    const selected = document.querySelector(`input[name="ling-${type}-${slotIdx}"]:checked`);
    if (!selected) return { choice: null, custom: '' };
    const choice = selected.value;
    let custom = '';
    if (choice === 'custom') {
      const input = document.getElementById(`ling-custom-${type}-${slotIdx}`);
      custom = input ? input.value.trim() : '';
    }
    return { choice, custom };
  }

  // ── 锁定某家面板 ──
  function _lockSlotPanel(slotIdx) {
    const panel = document.getElementById('cmd-slot-' + slotIdx);
    if (!panel) return;
    panel.querySelectorAll('input').forEach(el => { el.disabled = true; });
    const submitArea = document.getElementById('cmd-submit-slot-' + slotIdx);
    if (submitArea) {
      submitArea.innerHTML = '<div class="cmd-slot-submitted">✅ 已提交，等待其他玩家</div>';
    }
  }

  // ── 查询提交状态 ──
  async function checkAndRenderSubmissions(roundNum) {
    if (!roundNum) return;
    try {
      const res = await fetchWithTimeout(
        `${ACTION_SUPA_URL}?round=eq.${roundNum}&select=*`,
        { headers: SUPA_HEADERS }, 8000
      );
      if (!res.ok) return;
      const rows = await res.json();

      const submitted = {};
      rows.forEach(r => { submitted[r.slot] = r; });

      // 更新 tab 标记
      document.querySelectorAll('.cmd-ptab').forEach((btn, i) => {
        const slotKey = SLOT_NAMES[i];
        const done = !!submitted[slotKey];
        btn.classList.toggle('cmd-ptab-done', done);
      });

      // 锁定已提交的面板
      SLOT_NAMES.forEach((slotKey, i) => {
        if (submitted[slotKey]) {
          _lockSlotPanel(i);
        }
      });

      // 三家全提交 → 显示公开区 + GM复制按钮
      const allDone = SLOT_NAMES.every(s => !!submitted[s]);
      if (allDone) {
        _renderReveal(submitted);
        // GM 录入台复制按钮亮起
        const gmCopyBar = document.getElementById('gm-copy-actions-bar');
        if (gmCopyBar) gmCopyBar.style.display = '';
      }

    } catch (e) {
      console.error('[SG] 查询提交状态失败:', e);
    }
  }

  // ── 全员公开渲染 ──
  function _renderReveal(submitted) {
    const revealPanel = document.getElementById('action-reveal-panel');
    const revealGrid = document.getElementById('reveal-grid');
    if (!revealPanel || !revealGrid) return;

    revealPanel.classList.remove('hidden');

    let gridHtml = '';
    SLOT_NAMES.forEach((slotKey, i) => {
      const sub = submitted[slotKey];
      const name = state.players[i] ? state.players[i].name : slotKey;
      gridHtml += `<div class="reveal-col reveal-col-${i}">
        <div class="reveal-col-header">${_escHtml(name)} [${slotKey}]</div>
        <div class="reveal-col-row"><span class="reveal-ling-label">主令</span>${_formatChoice(sub.wu_choice, sub.wu_custom)}</div>
        <div class="reveal-col-row"><span class="reveal-ling-label">副令</span>${_formatChoice(sub.wen_choice, sub.wen_custom)}</div>
        <div class="reveal-col-row"><span class="reveal-ling-label">应变令</span>${_formatChoice(sub.ce_choice, sub.ce_custom)}</div>
      </div>`;
    });
    revealGrid.innerHTML = gridHtml;
  }

  // ── 格式化选择显示 ──
  function _formatChoice(choice, custom) {
    if (!choice) return '<span class="reveal-none">未选择</span>';
    if (choice === 'custom') return '<span class="reveal-custom">自拟: ' + _escHtml(custom || '') + '</span>';
    if (choice.startsWith('opp_')) return '<span class="reveal-option">机遇' + choice.replace('opp_', '') + '</span>';
    return '<span class="reveal-option">' + _escHtml(choice) + '</span>';
  }

  // ── GM 一键复制全部行动 ──
  async function onGMCopyActions() {
    const currentRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1].round : 0;
    if (!currentRound) return;

    try {
      const res = await fetchWithTimeout(
        `${ACTION_SUPA_URL}?round=eq.${currentRound}&select=*`,
        { headers: SUPA_HEADERS }, 8000
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();

      const submitted = {};
      rows.forEach(r => { submitted[r.slot] = r; });

      const latest = state.rounds[state.rounds.length - 1];
      const playerActions = (latest && latest.parsed && latest.parsed.playerActions) || {};

      let text = `第 ${currentRound} 回合 · 玩家行动\n\n`;

      SLOT_NAMES.forEach((slotKey, i) => {
        const sub = submitted[slotKey];
        const name = state.players[i] ? state.players[i].name : slotKey;
        const slotOpts = playerActions[slotKey] || {};

        text += `${name} [${slotKey}]\n`;
        text += `  主令: ${_fmtChoiceText('wu', sub, slotOpts)}\n`;
        text += `  副令: ${_fmtChoiceText('wen', sub, slotOpts)}\n`;
        text += `  应变令: ${_fmtChoiceText('ce', sub, slotOpts)}\n`;
        text += '\n';
      });

      await navigator.clipboard.writeText(text.trim());
      const okEl = document.getElementById('gm-copy-all-ok');
      if (okEl) { okEl.classList.remove('hidden'); setTimeout(() => okEl.classList.add('hidden'), 2500); }
      showToast('📋 已复制全部行动');
    } catch (e) {
      showToast('❌ 复制失败: ' + e.message);
    }
  }

  // ── 格式化选择为纯文本 ──
  function _fmtChoiceText(type, sub, slotOpts) {
    if (!sub) return '未提交';
    const choice = sub[type + '_choice'];
    const custom = sub[type + '_custom'];
    if (!choice) return '未选择';
    if (choice === 'custom') return '自拟: ' + (custom || '');
    if (choice.startsWith('opp_')) {
      const oppId = choice.replace('opp_', '');
      return '选择机遇' + oppId;
    }
    const typeOpts = slotOpts[type] || {};
    const optKey = choice.toLowerCase();
    if (typeOpts[optKey] && typeOpts[optKey].name) {
      return choice + '. ' + typeOpts[optKey].name;
    }
    return choice;
  }

  // ── HTML 转义 ──
  function _escHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
  }
"""

new_content = pattern.sub(replacement, content, count=1)

# Modify init() function
# We should double check if SGRole or role-login exist in init()
# Wait, let's just make sure
if 'SGRole' in new_content or 'role-login' in new_content or 'sg_role' in new_content:
    pass

with open('js/main.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
