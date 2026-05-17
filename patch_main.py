import re

main_path = 'js/main.js'
with open(main_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add ColorManager logic
color_manager_code = """
  // ══════════════════════════════════════════
  //  颜色调整管理
  // ══════════════════════════════════════════
  const ColorManager = {
    DEFAULT_COLORS: {
      p0: { strip: '#e74c3c', fill: '#e74c3c' },
      p1: { strip: '#3dbe6c', fill: '#3dbe6c' },
      p2: { strip: '#3498db', fill: '#3498db' },
      npc1: { strip: '#4a6b7c', fill: '#4a6b7c' },
      npc2: { strip: '#a8763e', fill: '#a8763e' },
      npc3: { strip: '#5a7a52', fill: '#5a7a52' },
      npc4: { strip: '#7a5a78', fill: '#7a5a78' },
      npc5: { strip: '#5a6b8a', fill: '#5a6b8a' },
      npc6: { strip: '#b07050', fill: '#b07050' },
    },

    hexToRgba(hex, alpha) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    },

    init() {
      this.loadFromStorage();
      this.bindEvents();
    },

    loadFromStorage() {
      const saved = JSON.parse(localStorage.getItem('sgz_faction_colors') || '{}');
      for (const key of Object.keys(this.DEFAULT_COLORS)) {
        const conf = saved[key] || this.DEFAULT_COLORS[key];
        this.applyToRoot(key, conf);
        this.updatePickers(key, conf);
        this.updateSwatch(key, conf.strip);
      }
    },

    applyToRoot(key, conf) {
      const root = document.documentElement;
      root.style.setProperty(`--${key}-strip`, conf.strip);
      // Generate fill with 0.32 alpha
      const fillRgba = this.hexToRgba(conf.fill, 0.32);
      root.style.setProperty(`--${key}-fill`, fillRgba);
      // Map legacy p0-color and p0-rgb as well for UI consistency
      if (key.startsWith('p')) {
        root.style.setProperty(`--${key}-color`, conf.strip);
        const r = parseInt(conf.strip.slice(1, 3), 16);
        const g = parseInt(conf.strip.slice(3, 5), 16);
        const b = parseInt(conf.strip.slice(5, 7), 16);
        root.style.setProperty(`--${key}-rgb`, `${r},${g},${b}`);
      }
    },

    updatePickers(key, conf) {
      const row = document.querySelector(`.color-row[data-key="${key}"]`);
      if (!row) return;
      const stripInput = row.querySelector('.color-picker[data-target="strip"]');
      const fillInput = row.querySelector('.color-picker[data-target="fill"]');
      if (stripInput) stripInput.value = conf.strip;
      if (fillInput) fillInput.value = conf.fill;
    },

    updateSwatch(key, hexColor) {
      const row = document.querySelector(`.color-row[data-key="${key}"]`);
      if (!row) return;
      const swatch = row.querySelector('.color-swatch');
      if (swatch) swatch.style.backgroundColor = hexColor;
    },

    saveToStorage() {
      const data = {};
      document.querySelectorAll('.color-row').forEach(row => {
        const key = row.dataset.key;
        const strip = row.querySelector('.color-picker[data-target="strip"]').value;
        const fill = row.querySelector('.color-picker[data-target="fill"]').value;
        data[key] = { strip, fill };
      });
      localStorage.setItem('sgz_faction_colors', JSON.stringify(data));
    },

    bindEvents() {
      let timer;
      document.querySelectorAll('.color-picker').forEach(input => {
        input.addEventListener('input', (e) => {
          const row = e.target.closest('.color-row');
          const key = row.dataset.key;
          const target = e.target.dataset.target;
          const val = e.target.value;

          if (target === 'strip') {
             this.updateSwatch(key, val);
          }

          const conf = {
            strip: row.querySelector('.color-picker[data-target="strip"]').value,
            fill: row.querySelector('.color-picker[data-target="fill"]').value
          };
          this.applyToRoot(key, conf);

          clearTimeout(timer);
          timer = setTimeout(() => {
            this.saveToStorage();
          }, 300);
        });
      });

      document.querySelectorAll('.color-reset').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const key = e.target.dataset.key;
          const def = this.DEFAULT_COLORS[key];
          this.updatePickers(key, def);
          this.updateSwatch(key, def.strip);
          this.applyToRoot(key, def);
          this.saveToStorage();
        });
      });

      document.getElementById('btn-color-reset-all')?.addEventListener('click', () => {
        if (confirm('确定要将所有势力配色恢复为默认吗？')) {
          localStorage.removeItem('sgz_faction_colors');
          this.loadFromStorage();
          if (window.state && window.state.players) {
             SGMap.update(window.state.players, window.state.cityOwnership || window.cityOwnership);
          }
        }
      });

      document.getElementById('btn-color-apply')?.addEventListener('click', () => {
        if (window.state && window.state.players) {
           // We need to re-render map to reflect color updates if logic uses inline rendering (which it partially does for roads etc)
           const cityMap = window.state.rounds && window.state.rounds.length ? window.state.rounds[window.state.rounds.length-1].parsed.cityOwnership : SGMap.parseCityOwnership();
           SGMap.update(window.state.players, cityMap);
        }
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
     ColorManager.init();
  });
"""

content = content.replace("document.addEventListener('DOMContentLoaded', () => {", color_manager_code + "\n  document.addEventListener('DOMContentLoaded', () => {")

with open(main_path, 'w', encoding='utf-8') as f:
    f.write(content)
