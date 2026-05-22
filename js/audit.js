/**
 * audit.js — 收支验算模块 v1.0
 *
 * 验算范围：城等+地利+主政+太守契合（含副守50%效率）
 * 容忍度：±20%（覆盖天候/民心/磨合期/彩蛋等软规则）
 *
 * 依赖：
 *   SGMap.CITIES         — 60城数据数组
 *   SGMap.CITY_TIER_BASE — 城等基础产出
 *   SGMap.BONUS_MULT     — 地利乘算表
 *   window._generalsCache — Supabase 武将缓存（含 suitable_roles）
 */
window.SGAudit = (function () {
  'use strict';

  var TOLERANCE = 0.20;

  // 主政→emoji映射
  var POLICY_EMOJI = { '🌾': '屯田', '💰': '开市', '🤝': '招贤', '⚔️': '军训', '🔨': '工造' };

  /**
   * 判断武将是否擅长某主政
   */
  function _isAdept(generalName, policyName) {
    if (!window._generalsCache) return false;
    var gd = window._generalsCache[generalName];
    if (!gd || !gd.suitable_roles) return false;
    return gd.suitable_roles.indexOf('擅长' + policyName) !== -1;
  }

  /**
   * 计算单城理论产出
   * @param {string} cityName
   * @param {Object} ow - cityOwnership[cityName]（含 productionBuffs）
   * @returns {{ gold: number, food: number }}
   */
  function _calcCityProd(cityName, ow) {
    var cityData = SGMap.CITIES.find(function (c) { return c.name === cityName; });
    if (!cityData) return { gold: 0, food: 0 };

    // 1. 城等基础
    var tier = SGMap.CITY_TIER_MAP[cityName] || '郡城';
    var base = SGMap.CITY_TIER_BASE[tier];
    var gold = base.gold, food = base.food;

    // 2. 地利乘算
    var bonusKeys = cityData.bonusKeys || [cityData.bonusKey] || [];
    bonusKeys.forEach(function (k) {
      var m = SGMap.BONUS_MULT[k];
      if (!m) return;
      if (m.gold) gold *= m.gold;
      if (m.food) food *= m.food;
    });

    // 3. 主政加成（区分主守100%和副守50%）
    if (!ow || !ow.productionBuffs) return { gold: Math.round(gold), food: Math.round(food) };

    var buffs = Object.values(ow.productionBuffs);
    // 第一条buff视为主守，第二条视为副守
    buffs.forEach(function (b, idx) {
      var isDeputy = idx >= 1;
      var ratio = isDeputy ? 0.5 : 1.0;

      // 屯田/开市产出加成
      if (b.emoji === '🌾') {
        food *= (1 + 0.3 * ratio);
      } else if (b.emoji === '💰') {
        gold *= (1 + 0.3 * ratio);
      }
      // 其他主政（军训/招贤/工造）无产出乘算，跳过

      // 太守契合
      var policyName = POLICY_EMOJI[b.emoji];
      if (policyName && b.general && _isAdept(b.general, policyName)) {
        // 契合+20%，副守折半即+10%
        var adeptRatio = isDeputy ? 0.10 : 0.20;
        // 契合只作用于对应资源
        if (b.emoji === '🌾') {
          food *= (1 + adeptRatio);
        } else if (b.emoji === '💰') {
          gold *= (1 + adeptRatio);
        }
        // 军训/招贤/工造契合不影响金粮产出
      }
    });

    return { gold: Math.round(gold), food: Math.round(food) };
  }

  /**
   * 计算玩家所有城的理论总产出
   */
  function calcExpected(citiesList, cityOwnership) {
    var totalGold = 0, totalFood = 0;
    var details = [];

    (citiesList || []).forEach(function (cl) {
      var ow = cityOwnership[cl.name];
      if (!ow) return;
      var prod = _calcCityProd(cl.name, ow);
      totalGold += prod.gold;
      totalFood += prod.food;
      details.push({ city: cl.name, gold: prod.gold, food: prod.food });
    });

    return { gold: totalGold, food: totalFood, details: details };
  }

  /**
   * 从 change.breakdown 中提取主持人报的产出数字
   * breakdown 结构: { '金': { items: [{label,val}], total }, '粮': {...} }
   */
  function extractReported(change) {
    var result = { gold: null, food: null };
    if (!change || !change.breakdown) return result;

    var goldBD = change.breakdown['金'];
    if (goldBD && goldBD.items) {
      var gItem = goldBD.items.find(function (it) { return it.label === '产出'; });
      if (gItem) result.gold = Math.abs(gItem.val);
    }

    var foodBD = change.breakdown['粮'];
    if (foodBD && foodBD.items) {
      var fItem = foodBD.items.find(function (it) { return it.label === '产出'; });
      if (fItem) result.food = Math.abs(fItem.val);
    }

    return result;
  }

  /**
   * 主入口：验算单个玩家
   * @returns {Array} alerts
   */
  function audit(playerIdx, citiesList, cityOwnership, change) {
    var alerts = [];
    var expected = calcExpected(citiesList, cityOwnership);
    var reported = extractReported(change);

    if (reported.gold != null && expected.gold > 0) {
      var diff = Math.abs(reported.gold - expected.gold) / expected.gold;
      if (diff > TOLERANCE) {
        alerts.push({
          type: 'gold',
          expected: expected.gold,
          reported: reported.gold,
          diff: Math.round(diff * 100),
          direction: reported.gold > expected.gold ? '高于' : '低于'
        });
      }
    }

    if (reported.food != null && expected.food > 0) {
      var diff2 = Math.abs(reported.food - expected.food) / expected.food;
      if (diff2 > TOLERANCE) {
        alerts.push({
          type: 'food',
          expected: expected.food,
          reported: reported.food,
          diff: Math.round(diff2 * 100),
          direction: reported.food > expected.food ? '高于' : '低于'
        });
      }
    }

    return alerts;
  }

  return { audit: audit, calcExpected: calcExpected, extractReported: extractReported };
})();