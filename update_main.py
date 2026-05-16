import re

with open('js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Modification A: Add sub-player matching before RESULT_PLAYER_LINE_RE
target_A_search = "      // 玩家行（👤 或 👤 段落内的玩家标识）\n      if (PLAYER_RE.test(tLine) || (currentCard && currentCard.emoji === '👤' && RESULT_PLAYER_LINE_RE.test(tLine))) {"
target_A_replace = """      // ── 👤 卡片内：精确识别子玩家分组标题行 ──
      // 格式：{1-6字名号}·{行动名} 或 {1-6字名号}：{行动名}
      // 例如："昭·犒赏北平与冀州居间"、"高·广陵平乱与紧急通商"
      // 注意：不能匹配 "第一路·天水攻街亭" 这类子段落标题（排除 "第X路" 前缀）
      if (currentCard && currentCard.emoji === '👤') {
        const subTitleM = tLine.match(
          /^([^\\s:：·\\u30fb\\u2022\\d第]{1,6})\\s*[·\\u30fb\\u2022]\\s*(.+)$/
        );
        if (subTitleM) {
          flushPara();
          // 作为纯文本行推入 cardLines，由 _groupPlayerResultLines() 处理分组
          currentCard.lines.push(tLine);
          continue;
        }
      }

      // 玩家行（👤 或 👤 段落内的玩家标识）
      if (PLAYER_RE.test(tLine) || (currentCard && currentCard.emoji === '👤' && RESULT_PLAYER_LINE_RE.test(tLine) && tLine.trim().length <= 30)) {"""

if target_A_search in content:
    content = content.replace(target_A_search, target_A_replace)
else:
    print("Failed to find target A")

# Modification B: Fix bodyLines rendering
target_B_search = """        // ── 后续描述行：每行独立 action-item，无序号，desc 色 ──
        grp.bodyLines.forEach(line => {
          const { name, desc } = splitDash(line);
          inner += '<div class="action-item result-body-item">';
          inner += `<span class="desc">${highlightInline(name)}</span>`;
          if (desc) {
            inner += `<span class="dash">\\u2014\\u2014</span>`;
            inner += `<span class="desc">${highlightInline(desc)}</span>`;
          }
          inner += '</div>';
        });"""

target_B_replace = """        // ── 新代码：正文行按段落渲染 ──
        {
          let _bodyParaBuf = [];
          const _flushBodyPara = () => {
            if (!_bodyParaBuf.length) return;
            inner += `<p class="raw-para">${_bodyParaBuf.map(highlightInline).join('<br>')}</p>`;
            _bodyParaBuf = [];
          };
          grp.bodyLines.forEach(bLine => {
            // 空行 → 断段
            if (!bLine.trim()) {
              _flushBodyPara();
              return;
            }
            // ▸ 影响行 → 独立渲染
            if (/^▸/.test(bLine)) {
              _flushBodyPara();
              inner += `<div class="raw-effect">${highlightInline(bLine)}</div>`;
              return;
            }
            // 普通行 → 累入段落缓冲
            _bodyParaBuf.push(bLine);
          });
          _flushBodyPara();
        }"""

if target_B_search in content:
    content = content.replace(target_B_search, target_B_replace)
else:
    print("Failed to find target B")

# We also need to modify SUB_PLAYER_RE to explicitly exclude numbered routes "第一路"
# Oh wait, the initial instructions didn't specify changing SUB_PLAYER_RE, but they said "第一路·xxx / 第二路·xxx 等子标题行不误识别为玩家分组".
# Wait, SUB_PLAYER_RE is: const SUB_PLAYER_RE = /^([^\\s:：·\\u30fb\\u2022]{1,6})\\s*[·\\u30fb\\u2022]\\s*(.*)$/;
# If I don't modify SUB_PLAYER_RE, it WILL match "第一路" because "第一路" is 3 chars.
# So we should modify SUB_PLAYER_RE to match what we put in Modification A:
# /^([^\\s:：·\\u30fb\\u2022\\d第]{1,6})\\s*[·\\u30fb\\u2022]\\s*(.*)$/
# Let's change it.
target_C_search = r"const SUB_PLAYER_RE = /^([^\s:：·\u30fb\u2022]{1,6})\s*[·\u30fb\u2022]\s*(.*)$/;"
target_C_replace = r"const SUB_PLAYER_RE = /^([^\s:：·\u30fb\u2022\d第]{1,6})\s*[·\u30fb\u2022]\s*(.*)$/;"

if target_C_search in content:
    content = content.replace(target_C_search, target_C_replace)
else:
    print("Failed to find target C")

with open('js/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
