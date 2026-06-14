import re

with open('css/style.css', 'a', encoding='utf-8') as f:
    f.write('''
/* ── 应变令联动分隔线 ── */
.ling-divider {
  text-align: center;
  padding: 8px 0;
  font-size: 0.68rem;
  color: var(--text-dim, #9a9080);
}

.ling-divider span {
  background: var(--card-bg, rgba(30, 28, 24, 0.85));
  padding: 0 10px;
  position: relative;
}

.ling-opp-card {
  border-left: 3px solid var(--gold-text, #c8b070);
}

.opp-selected {
  border-color: var(--gold-text, #c8b070);
  box-shadow: 0 0 0 1px var(--gold-text, #c8b070);
}

/* ── 独立提交按钮 ── */
.cmd-submit-slot {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(180, 160, 120, 0.15);
  text-align: center;
}

.cmd-slot-submit-btn {
  padding: 10px 28px;
  font-size: 0.82rem;
  font-weight: 600;
  background: linear-gradient(135deg, #8b6914, #c8a030);
  color: #1a1a14;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.cmd-slot-submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.cmd-slot-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cmd-slot-submit-hint {
  font-size: 0.65rem;
  color: var(--text-dim, #9a9080);
  margin-top: 6px;
}

.cmd-slot-submitted {
  color: #40b060;
  font-size: 0.78rem;
  padding: 10px 0;
}

/* ── GM 录入台复制按钮 ── */
.gm-copy-actions-bar {
  margin: 16px 0;
  padding: 14px;
  background: rgba(64, 176, 96, 0.06);
  border: 1px solid rgba(64, 176, 96, 0.3);
  border-radius: 8px;
  text-align: center;
}

.gm-copy-actions-btn {
  padding: 10px 24px;
  font-size: 0.82rem;
  font-weight: 600;
  background: rgba(64, 176, 96, 0.15);
  color: #60d080;
  border: 1px solid #40b060;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.gm-copy-actions-btn:hover {
  background: rgba(64, 176, 96, 0.25);
}

.gm-copy-actions-hint {
  display: block;
  font-size: 0.65rem;
  color: var(--text-dim, #9a9080);
  margin-top: 6px;
}

.gm-copy-actions-ok {
  color: #40b060;
  font-size: 0.75rem;
}

.gm-copy-actions-ok.hidden {
  display: none;
}
''')
