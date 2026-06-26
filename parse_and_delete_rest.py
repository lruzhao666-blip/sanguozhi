import re

with open('css/style.css', 'r') as f:
    content = f.read()

# 9. 注释头含「军报 · 势力色徽章 + 左侧势力色条 v1 (2026-05-29)」整段
pattern9 = r'/\*\s*══════════════════════════════════════════\s*军报 · 势力色徽章 \+ 左侧势力色条 v1 \(2026-05-29\).*?/\*\s*══════════════════════════════════════════\s*军报板块 v1 · 方案二'
content = re.sub(pattern9, '/* ══════════════════════════════════════════\n   军报板块 v1 · 方案二', content, flags=re.DOTALL)

with open('css/style.css', 'w') as f:
    f.write(content)
