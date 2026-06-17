import re

with open("css/style.css", "r") as f:
    content = f.read()

# Fix the nested comment issue
old_comment_block = """/* 需求1：取消透明度降低规则，保留此注释块但不应用样式 */

/*
.col-panel.readonly {
  opacity: 0.6;
  pointer-events: none; /* 禁用所有交互 */
}

.col-panel.readonly .col-head {
  background: rgba(100, 100, 100, 0.2);
}

.col-panel.readonly .submit-btn {
  display: none; /* 隐藏提交按钮 */
}

.col-panel.readonly .opt,
.col-panel.readonly .opp-opt-row {
  cursor: not-allowed;
}

/* 只读提示（可选，如果需要更明显的提示） */
.col-panel.readonly::before {
  content: '🔒 只读';
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 0.7rem;
  color: var(--text-dim);
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 8px;
  border-radius: 3px;
  z-index: 10;
}
*/"""

new_comment_block = """/* 需求1：取消透明度降低规则，保留此注释块但不应用样式 */

/*
.col-panel.readonly {
  opacity: 0.6;
  pointer-events: none;
}

.col-panel.readonly .col-head {
  background: rgba(100, 100, 100, 0.2);
}

.col-panel.readonly .submit-btn {
  display: none;
}

.col-panel.readonly .opt,
.col-panel.readonly .opp-opt-row {
  cursor: not-allowed;
}

.col-panel.readonly::before {
  content: '🔒 只读';
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 0.7rem;
  color: var(--text-dim);
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 8px;
  border-radius: 3px;
  z-index: 10;
}
*/"""

content = content.replace(old_comment_block, new_comment_block)

with open("css/style.css", "w") as f:
    f.write(content)
