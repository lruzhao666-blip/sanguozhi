window.DiceCalc = (function () {
  'use strict';

  /**
   * 计算骰点序列
   * @param {number} roundNum - 回合号 N
   * @param {string} sString  - 行动串 S,如 "132412"
   * @param {number} count    - 需要的骰子总数
   * @returns {number[]}      - 骰点数组,每个值 1-6
   */
  function calculate(roundNum, sString, count) {
    const N = roundNum;
    const S = sString.split('').map(c => parseInt(c, 10));
    const len = S.length;
    const results = [];

    for (let i = 1; i <= count; i++) {
      const k = (i - 1) % len;
      const d6 = ((S[k] + N + i) % 6) + 1;
      results.push(d6);
    }

    return results;
  }

  /**
   * 将骰点数组格式化为分组显示
   * @param {number[]} dice - 骰点数组
   * @returns {object[]}    - 分组数组
   *   [{ label:'战斗1攻方', dice:[3,5,1], sum:9 }, ...]
   */
  function formatGroups(dice) {
    const groups = [];
    let idx = 0;
    let battleNum = 1;

    // 自动按 3 颗一组分配
    // 前面每 6 颗为一场战斗(攻3+守3)
    // 最后可能剩余的按 2 颗(情境骰)或 3 颗(额外战斗)分

    while (idx < dice.length) {
      const remaining = dice.length - idx;

      if (remaining >= 6) {
        // 一场完整战斗: 攻方3 + 守方3
        const atk = dice.slice(idx, idx + 3);
        groups.push({
          label: '战斗' + battleNum + '攻方',
          dice: atk,
          sum: atk.reduce((a, b) => a + b, 0),
          notation: '3d6(' + atk.join(',') + ')'
        });
        idx += 3;

        const def = dice.slice(idx, idx + 3);
        groups.push({
          label: '战斗' + battleNum + '守方',
          dice: def,
          sum: def.reduce((a, b) => a + b, 0),
          notation: '3d6(' + def.join(',') + ')'
        });
        idx += 3;
        battleNum++;

      } else if (remaining >= 3) {
        // 3颗: 可能是额外战斗一方或暗骰
        const chunk = dice.slice(idx, idx + 3);
        groups.push({
          label: '备用3d6 #' + (groups.length + 1),
          dice: chunk,
          sum: chunk.reduce((a, b) => a + b, 0),
          notation: '3d6(' + chunk.join(',') + ')'
        });
        idx += 3;

      } else if (remaining >= 2) {
        // 2颗: 情境骰
        const chunk = dice.slice(idx, idx + 2);
        groups.push({
          label: '情境骰',
          dice: chunk,
          sum: chunk.reduce((a, b) => a + b, 0),
          notation: '2d6(' + chunk.join(',') + ')'
        });
        idx += 2;

      } else {
        // 1颗: 单颗暗骰
        const chunk = dice.slice(idx, idx + 1);
        groups.push({
          label: '暗骰1d6',
          dice: chunk,
          sum: chunk[0],
          notation: '1d6(' + chunk[0] + ')'
        });
        idx += 1;
      }
    }

    return groups;
  }

  /**
   * 生成可复制的骰点注入块文本
   */
  function generateInjectText(roundNum, sString, dice, groups) {
    let text = '═══ 第' + roundNum + '回合骰点序列 ═══\n';
    text += '行动串S: ' + sString + '\n';
    text += '完整序列: ' + dice.join(', ') + '\n\n';

    groups.forEach(function (g) {
      text += g.label + ': ' + g.notation + ' = ' + g.sum + '\n';
    });

    text += '\n使用顺序: 从上到下依次消耗,战斗骰写入风云段\n';
    text += '骰式行,情境骰写入事件叙事后。\n';
    text += '═══ 骰点结束 ═══';
    return text;
  }

  return { calculate: calculate, formatGroups: formatGroups,
           generateInjectText: generateInjectText };
})();