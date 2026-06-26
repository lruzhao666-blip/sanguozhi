import re

with open("js/main.js", "r") as f:
    content = f.read()

# Requirement 2.2: Bind the col-edit-btn
bind_old = """    // 提交按钮
    root.querySelectorAll('.submit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slotIdx = parseInt(this.dataset.slot);
        var currentSlot = getCurrentPlayerSlot();

        if (slotIdx !== currentSlot) {
          showToast('⚠️ 无法提交其他玩家的行动');
          return;
        }

        _act10Submit(slotIdx);
      });
    });"""

bind_new = bind_old + """\n
    // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓
    // 修改按钮
    root.querySelectorAll('.col-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var slotIdx = parseInt(this.dataset.slot);
        var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
        if (!panel) return;

        // 解锁面板
        panel.classList.remove('submitted-locked');

        // 隐藏已提交摘要
        var summary = document.getElementById('act10-summary-' + slotIdx);
        if (summary) summary.style.display = 'none';

        showToast('📝 已解锁，可重新选择行动');
      });
    });
    // ↑↑↑ 工单结束 ↑↑↑"""

content = content.replace(bind_old, bind_new)

# Requirement 2.3: Automatically lock panel on submit
submit_success_old = """      showToast('✅ ' + ACT10_SLOT_NAMES[slotIdx] + ' 行动已提交！');
      await _act10LoadSubmissions(currentRound);"""

submit_success_new = submit_success_old + """\n      // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓
      // 提交成功后锁定面板
      var panel = root.querySelector('.col-panel[data-slot="' + slotIdx + '"]');
      if (panel) panel.classList.add('submitted-locked');
      // ↑↑↑ 工单结束 ↑↑↑"""

content = content.replace(submit_success_old, submit_success_new)

# Requirement 2.4: Automatically lock panel on load
summary_old = """          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }"""

summary_new = """          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }
          // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓
          // 已提交数据存在，且是当前玩家，自动锁定
          var currentSlot = getCurrentPlayerSlot();
          if (i === currentSlot) {
            var panel = document.querySelector('.col-panel[data-slot="' + i + '"]');
            if (panel) panel.classList.add('submitted-locked');
          }
          // ↑↑↑ 工单结束 ↑↑↑"""

content = content.replace(summary_old, summary_new)

with open("js/main.js", "w") as f:
    f.write(content)
