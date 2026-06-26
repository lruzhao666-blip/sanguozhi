import re

with open('css/style.css', 'r') as f:
    content = f.read()

def find_block(pattern_start):
    match = re.search(pattern_start, content, flags=re.DOTALL)
    if match:
        print(f"Found: {match.group(0)[:100]}")
    else:
        print(f"NOT FOUND: {pattern_start}")

# 1
find_block(r'/\*\s*[═]+\s*军报模块 v3\.0 — 小而美重设计\s*[=]+\s*\*/')
# 2
find_block(r'/\*\s*[═]+\s*军报板块 v1 · 方案二\(势力徽章 \+ 色条\).*?\s*[═]+\s*\*/')
# 3
find_block(r'/\*\s*[═]+\s*军报板块 v1\.0\(2026-06-12\).*?\s*[═]+\s*\*/')
# 4
find_block(r'/\*\s*[═]+\s*军报板块 v20260613c — UI 终稿.*?\s*[═]+\s*\*/')
# 5
find_block(r'/\*\s*[═]+\s*军报板块 v20260613d — 极致紧凑 · 素颜外壳.*?\s*[═]+\s*\*/')
# 6
find_block(r'/\*\s*[═]+\s*v20260526a 军报:调度行尾备注小灰字.*?\s*[─]+\s*\*/')
# 7a
find_block(r'/\*\s*[═]+\s*v20260614a 军报板块方案A落地:左右双栏.*?\s*[─]+\s*\*/')
# 7c
find_block(r'/\*\s*[═]+\s*v20260614c 军报方案A全端微调:.*?\s*[─]+\s*\*/')
# 7d
find_block(r'/\*\s*[═]+\s*v20260614d 军报板块永久上下排列\(回退双栏\).*?\s*[─]+\s*\*/')
# 8
find_block(r'/\*\s*[═]+\s*军报板块（调度部队 \+ 战报）—— 视觉对齐 block-changes-detail\s*[═]+\s*\*/')
# 9
find_block(r'/\*\s*[═]+\s*军报 · 势力色徽章 \+ 左侧势力色条 v1 \(2026-05-29\).*?\s*[═]+\s*\*/')
