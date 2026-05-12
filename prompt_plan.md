## 方案计划

1. **Supabase配置 & 客户端引入**:
    - 在 `js/supabase-client.js` 中使用 `window.SUPABASE_CONFIG`（包含 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`）初始化 `@supabase/supabase-js`。
    - 并支持向后兼容现有的 `SUPA_URL` 和 `SUPA_KEY` 获取方式。
    - （由于系统不能使用npm，已使用ESM CDN https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm）。

2. **数据库结构与边缘函数**:
    - 已提供 `supabase_schema.sql` 包含了十几个核心表的建立。
    - 建立了基本边缘函数的占位/逻辑，如 `extract_sentence_pack` 进行按池抽取。

3. **新增的UI页面(行动汇总、骰子展示、后台管理等)**:
    - `index.html` 已经追加了相关 `tab` 和面板 (`#tab-actions`, `#tab-sentence-admin`, `#tab-history`, `#tab-admin`)。
    - `css/style-v2.css` 已经创建，并按照现有风格编写样式（不覆盖现有类）。

4. **主逻辑与动作包装 (`action-summary.js`)**:
    - 实现骰子算法 (`crypto.getRandomValues`) 和提取场景标签。
    - 调用云端请求提取句式，组装并展示完整的 Prompt。

5. **解析器 (`parser.js`) 兼容新增锚点**:
    - 新增了检测 `句式△`、`剧情△`、`钩子△`、`声望△` 等。

6. **句式合规事后比对 (`sentence-compliance.js`)**:
    - 在 `parse` 后，比对输出中是否存在未授权或者超频的句式。

7. **前端联调调整**:
    - 将上述 js 文件整合到 `index.html` 中。

8. **测试预提交准备**:
    - 执行代码检查和工具提示，包括 `pre_commit_instructions`。
