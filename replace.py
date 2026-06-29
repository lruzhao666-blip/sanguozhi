import re

with open('js/parser.js', 'r') as f:
    content = f.read()

# Define the start and end of the function to replace
start_comment = "// v18 (#parser-transit-multitroop-v1):"
start_func = "  function _parseTransit(raw) {"

# Find the start
idx_func = content.find(start_func)
if idx_func == -1:
    print("Function not found")
    exit(1)

# Find the end of the function (matching braces)
brace_count = 0
end_idx = -1
in_func = False

for i in range(idx_func, len(content)):
    if content[i] == '{':
        brace_count += 1
        in_func = True
    elif content[i] == '}':
        brace_count -= 1
        if in_func and brace_count == 0:
            end_idx = i + 1
            break

if end_idx == -1:
    print("Could not find end of function")
    exit(1)

new_func = """  function _parseTransit(raw) {
    if (!raw || !raw.trim()) return [];

    // 空白归一：全角空格→半角，连续空格→单个半角
    const _normSpace = (s) => String(s == null ? '' : s)
      .replace(/\\u3000/g, ' ')
      .replace(/[ \\t]+/g, ' ')
      .trim();

    const rawLines = raw.split('\\n').map(l => l.replace(/\\s+$/, '')).filter(l => l.trim());

    // 空段判定
    if (rawLines.length === 1 &&
        /无在途|无调度|本回合无调度部队/.test(rawLines[0])) {
      return [];
    }

    const FACTION_SLOT = { '甲': 0, '乙': 1, '丙': 2 };

    // 兵种容错映射
    const TROOP_ALIAS = {
      '步': '步', '步卒': '步', '步兵': '步',
      '弓': '弓', '弓手': '弓', '弓兵': '弓',
      '骑': '骑', '骑兵': '骑',
      '水': '水', '水军': '水',
      '蛮': '蛮', '蛮兵': '蛮',
    };
    // 非兵种噪声词（出现在兵种槽里要剔除，数值不计入）
    const TROOP_NOISE = ['民夫', '民船', '残部'];
    // 格式分类名（误填进行内要剥离）
    const FORMAT_WORDS = ['位移态', '驻扎态', '在路上', '已就位'];

    const result = [];

    // 清洗单个兵种槽：返回 { troops, troopEntries, infos:[] }
    const _cleanTroops = (seg) => {
      const troops = {};
      const troopEntries = [];
      const infos = [];
      seg.split(/[,，]/).forEach(piece => {
        let p = piece.trim();
        if (!p) return;
        // 剥离括号尾注 (折N) / （折500） 等
        const noteM = p.match(/[（(]([^）)]*)[）)]\\s*$/);
        if (noteM) {
          infos.push("剥离兵种尾注'(" + noteM[1] + ")'");
          p = p.replace(/[（(][^）)]*[）)]\\s*$/, '').trim();
        }
        const kvM = p.match(/^([^:：]+)[:：]\\s*(-?\\d+)$/);
        if (!kvM) {
          if (p) infos.push("无法识别的兵种片段'" + p + "'，已忽略");
          return;
        }
        const key = kvM[1].trim();
        const num = parseInt(kvM[2], 10);
        // 噪声词剔除
        if (TROOP_NOISE.indexOf(key) !== -1) {
          infos.push("非兵种'" + key + ":" + num + "'已剔除，数值不计入兵力");
          return;
        }
        const mapped = TROOP_ALIAS[key];
        if (!mapped) {
          infos.push("未知兵种'" + key + "'已忽略");
          return;
        }
        if (mapped !== key) {
          infos.push("兵种'" + key + "'归一为'" + mapped + "'");
        }
        troops[mapped] = (troops[mapped] || 0) + num;
        troopEntries.push({ type: mapped, count: num });
      });
      return { troops, troopEntries, infos };
    };

    // 剥离状态文本中的格式分类名；返回 { status, warns:[] }
    const _cleanStatus = (s) => {
      const warns = [];
      let txt = _normSpace(s);
      FORMAT_WORDS.forEach(w => {
        if (txt.indexOf(w) !== -1) {
          warns.push("剥离格式分类名'" + w + "'");
          txt = txt.split(w).join('');
        }
      });
      txt = _normSpace(txt);
      return { status: txt, warns };
    };

    rawLines.forEach((origLine, i) => {
      const lineNo = i + 1;
      const line = _normSpace(origLine);
      const warnings = [];        // 本行容错记录（INFO/WARN 文案）
      let level = null;           // 'WARN' | 'INFO' | null
      const _info = (m) => { warnings.push(m); if (level !== 'WARN') level = 'INFO'; };
      const _warn = (m) => { warnings.push(m); level = 'WARN'; };

      // 跳过空段提示行（多行里夹杂的）
      if (/无在途|无调度|本回合无调度部队/.test(line)) return;

      // 行类型判定（D-1）：剩N / 本回合抵达 → 在路上；含→但无剩N → WARN 仍按在路上
      const hasRemain  = /剩\\s*\\d+\\s*回合/.test(line);
      const hasArrived = /本回合抵达/.test(line);
      const hasArrow   = line.indexOf('→') !== -1;
      let moveType;
      if (hasRemain || hasArrived) {
        moveType = 'enroute';
      } else if (hasArrow) {
        moveType = 'enroute';
        _warn("含'→'但无'剩N回合'/'本回合抵达'，按在路上尽力解析");
      } else {
        moveType = 'stationed';
      }

      // 按空格切槽
      const slots = line.split(' ').filter(Boolean);

      // 首槽：阵营锚点（甲/乙/丙 或 长度≤6 的连续非空白 NPC 主公名）
      const factionRaw = slots.length ? slots[0] : '';
      const isValidFaction = /^[甲乙丙]$/.test(factionRaw) ||
        (factionRaw.length >= 1 && factionRaw.length <= 6 && !/\\s/.test(factionRaw));
      if (!factionRaw || !isValidFaction) {
        result.push({
          __error: true,
          line: lineNo,
          raw: origLine,
          reason: '缺阵营首槽',
          action: '该行不渲染，进告警区',
        });
        return;
      }
      const slot = FACTION_SLOT.hasOwnProperty(factionRaw) ? FACTION_SLOT[factionRaw] : null;

      // 武将名槽（第二槽），/ 拆数组但保留原槽文本
      const generalRaw = slots[1] || '';
      const generals = generalRaw ? generalRaw.split('/').map(s => s.trim()).filter(Boolean) : [];

      // 找兵种槽：从第三槽起，第一个含 数字 且形如 X:N 的槽（去括号后判定）
      const _looksTroop = (s) => {
        const t = s.replace(/[（(][^）)]*[）)]/g, '');
        return /[:：]\\s*-?\\d+/.test(t);
      };
      let troopIdx = -1;
      for (let k = 2; k < slots.length; k++) {
        if (_looksTroop(slots[k])) { troopIdx = k; break; }
      }

      let troops = {}, troopEntries = [];
      if (troopIdx !== -1) {
        const cleaned = _cleanTroops(slots[troopIdx]);
        troops = cleaned.troops;
        troopEntries = cleaned.troopEntries;
        cleaned.infos.forEach(_info);
      } else {
        _warn('未找到合法兵种槽');
      }

      // 位置/路线（第三槽到兵种槽之间的槽合并；无兵种槽则到末尾前留状态）
      const midEnd = troopIdx !== -1 ? troopIdx : slots.length;
      const midParts = slots.slice(2, midEnd);
      const midText = midParts.join(' ');

      let from = '', to = '', location = '';
      if (moveType === 'enroute') {
        // 优先从含 → 的部分拆 from/to
        const arrowSrc = hasArrow ? midText : (line.indexOf('→') !== -1 ? line : midText);
        const arrowM = arrowSrc.match(/(\\S+?)→(\\S+)/);
        if (arrowM) {
          from = _normSpace(arrowM[1]);
          to   = _normSpace(arrowM[2]);
        } else {
          to = _normSpace(midText);
        }
      } else {
        location = _normSpace(midText);
        to = location; // 兼容旧渲染：驻扎态下 to=位置
      }

      // 剩N / 本回合抵达（D-5）
      let remainTurns = null;
      let arrived = false;
      const remM = line.match(/剩\\s*(\\d+)\\s*回合/);
      if (remM) {
        remainTurns = parseInt(remM[1], 10);
        if (remainTurns === 0) {
          _warn("出现'剩0回合'，按'本回合抵达'处理");
          arrived = true;
        }
      }
      if (hasArrived) {
        arrived = true;
        if (remainTurns === null) remainTurns = 0;
      }

      // 状态槽：兵种槽之后的剩余文本（剥掉剩N / 本回合抵达XX）
      let statusSrc = '';
      if (troopIdx !== -1) {
        statusSrc = slots.slice(troopIdx + 1).join(' ');
      }
      statusSrc = statusSrc
        .replace(/剩\\s*\\d+\\s*回合/g, '')
        .replace(/本回合抵达[^\\s]*/g, '');
      const sc = _cleanStatus(statusSrc);
      sc.warns.forEach(_warn);
      let status = sc.status;
      if (moveType === 'stationed' && !status) {
        _warn('剥离后状态槽为空');
      }

      // 兼容旧字段
      const firstEntry = troopEntries[0] || { type: '', count: 0 };

      result.push({
        // ── 旧字段（渲染层在用，保持不变）──
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
        note: '',
        isStationary: (moveType === 'stationed'),
        // ── 新字段（D-7 冗余输出）──
        generals,
        moveType,
        location: (moveType === 'stationed') ? location : null,
        remainTurns: (moveType === 'enroute') ? remainTurns : null,
        arrived,
        raw: origLine,
        warnings,
        warnLevel: level, // 'WARN' | 'INFO' | null
      });
    });

    return result;
  }"""

new_content = content[:idx_func] + new_func + content[end_idx:]

with open('js/parser.js', 'w') as f:
    f.write(new_content)

print("Replacement successful")
