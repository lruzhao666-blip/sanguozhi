/* ═══════════════════════════════════════════════
   战争迷雾开关逻辑 #gm-fog-toggle-v1
═══════════════════════════════════════════════ */
(function initFogToggle() {
  const btn = document.getElementById('btn-fog-toggle');
  if (!btn) return;

  // 读取初始状态（默认开启）
  const stored = localStorage.getItem('sg_fog_of_war');
  const enabled = stored !== '0'; // null 或 '1' 都视为开启

  // 设置初始显示
  btn.dataset.enabled = enabled ? '1' : '0';
  btn.querySelector('.fog-label').textContent = enabled ? '战争迷雾：开启' : '战争迷雾：关闭';

  // 点击切换
  btn.addEventListener('click', () => {
    const current = btn.dataset.enabled === '1';
    const next = !current;

    // 更新 localStorage
    localStorage.setItem('sg_fog_of_war', next ? '1' : '0');

    // 更新按钮状态
    btn.dataset.enabled = next ? '1' : '0';
    btn.querySelector('.fog-label').textContent = next ? '战争迷雾：开启' : '战争迷雾：关闭';

    // 刷新地图（如果地图已加载）
    if (window.SGMap && window.SGMap.refresh) {
      window.SGMap.refresh();
    }

    // Toast 提示
    const msg = next ? '战争迷雾已开启：玩家只能看到自己城池的兵力' : '战争迷雾已关闭：所有兵力可见';
    if (window.showToast) {
      window.showToast(msg);
    }
  });
})();