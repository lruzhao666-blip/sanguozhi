import re

parser_path = 'js/parser.js'
with open(parser_path, 'r', encoding='utf-8') as f:
    content = f.read()

# I notice the old regex replacement failed. Let's do it with python replacement.
old_re = r"const re = /([^,，、(（\s]+)[（(]([^）)]*)[）)]/g;"
# It appears twice, once in _parseCityList and once in _parseGeneralList. We only want to replace the first one.
parts = content.split(old_re, 1)

new_re = r"const re = /([^,，、\[(（\s]+)(?:\[([^\]]+)\])?[（(]([^）)]*)[）)]/g;"

content = parts[0] + new_re + parts[1]

with open(parser_path, 'w', encoding='utf-8') as f:
    f.write(content)
