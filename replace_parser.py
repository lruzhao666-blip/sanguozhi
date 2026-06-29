import re

with open('js/parser.js', 'r') as f:
    content = f.read()

# Replace header
header_search = """ * v17 (#sanguo-npc-inherit-parser-v1): 支持 [NPC] 同上 简写,输出 npcCitiesInherit 标记
 * v16 (2026-XX-XX): 对齐 GM 规则书 v3.40 — [调度] 段状态白名单收窄至 4 种"""
header_replace = """ * v17 (#sanguo-npc-inherit-parser-v1): 支持 [NPC] 同上 简写,输出 npcCitiesInherit 标记
 * v18 (2026-06-30): [调度] 段升级到七槽格式 — 起点/终点拆分为独立槽位，
 *                   废除箭头→分隔符；驻屯时终点槽为"—"；不兼容旧六槽格式。
 * v16 (2026-XX-XX): 对齐 GM 规则书 v3.40 — [调度] 段状态白名单收窄至 4 种"""

if header_search in content:
    content = content.replace(header_search, header_replace)
    print("Header replaced.")
else:
    print("Header search not found!")

# Replace function
func_search = """  // ── 新格式：竖线六槽解析 ──
  function _parseTransitPipeLine(normLine, origLine, lineNo, FACTION_SLOT, TROOP_ALIAS) {
    const warnings = [];
    let level = null;
    const _info = (m) => { warnings.push(m); if (level !== 'WARN') level = 'INFO'; };
    const _warn = (m) => { warnings.push(m); level = 'WARN'; };

    // 跳过空段占位行
    if (/无在途|无调度|本回合无调度部队/.test(normLine)) return null;

    let parts = normLine.split('|').map(s => s.trim());

    // 容错：多于6段 → 第6段及之后重新拼回备注
    if (parts.length > 6) {
      const extra = parts.slice(5).join('|');
      parts = parts.slice(0, 5).concat([extra]);
      _info('竖线超过5个，第6槽及之后已合并为备注');
    }
    // 容错：少于6段 → 补空槽
    if (parts.length < 6) {
      _warn('竖线不足5个（仅' + parts.length + '段），缺失槽置空');
      while (parts.length < 6) parts.push('');
    }

    const [factionRaw, generalRaw, locationRaw, troopRaw, stateRaw, noteRaw] = parts;

    // 槽1 阵营
    if (!factionRaw) {
      _warn('阵营槽为空');
    }
    const slot = FACTION_SLOT.hasOwnProperty(factionRaw) ? FACTION_SLOT[factionRaw] : null;

    // 槽2 武将
    const generals = generalRaw ? generalRaw.split('/').map(s => s.trim()).filter(Boolean) : [];

    // 槽4 兵种解析
    const troops = {};
    const troopEntries = [];
    if (troopRaw) {
      troopRaw.split(',').forEach(piece => {
        const p = piece.trim();
        if (!p) return;
        const kvM = p.match(/^([^:：]+)[:：]\s*(\d+)$/);
        if (!kvM) {
          _info("无法识别的兵种片段'" + p + "'");
          return;
        }
        const key = kvM[1].trim();
        const num = parseInt(kvM[2], 10);
        const mapped = TROOP_ALIAS[key];
        if (!mapped) {
          _info("未知兵种'" + key + "'已忽略");
          return;
        }
        troops[mapped] = (troops[mapped] || 0) + num;
        troopEntries.push({ type: mapped, count: num });
      });
    }

    // 槽5 态：只认 "在途" 或 "驻屯"
    const isEnroute = (stateRaw === '在途');
    const isStationed = (stateRaw === '驻屯');
    if (!isEnroute && !isStationed && stateRaw) {
      _warn("态槽值'" + stateRaw + "'不在白名单(在途/驻屯)，按驻屯处理");
    }
    const moveType = isEnroute ? 'enroute' : 'stationed';

    // 槽3 位置 → from/to/location
    let from = '', to = '', location = '';
    // 归一化箭头变体
    const locNorm = (locationRaw || '')
      .replace(/->/g, '→').replace(/—>/g, '→').replace(/＞/g, '→');

    if (moveType === 'enroute') {
      const arrowM = locNorm.match(/(.+?)→(.+)/);
      if (arrowM) {
        from = arrowM[1].trim();
        to = arrowM[2].trim();
      } else {
        // "本回合抵达XX" 或无箭头
        to = locNorm.trim();
      }
    } else {
      location = locNorm.trim();
      to = location; // 兼容旧渲染
    }

    // 槽6 备注 → 提取 remain（在途时）或原样保留（驻屯时）
    let remainTurns = null;
    let arrived = false;
    let status = '';

    if (moveType === 'enroute') {
      // 从备注提取"剩N"或"剩0→到"
      const remM = (noteRaw || '').match(/剩\s*(\d+)/);
      if (remM) {
        remainTurns = parseInt(remM[1], 10);
      }
      if (/剩\s*0\s*→\s*到/.test(noteRaw || '')) {
        arrived = true;
        remainTurns = 0;
      }
      // status 显示用：在途时显示"剩N"
      if (remainTurns !== null) {
        status = arrived ? '本回合抵达' : ('剩' + remainTurns);
      } else {
        status = noteRaw || '';
      }
    } else {
      // 驻屯：备注原样作为 status 显示
      status = noteRaw || '';
    }

    // 兼容旧字段
    const firstEntry = troopEntries[0] || { type: '', count: 0 };

    return {
      // 旧字段（渲染层在用）
      faction: factionRaw,
      slot,
      general: generalRaw,
      from,
      to,
      troops,
      troopEntries,
      troopType: firstEntry.type,
      troopCount: firstEntry.count,
      status,
      note: noteRaw || '',
      isStationary: (moveType === 'stationed'),
      // 新字段
      generals,
      moveType,
      location: (moveType === 'stationed') ? location : null,
      remainTurns: (moveType === 'enroute') ? remainTurns : null,
      arrived,
      raw: origLine,
      warnings,
      warnLevel: level,
    };
  }"""
