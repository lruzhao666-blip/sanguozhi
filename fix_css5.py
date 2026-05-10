import re

with open('css/style.css', 'r') as f:
    content = f.read()

# Make padding consistent for raw-section
content = content.replace("padding: 5px 0 5px 14px;", "padding: 5px 14px 5px 14px;")

with open('css/style.css', 'w') as f:
    f.write(content)
