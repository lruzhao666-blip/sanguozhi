#!/bin/bash
# 1. Update index.html
sed -i 's/css\/style\.css?v=20260612a/css\/style\.css?v=20260612b/g' index.html
sed -i 's/js\/main\.js?v=20260619a/js\/main\.js?v=20260619b/g' index.html
sed -i 's/js\/parser\.js?v=20260610a/js\/parser\.js?v=20260610b/g' index.html

# 2. Append CSS to css/style.css
cat << 'CSSEOF' >> css/style.css

/* ══════════════════════════════════════════
   v20260612b 工单#opportunities-panel-v1: 公共机遇面板优化
══════════════════════════════════════════ */

.opportunities-panel {
  background: linear-gradient(135deg, rgba(60,30,0,.5), rgba(30,15,0,.35));
  border: 1px solid rgba(180,120,40,.3);
  border-radius: var(--rl);
  padding: 18px 20px 20px;
  margin-bottom: 16px;
}

.opp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.opp-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.opp-title {
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 700;
  color: var(--gold-light);
  letter-spacing: .1em;
}

.opp-subtitle {
  font-size: .72rem;
  color: var(--text-dim);
  margin-left: 4px;
}

.opp-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}

.opp-empty {
  text-align: center;
  padding: 20px;
  color: var(--text-dim);
  font-size: .85rem;
}

.opp-card {
  background: linear-gradient(135deg, rgba(100,50,0,.25), rgba(60,30,0,.15));
  border: 1px solid rgba(180,120,40,.35);
  border-radius: var(--r);
  padding: 14px 16px;
  cursor: pointer;
  transition: all .2s;
  position: relative;
  overflow: hidden;
}

.opp-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: linear-gradient(180deg, var(--gold-light), var(--gold-dim));
}

.opp-card:hover {
  background: linear-gradient(135deg, rgba(120,60,0,.35), rgba(80,40,0,.25));
  border-color: var(--gold);
  transform: translateY(-2px);
}

.opp-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.opp-card-title {
  font-family: var(--font-serif);
  font-size: .92rem;
  font-weight: 700;
  color: var(--text-main);
  letter-spacing: .06em;
}

.opp-type-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: .68rem;
  font-weight: 600;
  letter-spacing: .04em;
}

.opp-type-badge.compete {
  background: rgba(231,76,60,.2);
  color: #ff8a7a;
  border: 1px solid rgba(231,76,60,.4);
}

.opp-type-badge.cooperate {
  background: rgba(61,190,108,.2);
  color: #6dde9c;
  border: 1px solid rgba(61,190,108,.4);
}

.opp-card-desc {
  font-size: .82rem;
  color: var(--text-sub);
  line-height: 1.5;
  margin-bottom: 10px;
}

.opp-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid rgba(160,120,40,.2);
}

.opp-prestige {
  font-size: .8rem;
  color: var(--gold-light);
  font-weight: 600;
}

.opp-distance {
  font-size: .75rem;
  color: var(--text-dim);
}

@media (max-width: 720px) {
  .opp-body {
    grid-template-columns: 1fr;
  }

  .opportunities-panel {
    padding: 14px 16px 16px;
  }
}
CSSEOF
