import re
with open("css/style.css", "r") as f:
    content = f.read()

# Finding identity selector v2 to delete it
parts = content.split("/* ════════════════════════════════════════\n   身份选择器 v2")
if len(parts) > 1:
    part0 = parts[0]
    # Delete everything from this block (which ends at the end of the file currently, or before a new block)
    # Actually wait, there is no block after it currently. Let's check the end of the file.
    part1 = parts[1]

    # We will just take part0, as identity selector v2 goes to the end of the file in the original file
    content = part0

with open("css/style.css", "w") as f:
    f.write(content)
