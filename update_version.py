import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()
html = re.sub(r'css/style\.css\?v=\w+', 'css/style.css?v=20260515b', html)
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

with open('README.md', 'r', encoding='utf-8') as f:
    md = f.read()
md = re.sub(r'当前版本：\*\*v2\.7\.9\*\*', '当前版本：**v2.7.10**', md)
with open('README.md', 'w', encoding='utf-8') as f:
    f.write(md)
