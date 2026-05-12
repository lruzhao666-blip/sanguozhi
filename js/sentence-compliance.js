/**
 * sentence-compliance.js - 句式合规事后比对 (v1.2 骨架版)
 */
window.SentenceCompliance = (function() {

  function checkSkeletonHit(text, skeleton) {
    if (!skeleton.word_banks) return { pass: true, hitCount: 0, totalSlots: 0, slotResults: {} };

    const banks = skeleton.word_banks;
    const slotResults = {};
    let hitCount = 0;
    let totalSlots = 0;

    for (const [slotName, words] of Object.entries(banks)) {
      totalSlots++;
      const hit = words.some(w => text.includes(w));
      slotResults[slotName] = hit;
      if (hit) hitCount++;
    }

    // 判定标准:至少 (总槽位数 - 1) 槽命中,允许 1 槽缺失
    // (考虑 GPT 可能自创同风格词,留一槽宽容度)
    return {
      pass: hitCount >= Math.max(1, totalSlots - 1),
      hitCount, totalSlots, slotResults
    };
  }

  function checkCompliance(rawOutput, expectedPackage, preRolledDice) {
    const warnings = [];

    // 第一步：提取上报ID
    const reportedIds = [];
    const sentenceRegex = /句式△([A-Z]\d{2,3})/g;
    let match;
    while ((match = sentenceRegex.exec(rawOutput)) !== null) {
      reportedIds.push(match[1]);
    }

    if (!expectedPackage) {
        if (reportedIds.length > 0) {
            warnings.push("警告: 未提供本回合授权句式包，但检测到了句式使用: " + reportedIds.join(', '));
        }
        return warnings;
    }

    // 第二步：比对与槽位检查
    const authorizedMap = new Map();
    const addGroup = (group) => {
        if (group) group.forEach(s => authorizedMap.set(s.id, s));
    }

    addGroup(expectedPackage.ambience);
    if (expectedPackage.incision && expectedPackage.incision.pool) addGroup(expectedPackage.incision.pool);
    addGroup(expectedPackage.actions);
    addGroup(expectedPackage.metaphors);
    addGroup(expectedPackage.general_entry);
    addGroup(expectedPackage.micro);

    reportedIds.forEach(id => {
      const skeleton = authorizedMap.get(id);
      if (!skeleton) {
        warnings.push(`警告: 未授权句式 ${id}`);
      } else {
        // 检查例子是否被照抄
        if (skeleton.examples && skeleton.examples.some(ex => rawOutput.includes(ex))) {
            warnings.push(`警告: 句式 ${id} 未自组词 (照抄了 example)`);
        }
        // 检查骨架槽位
        const hitResult = checkSkeletonHit(rawOutput, skeleton);
        if (!hitResult.pass) {
             warnings.push(`警告: 骨架 ${id} 使用不规范 (缺 ${hitResult.totalSlots - hitResult.hitCount} 槽)`);
        } else if (hitResult.hitCount < hitResult.totalSlots) {
             console.log(`日志: 骨架 ${id} 缺 1 槽, 可能 GPT 自创词`);
        }
      }
    });

    // 第三步: 检查骨架超标
    let metaphorCount = 0;
    reportedIds.forEach(id => {
        const isMetaphor = expectedPackage.metaphors && expectedPackage.metaphors.find(s => s.id === id);
        if (isMetaphor) metaphorCount++;
    });
    if (metaphorCount > 2) {
        warnings.push("警告: 比喻骨架使用次数超过2次上限");
    }

    // 检查骰子是否篡改
    if (preRolledDice) {
        preRolledDice.forEach(dice => {
            if (dice.attacker_rolls) {
                const rollsStr = `${dice.attacker_rolls.join('+')}`; // Maybe checking sum or exact exact matches
                // A simplified check for pre-rolled dice
                if (!rawOutput.includes(rollsStr)) {
                    warnings.push(`警告: 疑似篡改骰子点数 (未找到预摇特征 ${rollsStr})`);
                }
            } else if (dice.rolls) {
                const rollsStr = `${dice.rolls.join('+')}`;
                if (!rawOutput.includes(rollsStr)) {
                    warnings.push(`警告: 疑似篡改骰子点数 (未找到预摇特征 ${rollsStr})`);
                }
            }
        });
    }

    return warnings;
  }

  return {
    checkCompliance
  };
})();
