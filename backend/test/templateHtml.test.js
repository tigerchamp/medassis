// 模板字符串 HTML 结构有效性回归（2026-11-04 新增）
//
// 背景：家庭组列表行的模板里 style 属性少了一个闭合双引号，
// 于是 `onclick="PageFamily.switchFamily('id')"` 被 HTML 解析器拆成了
//   style = "....; onclick="            （onclick 被吞进 style 的值里）
//   垃圾属性名 = "pagefamily.switchfamily('id')\""   （属性名被小写化）
// 结果：**事件处理器根本没绑上**，页面渲染完全正常，但点击毫无反应。
// 这类缺陷静默失效、不报错，当时先后误判过「静态资源缓存」「后端 family-id 链路」
// 「switchFamily 函数逻辑」三个方向，绕了大弯。
//
// 本测试不依赖 jsdom：直接扫源码里的模板字符串，
// 用一个迷你 HTML 属性解析器检查「属性名是否畸形」+「onclick 值是否完整」。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PAGES_SRC = fs.readFileSync(path.resolve(__dirname, '../../js/pages.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.resolve(__dirname, '../../js/app.js'), 'utf8');

// 把模板里的 ${...} 插值替换成占位符，避免把 JS 表达式误当成 HTML 标签/属性。
// 例如 `${(!e.gender ? '男' : '女')}` 里含括号，会被属性解析器误判为「属性名畸形」。
function maskInterpolations(s) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$' && s[i + 1] === '{') {
      depth = 1;
      out += '__EXPR__';
      i++;
      continue;
    }
    if (depth > 0) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') {
        depth--;
        if (depth === 0) continue;
      }
      out += 'x';
      continue;
    }
    out += s[i];
  }
  return out;
}

