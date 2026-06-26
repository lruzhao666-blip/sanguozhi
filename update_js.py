import re

with open('js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Change A: Remove `var _isMine = (slotIdx === getCurrentPlayerSlot());` and modify `remarkText`
content = content.replace("var _isMine = (slotIdx === getCurrentPlayerSlot());\n", "")
content = content.replace("var remarkText = (_isMine && remarks[sel.lingIdx]) ? ' <span class=\"sum-remark\">备注：' + _act10Esc(remarks[sel.lingIdx]) + '</span>' : '';", "var remarkText = remarks[sel.lingIdx] ? ' <span class=\"sum-remark\">备注：' + _act10Esc(remarks[sel.lingIdx]) + '</span>' : '';")

# Change B: Add _act10ResolveActionName function before _act10BuildSummary
resolve_action_name_func = """  // #act-summary-realname-v1: 根据 choice(label 或 name) 反查完整行动名
  function _act10ResolveActionName(slotIdx, lingIdx, choice) {
    if (!choice) return '';
    try {
      var last = state.rounds.length ? state.rounds[state.rounds.length - 1] : null;
      if (!last || !last.parsed) return choice;
      var sk = ACT10_SLOT_NAMES[slotIdx];
      var pa = (last.parsed.playerActions && last.parsed.playerActions[sk]) || {};
      var items = pa.items || [];
      var item = items[lingIdx];
      if (!item || !item.options) return choice;
      for (var oi = 0; oi < item.options.length; oi++) {
        var opt = item.options[oi];
        // 二级分支匹配
        if (opt.sub && opt.sub.length) {
          for (var si = 0; si < opt.sub.length; si++) {
            var sub = opt.sub[si];
            if ((sub.label || sub.name) === choice) {
              return (opt.name || '') + ' · ' + (sub.name || sub.label || '');
            }
          }
        }
        // 一级匹配
        if ((opt.label || opt.name) === choice) {
          return opt.name || opt.label || choice;
        }
      }
    } catch (e) {}
    return choice;
  }

"""
content = content.replace("  function _act10BuildSummary(sub, slotIdx) {\n", resolve_action_name_func + "  function _act10BuildSummary(sub, slotIdx) {\n")

# Change C: Modify _act10BuildSummary content to use _act10ResolveActionName
old_val = """var val = sel.choice === 'custom'
        ? '<span class="sum-custom-order">自定军令: ' + _act10Esc(sel.customText || '') + '</span>'
        : lingNum + ' ' + _act10Esc(sel.choice);"""
new_val = """var val = sel.choice === 'custom'
        ? '<span class="sum-custom-order">自定军令: ' + _act10Esc(sel.customText || '') + '</span>'
        : lingNum + ' ' + _act10Esc(_act10ResolveActionName(slotIdx, sel.lingIdx, sel.choice));"""
content = content.replace(old_val, new_val)

# Change D: Add _act10RestoreSelection function before _act10LoadSubmissions
restore_selection_func = """  // #act-restore-selection-v1: 刷新后从提交数据恢复选中态/备注/机遇/额度
  function _act10RestoreSelection(slotIdx, sub) {
    var root = document.getElementById('act10-root');
    if (!root || !sub) return;
    var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
    if (!panel) return;

    var sels = [];
    try { sels = typeof sub.ling_selections === 'string' ? JSON.parse(sub.ling_selections) : (sub.ling_selections || []); } catch (e) { sels = []; }
    var rems = [];
    try { rems = typeof sub.remarks === 'string' ? JSON.parse(sub.remarks) : (sub.remarks || []); } catch (e) { rems = []; }
    var opp = {};
    try { opp = typeof sub.opp_selection === 'string' ? JSON.parse(sub.opp_selection) : (sub.opp_selection || {}); } catch (e) { opp = {}; }

    var remarkMap = {};
    rems.forEach(function(r) { remarkMap[r.lingIdx] = r.text; });

    sels.forEach(function(sel) {
      // 自定军令
      if (sel.lingIdx === 4 || sel.choice === 'custom') {
        var cSlot = panel.querySelector('#act10-cslot-' + slotIdx);
        var cTa = panel.querySelector('.act-custom-ta');
        if (cTa) { cTa.value = sel.customText || ''; }
        if (cSlot) cSlot.classList.add('checked');
        return;
      }
      var catEl = panel.querySelector('#act10-cat-' + slotIdx + '-' + sel.lingIdx);
      if (!catEl) return;
      // 先找二级
      var target = catEl.querySelector('.act-opt-l2[data-val="' + sel.choice + '"]');
      if (target) {
        target.classList.add('checked');
        var brEl = target.closest('.act-branch-l1');
        if (brEl) {
          brEl.classList.add('expanded');
          var l1 = brEl.querySelector('.act-opt-l1');
          if (l1) l1.classList.add('checked');
          var subList = brEl.querySelector('.act-sub-list');
          if (subList) subList.classList.add('expanded');
        }
      } else {
        // 一级
        var t1 = catEl.querySelector('.act-opt-l1[data-val="' + sel.choice + '"]');
        if (t1) t1.classList.add('checked');
      }
      // 备注回填 + 显示备注块
      if (remarkMap[sel.lingIdx]) {
        var remBlock = panel.querySelector('#act10-remark-' + slotIdx + '-' + sel.lingIdx);
        if (remBlock) {
          remBlock.classList.add('visible');
          var remTa = remBlock.querySelector('.act-remark-ta');
          if (remTa) remTa.value = remarkMap[sel.lingIdx];
        }
      }
    });

    // 机遇
    if (opp && opp.type === 'opp' && opp.oppId) {
      var oppRow = panel.querySelector('.opp-opt-row[data-opp-id="' + opp.oppId + '"]');
      if (oppRow) oppRow.classList.add('checked');
    }

    // 刷新额度条
    _act10UpdateQuota(slotIdx);
  }

"""
content = content.replace("  async function _act10LoadSubmissions(roundNum) {\n", restore_selection_func + "  async function _act10LoadSubmissions(roundNum) {\n")

# Change E: Call _act10RestoreSelection in _act10LoadSubmissions
old_load_sub = """        if (sumEl) {
          // 显示摘要
          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }
          // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓"""
old_load_sub_actual = """        if (sub) {
          // 显示摘要
          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }
          // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓"""

new_load_sub = """        if (sub) {
          // 显示摘要
          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }
          _act10RestoreSelection(i, sub);
          // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓"""
content = content.replace(old_load_sub_actual, new_load_sub)

with open('js/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
