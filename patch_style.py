import re
with open("css/style.css", "r") as f:
    content = f.read()

# Requirement 1: Disable readonly panel styles
content = content.replace("/* ════════════════════════════════════════\n   只读面板样式 v1", "/* ════════════════════════════════════════\n   只读面板样式 v1 — 已禁用（工单#readonly-remove）")
# Finding the block to comment out
# The block ends before "身份选择器 v2"
parts = content.split("/* ════════════════════════════════════════\n   身份选择器 v2")
part0 = parts[0]
part1 = parts[1]

# In part0, find the readonly section to comment
idx_readonly = part0.find("只读面板样式 v1 — 已禁用")
if idx_readonly != -1:
    idx_styles = part0.find(".col-panel.readonly {", idx_readonly)
    if idx_styles != -1:
        # the styles end at the end of part0
        styles_str = part0[idx_styles:]
        commented_styles = "/*\n" + styles_str.strip() + "\n*/\n"
        part0 = part0[:idx_styles] + "/* 需求1：取消透明度降低规则，保留此注释块但不应用样式 */\n\n" + commented_styles

content = part0 + "/* ════════════════════════════════════════\n   身份选择器 v2" + part1

with open("css/style.css", "w") as f:
    f.write(content)
