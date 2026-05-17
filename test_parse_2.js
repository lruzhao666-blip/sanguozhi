const raw = "城池:邺城[袁绍]（袁绍/审配/逢纪|步:3000,骑:1500）";
const re = /([^,，、\[(（\s]+)(?:\[([^\]]+)\])?[（(]([^）)]*)[）)]/g;
let m;
while ((m = re.exec(raw)) !== null) {
  console.log("Match:", m);
}
