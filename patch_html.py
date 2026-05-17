import re

html_path = 'index.html'
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

html_to_insert = """
      <details class="color-panel" id="color-panel">
        <summary class="color-panel-summary">
          🎨 势力配色调整
          <span class="color-panel-sub">点击展开 · 配置自动保存</span>
        </summary>
        <div class="color-panel-body">

          <div class="color-section">
            <div class="color-section-title">玩家阵营</div>
            <div class="color-row" data-key="p0">
              <span class="color-swatch"></span>
              <span class="color-label">城主甲</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="p0">复位</button>
            </div>
            <div class="color-row" data-key="p1">
              <span class="color-swatch"></span>
              <span class="color-label">城主乙</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="p1">复位</button>
            </div>
            <div class="color-row" data-key="p2">
              <span class="color-swatch"></span>
              <span class="color-label">城主丙</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="p2">复位</button>
            </div>
          </div>

          <div class="color-section">
            <div class="color-section-title">NPC 阵营槽位</div>
            <div class="color-row" data-key="npc1">
              <span class="color-swatch"></span>
              <span class="color-label">槽位一 · 玄铁青</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="npc1">复位</button>
            </div>
            <div class="color-row" data-key="npc2">
              <span class="color-swatch"></span>
              <span class="color-label">槽位二 · 赭黄</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="npc2">复位</button>
            </div>
            <div class="color-row" data-key="npc3">
              <span class="color-swatch"></span>
              <span class="color-label">槽位三 · 竹墨绿</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="npc3">复位</button>
            </div>
            <div class="color-row" data-key="npc4">
              <span class="color-swatch"></span>
              <span class="color-label">槽位四 · 暮紫</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="npc4">复位</button>
            </div>
            <div class="color-row" data-key="npc5">
              <span class="color-swatch"></span>
              <span class="color-label">槽位五 · 砚灰蓝</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="npc5">复位</button>
            </div>
            <div class="color-row" data-key="npc6">
              <span class="color-swatch"></span>
              <span class="color-label">槽位六 · 枯橙</span>
              <input type="color" class="color-picker" data-target="strip" />
              <span class="color-hint">主色</span>
              <input type="color" class="color-picker" data-target="fill" />
              <span class="color-hint">填充</span>
              <button class="color-reset" data-key="npc6">复位</button>
            </div>
          </div>

          <div class="color-actions">
            <button id="btn-color-reset-all" class="btn-color-reset">🔄 全部复位为默认</button>
            <button id="btn-color-apply" class="btn-color-apply">✅ 立即应用到地图</button>
          </div>

        </div>
      </details>
"""

content = content.replace('<div class="gm-form">', html_to_insert + '\n      <div class="gm-form">')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)