// 提取模板字符串里的 HTML 片段（含 onclick= 的那些）
function extractHtmlTemplates(src) {
  const out = [];
  // 匹配反引号模板字符串（粗略但足够：只取含 onclick 的）
  const re = /`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1].includes('onclick') || m[1].includes('style="')) {
      out.push({ text: maskInterpolations(m[1]), raw: m[1], index: m.index });
    }
  }
  return out;
}

// 迷你 HTML 标签属性解析：找出每个标签的属性名/值。
// 关键点：属性名只能是 [^\s"'>/=]+ ，若解析出的属性名里出现 ( ) ' 等字符，
// 说明原始 HTML 的引号没闭合，属性被错位解析了。
function parseAttrs(tagText) {
  const attrs = [];
  let i = 0;
  const n = tagText.length;
  while (i < n) {
    // 跳过空白
    while (i < n && /\s/.test(tagText[i])) i++;
    if (i >= n) break;
    // 读属性名
    let name = '';
    while (i < n && !/[\s"'>/=]/.test(tagText[i])) {
      name += tagText[i];
      i++;
    }
    if (!name) { i++; continue; }
    // 跳过空白
    while (i < n && /\s/.test(tagText[i])) i++;
    let value = null;
    if (i < n && tagText[i] === '=') {
      i++;
      while (i < n && /\s/.test(tagText[i])) i++;
      if (i < n && (tagText[i] === '"' || tagText[i] === "'")) {
        const q = tagText[i];
        i++;
        value = '';
        while (i < n && tagText[i] !== q) {
          value += tagText[i];
          i++;
        }
        if (i < n) i++; // 跳过收尾引号
      } else {
        value = '';
        while (i < n && !/[\s>]/.test(tagText[i])) {
          value += tagText[i];
          i++;
        }
      }
    }
    attrs.push({ name, value });
    // 属性名后遇到 '/' 或 '>' 就结束本标签
    if (i < n && (tagText[i] === '>' || tagText[i] === '/')) break;
  }
  return attrs;
}

// 找出一段 HTML 里的所有开始标签
function findTags(html) {
  const tags = [];
  const re = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    tags.push({ raw: m[0], name: m[1], attrText: m[2] });
  }
  return tags;
}

test('★ 模板里所有标签的属性名都不得畸形（引号必须闭合）', () => {
  const problems = [];
  for (const [src, label] of [[PAGES_SRC, 'js/pages.js'], [APP_SRC, 'js/app.js']]) {
    for (const tpl of extractHtmlTemplates(src)) {
      for (const tag of findTags(tpl.text)) {
        for (const a of parseAttrs(tag.raw)) {
          // 属性名里出现这些字符 = 引号没闭合，属性被错位解析
          if (/[()'"]/.test(a.name)) {
            const line = src.slice(0, tpl.index).split('\n').length;
            problems.push(`${label}:${line} 属性名畸形 -> ${JSON.stringify(a.name)}`);
          }
        }
      }
    }
  }
  assert.deepEqual(problems, [], '发现属性名畸形的标签（多半是引号没闭合）：\n' + problems.join('\n'));
});

test('★ 标签内的引号必须成对（这是「属性被错位解析」的根本原因）', () => {
  // 直接数标签属性区里的双引号个数：奇数说明某个引号没闭合，
  // 后面的 onclick / style 会被解析成垃圾属性名，事件处理器绑不上。
  const problems = [];
  for (const [src, label] of [[PAGES_SRC, 'js/pages.js'], [APP_SRC, 'js/app.js']]) {
    for (const tpl of extractHtmlTemplates(src)) {
      // 逐个标签扫描（不用正则切标签，避免引号不配对时切错）
      const text = tpl.text;
      let i = 0;
      while (i < text.length) {
        if (text[i] !== '<') { i++; continue; }
        // 跳过闭合标签
        if (text[i + 1] === '/') { const gt = text.indexOf('>', i); i = gt === -1 ? text.length : gt + 1; continue; }
        // 扫描到标签结束（遇到 > 且不在引号内）
        let j = i + 1;
        let inQuote = false;
        while (j < text.length) {
          const ch = text[j];
          if (ch === '"') inQuote = !inQuote;
          else if (ch === '>') break;
          j++;
        }
        if (j >= text.length) break;
        const tagText = text.slice(i, j + 1);
        const dq = (tagText.match(/"/g) || []).length;
        if (dq % 2 !== 0) {
          const line = src.slice(0, tpl.index).split('\n').length;
          problems.push(`${label}:${line} 标签内双引号数为奇数(${dq}) -> ${JSON.stringify(tagText.slice(0, 160))}`);
        }
        i = j + 1;
      }
    }
  }
  assert.deepEqual(problems, [], '发现引号未闭合的标签（onclick 等事件属性会绑不上）：\n' + problems.join('\n'));
});

test('★ 带 onclick 的标签，其 onclick 值必须看起来是完整 JS 调用', () => {
  const problems = [];
  for (const [src, label] of [[PAGES_SRC, 'js/pages.js'], [APP_SRC, 'js/app.js']]) {
    for (const tpl of extractHtmlTemplates(src)) {
      for (const tag of findTags(tpl.text)) {
        const attrs = parseAttrs(tag.raw);
        const oc = attrs.find(a => a.name.toLowerCase() === 'onclick');
        if (!oc) continue;
        const v = oc.value == null ? '' : oc.value;
        // 值里出现换行/制表符说明引号提前闭合了
        if (/[\n\r\t]/.test(v)) {
          const line = src.slice(0, tpl.index).split('\n').length;
          problems.push(`${label}:${line} onclick 值含换行 -> ${JSON.stringify(v)}`);
        }
        // onclick 值里带单引号参数时，末尾必须闭合
        if (/\([^)]*$/.test(v.trim())) {
          const line = src.slice(0, tpl.index).split('\n').length;
          problems.push(`${label}:${line} onclick 括号未闭合 -> ${JSON.stringify(v)}`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], '发现结构不完整的 onclick：\n' + problems.join('\n'));
});

test('★ style 属性的值里不得出现 "onclick"（说明 style 引号没闭合把 onclick 吞了）', () => {
  const problems = [];
  for (const [src, label] of [[PAGES_SRC, 'js/pages.js'], [APP_SRC, 'js/app.js']]) {
    for (const tpl of extractHtmlTemplates(src)) {
      for (const tag of findTags(tpl.text)) {
        for (const a of parseAttrs(tag.raw)) {
          if (a.name.toLowerCase() === 'style' && a.value && /onclick|onchange|oninput/i.test(a.value)) {
            const line = src.slice(0, tpl.index).split('\n').length;
            problems.push(`${label}:${line} style 值里混进了事件属性 -> ${JSON.stringify(a.value)}`);
          }
        }
      }
    }
  }
  assert.deepEqual(problems, [], '发现 style 属性吞掉事件属性的情况：\n' + problems.join('\n'));
});

test('家庭组行模板：onclick 必须是 PageFamily.switchFamily 且引号闭合', () => {
  const idx = PAGES_SRC.indexOf("PageFamily.switchFamily('${f.id}')");
  assert.notEqual(idx, -1, 'js/pages.js 里找不到家庭组行的切换绑定');
  const line = PAGES_SRC.slice(0, idx).split('\n').length;
  // 取该行所在的完整标签
  const lineStart = PAGES_SRC.lastIndexOf('\n', idx) + 1;
  const lineEnd = PAGES_SRC.indexOf('\n', idx);
  const lineText = PAGES_SRC.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const tags = findTags(lineText);
  assert.ok(tags.length, `第 ${line} 行没解析出标签`);
  const attrs = parseAttrs(tags[0].raw);
  const oc = attrs.find(a => a.name.toLowerCase() === 'onclick');
  assert.ok(oc, `第 ${line} 行的标签没有 onclick 属性（实际属性：${attrs.map(a => a.name).join(', ')}）`);
  assert.equal(oc.value, "PageFamily.switchFamily('${f.id}')", 'onclick 值不正确');
  // style 属性必须独立存在且不含 onclick
  const st = attrs.find(a => a.name.toLowerCase() === 'style');
  assert.ok(st, `第 ${line} 行缺少独立的 style 属性`);
  assert.ok(!/onclick/i.test(st.value), 'style 值里混进了 onclick，说明引号没闭合');
});

test('★ 家庭组行不得把用户输入拼进 inline handler 的字符串参数', () => {
  // 家庭名是用户自由输入（含 ' " < >），拼进 onclick 字符串参数会再次破坏结构
  const idx = PAGES_SRC.indexOf('App.editFamilyName(');
  assert.notEqual(idx, -1, 'js/pages.js 里找不到编辑家庭组名的绑定');
  const lineStart = PAGES_SRC.lastIndexOf('\n', idx) + 1;
  const lineEnd = PAGES_SRC.indexOf('\n', idx);
  const lineText = PAGES_SRC.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  assert.ok(
    !/editFamilyName\([^)]*f\.name/.test(lineText),
    '编辑按钮把 f.name 拼进了 inline handler 参数，应改为只传 familyId，名称由 editFamilyName 内部查'
  );
  assert.ok(
    /editFamilyName\('\$\{f\.id\}'\)/.test(lineText),
    '编辑按钮应只传 familyId'
  );
});

test('★ 家庭名等用户输入在文本位置必须走 _escHtml 转义', () => {
  assert.ok(
    PAGES_SRC.includes('_escHtml(s)'),
    'js/pages.js 里缺少 _escHtml 转义函数'
  );
  const idx = PAGES_SRC.indexOf("const nameHtml = PageFamily._escHtml(f.name || '')");
  assert.notEqual(idx, -1, '家庭名没有走 _escHtml 转义');
  // 模板里不应再出现裸的 ${f.name}
  assert.ok(
    !/\$\{f\.name\}/.test(PAGES_SRC),
    '模板里仍有未转义的 ${f.name}'
  );
});

test('后端 getUserFamilies 必须返回 creator_id（否则编辑按钮永不显示）', () => {
  const authSrc = fs.readFileSync(path.resolve(__dirname, '../src/controllers/authController.js'), 'utf8');
  assert.ok(
    /as creator_id/.test(authSrc),
    'authController.getUserFamilies 未返回 creator_id 字段，前端 isCreator 判断恒为 false'
  );
});

test('后端 updateFamily 必须支持按 familyId 精确定位（不能一律用 req.familyId）', () => {
  const authSrc = fs.readFileSync(path.resolve(__dirname, '../src/controllers/authController.js'), 'utf8');
  const fnStart = authSrc.indexOf('async function updateFamily');
  assert.notEqual(fnStart, -1, '找不到 updateFamily');
  const fnEnd = authSrc.indexOf('\n}', fnStart);
  const fnBody = authSrc.slice(fnStart, fnEnd);
  assert.ok(
    /bodyFamilyId|req\.body\.familyId/.test(fnBody),
    'updateFamily 未读取 body 里的 familyId，改「非当前家庭」时会改错对象'
  );
  assert.ok(
    /targetFamilyId/.test(fnBody),
    'updateFamily 未使用按 familyId 定位后的变量'
  );
});
