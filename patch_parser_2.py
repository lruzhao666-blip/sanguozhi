import sys

file_path = "js/parser.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_block = """        op.buffs.forEach(b => {
          if (b.expired) {
            // 到期：删除该 type 的 buff
            delete entry.productionBuffs[b.type];
          } else if (b.value != null) {
            // 写入/覆盖
            entry.productionBuffs[b.type] = {
              type:     b.type,
              value:    b.value,
              resource: b.resource,
              remain:   b.remain,
            };
          }
        });"""

new_block = """        op.buffs.forEach(b => {
          if (b.expired) {
            // 到期：删除该 type 的 buff
            delete entry.productionBuffs[b.type];
          } else if (b.general) {
            // ★ 新格式 v3.9.2：emoji + 武将 + 动作 + 回合（暗箱，无数值）
            entry.productionBuffs[b.type] = {
              type:    b.type,
              emoji:   b.emoji,
              general: b.general,
              action:  b.action,
              remain:  b.remain,
            };
          } else if (b.value != null) {
            // 旧格式兼容：写入数值版
            entry.productionBuffs[b.type] = {
              type:     b.type,
              value:    b.value,
              resource: b.resource,
              remain:   b.remain,
            };
          }
        });"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patch successful!")
else:
    print("Could not find the block to replace!")
