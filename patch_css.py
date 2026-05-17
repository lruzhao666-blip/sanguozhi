import re

css_path = 'css/style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Insert new variables into :root
new_vars = """
  --p0-strip: #e74c3c;
  --p0-fill: rgba(231,76,60,0.32);
  --p1-strip: #3dbe6c;
  --p1-fill: rgba(61,190,108,0.32);
  --p2-strip: #3498db;
  --p2-fill: rgba(52,152,219,0.32);
  --npc1-strip: #4a6b7c;
  --npc1-fill: rgba(74,107,124,0.35);
  --npc2-strip: #a8763e;
  --npc2-fill: rgba(168,118,62,0.32);
  --npc3-strip: #5a7a52;
  --npc3-fill: rgba(90,122,82,0.32);
  --npc4-strip: #7a5a78;
  --npc4-fill: rgba(122,90,120,0.32);
  --npc5-strip: #5a6b8a;
  --npc5-fill: rgba(90,107,138,0.32);
  --npc6-strip: #b07050;
  --npc6-fill: rgba(176,112,80,0.30);
"""

# Find the end of :root definition
root_match = re.search(r'(:root\s*\{[^}]*)(\})', content)
if root_match:
    content = content[:root_match.start(2)] + new_vars + content[root_match.start(2):]

# Add .color-panel styles to the end of the file
new_styles = """
/* ─────────────────────────────────
   势力配色调整面板
───────────────────────────────── */
.color-panel {
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(212,175,55,0.25);
  border-radius: 6px;
  margin-bottom: 16px;
  padding: 0;
}
.color-panel-summary {
  padding: 12px 16px;
  color: #d4af37;
  font-family: 'Noto Serif SC', serif;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}
.color-panel-sub {
  margin-left: 12px;
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  font-weight: 400;
}
.color-panel-body { padding: 0 16px 16px; }
.color-section { margin-top: 12px; }
.color-section-title {
  color: rgba(212,175,55,0.85);
  font-size: 13px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px dashed rgba(212,175,55,0.2);
}
.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.color-swatch {
  width: 16px; height: 16px; border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.2);
}
.color-label {
  min-width: 90px;
  color: #e8e8e8;
  font-size: 13px;
}
.color-picker {
  width: 36px; height: 24px;
  border: 1px solid rgba(212,175,55,0.3);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}
.color-hint {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
}
.color-reset {
  margin-left: auto;
  background: transparent;
  border: 1px solid rgba(212,175,55,0.3);
  color: rgba(212,175,55,0.8);
  padding: 3px 10px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}
.color-reset:hover { background: rgba(212,175,55,0.1); }
.color-actions {
  margin-top: 16px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.btn-color-reset, .btn-color-apply {
  padding: 6px 14px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'Noto Serif SC', serif;
}
.btn-color-reset {
  background: transparent;
  border: 1px solid rgba(255,100,100,0.4);
  color: rgba(255,150,150,0.9);
}
.btn-color-apply {
  background: rgba(212,175,55,0.15);
  border: 1px solid rgba(212,175,55,0.5);
  color: #d4af37;
}
"""

content += "\n" + new_styles

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(content)
