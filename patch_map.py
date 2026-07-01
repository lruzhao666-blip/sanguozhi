import re

with open('js/map.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Header
header_addition = "* v20261111k (工单#map-tooltip-facility-emoji-warfront-B-v1): 设施彩色emoji + 标题齿轮 + 兵力焦点放大"
if header_addition not in content:
    content = re.sub(r'(\/\*\*[\s\S]*?\* v25\.7 [^\n]*)', r'\1\n ' + header_addition, content, 1)

# 2. FACILITY_ICON
icon_def = """  // v20261111k 设施彩色 emoji 映射（工单#map-tooltip-facility-emoji-warfront-B-v1）
  // 5 项带 \\uFE0F 变体选择符强制彩色渲染：粮仓/矿场/校场/医馆/水寨
  const FACILITY_ICON = {
    '屯田': '\\uD83C\\uDF3E',            // 🌾
    '水车': '\\uD83D\\uDCA7',            // 💧
    '粮仓': '\\uD83C\\uDFDA\\uFE0F',      // 🏚️
    '市集': '\\uD83C\\uDFAA',            // 🎪
    '矿场': '\\u26CF\\uFE0F',            // ⛏️
    '商会': '\\uD83D\\uDCB0',            // 💰
    '码头': '\\u26F5',                  // ⛵
    '校场': '\\u2694\\uFE0F',            // ⚔️
    '城墙': '\\uD83C\\uDFF0',            // 🏰
    '箭楼': '\\uD83C\\uDFF9',            // 🏹
    '驿站': '\\uD83D\\uDC0E',            // 🐎
    '义仓': '\\uD83C\\uDF5A',            // 🍚
    '书院': '\\uD83D\\uDCDA',            // 📚
    '医馆': '\\u2695\\uFE0F',            // ⚕️
    '马场': '\\uD83D\\uDC34',            // 🐴
    '水寨': '\\u2693\\uFE0F',            // ⚓️
    '弩坊': '\\uD83C\\uDFAF',            // 🎯
    '蛮营': '\\uD83D\\uDEE1\\uFE0F',      // 🛡️
  };"""

if "const FACILITY_ICON =" not in content:
    content = re.sub(
        r'(const FACILITY_EFFECTS = \{[\s\S]*?\n  \};)',
        r'\1\n\n' + icon_def,
        content
    )

# 3. sgt-facility-block
old_facility_block = """      <div class="sgt-facility-block">
        <div class="sgt-facility-block-title">
          ⚙️ 设施
          <span class="count">${ow.facilities.length} 项</span>
        </div>
        <div class="sgt-facility-chips">
          ${ow.facilities.map(facilityName => {
            const category = getFacilityCategory(facilityName);
            let chipHtml = `<div class="sgt-facility-chip ${category}" title="${facilityName}">`;
            chipHtml += `<span class="sgt-facility-name">${facilityName}</span>`;
            chipHtml += `</div>`;
            return chipHtml;
          }).join('')}
        </div>
      </div>"""

new_facility_block = """      <div class="sgt-facility-block">
        <div class="sgt-facility-block-title">
          <span style="font-size:.85rem;line-height:1;margin-right:2px">\\u2699\\uFE0F</span>设施
          <span class="count">${ow.facilities.length} 项</span>
        </div>
        <div class="sgt-facility-chips">
          ${ow.facilities.map(facilityName => {
            const category = getFacilityCategory(facilityName);
            const icon = FACILITY_ICON[facilityName] || '';
            let chipHtml = `<div class="sgt-facility-chip ${category}" title="${facilityName}">`;
            if (icon) chipHtml += `<span style="font-size:.8rem;line-height:1">${icon}</span>`;
            chipHtml += `<span class="sgt-facility-name">${facilityName}</span>`;
            chipHtml += `</div>`;
            return chipHtml;
          }).join('')}
        </div>
      </div>"""

if "⚙️ 设施" in content:
    content = content.replace(old_facility_block, new_facility_block)

# 4. _chips
old_chips = """    const _chips = (t) => TROOP_TYPES.filter(k => (t[k]||0) > 0)
      .map(k => `<span class="sgt-troop-chip"><b>${k}</b><span>${Number(t[k]).toLocaleString()}</span></span>`).join('');"""

new_chips = """    const _chips = (t) => TROOP_TYPES.filter(k => (t[k]||0) > 0)
      .map(k => `<span class="sgt-troop-chip"><b>${k}</b><span style="font-size:1rem;font-weight:800;color:#f0c060">${Number(t[k]).toLocaleString()}</span></span>`).join('');"""

if old_chips in content:
    content = content.replace(old_chips, new_chips)


with open('js/map.js', 'w', encoding='utf-8') as f:
    f.write(content)
