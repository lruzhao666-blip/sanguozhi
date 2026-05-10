import re

with open('css/style.css', 'r') as f:
    content = f.read()

# Let's adjust padding of action-player-group in mobile view
match = re.search(r'@media\s*\(max-width:\s*640px\)\s*\{', content)
if match:
    insertion = "\n  .digest-raw .action-player-group { padding: 2px 0 2px 14px; }\n"
    content = content[:match.end()] + insertion + content[match.end():]

with open('css/style.css', 'w') as f:
    f.write(content)
