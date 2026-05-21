window.SGValidator = (function() {
  'use strict';

  function _sumBreakdown(breakdown, cat) {
    if (!breakdown || !breakdown[cat]) return 0;
    return breakdown[cat].items.reduce((sum, item) => sum + item.val, 0);
  }

  function validate(parsedTurn, lastResources) {
    const errors = [];
    const warnings = [];

    if (!parsedTurn || !parsedTurn.changes) return { errors, warnings };

    const isQuarterly = (parsedTurn.round % 10 === 0);
    let hasQuarterlyEvent = false;

    // Rule 4: General Status valid values
    const VALID_STATUS = ['空', '疲劳', '受伤', '患病', '阵亡']; // 括号内是空的话就是健康
    if (parsedTurn.players) {
      parsedTurn.players.forEach(p => {
        if (p.generals) {
          p.generals.forEach(g => {
            if (g.status && !VALID_STATUS.includes(g.status)) {
               // The rules said "括号内只能是...之一"
               if (g.status !== '空' && g.status !== '') {
                 errors.push({ slot: p.slot, playerName: p.name, type: 'invalid_status', message: `武将[${g.name}]状态非法: ${g.status}` });
               }
            }
          });
        }
      });
    }

    // Rule 4: Battle result strings
    if (parsedTurn.battles) {
      parsedTurn.battles.forEach(b => {
        if (b.result && !['胜', '平', '负'].includes(b.result)) {
           errors.push({ slot: '战报', playerName: '', type: 'invalid_battle_result', message: `战报结果非法(只能胜/平/负): ${b.result}` });
        }
      });
    }

    parsedTurn.changes.forEach(ch => {
      const pName = ch.slot; // 甲, 乙, 丙
      const playerName = parsedTurn.players?.find(p => p.slot === pName)?.name || '';

      // Rule 1 & 2: Breakdown Sum vs Total
      const resTypes = ['金', '粮', '兵', '民心'];
      resTypes.forEach(cat => {
        if (ch.breakdown && ch.breakdown[cat]) {
          const declaredTotal = ch.breakdown[cat].total;
          const sum = _sumBreakdown(ch.breakdown, cat);
          // Rule 2
          if (declaredTotal !== sum) {
             const itemsStr = ch.breakdown[cat].items.map(i => `${i.label}${i.val > 0 ? '+' : ''}${i.val}`).join(', ');
             errors.push({ slot: pName, playerName, type: 'sum_mismatch', message: `${cat}合计声明 ${declaredTotal},但分项加总 (${itemsStr}) = ${sum}` });
          }
          // Rule 1
          if (ch.resources && ch.resources[cat] !== undefined) {
             if (ch.resources[cat] !== declaredTotal) {
               errors.push({ slot: pName, playerName, type: 'delta_mismatch', message: `总变化${cat}△${ch.resources[cat]} 与收支明细合计${declaredTotal}不符` });
             }
          }
        }
      });

      // Rule 5: Quarterly
      if (ch.quarterly && ch.quarterly.length > 0) {
        hasQuarterlyEvent = true;
      }
    });

    // Rule 4: Raw text city lines check
    if (parsedTurn.rawDigest) {
      const cityLines = parsedTurn.rawDigest.split('\n').filter(l => /^城池[:：]/.test(l));
      cityLines.forEach(line => {
        if (/[\uff08\uff09\uff5c\uff0f\uff1a\uff0c]/.test(line)) {
          errors.push({ slot: '城池行', playerName: '', type: 'full_width_char', message: `城池行包含全角字符 ( ) | / : , : ${line}` });
        }
      });
    }

    // Rule 3: Continuity
    if (lastResources && parsedTurn.players) {
      parsedTurn.players.forEach(p => {
        const lastP = lastResources.find(lp => lp.slot === p.slot);
        if (lastP) {
          const ch = parsedTurn.changes.find(c => c.slot === p.slot);
          const resources = ['gold', 'food', 'troop', 'morale'];
          const resNames = ['金', '粮', '兵', '民心'];
          resources.forEach((res, idx) => {
            if (p[res] != null && lastP[res] != null) {
              const diff = p[res] - lastP[res];
              const declaredDelta = ch && ch.resources && ch.resources[resNames[idx]] !== undefined ? ch.resources[resNames[idx]] : 0;
              if (diff !== declaredDelta) {
                errors.push({ slot: p.slot, playerName: p.name, type: 'continuity_error', message: `资源延续性:上回合${resNames[idx]} ${lastP[res]},本回合 ${p[res]},差额 ${diff},与声明的 ${resNames[idx]}△${declaredDelta} 不符` });
              }
            }
          });
        }
      });
    }

    // Rule 5: Quarterly checks
    if (parsedTurn.round > 0) {
      if (isQuarterly && !hasQuarterlyEvent) {
        warnings.push({ slot: '全局', playerName: '', type: 'quarterly_missing', message: `第${parsedTurn.round}回合应出现季度△ 行` });
      } else if (!isQuarterly && hasQuarterlyEvent) {
        warnings.push({ slot: '全局', playerName: '', type: 'quarterly_unexpected', message: `第${parsedTurn.round}回合不应出现季度△ 行(应仅 10/20/30 出现)` });
      }

      if (isQuarterly && hasQuarterlyEvent) {
        parsedTurn.changes.forEach(ch => {
          if (ch.quarterly && ch.quarterly.length > 0) {
             const p = parsedTurn.players?.find(p => p.slot === ch.slot);
             const citiesCount = p ? p.cities : 0;
             if (citiesCount > 0) {
               const expectedGold = citiesCount * -50;
               const expectedFood = citiesCount * -100;
               let actualGold = 0, actualFood = 0;
               ch.quarterly.forEach(q => {
                 if (q.res === '金') actualGold += q.val;
                 if (q.res === '粮') actualFood += q.val;
               });

               if (Math.abs(actualGold - expectedGold) > Math.abs(expectedGold * 0.2)) {
                 warnings.push({ slot: ch.slot, playerName: p.name, type: 'quarterly_amount', message: `季度金扣除 ${actualGold} 与预期 ${expectedGold} 偏差过大` });
               }
               if (Math.abs(actualFood - expectedFood) > Math.abs(expectedFood * 0.2)) {
                 warnings.push({ slot: ch.slot, playerName: p.name, type: 'quarterly_amount', message: `季度粮扣除 ${actualFood} 与预期 ${expectedFood} 偏差过大` });
               }
             }
          }
        });
      }
    }

    // Rule 6: Battle vs Troop delta
    if (parsedTurn.battles) {
      parsedTurn.battles.forEach(b => {
         const attackerP = parsedTurn.players?.find(p => p.name === b.attacker || p.slot === b.attackerSlot);
         if (attackerP) {
           const ch = parsedTurn.changes.find(c => c.slot === attackerP.slot);
           if (ch && ch.breakdown && ch.breakdown['兵']) {
             const hasLoss = ch.breakdown['兵'].items.some(i => i.val < 0);
             if (!hasLoss) {
               warnings.push({ slot: attackerP.slot, playerName: attackerP.name, type: 'battle_troop_mismatch', message: `战报有攻城行为，但兵收支无战损负值` });
             }
           }
         }
      });
    }

    return { errors, warnings };
  }

  function buildPromptText(turnNum, errors, warnings) {
    if (errors.length === 0 && warnings.length === 0) return '';
    let prompt = `⚠️ 第${turnNum}回合数据校验异常\n\n`;

    errors.forEach(e => {
      prompt += `[${e.slot}方${e.playerName ? '·'+e.playerName : ''}] ${e.message}\n`;
    });
    warnings.forEach(w => {
      prompt += `[${w.slot}方${w.playerName ? '·'+w.playerName : ''}] ${w.message}\n`;
    });

    prompt += `\n请修正后重发完整数据区,或在剧情区点明缘由(如事件私有产出未在收支△ 体现等)。`;
    return prompt;
  }

  return { validate, buildPromptText };
})();
