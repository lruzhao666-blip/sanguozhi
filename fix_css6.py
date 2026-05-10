import re

with open('css/style.css', 'r') as f:
    content = f.read()

# I want to ensure the left padding is consistent to other text paragraphs
content = content.replace("padding: 4px 12px;", "padding: 4px 14px;")

with open('css/style.css', 'w') as f:
    f.write(content)
