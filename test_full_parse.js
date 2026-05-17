global.window = {};
global.EMOJI_MAP = {}; // mock
require('./js/parser.js');
const parser = global.window.SGParser;

const testRaw = `
========================================
[回合] 第3回合
[节气] 春-仲·细雨
[速递] 测试样本

[甲] 名号:玩家甲
金:500 粮:3200 兵:1500 民心:65 城:1
城池:陈留(荀彧/任峻|步:1200,骑:300)
武将:荀彧(),任峻()

[NPC] 城池:邺城[袁绍](袁绍/审配/逢纪|步:3000,骑:1500),南皮[袁绍](袁谭|步:2000),平原[袁绍](逢纪|步:1500),许昌[曹操](荀彧/夏侯惇|步:4000,骑:1000),濮阳[曹操](夏侯惇|步:2500),小沛[曹操](曹仁|步:1800),襄阳[刘表](蔡瑁/张允|步:2500,水:1500),宛城(张绣|步:1500)

[战报]
本回合无战事

[摘要] 测试样本
========================================
`;

const parsed = parser.parse(testRaw);

console.log("=== NPC Cities Extracted ===");
console.log(JSON.stringify(parsed.npcCities, null, 2));

console.log("\n=== City Ownership Validation ===");
['邺城', '南皮', '平原', '许昌', '濮阳', '小沛', '襄阳', '宛城'].forEach(city => {
  const ow = parsed.cityOwnership[city];
  console.log(`${city}: faction = ${ow?.faction}, troops = ${JSON.stringify(ow?.troops)}`);
});
