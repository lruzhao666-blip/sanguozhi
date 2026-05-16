const fs = require('fs');
const mainCode = fs.readFileSync('js/main.js', 'utf-8');

const script = `
  const window = {
    SGParser: {
      parseRaw: () => ({ slot: '甲', intel: [], battles: [] })
    },
    location: { hostname: 'localhost' },
    supabase: null
  };
  const document = {
    documentElement: { style: { setProperty: ()=>{} } },
    addEventListener: ()=>{},
    getElementById: ()=>({ addEventListener: ()=>{}, style: {}, classList: { add: ()=>{}, remove: ()=>{} }, innerHTML: '', value: '' }),
    querySelector: ()=>({ addEventListener: ()=>{}, style: {}, classList: { add: ()=>{}, remove: ()=>{} } }),
    querySelectorAll: ()=>([])
  };
  const localStorage = { getItem: ()=>null, setItem: ()=>{} };
  const fetch = ()=>{};
  const URLSearchParams = class { get(){} };

  ${mainCode.replace('document.addEventListener(', '//')}

  const testText = \`👤 各城主行动结果

昭·犒赏北平与冀州居间
北平。夏侯惇把降兵和旧部混编的方案定了下来——骑兵按三旧七新混编，步兵按五五混编，弓手单独成队由老兵带。曹仁到了之后接手了骑兵混编的细活。夏侯惇对曹仁说：「这批降兵里有几个是公孙瓒的老白马义从，骑术不差。你挑一挑。」

鲁肃的第二封信——致高览的调停信也写好了。措辞比给文丑的更谨慎。信使带着信和一份薄礼往邺城方向出发，约四五日可到。
▸ 影响：北平降兵混编推进顺利，鲁肃致书高览居间调停

高·广陵平乱与紧急通商
周瑜收到广陵雷薄叛逃的消息时正在写通商令。他停笔看了一会窗外，然后继续写。

第一，命步骘以高公名义在广陵宣布：开春后补发全军半月口粮作为犒赏。纪灵私下对步骘说：「得赶紧弄到粮。」

第二，命各城立刻启动通商。朱治从寿春粮仓里挤出了一百五十石装船南下。

第三，周瑜下了一道暗令：各城粮食消耗暂时压缩。周瑜对张昭说：「子布先生，委屈将士们几天。」张昭点头：「我去办。但有一件事你得知道——孙权今天问了粮商名单。」
▸ 影响：步骘安抚广陵，各城启动通商补粮，寿春紧急调粮

源·五路同发
源公在江陵用了整整一天部署五条线。到傍晚五道军令全部发出。

第一路·天水攻街亭。法正对魏延说：「后天出发。今天明天备粮点兵。」

第二路·汉中集兵指向长安方向。源公致书张鲁的安抚信同时送达。

第三路·襄阳江陵夹击上庸。庞统当天就开始跟文聘商议兵力部署。庞统说：「两路到位后先围不打，断他粮道。」
▸ 影响：五路计划全面启动\`;

  console.log(highlightRaw(testText));
`;

fs.writeFileSync('run_eval.js', script);
