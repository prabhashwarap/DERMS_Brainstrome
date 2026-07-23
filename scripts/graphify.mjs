#!/usr/bin/env node
// graphify — generate a compact code-map of the repo so AI agents can navigate
// by symbols/signatures instead of reading whole files (token savings).
//
// Usage:
//   node scripts/graphify.mjs            # scan src/, write .graphify/map.{md,json}
//   node scripts/graphify.mjs --root lib # scan a different root
//   node scripts/graphify.mjs --stdout   # print markdown to stdout, write nothing
//
// Zero runtime deps: uses the `typescript` compiler already in devDependencies.

import ts from 'typescript';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const args = process.argv.slice(2);
const opt = (flag, def) => {
  const i = args.indexOf(flag);
  return i === -1 ? def : args[i + 1] ?? true;
};
const ROOT = process.cwd();
const SRC = join(ROOT, opt('--root', 'src'));
const OUT_DIR = join(ROOT, '.graphify');
const STDOUT = args.includes('--stdout');

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.graphify']);
const EXTS = new Set(['.ts', '.tsx']);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (EXTS.has(extname(name)) && !name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

const oneLine = (s) => s.replace(/\s+/g, ' ').trim();
const isPascal = (n) => /^[A-Z]/.test(n);

// Render a parameter list + return type as compact text, without bodies.
function signature(node, sf) {
  const params = (node.parameters ?? [])
    .map((p) => {
      const name = oneLine(p.name.getText(sf));
      const type = p.type ? ': ' + oneLine(p.type.getText(sf)) : '';
      const opt = p.questionToken ? '?' : '';
      const rest = p.dotDotDotToken ? '...' : '';
      return rest + name + opt + type;
    })
    .join(', ');
  const ret = node.type ? ': ' + oneLine(node.type.getText(sf)) : '';
  return `(${params})${ret}`;
}

// Unwrap memo()/forwardRef()/observer() wrappers to find the inner function.
function unwrapCall(expr) {
  let cur = expr;
  const wrappers = [];
  while (ts.isCallExpression(cur) && cur.arguments.length) {
    const callee = cur.expression.getText();
    wrappers.push(callee.split('.').pop());
    cur = cur.arguments[0];
  }
  return { inner: cur, wrappers };
}

function extractFile(file) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const symbols = [];

  const isExported = (node) =>
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

  for (const stmt of sf.statements) {
    // export function foo(...) {}
    if (ts.isFunctionDeclaration(stmt) && isExported(stmt) && stmt.name) {
      const name = stmt.name.text;
      const kind = isPascal(name) ? 'component' : 'fn';
      symbols.push({ kind, name, sig: signature(stmt, sf) });
      continue;
    }
    // export class Foo {}
    if (ts.isClassDeclaration(stmt) && isExported(stmt) && stmt.name) {
      symbols.push({ kind: 'class', name: stmt.name.text, sig: '' });
      continue;
    }
    // export interface / type / enum
    if (ts.isInterfaceDeclaration(stmt) && isExported(stmt)) {
      symbols.push({ kind: 'interface', name: stmt.name.text, sig: '' });
      continue;
    }
    if (ts.isTypeAliasDeclaration(stmt) && isExported(stmt)) {
      symbols.push({ kind: 'type', name: stmt.name.text, sig: '' });
      continue;
    }
    if (ts.isEnumDeclaration(stmt) && isExported(stmt)) {
      symbols.push({ kind: 'enum', name: stmt.name.text, sig: '' });
      continue;
    }
    // export const foo = ... / export const Foo = memo(() => ...)
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        let kind = 'const';
        let sig = '';
        let init = decl.initializer;
        const tags = [];
        if (init && ts.isCallExpression(init)) {
          const { inner, wrappers } = unwrapCall(init);
          if (wrappers.length) tags.push(...wrappers);
          init = inner;
        }
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          kind = isPascal(name) ? 'component' : 'fn';
          sig = signature(init, sf);
        } else if (isPascal(name) && tags.some((w) => /memo|forwardRef|observer/.test(w))) {
          kind = 'component';
        }
        symbols.push({ kind, name, sig, tags: tags.length ? tags : undefined });
      }
      continue;
    }
    // export default <expr>
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      const e = stmt.expression;
      const name = ts.isIdentifier(e) ? e.getText(sf) : 'default';
      symbols.push({ kind: 'default', name, sig: '' });
      continue;
    }
    // export { a, b } from './x'  /  export * from './x'
    if (ts.isExportDeclaration(stmt)) {
      const from = stmt.moduleSpecifier ? ` from ${stmt.moduleSpecifier.getText(sf)}` : '';
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          symbols.push({ kind: 'reexport', name: el.name.text, sig: from.trim() });
        }
      } else {
        symbols.push({ kind: 'reexport', name: '*', sig: from.trim() });
      }
    }
  }
  return symbols;
}

// ---- run ----
const files = walk(SRC).sort();
const entries = [];
let symCount = 0;
for (const file of files) {
  const rel = relative(ROOT, file);
  const symbols = extractFile(file);
  symCount += symbols.length;
  entries.push({ file: rel, symbols });
}

const kindLabel = (s) => {
  switch (s.kind) {
    case 'fn': return `fn ${s.name}${s.sig}`;
    case 'component': return `${s.name}${s.sig || '()'}`;
    case 'const': return `const ${s.name}`;
    case 'class': return `class ${s.name}`;
    case 'interface': return `interface ${s.name}`;
    case 'type': return `type ${s.name}`;
    case 'enum': return `enum ${s.name}`;
    case 'default': return `default → ${s.name}`;
    case 'reexport': return `↳ ${s.name} ${s.sig}`.trim();
    default: return s.name;
  }
};

function renderMarkdown() {
  const lines = [];
  lines.push('# Code Map (graphify)');
  lines.push('');
  lines.push(
    `_${files.length} files · ${symCount} exported symbols · regenerate with \`npm run graphify\`._`
  );
  lines.push('');
  lines.push(
    'Read this map to locate code, then open only the file(s) you need. ' +
      'Signatures are compact (params + annotated return type); tags like `[memo]` note wrappers.'
  );
  lines.push('');
  for (const e of entries) {
    if (!e.symbols.length) continue;
    lines.push(`## ${e.file}`);
    for (const s of e.symbols) {
      const tags = s.tags ? '  [' + s.tags.join('][') + ']' : '';
      lines.push(`- ${kindLabel(s)}${tags}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const md = renderMarkdown();

if (STDOUT) {
  process.stdout.write(md + '\n');
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'map.md'), md + '\n');
  writeFileSync(
    join(OUT_DIR, 'map.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), root: relative(ROOT, SRC), files: entries },
      null,
      2
    ) + '\n'
  );
  const bytes = Buffer.byteLength(md);
  console.log(
    `graphify: ${files.length} files, ${symCount} symbols → .graphify/map.md (${(bytes / 1024).toFixed(1)} KB), .graphify/map.json`
  );
}
