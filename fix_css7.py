import re

with open('css/style.css', 'r') as f:
    content = f.read()

# Make padding consistent for raw-section
content = content.replace("padding: 5px 0 5px 14px;", "padding: 5px 14px 5px 14px;")
content = content.replace("padding: 4px 12px;", "padding: 4px 14px;")
content = content.replace("padding: 5px 14px 5px 12px;", "padding: 5px 14px 5px 14px;")
content = content.replace("padding: 2px 0 2px 12px;", "padding: 2px 0 2px 14px;")
content = content.replace("padding: 6px 14px 6px 12px;", "padding: 6px 14px 6px 14px;")

match = re.search(r'@media\s*\(max-width:\s*640px\)\s*\{', content)
if match:
    insertion = "\n  .digest-raw .action-player-group { padding: 2px 0 2px 14px; }\n  .digest-raw .action-block-title { padding: 6px 14px 6px 14px; margin-top: 18px; }\n"
    content = content[:match.end()] + insertion + content[match.end():]

with open('css/style.css', 'w') as f:
    f.write(content)
