import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 删除 role-login.js 的 script 引用
content = re.sub(r'<script src="js/role-login.js\?v=v20260601a"></script>\n?', '', content)

# 2. 删除身份登录浮层 HTML
role_login_html = r"""<!-- 身份登录浮层 -->
<div class="role-login-overlay" id="role-login-overlay">
  <div class="role-login-card" id="role-login-inner"></div>
</div>"""
content = content.replace(role_login_html, '')

# 3. 删除 footer 中的身份显示
footer_html = r"""  <span class="footer-sep">·</span>
  <span id="role-footer-info">未登录</span>"""
content = content.replace(footer_html, '')

# 4. GM 录入台增加一键复制按钮
gm_copy_bar = """      <div class="gm-copy-actions-bar" id="gm-copy-actions-bar" style="display:none;">
        <div class="gm-copy-actions-inner">
          <button class="gm-copy-actions-btn" id="btn-gm-copy-all-actions">📋 一键复制全部玩家行动</button>
          <span class="gm-copy-actions-hint">三家行动全部提交后可用，复制后粘贴给 AI 主持人</span>
          <span class="gm-copy-actions-ok hidden" id="gm-copy-all-ok">✓ 已复制到剪贴板</span>
        </div>
      </div>
"""
content = content.replace('      <div id="parse-preview" class="parse-preview hidden">', gm_copy_bar + '      <div id="parse-preview" class="parse-preview hidden">')

# 5. 行动 tab 提交栏改为三家独立提交
submit_bar_old = r"""    <!-- ══ 提交栏 ══ -->
    <div class="action-submit-bar" id="action-submit-bar">
      <button id="btn-action-submit" class="action-submit-btn" disabled>
        提交本回合行动
      </button>
      <div class="action-submit-hint" id="action-submit-hint">
        选择三令后提交，提交后不可修改
      </div>
      <div class="action-submit-success hidden" id="action-submit-success">
        ✅ 已提交，等待其他玩家
      </div>
    </div>"""
submit_bar_new = """    <!-- ══ 提交栏（已移入各 slot 面板内，由 JS 渲染） ══ -->"""
content = content.replace(submit_bar_old, submit_bar_new)

# 6. 删除行动 tab 的 GM 复制栏
gm_copy_old = r"""    <!-- ══ GM 一键复制栏 ══ -->
    <div class="action-gm-copy hidden" id="action-gm-copy">
      <button class="gm-copy-btn" id="btn-gm-copy-actions">
        📋 一键复制全部行动
      </button>
      <span class="gm-copy-hint">复制后粘贴给 AI 主持人</span>
      <span class="gm-copy-ok hidden" id="gm-copy-ok">✓ 已复制</span>
    </div>"""
content = content.replace(gm_copy_old, '')

# 10. 更新版本号
content = content.replace('css/style.css?v=20260615v2a', 'css/style.css?v=20260616collab')
content = content.replace('js/main.js?v=20260615fix1', 'js/main.js?v=20260616collab')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
