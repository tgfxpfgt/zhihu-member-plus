/**
 * 本地/CI 通用检查脚本
 * 用法：node scripts/check.js
 * 1. 全部 JS 文件语法检查（node --check）
 * 2. manifest.json JSON 合法性
 * 3. 版本号对齐：manifest.json ↔ lite 油猴脚本 ↔ popup 徽章
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let failed = false;

function fail(msg) {
  console.error('  ✗ ' + msg);
  failed = true;
}
function ok(msg) {
  console.log('  ✓ ' + msg);
}

/* ---------- 1. 收集 JS 文件 ---------- */
function collectJsFiles(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.github' || name === '.workbuddy' || name === 'scripts' || name === 'node_modules') continue;
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) collectJsFiles(p, acc);
    else if (name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

console.log('[1/3] JavaScript 语法检查');
const jsFiles = collectJsFiles(ROOT, []);
for (const file of jsFiles) {
  const rel = path.relative(ROOT, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    ok(rel);
  } catch (e) {
    fail(rel + ' — ' + String(e.stderr || e.message).split('\n')[0]);
  }
}

/* ---------- 2. manifest.json ---------- */
console.log('[2/3] manifest.json 检查');
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  ok('JSON 合法，版本 ' + manifest.version);
} catch (e) {
  fail('manifest.json 解析失败: ' + e.message);
}

/* ---------- 3. 版本对齐 ---------- */
console.log('[3/3] 版本号对齐');
if (manifest) {
  const mv = manifest.version;

  const lite = fs.readFileSync(path.join(ROOT, 'zhihu-member-plus-lite.user.js'), 'utf8');
  const liteMatch = lite.match(/@version\s+([\d.]+)/);
  if (liteMatch) {
    if (liteMatch[1] === mv) ok('油猴轻量版 @version ' + liteMatch[1]);
    else fail(`油猴轻量版版本 ${liteMatch[1]} ≠ manifest ${mv}`);
  } else {
    fail('油猴轻量版未找到 @version');
  }

  const html = fs.readFileSync(path.join(ROOT, 'popup', 'popup.html'), 'utf8');
  const shortVer = 'v' + mv.split('.').slice(0, 2).join('.');
  const badgeMatch = html.match(/class="version">([^<]+)</);
  if (badgeMatch) {
    if (badgeMatch[1] === shortVer) ok('popup 徽章 ' + badgeMatch[1]);
    else fail(`popup 徽章 ${badgeMatch[1]} ≠ ${shortVer}`);
  } else {
    fail('popup.html 未找到版本徽章');
  }

  // content_scripts 文件都存在
  const scripts = (manifest.content_scripts || []).flatMap(cs => cs.js || []);
  for (const s of scripts) {
    if (fs.existsSync(path.join(ROOT, s))) ok(s);
    else fail('manifest 引用的文件不存在: ' + s);
  }
}

console.log(failed ? '\n检查未通过 ✗' : '\n全部检查通过 ✓');
process.exit(failed ? 1 : 0);
