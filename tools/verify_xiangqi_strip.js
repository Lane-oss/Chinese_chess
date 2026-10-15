// ArkTS -> JS 粗转换：仅用于在 Node 中验证纯规则逻辑。
//
// 两个必须用字符扫描（而非正则）处理的点：
//   1. 注释里的斜杠与引号会干扰后续扫描 —— 先做一趟注释扫描，按行清空；
//   2. 形参类型标注不能用正则一刀切，否则会误伤 (a === b ? -1 : 0) 这类三元表达式。

function removeBlocks(source, startRegex) {
  const lines = source.split('\n');
  const keep = [];
  let depth = 0;
  let skipping = false;
  for (const line of lines) {
    if (!skipping && startRegex.test(line)) {
      skipping = true;
      depth = 0;
    }
    if (skipping) {
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth <= 0) skipping = false;
      continue;
    }
    keep.push(line);
  }
  return keep.join('\n');
}

/** 扫描一遍，把注释替换为空格（保持换行与列位置），字符串原样保留 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let inString = null;
  while (i < src.length) {
    const ch = src[i];
    if (inString !== null) {
      if (ch === '\\' && i + 1 < src.length) {
        out += ch + src[i + 1];
        i += 2;
        continue;
      }
      out += ch;
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) {
        out += '  ';
        i += 2;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** 从 openIdx 处的 '(' 开始，收集顶层形参片段（深度跟踪，跳过默认值） */
function collectSegments(src, openIdx) {
  const segs = [];
  let buf = '';
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      buf += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        if (buf.trim() !== '') segs.push(buf);
        return { segs, end: i };
      }
      buf += ch;
    } else if (ch === ',' && depth === 1) {
      segs.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
    i++;
  }
  return { segs, end: -1 };
}

/** 片段是否为类型标注：冒号出现在顶层，且在赋值号之前 */
function hasTypeAnnotation(seg) {
  let depth = 0;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === '=' && depth === 0) return false;
    else if (ch === ':' && depth === 0) return true;
  }
  return false;
}

/** 取形参名（保留剩余参数 ... 与简单修饰符） */
function nameOf(seg) {
  const trimmed = seg.trim();
  if (trimmed.startsWith('...')) return '...' + trimmed.slice(3).split(':')[0].trim();
  return trimmed.split(':')[0].trim();
}

/** 剥掉一个形参列表里的类型标注与默认值 */
function stripParamsGroup(src, openIdx) {
  const collected = collectSegments(src, openIdx);
  if (collected.end < 0) return null;
  if (!collected.segs.some(hasTypeAnnotation)) return null;
  const names = collected.segs.map(nameOf).join(', ');
  return { text: `(${names})`, end: collected.end };
}

/**
 * 扫描源码，找到真正的形参列表并剥离类型标注。
 * '(' 前面是标识符/function/constructor/get/set/new，且括号内存在顶层类型标注时才处理，
 * 因此 (a === b ? -1 : 0) 这类表达式不会被误伤。
 */
function stripParamTypes(src) {
  let out = '';
  let i = 0;
  let token = '';
  let inString = null;

  while (i < src.length) {
    const ch = src[i];

    if (inString !== null) {
      if (ch === '\\' && i + 1 < src.length) {
        out += ch + src[i + 1];
        i += 2;
        continue;
      }
      out += ch;
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '(') {
      const prev = token;
      const looksLikeParams = prev === 'function' || prev === 'constructor' || prev === 'get' ||
        prev === 'set' || prev === 'new' || /^[A-Za-z_$][\w$]*$/.test(prev);
      if (looksLikeParams) {
        const stripped = stripParamsGroup(src, i);
        if (stripped) {
          out += stripped.text;
          i = stripped.end + 1;
          token = ')';
          continue;
        }
      }
      out += ch;
      token = '';
      i++;
      continue;
    }
    if (/[\w$]/.test(ch)) {
      token += ch;
      out += ch;
      i++;
      continue;
    }
    if (ch !== ' ' && ch !== '\t') {
      token = '';
    }
    out += ch;
    i++;
  }
  return out;
}

function stripArkTs(source) {
  // 1) 清空注释（保留换行），避免注释内容干扰后续扫描
  let out = stripComments(source);

  // 2) export type X = ...; 整条删除
  out = out.replace(/^export type [^;]+;$/gm, '');

  // 3) export interface X { ... } 整块删除
  out = removeBlocks(out, /^export interface \w+ \{$/gm);

  // 4) 形参类型标注
  out = stripParamTypes(out);

  // 5) 箭头函数类型的字段：onTap: (a: number) => void = ...
  out = out.replace(/(\w+)\s*:\s*\([^)]*\)\s*=>\s*[\w<>\[\]| ]+(\s*=)/g, '$1$2');

  // 6) 变量/常量的类型标注（限制在同一行，避免跨行吞掉后面的代码）
  out = out.replace(/\bconst\s+(\w+)\s*:\s*([^\n;{}]+?)\s*=/g, 'const $1 =');
  out = out.replace(/\blet\s+(\w+)\s*:\s*([^\n;{}]+?)\s*=/g, 'let $1 =');
  out = out.replace(/\bvar\s+(\w+)\s*:\s*([^\n;{}]+?)\s*=/g, 'var $1 =');

  // 6b) 类/结构体字段类型标注与修饰符。
  //     脚本里没有 class 关键字，必须把 private/public/protected/readonly 一并去掉，
  //     否则 `private x = 1` 在普通作用域中非法（曾导致语法错误）。
  //     注意两点：修饰符分支要用 (?:...) 包住；类型部分用「首字符必须是标识符首字符」的
  //     字符集直接吞掉整个类型（能覆盖 MoveRecord[]、Board[]、number[][]、A | null 等）。
  const fieldMods = '(?:private|public|protected|readonly|static)\\s+';
  const fieldType = "[A-Za-z_$][\\w$.\\[\\]<>|,?'\"\\s]*";
  out = out.replace(
    new RegExp('^(\\s*)(?:' + fieldMods + ')*([A-Za-z_$][\\w$]*)\\s*:\\s*' + fieldType + '\\s*=', 'gm'),
    '$1$2 =');
  out = out.replace(
    new RegExp('^(\\s*)(?:' + fieldMods + ')+([A-Za-z_$][\\w$]*)\\s*=', 'gm'),
    '$1$2 =');

  // 6c) ArkUI 装饰器字段（@State/@Prop/@Link 等）的类型标注
  out = out.replace(
    new RegExp('^([ \\t]*@\\w+\\s+[A-Za-z_$][\\w$]*)\\s*:\\s*' + fieldType + '\\s*=', 'gm'),
    '$1 =');

  // 7) 函数返回类型标注。只处理「返回类型后面紧跟 { 或 =>」的情况：
  //    若放宽到分号，会误伤 `cond ? a : b;` 这类三元表达式（它同样以 ) : ... ; 结尾）。
  out = out.replace(/\)\s*:\s*([^\n;{}]+?)\s*(?=\{)/g, ') ');
  out = out.replace(/\)\s*:\s*([^\n;{}]+?)\s*(?==>)/g, ') ');

  // 8) 类型断言 x as T
  out = out.replace(/\s+as\s+[A-Za-z_][\w<>\[\]|.'\s]*?(?=[,);\]\s])/g, '');

  return out;
}

module.exports = { stripArkTs, removeBlocks, stripComments, stripParamTypes };
