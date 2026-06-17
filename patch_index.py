import re

with open("index.html", "r") as f:
    content = f.read()

# Requirement 4: CSS version update
content = content.replace('css/style.css?v=20260615land5', 'css/style.css?v=20260615land6')

# Requirement 4: Footer update
old_footer = """<footer id="site-footer">
  <span>⚔️ 三国志文字版</span>
  <span class="footer-sep">·</span>
  <span id="footer-info">尚未开局</span>
  <!-- ↓↓↓ 身份选择器移到页脚 ↓↓↓ -->
  <div class="identity-selector-footer" id="identity-selector">
    <span class="identity-label">我的身份：</span>
    <button class="identity-btn" data-slot="0">甲</button>
    <button class="identity-btn" data-slot="1">乙</button>
    <button class="identity-btn" data-slot="2">丙</button>
  </div>
  <!-- ↑↑↑ 身份选择器结束 ↑↑↑ -->
</footer>"""

new_footer = """<footer id="site-footer">
  <div class="footer-content">
    <span>⚔️ 三国志文字版</span>
    <span class="footer-sep">·</span>
    <span id="footer-info">尚未开局</span>
    <span class="footer-sep">·</span>
    <!-- ↓↓↓ 极简身份选择器 ↓↓↓ -->
    <div class="identity-selector-minimal" id="identity-selector">
      <button class="identity-btn-mini" data-slot="0">甲</button>
      <button class="identity-btn-mini" data-slot="1">乙</button>
      <button class="identity-btn-mini" data-slot="2">丙</button>
    </div>
    <!-- ↑↑↑ 身份选择器结束 ↑↑↑ -->
  </div>
</footer>"""

content = content.replace(old_footer, new_footer)

with open("index.html", "w") as f:
    f.write(content)
