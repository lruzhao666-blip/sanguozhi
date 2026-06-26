import re

with open('css/style.css', 'r') as f:
    content = f.read()

pattern = r'/\*\s*══════════════════════════════════════════\s*军报 · 势力色徽章 \+ 左侧势力色条 v1 \(2026-05-29\).*?/\*\s*════════════════════════════════════════════════════════════\s*v20260608q'
content = re.sub(pattern, '/* ════════════════════════════════════════════════════════════\n   v20260608q', content, flags=re.DOTALL)

with open('css/style.css', 'w') as f:
    f.write(content)
