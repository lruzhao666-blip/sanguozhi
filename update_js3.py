import re

with open('js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# E
old_code = """        if (sub) {
          // 显示摘要
          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }
          // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓"""
new_code = """        if (sub) {
          // 显示摘要
          if (sumEl) {
            sumEl.style.display = '';
            sumEl.innerHTML = _act10BuildSummary(sub, i);
          }
          _act10RestoreSelection(i, sub);
          // ↓↓↓ 工单 #submit-lock-v1 ↓↓↓"""

content = content.replace(old_code, new_code)

with open('js/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
