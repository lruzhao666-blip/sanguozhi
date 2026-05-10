/**
 * general-duties.js — 武将职务面板 v1.0
 *
 * 功能：
 *  1. 点击武将标签 → 弹出该武将的职务面板
 *  2. 面板内全部游戏职务按钮，默认灰色，点击点亮，再点取消
 *  3. 面板内可按类别筛选职务（全部/军事/内政/外交/谋略）
 *  4. 玩家卡武将列表上方加筛选栏，可筛选出"已点亮某类职务"的武将
 *  5. 数据存 localStorage，key = gd_v1_{武将名}
 *  6. window.clearAllGeneralDuties() — onClearAll 时调用，清空所有记录
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════
  //  职务数据表
  // ══════════════════════════════════════════
  const DUTIES = [
    // 军事
    { id:'mil_attack',    cat:'军事', label:'出征攻城' },
    { id:'mil_defend',    cat:'军事', label:'驻守防御' },
    { id:'mil_train',     cat:'军事', label:'练兵备战' },
    { id:'mil_recruit',   cat:'军事', label:'招募新兵' },
    { id:'mil_escort',    cat:'军事', label:'护送押运' },
    { id:'mil_raid',      cat:'军事', label:'奇袭扰敌' },
    { id:'mil_siege',     cat:'军事', label:'围城断粮' },
    { id:'mil_reinforce', cat:'军事', label:'驰援友军' },
    { id:'mil_patrol',    cat:'军事', label:'巡防要道' },
    // 内政
    { id:'adm_farm',      cat:'内政', label:'屯田耕作' },
    { id:'adm_tax',       cat:'内政', label:'征收赋税' },
    { id:'adm_build',     cat:'内政', label:'修筑建设' },
    { id:'adm_road',      cat:'内政', label:'修路通道' },
    { id:'adm_relief',    cat:'内政', label:'安民救灾' },
    { id:'adm_supply',    cat:'内政', label:'转运粮草' },
    { id:'adm_morale',    cat:'内政', label:'安抚民心' },
    { id:'adm_manage',    cat:'内政', label:'治理城务' },
    { id:'adm_emergency', cat:'内政', label:'急征军备' },
    // 外交
    { id:'dip_ally',      cat:'外交', label:'结盟谈判' },
    { id:'dip_bribe',     cat:'外交', label:'游说拉拢' },
    { id:'dip_surrender', cat:'外交', label:'劝降纳降' },
    { id:'dip_tribute',   cat:'外交', label:'进贡朝贡' },
    { id:'dip_envoy',     cat:'外交', label:'出使斡旋' },
    { id:'dip_trade',     cat:'外交', label:'互市贸易' },
    { id:'dip_break',     cat:'外交', label:'离间破盟' },
    // 谋略
    { id:'str_intel',     cat:'谋略', label:'刺探情报' },
    { id:'str_sabotage',  cat:'谋略', label:'破坏粮道' },
    { id:'str_assassin',  cat:'谋略', label:'刺杀暗杀' },
    { id:'str_defect',    cat:'谋略', label:'策反内应' },
    { id:'str_rumor',     cat:'谋略', label:'散布谣言' },
    { id:'str_deceive',   cat:'谋略', label:'声东击西' },
    { id:'str_plan',      cat:'谋略', label:'献计出谋' },
  ];

  const ALL_CATS   = ['全部', '军事', '内政', '外交', '谋略'];
  const STORAGE_PFX = 'gd_v1_';

  // ── 每个类别包含哪些 duty id ──
  const CAT_IDS = {};
  DUTIES.forEach(d => {
    if (!CAT_IDS[d.cat]) CAT_IDS[d.cat] = new Set();
    CAT_IDS[d.cat].add(d.id);
  });

  // ══════════════════════════════════════════
  //  localStorage
  // ══════════════════════════════════════════
  function load(name)       { try { return JSON.parse(localStorage.getItem(STORAGE_PFX + name) || '{}'); } catch(e){ return {}; } }
  function save(name, data) { try { localStorage.setItem(STORAGE_PFX + name, JSON.stringify(data)); } catch(e){} }

  window.clearAllGeneralDuties = function () {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PFX)) ks.push(k);
    }
    ks.forEach(k => localStorage.removeItem(k));
  };

  // ── 武将是否拥有某类职务（>=1个点亮） ──
  window.genHasCat = function (name, cat) {
    if (cat === '全部') return true;
    const data = load(name);
    const ids  = CAT_IDS[cat];
    if (!ids) return false;
    return Object.keys(data).some(id => ids.has(id));
  };

  // ── 武将已点亮的职务数量 ──
  window.genDutyCount = function (name) {
    return Object.keys(load(name)).length;
  };

  // ══════════════════════════════════════════
  //  弹框 DOM（懒创建）
  // ══════════════════════════════════════════
  function ensureModal() {
    if (document.getElementById('gd-modal')) return;
    const el = document.createElement('div');
    el.id        = 'gd-modal';
    el.className = 'gd-overlay';
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="gd-panel" id="gd-panel" role="dialog">
        <div class="gd-hd">
          <div class="gd-hd-left">
            <span class="gd-gen-name" id="gd-name"></span>
            <span class="gd-gen-badge" id="gd-status"></span>
          </div>
          <button class="gd-close" id="gd-close" aria-label="关闭">✕</button>
        </div>
        <div class="gd-modal-cats" id="gd-modal-cats"></div>
        <p class="gd-hint">点击职务可点亮／再次点击取消</p>
        <div class="gd-body" id="gd-body"></div>
        <div class="gd-ft">
          <button class="gd-clear-btn" id="gd-clear">清空本将所有点亮</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    // 全局事件（只绑一次）
    document.getElementById('gd-close').onclick = closeModal;
    el.addEventListener('click', e => { if (e.target === el) closeModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.classList.contains('gd-open')) closeModal();
    });
    document.getElementById('gd-clear').onclick = () => {
      save(_cur, {});
      renderBody();
      refreshAllGenLists();
    };
    document.getElementById('gd-modal-cats').addEventListener('click', e => {
      const b = e.target.closest('.gd-mcat');
      if (!b) return;
      _modalCat = b.dataset.cat;
      syncModalCats();
      renderBody();
    });
  }

  // ══════════════════════════════════════════
  //  内部状态
  // ══════════════════════════════════════════
  let _cur      = '';   // 当前武将名
  let _curSt    = '';   // 当前武将状态
  let _modalCat = '全部';

  // ══════════════════════════════════════════
  //  打开 / 关闭
  // ══════════════════════════════════════════
  window.openGeneralDuties = function (name, status) {
    ensureModal();
    _cur     = name;
    _curSt   = status || '健康';
    _modalCat = '全部';

    document.getElementById('gd-name').textContent   = name;
    const stEl = document.getElementById('gd-status');
    stEl.textContent  = _curSt;
    stEl.className    = 'gd-gen-badge gd-st-' + stKey(_curSt);

    syncModalCats();
    renderBody();

    const modal = document.getElementById('gd-modal');
    modal.classList.add('gd-open');
  };

  function closeModal() {
    const modal = document.getElementById('gd-modal');
    if (modal) modal.classList.remove('gd-open');
  }

  // ══════════════════════════════════════════
  //  渲染弹框内容
  // ══════════════════════════════════════════
  function syncModalCats() {
    const el = document.getElementById('gd-modal-cats');
    if (!el) return;
    el.innerHTML = ALL_CATS.map(c =>
      `<button class="gd-mcat${c === _modalCat ? ' gd-mcat-on' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
  }

  function renderBody() {
    const el   = document.getElementById('gd-body');
    if (!el) return;
    const data = load(_cur);
    const list = _modalCat === '全部' ? DUTIES : DUTIES.filter(d => d.cat === _modalCat);

    // 分组
    const groups = {};
    list.forEach(d => { (groups[d.cat] = groups[d.cat] || []).push(d); });

    let html = '';
    for (const [cat, duties] of Object.entries(groups)) {
      if (_modalCat === '全部')
        html += `<div class="gd-grp-title">${cat}</div>`;
      html += `<div class="gd-grid">`;
      for (const d of duties) {
        const on = data[d.id] ? ' gd-on' : '';
        html += `<button class="gd-duty${on}" data-id="${d.id}">${d.label}</button>`;
      }
      html += `</div>`;
    }
    el.innerHTML = html;

    // 点击职务
    el.querySelectorAll('.gd-duty').forEach(b => {
      b.addEventListener('click', () => {
        const d = load(_cur);
        if (d[b.dataset.id]) { delete d[b.dataset.id]; b.classList.remove('gd-on'); }
        else                  { d[b.dataset.id] = 1;    b.classList.add('gd-on'); }
        save(_cur, d);
        refreshAllGenLists();   // 同步玩家卡筛选
      });
    });
  }

  // ══════════════════════════════════════════
  //  玩家卡武将列表筛选
  // ══════════════════════════════════════════

  // 当前每张玩家卡的筛选状态
  const _cardCat = { 0:'全部', 1:'全部', 2:'全部' };

  // 创建筛选栏（每张玩家卡调用一次）
  window.initGenFilter = function (idx) {
    const wrap = document.getElementById(`gen-filter-${idx}`);
    if (!wrap || wrap.dataset.bound) return;
    wrap.dataset.bound = '1';
    wrap.addEventListener('click', e => {
      const b = e.target.closest('.gf-btn');
      if (!b) return;
      _cardCat[idx] = b.dataset.cat;
      wrap.querySelectorAll('.gf-btn').forEach(x =>
        x.classList.toggle('gf-on', x.dataset.cat === _cardCat[idx]));
      // 重新筛选武将列表
      applyGenFilter(idx);
    });
  };

  // 对一张玩家卡应用当前筛选
  function applyGenFilter(idx) {
    const listEl = document.getElementById(`gen-list-${idx}`);
    if (!listEl) return;
    const cat = _cardCat[idx] || '全部';
    listEl.querySelectorAll('.gen-tag').forEach(tag => {
      const name    = tag.dataset.name || '';
      const visible = (cat === '全部') || window.genHasCat(name, cat);
      // inline style 里有 !important，只有 setProperty priority 才能覆盖
      if (visible) {
        tag.style.removeProperty('display');
      } else {
        tag.style.setProperty('display', 'none', 'important');
      }
    });
    // 全都隐藏时提示
    const allHidden = [...listEl.querySelectorAll('.gen-tag')].every(t => t.style.getPropertyValue('display') === 'none');
    let tip = listEl.querySelector('.gf-empty-tip');
    if (allHidden && cat !== '全部') {
      if (!tip) { tip = document.createElement('span'); tip.className = 'gf-empty-tip gen-empty'; listEl.appendChild(tip); }
      tip.textContent = `无${cat}武将`;
    } else {
      if (tip) tip.remove();
    }
  }

  // 点亮/取消后刷新所有玩家卡的筛选
  function refreshAllGenLists() {
    [0, 1, 2].forEach(i => applyGenFilter(i));
  }

  // 状态 key
  function stKey(s) {
    if (!s) return 'healthy';
    if (/疲劳|疲/.test(s))    return 'tired';
    if (/受伤|伤/.test(s))    return 'injured';
    if (/患病|病/.test(s))    return 'sick';
    if (/阵亡|亡|死/.test(s)) return 'dead';
    return 'healthy';
  }

})();
