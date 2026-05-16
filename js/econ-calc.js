window.EconCalc = (function () {
  var GEO_TAGS = {
    '粮丰':     { gold: 0,   food: 60,  battle: null },
    '金丰':     { gold: 45,  food: 0,   battle: null },
    '苦寒减产': { gold: -20, food: -20, battle: null },
    '瘴气':     { gold: 0,   food: -30, battle: null },
    '偏远':     { gold: -10, food: -10, battle: null },
    '防御+':    { gold: 0,   food: 0,   battle: 'def+2' },
    '进攻+':    { gold: 20,  food: 0,   battle: 'atk+1' },
    '谋略+':    { gold: 15,  food: 0,   battle: null },
    '骑兵强':   { gold: 0,   food: 0,   battle: null },
    '水战强':   { gold: 0,   food: 20,  battle: null },
    '蛮兵强':   { gold: 0,   food: 0,   battle: null },
    '险关':     { gold: 0,   food: 0,   battle: 'def+3' },
  };

  var CITY_TAGS = {
    '襄平': ['骑兵强','苦寒减产'],
    '北平': ['骑兵强','防御+'],
    '蓟县': ['粮丰','苦寒减产'],
    '南皮': ['粮丰','水战强'],
    '平原': ['粮丰','进攻+'],
    '邺城': ['金丰','防御+'],
    '晋阳': ['骑兵强','谋略+'],
    '上党': ['骑兵强','险关'],
    '北海': ['水战强','粮丰'],
    '济南': ['粮丰'],
    '河内': ['粮丰','进攻+'],
    '洛阳': ['金丰','谋略+'],
    '弘农': ['险关'],
    '虎牢关': ['险关','防御+'],
    '潼关': ['险关','防御+'],
    '长安': ['金丰','骑兵强'],
    '天水': ['骑兵强','防御+'],
    '安定': ['骑兵强'],
    '武威': ['骑兵强','苦寒减产'],
    '西平': ['苦寒减产','险关'],
    '街亭': ['险关'],
    '濮阳': ['粮丰','防御+'],
    '陈留': ['粮丰','谋略+'],
    '许昌': ['金丰','谋略+'],
    '汝南': ['粮丰'],
    '谯郡': ['进攻+','粮丰'],
    '下邳': ['粮丰','防御+'],
    '小沛': ['进攻+'],
    '广陵': ['水战强','粮丰'],
    '宛城': ['防御+','进攻+'],
    '新野': ['进攻+'],
    '襄阳': ['水战强','谋略+'],
    '江夏': ['水战强','防御+'],
    '江陵': ['粮丰','水战强'],
    '武陵': ['蛮兵强','瘴气'],
    '长沙': ['粮丰','进攻+'],
    '桂阳': ['金丰','偏远'],
    '零陵': ['谋略+','偏远'],
    '寿春': ['粮丰','进攻+'],
    '合肥': ['防御+','水战强'],
    '庐江': ['水战强'],
    '建业': ['金丰','防御+'],
    '吴郡': ['金丰','水战强'],
    '会稽': ['水战强','金丰'],
    '柴桑': ['水战强','谋略+'],
    '庐陵': ['蛮兵强','偏远'],
    '汉中': ['险关','谋略+'],
    '上庸': ['防御+','险关'],
    '梓潼': ['险关'],
    '成都': ['粮丰','金丰'],
    '永安': ['险关','防御+'],
    '江州': ['水战强','粮丰'],
    '武都': ['险关','苦寒减产'],
    '剑阁': ['险关','防御+'],
    '葭萌关': ['险关'],
    '阳平关': ['险关','防御+'],
    '建宁': ['蛮兵强','瘴气'],
    '云南': ['蛮兵强','瘴气','偏远'],
    '永昌': ['金丰','偏远'],
    '交趾': ['水战强','偏远','蛮兵强'],
  };

  /**
   * 计算单座城池的基础回合产出
   * @param {string} cityName - 城名
   * @param {number} morale   - 该玩家当前民心值
   * @returns {{ gold:number, food:number, details:string[] }}
   */
  function calcCityIncome(cityName, morale) {
    var baseGold = 80;
    var baseFood = 150;
    var details = ['基础:金+80,粮+150'];

    // 地利修正
    var tags = CITY_TAGS[cityName] || [];
    tags.forEach(function (tag) {
      var t = GEO_TAGS[tag];
      if (!t) return;
      if (t.gold !== 0) {
        baseGold += t.gold;
        details.push(tag + ':金' + (t.gold > 0 ? '+' : '') + t.gold);
      }
      if (t.food !== 0) {
        baseFood += t.food;
        details.push(tag + ':粮' + (t.food > 0 ? '+' : '') + t.food);
      }
    });

    // 民心阶梯
    var moraleMultiplier = 1.0;
    if (morale >= 75) {
      moraleMultiplier = 1.1;
      details.push('民心高(≥75):产出×1.1');
    } else if (morale <= 39) {
      moraleMultiplier = 0.8;
      details.push('民心低(≤39):产出×0.8');
    }

    var finalGold = Math.round(baseGold * moraleMultiplier);
    var finalFood = Math.round(baseFood * moraleMultiplier);

    return { gold: finalGold, food: finalFood, details: details };
  }

  /**
   * 计算一个玩家的总回合产出
   * @param {string[]} cityNames - 拥有的城名数组
   * @param {number} morale      - 民心值
   * @returns {{ totalGold:number, totalFood:number,
   *             perCity:object[], details:string[] }}
   */
  function calcTotalIncome(cityNames, morale) {
    var totalGold = 0, totalFood = 0;
    var perCity = [];
    var details = [];

    cityNames.forEach(function (name) {
      var c = calcCityIncome(name, morale);
      totalGold += c.gold;
      totalFood += c.food;
      perCity.push({ city: name, gold: c.gold, food: c.food,
                     details: c.details });
      details.push(name + ':金+' + c.gold + ',粮+' + c.food);
    });

    return {
      totalGold: totalGold,
      totalFood: totalFood,
      perCity: perCity,
      details: details
    };
  }

  /**
   * 计算一个玩家的总回合维护消耗
   * @param {number} totalTroop   - 总兵力
   * @param {number} generalCount - 武将数量
   * @param {number} cityCount    - 城池数量
   * @returns {{ gold:number, food:number, details:string[] }}
   */
  function calcMaintenance(totalTroop, generalCount, cityCount) {
    // 军粮: 每100兵 -25粮(向下取整再乘)
    var armyFood = Math.floor(totalTroop / 100) * 25;
    // 武将口粮: 每位 -3粮
    var genFood = generalCount * 3;
    // 俸禄: 每位武将 -10金
    var genGold = generalCount * 10;
    // 治城: 每座城 -20金
    var cityGold = cityCount * 20;
    // 民心维护: 每座城 -8粮
    var cityFood = cityCount * 8;

    var totalGold = genGold + cityGold;
    var totalFood = armyFood + genFood + cityFood;

    var details = [];
    if (armyFood > 0) details.push('军粮(' + totalTroop + '兵):-' + armyFood + '粮');
    if (genFood > 0)  details.push('武将口粮(' + generalCount + '将):-' + genFood + '粮');
    if (genGold > 0)  details.push('俸禄(' + generalCount + '将):-' + genGold + '金');
    if (cityGold > 0) details.push('治城(' + cityCount + '城):-' + cityGold + '金');
    if (cityFood > 0) details.push('民心维护(' + cityCount + '城):-' + cityFood + '粮');

    return { gold: totalGold, food: totalFood, details: details };
  }

  /**
   * 判断是否为季度回合并计算季度消耗
   * @param {number} roundNum  - 回合号
   * @param {number} cityCount - 城池数量
   * @returns {{ gold:number, food:number, isQuarter:boolean }}
   */
  function calcQuarterly(roundNum, cityCount) {
    var isQuarter = (roundNum % 10 === 0) && roundNum > 0;
    if (!isQuarter) return { gold: 0, food: 0, isQuarter: false };
    return {
      gold: cityCount * 120,
      food: cityCount * 200,
      isQuarter: true
    };
  }

  var ACTION_COSTS = {
    '招募':   { gold: 10, food: 10, per: 100, unit: '兵',
                note: '每100兵消耗10金10粮' },
    '急征':   { gold: 30, food: 30, per: 300, unit: '兵',
                note: '每300兵消耗30金30粮,单回合≤600兵' },
    '攻城':   { goldPerTroop: 0, foodRate: 0.2,
                note: '出兵数×0.2粮' },
    '内政':   { gold: 50, food: 0, note: '固定50金' },
    '外交':   { gold: 80, food: 0, note: '固定80金' },
    '计策':   { gold: 60, food: 0, note: '固定60金(谋略+城48金)' },
    '侦察':   { gold: 30, food: 0, note: '固定30金' },
    '剿匪':   { gold: 50, food: 80, note: '固定50金80粮' },
    '屯田':   { gold: 50, food: 0, note: '启动50金' },
    '开市':   { gold: 80, food: 0, note: '启动80金' },
    '招贤':   { gold: 80, food: 30, note: '启动80金30粮' },
    '练兵':   { gold: 40, food: 0, note: '启动40金' },
    '工造':   { gold: 90, food: 0, note: '启动60-120金(取中值90)' },
  };

  /**
   * 计算明账行动消耗
   * @param {string} actionType  - 行动类型名
   * @param {object} params      - 额外参数
   *   招募/急征: { count: 兵数 }
   *   攻城: { troops: 出兵数 }
   *   其他: 无需额外参数
   * @returns {{ gold:number, food:number, note:string }}
   */
  function calcActionCost(actionType, params) {
    var cost = ACTION_COSTS[actionType];
    if (!cost) return { gold: 0, food: 0, note: '未知行动类型' };

    if (actionType === '招募' || actionType === '急征') {
      var count = (params && params.count) || 0;
      var batches = Math.ceil(count / cost.per);
      return {
        gold: batches * cost.gold,
        food: batches * cost.food,
        note: actionType + count + '兵:金-'
              + (batches * cost.gold) + ',粮-' + (batches * cost.food)
      };
    }

    if (actionType === '攻城') {
      var troops = (params && params.troops) || 0;
      var foodCost = Math.round(troops * cost.foodRate);
      return { gold: 0, food: foodCost,
               note: '攻城(' + troops + '兵):粮-' + foodCost };
    }

    return { gold: cost.gold || 0, food: cost.food || 0,
             note: cost.note };
  }

  /**
   * 汇总一个玩家的完整单回合收支
   * @param {object} playerState - 玩家状态
   *   { cityNames:[], morale:number, totalTroop:number,
   *     generalCount:number, roundNum:number,
   *     actions:[{type,params}], events:[{gold,food}] }
   * @returns {object} 完整收支报告
   */
  function calcFullBalance(playerState) {
    var income = calcTotalIncome(
      playerState.cityNames, playerState.morale);
    var maint = calcMaintenance(
      playerState.totalTroop,
      playerState.generalCount,
      playerState.cityNames.length);
    var quarter = calcQuarterly(
      playerState.roundNum, playerState.cityNames.length);

    var actionGold = 0, actionFood = 0, actionDetails = [];
    (playerState.actions || []).forEach(function (a) {
      var c = calcActionCost(a.type, a.params);
      actionGold += c.gold;
      actionFood += c.food;
      actionDetails.push(c.note);
    });

    var eventGold = 0, eventFood = 0;
    (playerState.events || []).forEach(function (e) {
      eventGold += (e.gold || 0);
      eventFood += (e.food || 0);
    });

    var netGold = income.totalGold - maint.gold
      - quarter.gold - actionGold + eventGold;
    var netFood = income.totalFood - maint.food
      - quarter.food - actionFood + eventFood;

    return {
      income: income,
      maintenance: maint,
      quarterly: quarter,
      actions: { gold: actionGold, food: actionFood,
                 details: actionDetails },
      events: { gold: eventGold, food: eventFood },
      net: { gold: netGold, food: netFood },
      summary: {
        gold: '产出+' + income.totalGold
          + ',维护-' + maint.gold
          + (quarter.gold ? ',季度-' + quarter.gold : '')
          + (actionGold ? ',行动-' + actionGold : '')
          + (eventGold ? ',事件' + (eventGold >= 0 ? '+' : '')
             + eventGold : '')
          + ',合计' + (netGold >= 0 ? '+' : '') + netGold,
        food: '产出+' + income.totalFood
          + ',维护-' + maint.food
          + (quarter.food ? ',季度-' + quarter.food : '')
          + (actionFood ? ',行动-' + actionFood : '')
          + (eventFood ? ',事件' + (eventFood >= 0 ? '+' : '')
             + eventFood : '')
          + ',合计' + (netFood >= 0 ? '+' : '') + netFood,
      }
    };
  }

  /**
   * 计算战斗伤亡
   * @param {number} atkTroops - 攻方投入兵力
   * @param {number} defTroops - 守方投入兵力
   * @param {number} diff      - 骰式总差值(攻-守)
   * @param {object} modifiers - 修正系数(可选)
   *   { siege:bool, flank:bool, ambush:bool,
   *     longMarch:bool, famedGeneral:bool,
   *     mountain:bool, pass:bool, extremeWeather:bool }
   * @returns {{ atkLoss:number, defLoss:number,
   *             atkRate:string, defRate:string,
   *             grade:string, details:string[] }}
   */
  function calcCasualties(atkTroops, defTroops, diff, modifiers) {
    var mod = modifiers || {};
    var grade, winnerR, loserR;
    var absDiff = Math.abs(diff);

    // 判定胜负档位
    if (diff > 0) {
      // 攻方胜
      if (absDiff >= 9) {
        grade = '大胜(攻方)';
        winnerR = [0.03, 0.10];
        loserR  = [0.70, 0.95];
      } else if (absDiff >= 4) {
        grade = '小胜(攻方)';
        winnerR = [0.08, 0.15];
        loserR  = [0.45, 0.70];
      } else {
        grade = '惨胜(攻方)';
        winnerR = [0.15, 0.25];
        loserR  = [0.30, 0.50];
      }
    } else if (diff < 0) {
      // 守方胜
      if (absDiff >= 9) {
        grade = '大胜(守方)';
        winnerR = [0.03, 0.10];
        loserR  = [0.70, 0.95];
      } else if (absDiff >= 4) {
        grade = '小胜(守方)';
        winnerR = [0.08, 0.15];
        loserR  = [0.45, 0.70];
      } else {
        grade = '惨胜(守方)';
        winnerR = [0.15, 0.25];
        loserR  = [0.30, 0.50];
      }
    } else {
      grade = '平手';
      winnerR = [0.15, 0.25];
      loserR  = [0.15, 0.25];
    }

    // 取中值作为基础伤亡率
    var winRate = (winnerR[0] + winnerR[1]) / 2;
    var loseRate = (loserR[0] + loserR[1]) / 2;

    var details = [grade];

    // 应用修正系数
    if (mod.siege) {
      winRate *= 1.3;
      details.push('攻城战:胜方×1.3');
    }
    if (mod.flank || mod.ambush) {
      loseRate = (loserR[0] * 0.3 + loserR[1] * 0.7);
      details.push('夹击/中伏:败方向上限取');
    }
    if (mod.longMarch) {
      // 远征方自身×1.2
      if (diff > 0) winRate *= 1.2;
      else loseRate *= 1.2;
      details.push('远征:该方×1.2');
    }
    if (mod.famedGeneral) {
      loseRate *= 0.85;
      details.push('名将指挥:败方×0.85');
    }
    if (mod.mountain) {
      // 不利方×1.15
      loseRate *= 1.15;
      details.push('山地/水战不利:×1.15');
    }
    if (mod.pass) {
      winRate *= 1.4;
      details.push('险关:攻方×1.4');
    }
    if (mod.extremeWeather) {
      winRate *= 1.15;
      loseRate *= 1.15;
      details.push('极端天候:双方×1.15');
    }

    // 计算实际伤亡
    var winTroops, loseTroops;
    if (diff > 0) {
      winTroops = atkTroops;
      loseTroops = defTroops;
    } else if (diff < 0) {
      winTroops = defTroops;
      loseTroops = atkTroops;
    } else {
      winTroops = atkTroops;
      loseTroops = defTroops;
    }

    var winLoss  = Math.round(winTroops * winRate);
    var loseLoss = Math.round(loseTroops * loseRate);

    // 最低保底
    if (winTroops >= 300) {
      var minWin = Math.round(winTroops * 0.05);
      if (winLoss < minWin) {
        winLoss = minWin;
        details.push('胜方保底5%');
      }
    }
    if (loseTroops >= 300) {
      var minLose = Math.round(loseTroops * 0.25);
      if (loseLoss < minLose) {
        loseLoss = minLose;
        details.push('败方保底25%');
      }
    }

    // 映射回攻守
    var atkLoss, defLoss;
    if (diff > 0) {
      atkLoss = winLoss;
      defLoss = loseLoss;
    } else if (diff < 0) {
      atkLoss = loseLoss;
      defLoss = winLoss;
    } else {
      atkLoss = winLoss;
      defLoss = loseLoss;
    }

    return {
      atkLoss: atkLoss,
      defLoss: defLoss,
      atkRate: (atkLoss / atkTroops * 100).toFixed(1) + '%',
      defRate: (defLoss / defTroops * 100).toFixed(1) + '%',
      grade: grade,
      details: details
    };
  }

  return {
    GEO_TAGS:         GEO_TAGS,
    CITY_TAGS:        CITY_TAGS,
    ACTION_COSTS:     ACTION_COSTS,
    calcCityIncome:   calcCityIncome,
    calcTotalIncome:  calcTotalIncome,
    calcMaintenance:  calcMaintenance,
    calcQuarterly:    calcQuarterly,
    calcActionCost:   calcActionCost,
    calcFullBalance:  calcFullBalance,
    calcCasualties:   calcCasualties,
  };
})();