func_replace = """  // ── 新格式：竖线七槽解析 ──
  function _parseTransitPipeLine(normLine, origLine, lineNo, FACTION_SLOT, TROOP_ALIAS) {
    const warnings = [];
    let level = null;
    const _info = (m) => { warnings.push(m); if (level !== 'WARN') level = 'INFO'; };
    const _warn = (m) => { warnings.push(m); level = 'WARN'; };

    // 跳过空段占位行
    if (/无在途|无调度|本回合无调度部队/.test(normLine)) return null;

    let parts = normLine.split('|').map(s => s.trim());

    // 容错：多于7段 → 第7段及之后重新拼回备注
    if (parts.length > 7) {
      const extra = parts.slice(6).join('|');
      parts = parts.slice(0, 6).concat([extra]);
      _info('竖线超过6个，第7槽及之后已合并为备注');
    }
    // 容错：少于7段 → 补空槽
    if (parts.length < 7) {
      _warn('竖线不足6个（仅' + parts.length + '段），缺失槽置空');
      while (parts.length < 7) parts.push('');
    }

    const [factionRaw, generalRaw, fromRaw, toRaw, troopRaw, stateRaw, noteRaw] = parts;

    // 槽1 阵营
    if (!factionRaw) {
      _warn('阵营槽为空');
    }
    const slot = FACTION_SLOT.hasOwnProperty(factionRaw) ? FACTION_SLOT[factionRaw] : null;

    // 槽2 武将
    const generals = generalRaw ? generalRaw.split('/').map(s => s.trim()).filter(Boolean) : [];

    // 槽6 态：只认 "在途" 或 "驻屯"
    const isEnroute = (stateRaw === '在途');
    const isStationed = (stateRaw === '驻屯');
    if (!isEnroute && !isStationed && stateRaw) {
      _warn("态槽值'" + stateRaw + "'不在白名单(在途/驻屯)，按驻屯处理");
    }
    const moveType = isEnroute ? 'enroute' : 'stationed';

    // 槽3 起点、槽4 终点
    let from = fromRaw.trim();
    let to = '';
    let location = '';

    if (moveType === 'enroute') {
      // 在途：槽4是终点地名
      to = toRaw.trim();
      if (!to) _warn('在途部队终点槽为空');
    } else {
      // 驻屯：槽4应为"—"（或其他占位符），表示原地
      const dashTokens = ['—', '-', '－', '', '无'];
      if (!dashTokens.includes(toRaw.trim())) {
        _info("驻屯部队终点槽应为'—'，实际为'" + toRaw + "'");
      }
      location = from; // 驻屯位置就是起点
      to = location; // 兼容旧渲染
    }

    // 槽5 兵种解析
    const troops = {};
    const troopEntries = [];
    if (troopRaw) {
      troopRaw.split(',').forEach(piece => {
        const p = piece.trim();
        if (!p) return;
        const kvM = p.match(/^([^:：]+)[:：]\s*(\d+)$/);
        if (!kvM) {
          _info("无法识别的兵种片段'" + p + "'");
          return;
        }
        const key = kvM[1].trim();
        const num = parseInt(kvM[2], 10);
        const mapped = TROOP_ALIAS[key];
        if (!mapped) {
          _info("未知兵种'" + key + "'已忽略");
          return;
        }
        troops[mapped] = (troops[mapped] || 0) + num;
        troopEntries.push({ type: mapped, count: num });
      });
    }

    // 槽7 备注 → 提取 remain（在途时）
    let remainTurns = null;
    let arrived = false;
    let status = '';

    if (moveType === 'enroute') {
      // 从备注提取"剩N"或"剩0到"
      const remM = (noteRaw || '').match(/剩\s*(\d+)/);
      if (remM) {
        remainTurns = parseInt(remM[1], 10);
      }
      if (/剩\s*0/.test(noteRaw || '') && /到/.test(noteRaw || '')) {
        arrived = true;
        if (remainTurns === null) remainTurns = 0;
      }
      // status 显示用：在途时显示"剩N"
      if (remainTurns !== null) {
        status = arrived ? '本回合抵达' : ('剩' + remainTurns);
      } else {
        status = noteRaw || '';
      }
    } else {
      // 驻屯：备注原样作为 status 显示
      status = noteRaw || '';
    }

    // 兼容旧字段
    const firstEntry = troopEntries[0] || { type: '', count: 0 };

    return {
      faction: factionRaw,
      slot,
      general: generalRaw,
      from,
      to,
      troops,
      troopEntries,
      troopType: firstEntry.type,
      troopCount: firstEntry.count,
      status,
      note: noteRaw || '',
      isStationary: (moveType === 'stationed'),
      generals,
      moveType,
      location: (moveType === 'stationed') ? location : null,
      remainTurns: (moveType === 'enroute') ? remainTurns : null,
      arrived,
      raw: origLine,
      warnings,
      warnLevel: level,
    };
  }"""

if func_search in content:
    content = content.replace(func_search, func_replace)
    print("Function replaced.")
else:
    print("Function search not found!")

with open('js/parser.js', 'w') as f:
    f.write(content)
