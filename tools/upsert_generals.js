#!/usr/bin/env node
/**
 * upsert_generals.js — 武将数据批量入库脚本
 *
 * 用法：
 *   node upsert_generals.js <json文件路径>
 *   node upsert_generals.js generals_batch01.json
 *
 * JSON 格式（数组）：
 * [
 *   {
 *     "name": "关羽",
 *     "courtesy_name": "云长",
 *     "nickname": "美髯公",
 *     "faction_hint": "蜀",
 *     "tier": "传奇",
 *     "biography": "河东解县人...",
 *     "suitable_roles": ["独当一面之大将", "不宜外交,尤忌对吴事务"]
 *   },
 *   ...
 * ]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Supabase 配置 ──
// 优先读取环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY，方便 CI 或命令行覆盖
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://smiifcbmmtolimtaxpip.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';
// ⚠️  正式入库请通过环境变量传入 service_role key，anon key 只有读权限

// ── 字段校验 ──
const REQUIRED_FIELDS  = ['name', 'faction_hint', 'tier', 'biography', 'suitable_roles'];
const VALID_FACTIONS   = ['魏', '蜀', '吴', '群雄', '汉室'];
const VALID_TIERS      = ['常规', '精英', '传奇', '神话'];

function validate(row, idx) {
  const errors = [];
  REQUIRED_FIELDS.forEach(f => {
    if (row[f] == null || row[f] === '') errors.push(`缺少字段: ${f}`);
  });
  if (row.faction_hint && !VALID_FACTIONS.includes(row.faction_hint))
    errors.push(`faction_hint 非法值: "${row.faction_hint}"，应为 魏/蜀/吴/群雄/汉室`);
  if (row.tier && !VALID_TIERS.includes(row.tier))
    errors.push(`tier 非法值: "${row.tier}"，应为 常规/精英/传奇/神话`);
  if (row.suitable_roles && !Array.isArray(row.suitable_roles))
    errors.push(`suitable_roles 必须是数组`);
  if (errors.length > 0) {
    console.error(`\n❌ 第 ${idx + 1} 条 [${row.name || '?'}] 校验失败:`);
    errors.forEach(e => console.error('   · ' + e));
    return false;
  }
  return true;
}

// ── 规范化单条数据 ──
function normalize(row) {
  return {
    name:           String(row.name).trim(),
    courtesy_name:  row.courtesy_name  != null ? String(row.courtesy_name)  : '',
    nickname:       row.nickname       != null ? String(row.nickname)       : '',
    faction_hint:   String(row.faction_hint).trim(),
    tier:           String(row.tier).trim(),
    biography:      String(row.biography).trim(),
    suitable_roles: row.suitable_roles.map(s => String(s)),
  };
}

// ── 分批 upsert（每批最多 50 条，避免请求过大）──
async function upsertBatch(rows) {
  const url = SUPABASE_URL + '/rest/v1/generals_static';
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',  // upsert on conflict
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return rows.length;
}

// ── 主流程 ──
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('用法: node upsert_generals.js <json文件路径>');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`文件不存在: ${absPath}`);
    process.exit(1);
  }

  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (e) {
    console.error(`JSON 解析失败: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(rows)) {
    console.error('JSON 根节点必须是数组');
    process.exit(1);
  }

  console.log(`\n📂 读取文件: ${absPath}`);
  console.log(`📋 共 ${rows.length} 条数据，开始校验...\n`);

  // 校验
  let hasError = false;
  rows.forEach((r, i) => {
    if (!validate(r, i)) hasError = true;
  });
  if (hasError) {
    console.error('\n⛔ 存在校验错误，已中止入库。请修正后重试。');
    process.exit(1);
  }
  console.log(`✅ 校验通过，准备入库...\n`);

  // 规范化
  const normalized = rows.map(normalize);

  // 分批入库（每批 50 条）
  const BATCH_SIZE = 50;
  let total = 0;
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    try {
      const n = await upsertBatch(batch);
      total += n;
      console.log(`  ✓ 批次 ${Math.floor(i / BATCH_SIZE) + 1}: 入库 ${n} 条（累计 ${total} 条）`);
    } catch (e) {
      console.error(`\n❌ 批次 ${Math.floor(i / BATCH_SIZE) + 1} 入库失败: ${e.message}`);
      console.error('⛔ 已中止，请检查错误后重试。');
      process.exit(1);
    }
  }

  console.log(`\n🎉 入库完成！本批 ${total} 条。`);
}

main();
