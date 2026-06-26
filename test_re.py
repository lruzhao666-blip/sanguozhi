import re

with open('css/style.css', 'r') as f:
    content = f.read()

# Helper function to delete from match up to the next non-junbao rule.
# To be safe, we just find the match and inspect what follows it.

def find_range(start_regex, stop_regex):
    start_match = re.search(start_regex, content, flags=re.DOTALL)
    if not start_match:
        return
    start_idx = start_match.start()

    # search for stop_regex from start_idx
    stop_match = re.search(stop_regex, content[start_idx:], flags=re.DOTALL)
    if stop_match:
        end_idx = start_idx + stop_match.start()
        print(f"Match length: {end_idx - start_idx}")
    else:
        print("STOP NOT FOUND")

# 1
find_range(r'/\*\s*[═]+\s*军报模块 v3\.0 — 小而美重设计\s*[=]+\s*\*/', r'/\*\s*══════════════════════════════════════════════════════\s*战况层 v1\.0')
# 2
find_range(r'/\*\s*[═]+\s*军报板块 v1 · 方案二\(势力徽章 \+ 色条\).*?\s*[═]+\s*\*/', r'/\*\s*══════════════════════════════════════════\s*军报板块 v1\.0')
# 3
find_range(r'/\*\s*[═]+\s*军报板块 v1\.0\(2026-06-12\).*?\s*[═]+\s*\*/', r'/\*\s*══════════════════════════════════════════\s*军报板块 v20260613c')
# 4
find_range(r'/\*\s*[═]+\s*军报板块 v20260613c — UI 终稿.*?\s*[═]+\s*\*/', r'/\*\s*══════════════════════════════════════════════════════\s*军报板块 v20260613d')
# 5
find_range(r'/\*\s*[═]+\s*军报板块 v20260613d — 极致紧凑 · 素颜外壳.*?\s*[═]+\s*\*/', r'/\*\s*══════════════════════════════════════════\s*v20260526a 军报:调度行尾备注小灰字')
# 6
find_range(r'/\*\s*[═]+\s*v20260526a 军报:调度行尾备注小灰字.*?\s*[═]+\s*\*/', r'/\*\s*══════════════════════════════════════════════════\s*v20260614a')
# 7a
find_range(r'/\*\s*[═]+\s*v20260614a 军报板块方案A落地:左右双栏.*?\s*[─]+\s*\*/', r'/\*\s*══ v20260614a END ══\s*\*/')
# 7c
find_range(r'/\*\s*[═]+\s*v20260614c 军报方案A全端微调:.*?\s*[─]+\s*\*/', r'/\*\s*══ v20260614c END ══\s*\*/')
# 7d
find_range(r'/\*\s*[═]+\s*v20260614d 军报板块永久上下排列\(回退双栏\).*?\s*[─]+\s*\*/', r'/\*\s*══ v20260614d END ══\s*\*/')
# 8
find_range(r'/\*\s*[═]+\s*军报板块（调度部队 \+ 战报）—— 视觉对齐 block-changes-detail\s*[═]+\s*\*/', r'/\*\s*══════════════════════════════════════════\s*历史回合')
# 9
find_range(r'/\*\s*[═]+\s*军报 · 势力色徽章 \+ 左侧势力色条 v1 \(2026-05-29\).*?\s*[═]+\s*\*/', r'/\*\s*══════════════════════════════════════════\s*军报板块 v1 · 方案二')
