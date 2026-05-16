import re

with open('js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the maint null checks
content = content.replace("aiMaintGold ? Math.abs(aiMaintGold) : null", "aiMaintGold !== null ? Math.abs(aiMaintGold) : null")
content = content.replace("aiMaintFood ? Math.abs(aiMaintFood) : null", "aiMaintFood !== null ? Math.abs(aiMaintFood) : null")

# Add the net income rows
target = """      html += `</div>`;
      cardsRow.innerHTML += html;"""

replacement = """      // Net income summation
      const enNetGold = income.totalGold - maint.gold - (quarter.isQuarter ? quarter.gold : 0);
      const enNetFood = income.totalFood - maint.food - (quarter.isQuarter ? quarter.food : 0);
      const aiNetGold = aiChange && aiChange.resources && aiChange.resources.gold !== undefined ? aiChange.resources.gold : null;
      const aiNetFood = aiChange && aiChange.resources && aiChange.resources.food !== undefined ? aiChange.resources.food : null;

      html += `${renderRow('净收入(金)', enNetGold, aiNetGold, true)}
        ${renderRow('净收入(粮)', enNetFood, aiNetFood, true)}`;

      html += `</div>`;
      cardsRow.innerHTML += html;"""

if target in content:
    content = content.replace(target, replacement)
    with open('js/main.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched js/main.js successfully.")
else:
    print("Could not find target block in js/main.js")
