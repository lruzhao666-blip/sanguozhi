import re

css_path = 'css/style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update p0-strip, p0-fill, p0-color to use var
content = content.replace('.p0-strip { background: var(--p0-color); box-shadow: 0 0 6px rgba(231,76,60,.6); }',
                          '.p0-strip { background: var(--p0-strip); box-shadow: 0 0 6px var(--p0-strip); }')
content = content.replace('.p1-strip { background: var(--p1-color); box-shadow: 0 0 6px rgba(61,190,108,.6); }',
                          '.p1-strip { background: var(--p1-strip); box-shadow: 0 0 6px var(--p1-strip); }')
content = content.replace('.p2-strip { background: var(--p2-color); box-shadow: 0 0 6px rgba(52,152,219,.6); }',
                          '.p2-strip { background: var(--p2-strip); box-shadow: 0 0 6px var(--p2-strip); }')

content = content.replace('.p0-fill { background: linear-gradient(90deg, rgba(140,20,10,.6), var(--p0-color)); }',
                          '.p0-fill { background: linear-gradient(90deg, rgba(140,20,10,.6), var(--p0-fill)); }')
content = content.replace('.p1-fill { background: linear-gradient(90deg, rgba(8,80,30,.6),   var(--p1-color)); }',
                          '.p1-fill { background: linear-gradient(90deg, rgba(8,80,30,.6),   var(--p1-fill)); }')
content = content.replace('.p2-fill { background: linear-gradient(90deg, rgba(5,40,110,.6),  var(--p2-color)); }',
                          '.p2-fill { background: linear-gradient(90deg, rgba(5,40,110,.6),  var(--p2-fill)); }')

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(content)
