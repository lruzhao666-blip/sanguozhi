import re

with open('css/style.css', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to find the specific mobile query block to replace
search_pattern = r'''/\* 移动端适配 \*/\s*@media \(max-width: 720px\) \{\s*#main-content \{\s*top: 95px;\s*\}\s*#tab-arena .arena-wrap,\s*#tab-action .actions-page,\s*#tab-gm .gm-page \{\s*padding: 12px 10px 40px;\s*\}\s*\}'''

replace_pattern = '''/* 移动端适配 */
@media (max-width: 720px) {
  #main-content {
    min-height: calc(100vh - 95px);
  }

  .tab-panel {
    min-height: calc(100vh - 95px);
  }

  #tab-arena .arena-wrap,
  #tab-action .actions-page,
  #tab-gm .gm-page {
    padding: 12px 10px 40px;
  }
}'''

new_content = re.sub(search_pattern, replace_pattern, content, count=1)

if content == new_content:
    print("Pattern not found!")
else:
    with open('css/style.css', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Pattern replaced successfully!")
