import sys

file_path = "js/parser.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_block = """      // 产出△城名:屯田+45粮/5,开市+30金/4
      if (/^产出△/.test(line)) {
        anchor = null;
        const rest = line.replace(/^产出△\s*/, '').trim();
        // 格式：城名:buff串  （冒号全半角均支持）
        const colonPos = rest.search(/[:：]/);
        if (colonPos > 0) {
          const cityName = rest.slice(0, colonPos).trim();
          const buffStr  = rest.slice(colonPos + 1).trim();
          const buffs = [];
          buffStr.split(/[,，]/).forEach(seg => {
            seg = seg.trim();
            if (!seg) return;
            // 到期格式：屯田-到期  开市-到期
            const expM = seg.match(/^([^+-]+)-到期$/);
            if (expM) { buffs.push({ type: expM[1].trim(), expired: true }); return; }
            // 增益格式：屯田+45粮/5  开市+30金/4
            const bufM = seg.match(/^([^+\-]+)[+]([0-9]+)([^/]+)\/([0-9]+)$/);
            if (bufM) {
              buffs.push({
                type:     bufM[1].trim(),
                value:    parseInt(bufM[2]),
                resource: bufM[3].trim(),
                remain:   parseInt(bufM[4]),
              });
              return;
            }
            // 宽容：无法解析的 seg 仍以原始字符串保存
            buffs.push({ type: seg, raw: seg });
          });
          if (!change.productionOps) change.productionOps = [];
          change.productionOps.push({ city: cityName, buffs });
        }
        continue;
      }"""

new_block = """      // 产出△城名:🌾 任峻 督民筑渠/4
      // v3.9.2：emoji + 武将 + 动作短语 + 剩余回合（暗箱铁律，无数值）
      if (/^产出△/.test(line)) {
        anchor = null;
        const rest = line.replace(/^产出△\s*/, '').trim();
        const colonPos = rest.search(/[:：]/);
        if (colonPos > 0) {
          const cityName = rest.slice(0, colonPos).trim();
          const buffStr  = rest.slice(colonPos + 1).trim();
          const buffs = [];

          // 九大任事 emoji → 类型名映射
          const DUTY_EMOJI_MAP = {
            '🌾': '屯田', '💰': '开市', '🐫': '通商', '🤝': '人才',
            '🔨': '工造', '📚': '教化', '⚔️': '军训', '🕊️': '情报', '🎁': '特产',
          };
          // ⚔️ 带变体选择符 \uFE0F，做容错
          const DUTY_EMOJI_MAP_LOOSE = {};
          Object.keys(DUTY_EMOJI_MAP).forEach(k => {
            DUTY_EMOJI_MAP_LOOSE[k] = DUTY_EMOJI_MAP[k];
            DUTY_EMOJI_MAP_LOOSE[k.replace(/\uFE0F/g, '')] = DUTY_EMOJI_MAP[k];
          });

          buffStr.split(/[,，]/).forEach(seg => {
            seg = seg.trim();
            if (!seg) return;

            // 到期格式：屯田-到期（保留兼容）
            const expM = seg.match(/^([^+\-]+)-到期$/);
            if (expM) { buffs.push({ type: expM[1].trim(), expired: true }); return; }

            // ★ 新格式 v3.9.2：emoji + 空格 + 武将名 + 空格 + 动作短语/剩余回合
            // 例：🌾 任峻 督民筑渠/4
            const newM = seg.match(/^(\S+)\s+(\S+)\s+(.+)\/(\d+)$/);
            if (newM) {
              const emojiRaw   = newM[1].trim();
              const generalNm  = newM[2].trim();
              const action     = newM[3].trim();
              const remain     = parseInt(newM[4]);
              const emojiKey   = emojiRaw.replace(/\uFE0F/g, '');
              const dutyType   = DUTY_EMOJI_MAP_LOOSE[emojiKey] || DUTY_EMOJI_MAP_LOOSE[emojiRaw] || '任事';
              buffs.push({
                type:    dutyType,
                emoji:   emojiRaw,
                general: generalNm,
                action:  action,
                remain:  remain,
              });
              return;
            }

            // 旧格式兼容：屯田+45粮/5  开市+30金/4
            const oldM = seg.match(/^([^+\-]+)[+]([0-9]+)([^/]+)\/([0-9]+)$/);
            if (oldM) {
              buffs.push({
                type:     oldM[1].trim(),
                value:    parseInt(oldM[2]),
                resource: oldM[3].trim(),
                remain:   parseInt(oldM[4]),
              });
              return;
            }

            // 兜底
            buffs.push({ type: seg, raw: seg });
          });

          if (!change.productionOps) change.productionOps = [];
          change.productionOps.push({ city: cityName, buffs });
        }
        continue;
      }"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patch successful!")
else:
    print("Could not find the block to replace!")
