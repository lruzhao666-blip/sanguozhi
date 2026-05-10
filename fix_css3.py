import re

with open('css/style.css', 'r') as f:
    content = f.read()

# I will align the action-player-group padding with other raw-paragraphs and set action-block-title padding appropriately.
content = content.replace("padding: 2px 0 2px 12px;", "padding: 2px 0 2px 14px;")

with open('css/style.css', 'w') as f:
    f.write(content)
