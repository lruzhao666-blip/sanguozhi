import sys

file_path = "js/map.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_block = """    // ── 当前产业（productionBuffs）── 仅玩家城显示
    let prodHtml = '';
    if (isPlayer) {
      const buffs = ow?.productionBuffs;
      const buffList = buffs ? Object.values(buffs) : [];
      if (buffList.length > 0) {
        const PROD_ICON = { '屯田': '🌾', '开市': '💰' };
        const rows = buffList.map(b => {
          const icon = PROD_ICON[b.type] || '📌';
          return `<div class="sgt-row sgt-prod-buff">
            <span class="sgt-lbl">${icon} ${_esc(b.type)}</span>
            <span class="sgt-prod-val">+${b.value} ${_esc(b.resource)}/回合</span>
            <span class="sgt-prod-remain">剩 ${b.remain} 回合</span>
          </div>`;
        }).join('');
        prodHtml = `<div class="sgt-divider"></div>
          <div class="sgt-prod-title">当前产业</div>${rows}`;
      }
    }"""

new_block = """    // 任事区块（v3.9.2：暗箱铁律，不显示数值）
    let dutiesHTML = '';
    if (isPlayer && ow && ow.productionBuffs) {
      const buffList = Object.values(ow.productionBuffs);
      if (buffList.length) {
        const rows = buffList.map(b => {
          // 新格式 v3.9.2
          if (b.general) {
            return `<div class="sgmap-duty-row">
              <span class="sgmap-duty-emoji">${_esc(b.emoji || '')}</span>
              <span class="sgmap-duty-general">${_esc(b.general)}</span>
              <span class="sgmap-duty-action">${_esc(b.action)}</span>
              <span class="sgmap-duty-remain">/${b.remain}</span>
            </div>`;
          }
          // 旧格式兼容（不再显示数值，只显示类型与剩余回合）
          return `<div class="sgmap-duty-row">
            <span class="sgmap-duty-type">${_esc(b.type)}</span>
            <span class="sgmap-duty-remain">/${b.remain}</span>
          </div>`;
        }).join('');
        dutiesHTML = `
          <div class="sgmap-section sgmap-duties">
            <div class="sgmap-section-title">任事</div>
            ${rows}
          </div>`;
      }
    }"""

if old_block in content:
    content = content.replace(old_block, new_block)

    # Also replace ${prodHtml} with ${dutiesHTML} in the innerHTML
    content = content.replace("${prodHtml}", "${dutiesHTML}")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patch successful!")
else:
    print("Could not find the block to replace!")
