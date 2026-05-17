import re

map_path = 'js/map.js'
with open(map_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update P_COLOR and NPC_C to fetch from CSS var
new_colors = """
  const getCssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* 动态获取势力颜色的辅助函数 */
  function _getFactionColor(key, isPlayer) {
    if (isPlayer) {
      const idx = key;
      // 默认 P_COLOR 配置
      const defs = [
        { fill:'rgba(80,10, 8,0.82)',  film:'rgba(210,55,40,0.20)',  stroke:'rgba(225,85,65,0.75)',  glow:'#ec7a62', text:'#fdeae6' },  // 赤
        { fill:'rgba( 8,55,22,0.82)',  film:'rgba(40,185,85,0.18)',  stroke:'rgba(55,200,100,0.70)', glow:'#52d478', text:'#e2f8ec' },  // 翠
        { fill:'rgba( 8,40,90,0.82)',  film:'rgba(40,125,220,0.20)', stroke:'rgba(65,150,240,0.70)', glow:'#60aef0', text:'#daeeff' },  // 青
      ];
      const def = defs[idx] || EMPTY_C;
      return {
        fill:   getCssVar(`--p${idx}-fill`) || def.fill,
        film:   def.film,
        stroke: getCssVar(`--p${idx}-strip`) || def.stroke,
        glow:   getCssVar(`--p${idx}-strip`) || def.glow,
        text:   def.text
      };
    } else {
      const slot = key; // e.g. 'npc1'
      // 默认 NPC_C 配置
      const def = NPC_C;
      if (!slot) return def;
      return {
        fill:   getCssVar(`--${slot}-fill`) || def.fill,
        film:   def.film,
        stroke: getCssVar(`--${slot}-strip`) || def.stroke,
        glow:   getCssVar(`--${slot}-strip`) || def.glow,
        text:   def.text
      };
    }
  }

  const NPC_C   = { fill:'rgba(35,25, 6,0.85)',  film:'rgba(170,128,40,0.22)', stroke:'rgba(200,155,55,0.70)', glow:'#caa042', text:'#f0dfa0' };
  const EMPTY_C = { fill:'rgba(10,11,16,0.55)',  film:'rgba(40, 45,55,0.12)',  stroke:'rgba(175,148,82,0.16)', glow:'#887760', text:'rgba(185,158,100,0.32)' };
"""

# Replace existing P_COLOR and NPC_C declarations
content = re.sub(
    r'const P_COLOR = \[\s*\{[^\}]+\},\s*//.*?\n\s*\{[^\}]+\},\s*//.*?\n\s*\{[^\}]+\},\s*//.*?\n\s*\];\n\s*const NPC_C[^;]+;\n\s*const EMPTY_C[^;]+;',
    new_colors, content
)

# Replace cityOwnership logic in _cityLayer
old_color_logic = """      if (!ow || ow.owner === '') {
        color = EMPTY_C;
      } else if (ow.owner === 'npc') {
        color = NPC_C; isNPC = true;
      } else {
        pidx = ow.playerIdx;
        color = P_COLOR[pidx] || EMPTY_C;
        isPlayer = true;
      }"""

new_color_logic = """      let npcSlot = null;
      if (!ow || ow.owner === '') {
        color = EMPTY_C;
      } else if (ow.owner === 'npc') {
        isNPC = true;
        npcSlot = _npcFactionSlots[ow.faction] || null;
        color = npcSlot ? _getFactionColor(npcSlot, false) : NPC_C;
      } else {
        pidx = ow.playerIdx;
        color = _getFactionColor(pidx, true) || EMPTY_C;
        isPlayer = true;
      }"""

content = content.replace(old_color_logic, new_color_logic)

# Make _npcFactionSlots available globally in map.js closure
content = re.sub(r'let _tooltip;\n', r'let _tooltip;\n  let _npcFactionSlots = {};\n', content)

# Calculate NPC factions logic inside _build (so it updates whenever cities change)
old_build = """  function _build(container) {
    container.innerHTML = `"""
new_build = """  function _build(container) {
    _updateFactionColors();
    container.innerHTML = `"""
content = content.replace(old_build, new_build)

# Add _updateFactionColors function
faction_colors_logic = """
  function _updateFactionColors() {
    const factionCounts = {};
    for (const city of CITIES) {
      const ow = cityOwnership[city.name];
      if (ow && ow.owner === 'npc' && ow.faction) {
        factionCounts[ow.faction] = (factionCounts[ow.faction] || 0) + 1;
      }
    }

    // Maintain stable slots
    const availableSlots = ['npc1', 'npc2', 'npc3', 'npc4', 'npc5', 'npc6'];
    const newSlots = {};
    const usedSlots = new Set();

    // Keep existing slots if >= 3
    for (const faction in _npcFactionSlots) {
      if (factionCounts[faction] >= 3) {
        newSlots[faction] = _npcFactionSlots[faction];
        usedSlots.add(newSlots[faction]);
      }
    }

    // Assign new slots for new factions with >= 3
    for (const faction in factionCounts) {
      if (factionCounts[faction] >= 3 && !newSlots[faction]) {
        for (const slot of availableSlots) {
          if (!usedSlots.has(slot)) {
            newSlots[faction] = slot;
            usedSlots.add(slot);
            break;
          }
        }
      }
    }

    _npcFactionSlots = newSlots;
  }
"""
content = content.replace('function _svg() {', faction_colors_logic + '\n  function _svg() {')


# Update road lines color logic
old_road_logic = """      if (same) {
        const pc = P_COLOR[owA.playerIdx] || NPC_C;"""
new_road_logic = """      if (same) {
        let pc = NPC_C;
        if (owA.owner === 'npc') {
           const slot = _npcFactionSlots[owA.faction];
           if (slot) pc = _getFactionColor(slot, false);
        } else {
           pc = _getFactionColor(owA.playerIdx, true);
        }
"""
content = content.replace(old_road_logic, new_road_logic)

# Update _showTip ownerClr
old_tip_logic = """    if (isNPC) {
      ownerStr = 'NPC 势力'; ownerClr = NPC_C.glow;
    } else if (isPlayer) {
      const p = players[ow.playerIdx];
      ownerStr = `${p?.name || ow.playerName}${ow.isMulti ? '〔占领〕' : '〔主城〕'}`;
      ownerClr = P_COLOR[ow.playerIdx]?.glow || '#fff';
    }"""
new_tip_logic = """    if (isNPC) {
      if (ow.faction && _npcFactionSlots[ow.faction]) {
        ownerStr = `${ow.faction}势力`;
        ownerClr = _getFactionColor(_npcFactionSlots[ow.faction], false).glow;
      } else {
        ownerStr = 'NPC 势力'; ownerClr = NPC_C.glow;
      }
    } else if (isPlayer) {
      const p = players[ow.playerIdx];
      ownerStr = `${p?.name || ow.playerName}${ow.isMulti ? '〔占领〕' : '〔主城〕'}`;
      ownerClr = _getFactionColor(ow.playerIdx, true).glow || '#fff';
    }"""
content = content.replace(old_tip_logic, new_tip_logic)

# Update _updateLegend
old_legend = """    let html = players.map((p, i) => {
      const pc = P_COLOR[i]; if (!pc) return '';
      return `<span class="sgmap-legend-item">
        <span class="sgmap-legend-dot" style="background:${pc.stroke};box-shadow:0 0 5px ${pc.glow}"></span>
        <span style="color:${pc.glow};font-weight:700">${_esc(p.name || '城主' + '甲乙丙'[i])}</span>
        <span style="color:var(--text-dim);font-size:.65rem"> ${cnt[i] || 0}城</span>
      </span>`;
    }).join('');
    const npcCnt = Object.values(cityOwnership).filter(o => o.owner === 'npc').length;
    html += `<span class="sgmap-legend-item">
      <span class="sgmap-legend-dot" style="background:${NPC_C.stroke}"></span>
      <span style="color:${NPC_C.glow};font-weight:700">NPC</span>
      <span style="color:var(--text-dim);font-size:.65rem"> ${npcCnt}城</span>
    </span>`;"""

new_legend = """    let html = players.map((p, i) => {
      const pc = _getFactionColor(i, true);
      return `<span class="sgmap-legend-item">
        <span class="sgmap-legend-dot" style="background:${pc.stroke};box-shadow:0 0 5px ${pc.glow}"></span>
        <span style="color:${pc.glow};font-weight:700">${_esc(p.name || '城主' + '甲乙丙'[i])}</span>
        <span style="color:var(--text-dim);font-size:.65rem"> ${cnt[i] || 0}城</span>
      </span>`;
    }).join('');

    const npcFactionCounts = {};
    let totalNpcCnt = 0;
    Object.values(cityOwnership).forEach(o => {
      if (o.owner === 'npc') {
        totalNpcCnt++;
        if (o.faction && _npcFactionSlots[o.faction]) {
          npcFactionCounts[o.faction] = (npcFactionCounts[o.faction] || 0) + 1;
        }
      }
    });

    for (const faction in npcFactionCounts) {
       const slot = _npcFactionSlots[faction];
       if (slot) {
         const fc = _getFactionColor(slot, false);
         html += `<span class="sgmap-legend-item">
           <span class="sgmap-legend-dot" style="background:${fc.stroke};box-shadow:0 0 5px ${fc.glow}"></span>
           <span style="color:${fc.glow};font-weight:700">${_esc(faction)}</span>
           <span style="color:var(--text-dim);font-size:.65rem"> ${npcFactionCounts[faction]}城</span>
         </span>`;
         // subtract from total npc count if needed, or leave it. We'll leave total.
       }
    }

    const plainNpcCnt = Object.values(cityOwnership).filter(o => o.owner === 'npc' && (!o.faction || !_npcFactionSlots[o.faction])).length;

    html += `<span class="sgmap-legend-item">
      <span class="sgmap-legend-dot" style="background:${NPC_C.stroke}"></span>
      <span style="color:${NPC_C.glow};font-weight:700">散城</span>
      <span style="color:var(--text-dim);font-size:.65rem"> ${plainNpcCnt}城</span>
    </span>`;"""
content = content.replace(old_legend, new_legend)

# Make sure to update the export at the bottom if needed. P_COLOR is exported. We should provide an array or getter.
content = content.replace("P_COLOR,\n  };", "get P_COLOR() { return [_getFactionColor(0, true), _getFactionColor(1, true), _getFactionColor(2, true)]; },\n    getFactionColor: _getFactionColor,\n  };")

with open(map_path, 'w', encoding='utf-8') as f:
    f.write(content)
