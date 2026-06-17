import re

with open("css/style.css", "r") as f:
    content = f.read()

# Update #site-footer
old_footer = """#site-footer {
  text-align: center; padding: 12px; border-top: 1px solid rgba(80,25,15,.3);
  font-size: .68rem; color: var(--text-dim); background: rgba(3,0,0,.9);
  letter-spacing: .12em; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.footer-sep { color: rgba(120,40,20,.5); }"""

new_footer = """#site-footer {
  text-align: center; border-top: 1px solid rgba(80,25,15,.3);
  font-size: .68rem; color: var(--text-dim); background: rgba(3,0,0,.9);
  letter-spacing: .12em;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 20px;
}
.footer-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.footer-sep { color: rgba(120,40,20,.5); opacity: 0.5; }"""

content = content.replace(old_footer, new_footer)

with open("css/style.css", "w") as f:
    f.write(content)
