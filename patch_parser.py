import re

parser_path = 'js/parser.js'
with open(parser_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update regex in _parseCityList
old_re = r"const re = /\(\[\^,，、\(\（\\s\]\+\)\[\（\(\]\(\[\^）\)\]\*\)\[）\)\]/g;"
new_re = r"const re = /([^,，、\[(（\s]+)(?:\[([^\]]+)\])?[（(]([^）)]*)[）)]/g;"
content = content.replace(old_re, new_re)

# Patch _parseCityList while loop to handle the new capture group
old_while = """    while ((m = re.exec(raw)) !== null) {
      const name  = m[1].trim();
      const inner = m[2].trim();"""
new_while = """    while ((m = re.exec(raw)) !== null) {
      const name  = m[1].trim();
      const faction = m[2] ? m[2].trim() : null;
      const inner = m[3].trim();"""
content = content.replace(old_while, new_while)

old_push = """      result.push({
        name,
        holder:  holders.join('/') || '无',
        holders,
        troops:  _parseTroops(troopsRaw),
      });"""
new_push = """      result.push({
        name,
        faction,
        holder:  holders.join('/') || '无',
        holders,
        troops:  _parseTroops(troopsRaw),
      });"""
content = content.replace(old_push, new_push)

old_push_fallback = """if (n) result.push({ name: n, holder: '无', holders: [], troops: {} });"""
new_push_fallback = """if (n) result.push({ name: n, faction: null, holder: '无', holders: [], troops: {} });"""
content = content.replace(old_push_fallback, new_push_fallback)

# Patch _parseNpcBlock
old_map = """    return list.map(c => ({
      name:    c.name,
      holders: c.holders || (c.holder && c.holder !== '无' ? c.holder.split('/') : []),
      holder:  c.holder,
      troops:  c.troops || {},
    }));"""
new_map = """    return list.map(c => ({
      name:    c.name,
      faction: c.faction,
      holders: c.holders || (c.holder && c.holder !== '无' ? c.holder.split('/') : []),
      holder:  c.holder,
      troops:  c.troops || {},
    }));"""
content = content.replace(old_map, new_map)

# Patch _buildCityOwnership
old_npc_obj = """        result[c.name] = {
          owner:      'npc',
          playerIdx:  -1,
          playerName: '',
          holder:     c.holder || '无',
          troops:     c.troops || {},
          isMulti:    false,
        };"""
new_npc_obj = """        result[c.name] = {
          owner:      'npc',
          faction:    c.faction || null,
          playerIdx:  -1,
          playerName: '',
          holder:     c.holder || '无',
          troops:     c.troops || {},
          isMulti:    false,
        };"""
content = content.replace(old_npc_obj, new_npc_obj)

with open(parser_path, 'w', encoding='utf-8') as f:
    f.write(content)
