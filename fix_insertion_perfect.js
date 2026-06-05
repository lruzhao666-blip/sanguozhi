const fs = require('fs');
let content = fs.readFileSync('js/diagnostics.js', 'utf8');

const r12Index = content.lastIndexOf("id: 'R12'");
if (r12Index !== -1) {
    const endArrayMatch = content.indexOf("  ];", r12Index);
    if (endArrayMatch !== -1) {
        const insertionIndex = endArrayMatch;

        const codeToInsert = `    /* ─────── R15 空城未补人(连续 ≥3 回合 warn / ≥5 回合 error) ─────── */
    /* #diag-r15-empty-city-watch-v1 (2026-XX-XX):
       依据 M-21【无主之城】"无将时守将写「空」,产出 ×0.5,民心 -3。
       空置 ≥3 回合 GM 择一:豪强自立 / 邻势力吞并"。

       检测策略:
       - 扫描所有历史回合,对每座城(玩家+NPC)按"阵营+城名"建立连续空置计数
       - 阵营变更(易主)即清零重计
       - 同一城连续空置:≥3 回合 → warn,≥5 回合 → error(升级)
       - 每回合都报(玩家可"忽略本条"暂屏蔽)

       语气定位:这是提醒,不是错误,主持人保留裁量。 */
    {
      id: 'R15', name: '空城未补人', level: 'warn', enabled: true,
      check(rounds, latest) {
        if (!latest || !latest.parsed || !rounds.length) return [];
        const round = latest.round || 0;

        /* 工具:从一个 parsed 中提取本回合所有城的「阵营 + 城名 + 是否空」三元组
           阵营键说明:
             - 玩家城:'甲'/'乙'/'丙'
             - NPC 城有阵营标签:阵营主公名(如'袁绍')
             - NPC 散城:'__npc_unowned__'(统一归一,无阵营即视为同阵营)
           本回合该城不在数据里 → 不进 map(自动断链清零) */
        function snapshot(parsed) {
          const map = {};  /* key = \`\${faction}::\${cityName}\` → { faction, city, empty } */
          if (!parsed) return map;

          (parsed.players || []).forEach(p => {
            const slot = p.slot;
            if (!slot) return;
            (p.cities_list || []).forEach(c => {
              if (!c || !c.name) return;
              const key = slot + '::' + c.name;
              map[key] = {
                faction: slot,
                city: c.name,
                empty: !!c.holderEmpty,
              };
            });
          });

          (parsed.npcCities || []).forEach(c => {
            if (!c || !c.name) return;
            const fac = c.faction || '__npc_unowned__';
            const key = fac + '::' + c.name;
            map[key] = {
              faction: fac,
              city: c.name,
              empty: !!c.holderEmpty,
            };
          });

          return map;
        }

        /* 从最早回合开始,对每个 key 累计连续空置数
           - 空 → 计数 +1
           - 不空(有人驻守) → 计数清零
           - 城在本回合数据中不存在(易主/被吞) → 计数清零(下次再出现重新起算) */
        const counter = {};  /* key → 当前连续空置回合数 */
        const lastSeen = {}; /* key → 上次见到此 key 的回合号 */

        for (let i = 0; i < rounds.length; i++) {
          const rd = rounds[i];
          const snap = snapshot(rd.parsed);
          const seenThisRound = new Set();

          Object.keys(snap).forEach(key => {
            seenThisRound.add(key);
            const info = snap[key];
            if (info.empty) {
              counter[key] = (counter[key] || 0) + 1;
            } else {
              counter[key] = 0;
            }
            lastSeen[key] = rd.round || 0;
          });

          /* 本回合没出现的 key(城易主或被吞):清零计数 */
          Object.keys(counter).forEach(key => {
            if (!seenThisRound.has(key)) {
              counter[key] = 0;
            }
          });
        }

        /* 最终状态:对最新回合的所有城,counter[key] 即为连续空置回合数 */
        const latestSnap = snapshot(latest.parsed);
        const issues = [];

        Object.keys(latestSnap).forEach(key => {
          const info = latestSnap[key];
          if (!info.empty) return;
          const streak = counter[key] || 0;
          if (streak < 3) return;

          /* 阵营展示名 */
          let factionLabel;
          if (info.faction === '甲' || info.faction === '乙' || info.faction === '丙') {
            factionLabel = info.faction + '方';
          } else if (info.faction === '__npc_unowned__') {
            factionLabel = '散城';
          } else {
            factionLabel = info.faction + '势力';
          }

          /* 文案分级:≥5 升级为 error,提醒"豪强自立/邻势力吞并"风险 */
          if (streak >= 5) {
            issues.push({
              id: 'R15-r' + round + '-' + key + '-err',
              ruleId: 'R15', ruleName: '空城未补人', level: 'error',
              body: factionLabel + '<b>' + escHtml(info.city) + '</b>已连续空置 <span class="diag-mark">' + streak + '</span> 回合,远超 M-21 规定的 3 回合阈值。豪强自立或邻势力吞并的风险已然存在,建议尽快提醒主持人安排守将或推进事件。',
              copy: '【第' + round + '回合数据核对】[R15·空城未补人] ' + factionLabel + info.city + '已连续空置 ' + streak + ' 回合(M-21 规定 ≥3 回合 GM 应择一:豪强自立 / 邻势力吞并)。请问该城本回合是否需要安排守将,或触发对应事件?',
            });
          } else {
            issues.push({
              id: 'R15-r' + round + '-' + key + '-warn',
              ruleId: 'R15', ruleName: '空城未补人', level: 'warn',
              body: factionLabel + '<b>' + escHtml(info.city) + '</b>已连续空置 <span class="diag-mark">' + streak + '</span> 回合,达到 M-21【无主之城】3 回合阈值。可提醒主持人:本回合是否需要派将驻守,或推进"豪强自立 / 邻势力吞并"事件。',
              copy: '【第' + round + '回合数据核对】[R15·空城未补人] ' + factionLabel + info.city + '已连续空置 ' + streak + ' 回合,达到 M-21 的 3 回合阈值。请问本回合是否需要派将驻守,或考虑推进相应事件?',
            });
          }
        });

        return issues;
      },
    },\n`;

        content = content.substring(0, insertionIndex) + codeToInsert + content.substring(insertionIndex);
        fs.writeFileSync('js/diagnostics.js', content);
        console.log("Successfully inserted!");
    } else {
        console.error("Did not find `  ];` after R12.");
    }
} else {
    console.error("R12 not found.");
}
