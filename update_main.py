import re

with open('js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace _buildCheckSystemPrompt
old_prompt = r'''  function _buildCheckSystemPrompt\(\) \{
    return \[
      '你是《三国志文字版》数据校验助手。检查 GM 输出的数据区是否符合格式规范。',
.*?
      '请严格按上述格式和规则检查数据区。'
    \]\.join\('\\n'\);
  \}'''

new_prompt = '''  // 构建检查 System Prompt（精简版）
  function _buildCheckSystemPrompt() {
    return [
      '你是《三国志文字版》数据校验助手。检查 GM 输出的数据区是否符合格式规范。',
      '',
      '━━━ 检查项目（按优先级）━━━',
      '',
      '【P0 严重错误 — 必须修复】',
      '',
      '1. 格式完整性',
      '   检查点：',
      '   · 段落标签完整：[回合][NPC][战报][威望][调度][变动][甲][乙][丙]',
      '   · 段落顺序正确：必须按上述顺序排列',
      '   · 必需分隔符存在：冒号、竖线、括号、逗号',
      '',
      '2. 资源数值闭环',
      '   检查点：上回合资源 + 本回合变动△ = 本回合资源',
      '   检查资源：金、粮、兵、民心、城',
      '   示例：上回合金1200 + 变动金△+150 = 本回合金1350',
      '   容差：±5 以内视为合理误差',
      '',
      '3. 城池数量匹配',
      '   检查点：',
      '   · [甲]城:3 则城池列表必须恰好 3 个',
      '   · 城池列表：城:襄阳,新野,江夏 → 实际 3 个',
      '',
      '4. 武将数量与落点',
      '   检查点：',
      '   · [甲]武将:关羽,张飞,赵云 → 数据区必须出现这 3 位',
      '   · 不得出现未在名单中的武将名（幽灵武将）',
      '   · 每位武将必须落在：城池守将括号 或 [调度]段',
      '',
      '【P1 次要问题 — 建议修复】',
      '',
      '5. 武将状态白名单',
      '   合法值：健康(空) / 疲劳 / 受伤 / 患病 / 阵亡',
      '   常见错误：重伤→受伤 / 战死→阵亡 / 轻伤→受伤',
      '',
      '6. 战报档位白名单',
      '   合法值：大胜 / 小胜 / 惨胜 / 平局 / 小负 / 大败 / 胜',
      '   常见错误：全胜→大胜 / 险胜→小胜 / 惨败→大败',
      '',
      '7. 兵种白名单',
      '   合法值：步 / 弓 / 骑 / 水 / 蛮',
      '   常见错误：枪→步 / 盾→步 / 重步→步 / 轻骑→骑',
      '',
      '8. 调度状态白名单',
      '   位移态（带"剩N"）：剩N / 攻城中 / 交战中 / 客驻',
      '   驻扎态（不带"剩N"）：巡防 / 围城中 / 伏兵 / 客驻 / 封锁 / 警戒',
      '   常见错误：对峙中→交战中 / 客途→在野',
      '',
      '━━━ 输出格式 ━━━',
      '',
      '返回严格的 JSON 格式：',
      '{',
      '  "status": "ok",  // 无任何错误时为 "ok"，有错误时为 "error"',
      '  "issues": [  // 错误列表，无错误时为空数组 []',
      '    {',
      '      "priority": "P0",  // 或 "P1"',
      '      "type": "资源闭环错误",  // 错误类型简述',
      '      "location": "甲 金",  // 错误位置',
      '      "description": "上回合金1200，本回合变动+150，应该等于1350，但你写成了1360。请把「金:1360」改为「金:1350」",',
      '      "howToFix": "找到 [甲] 段落，将「金:1360」改为「金:1350」"  // 修改指导（自然语气）',
      '    }',
      '  ],',
      '  "summary": ""  // 总结性建议（自然语气，如"发现 3 个错误，主要是资源闭环问题，建议重新核对变动△的计算"）',
      '}',
      '',
      '━━━ 检查规则 ━━━',
      '',
      '· status="ok" 当且仅当 issues 为空数组',
      '· 每个错误都要提供清晰的修改指导（howToFix），用自然语气告诉 GM 怎么改',
      '· description 要说明错误原因和正确值应该是什么',
      '· 如果有多个错误，在 summary 中给出总体建议',
      '· 不要输出完整的修正数据区，只需要告诉 GM 哪里错了、怎么改',
      '',
      '━━━ 重要提醒 ━━━',
      '',
      '· 你的任务是检查并指导修改，不是替 GM 重写整个数据区',
      '· 用自然语气，就像在和 GM 对话："你这里算错了，应该是 X"',
      '· 如果错误很多，优先指出最严重的 P0 错误',
      '',
      '数据区格式示例：',
      '[回合]第5回合·荆襄逐鹿',
      '[NPC]',
      '袁绍(3城)|金:2400/粮:3200/兵:18000/民心:52/武将:颜良,文丑',
      '[战报]',
      '襄阳 | 平局 | 甲 关羽5000 vs 乙 夏侯惇4800 | 甲兵-800·乙兵-750',
      '[威望]',
      '甲 威望:55',
      '[调度]',
      '甲 关羽 襄阳→江夏 步:3000,弓:2000 剩2回合',
      '[变动]',
      '甲 收支△',
      '金:产出+200,战利+50,行动-100,维护-80,合计+70',
      '[甲]',
      '金:1350/粮:1680/兵:7200/民心:47/城:3',
      '城:襄阳,新野,江夏',
      '武将:关羽,张飞,赵云',
      '襄阳(郡城)|步:2000,弓:1500|守将:张飞',
      '',
      '请严格按上述格式和规则检查数据区。'
    ].join('\\n');
  }'''

content = re.sub(old_prompt, new_prompt, content, flags=re.DOTALL)


# 2. Modify timeout in _callDataCheckAPI
content = re.sub(r'\}, 60000\)\.then\(function\(res\)', r'}, 120000).then(function(res)', content)


# 3. Modify _showCheckResult issue rendering
old_render = r'''      // 渲染问题列表
      var issuesList = document\.getElementById\('issues-list'\);
      issuesList\.innerHTML = \(result\.issues \|\| \[\]\)\.map\(function\(issue, idx\) \{
        return \[
          '<div style="background:rgba\(231,111,81,0\.08\); border:1px solid rgba\(231,111,81,0\.25\); border-radius:4px; padding:12px; margin-bottom:10px;">',
          '  <div style="display:flex; gap:8px; margin-bottom:8px;">',
          '    <span style="font-weight:700; color:#e76f51;">' \+ \(idx \+ 1\) \+ '\.</span>',
          '    <div style="flex:1;">',
          '      <span style="display:inline-block; background:rgba\(231,111,81,0\.2\); color:#e76f51; padding:2px 8px; border-radius:3px; font-size:0\.7rem; font-weight:600; margin-bottom:6px;">' \+ \(issue\.type \|\| ''\) \+ '</span>',
          '      <div style="font-size:0\.85rem; color:var\(--text-main\); margin-bottom:8px; line-height:1\.5;">' \+ escapeHtml\(issue\.description \|\| ''\) \+ '</div>',
          '      <div style="font-size:0\.8rem; color:var\(--text-dim\); padding-left:12px; border-left:2px solid rgba\(212,165,116,0\.3\); line-height:1\.4;">',
          '        <span style="color:var\(--gold\); font-weight:600;">→ 建议修正：</span>' \+ escapeHtml\(issue\.fixed \|\| ''\) \+ '',
          '      </div>',
          '    </div>',
          '  </div>',
          '</div>'
        \]\.join\(''\);
      \}\)\.join\(''\);'''

new_render = '''      // 渲染问题列表
      var issuesList = document.getElementById('issues-list');
      issuesList.innerHTML = (result.issues || []).map(function(issue, idx) {
        return [
          '<div style="background:rgba(231,111,81,0.08); border:1px solid rgba(231,111,81,0.25); border-radius:4px; padding:12px; margin-bottom:10px;">',
          '  <div style="display:flex; gap:8px; margin-bottom:8px;">',
          '    <span style="font-weight:700; color:#e76f51;">' + (idx + 1) + '.</span>',
          '    <div style="flex:1;">',
          '      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">',
          '        <span style="display:inline-block; background:rgba(231,111,81,0.2); color:#e76f51; padding:2px 8px; border-radius:3px; font-size:0.7rem; font-weight:600;">' + (issue.priority || 'P0') + '</span>',
          '        <span style="font-size:0.85rem; color:#999;">位置：' + escapeHtml(issue.location || '') + '</span>',
          '      </div>',
          '      <div style="font-size:0.9rem; color:var(--text-main); margin-bottom:8px; line-height:1.6;">' + escapeHtml(issue.description || '') + '</div>',
          (issue.howToFix ? '<div style="background:rgba(46,160,67,0.08); border-left:3px solid #2ea043; padding:8px 12px; font-size:0.85rem; color:var(--text-main); line-height:1.5; border-radius:3px;">💡 ' + escapeHtml(issue.howToFix) + '</div>' : ''),
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');

      // 如果有总结，显示在列表后
      if (result.summary) {
        issuesList.innerHTML += '<div style="background:rgba(100,149,237,0.08); border:1px solid rgba(100,149,237,0.25); border-radius:4px; padding:12px; margin-top:16px; font-size:0.9rem; color:var(--text-main); line-height:1.6;">📌 ' + escapeHtml(result.summary) + '</div>';
      }'''

content = re.sub(old_render, new_render, content, flags=re.DOTALL)

with open('js/main.js', 'w', encoding='utf-8') as f:
    f.write(content)
