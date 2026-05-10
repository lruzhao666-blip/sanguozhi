import re

with open('css/style.css', 'r') as f:
    content = f.read()

# I want to ensure the left padding of action-block-title is 14px instead of 12px for both desktop and mobile
content = content.replace("padding: 5px 14px 5px 12px;", "padding: 5px 14px 5px 14px;")
content = content.replace("padding: 6px 14px 6px 12px;", "padding: 6px 14px 6px 14px;")

with open('css/style.css', 'w') as f:
    f.write(content)
