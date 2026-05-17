global.window = {};
global.EMOJI_MAP = {}; // mock
require('./js/parser.js');
const parser = global.window.SGParser;

const testRaw = `
[NPC]
城池:邺城[袁绍](袁绍/审配/逢纪|步:3000,骑:1500),南皮[袁绍](袁谭|步:2000),许昌[曹操](荀彧/夏侯惇|步:4000,骑:1000),襄阳[刘表](蔡瑁/张允|步:2500,水:1500),宛城(张绣|步:1500)
`;

const parsed = parser.parse(testRaw);
console.log(JSON.stringify(parsed.npcCities, null, 2));

const testRaw2 = `
[NPC]
城池:邺城(袁绍|步:3000,骑:1500),南皮(袁谭|步:2000),许昌(曹操|步:4000,骑:1000)
`;
const parsed2 = parser.parse(testRaw2);
console.log(JSON.stringify(parsed2.npcCities, null, 2));
