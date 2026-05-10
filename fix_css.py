import re

with open('css/style.css', 'r') as f:
    content = f.read()

# add media query for max-width: 640px to override padding on mobile for action-block-title
# We see around line 938 there is a media query for max-width: 640px
match = re.search(r'@media\s*\(max-width:\s*640px\)\s*\{', content)
if match:
    # insert our new rule right after the media query opening
    insertion = "\n  .digest-raw .action-block-title { padding: 6px 14px 6px 12px; margin-top: 18px; }\n"
    content = content[:match.end()] + insertion + content[match.end():]

with open('css/style.css', 'w') as f:
    f.write(content)
