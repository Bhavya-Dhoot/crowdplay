// Lists exports in src/ that nothing else references, and source files nothing imports.
// Uses the TypeScript language service (already a devDependency), so no extra tools.
//   node scripts/find-dead-exports.mjs
// Entry points that Next.js loads by convention (app routes, layouts, instrumentation, config) are never reported.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const cfgPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, root);
const files = cfg.fileNames.filter((f) => !f.includes("node_modules"));

const host = {
  getScriptFileNames: () => files,
  getScriptVersion: () => "1",
  getScriptSnapshot: (f) => (fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8")) : undefined),
  getCurrentDirectory: () => root,
  getCompilationSettings: () => cfg.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
const program = ls.getProgram();

const norm = (f) => path.relative(root, f).split(path.sep).join("/");
// Next.js / tooling entry points: their exports are consumed by the framework, not by imports.
const isEntry = (rel) =>
  /^src\/app\/.*\/?(page|layout|route|loading|error|not-found|template|default|opengraph-image|twitter-image|icon|sitemap|robots|manifest)\.(t|j)sx?$/.test(rel) ||
  /^src\/(instrumentation|middleware|proxy)\.ts$/.test(rel) ||
  /^src\/app\/(page|layout|error|not-found|global-error)\.tsx?$/.test(rel) ||
  !rel.startsWith("src/") ||
  rel.startsWith("src/tests/");

const dead = [];
const importedFiles = new Set();
for (const sf of program.getSourceFiles()) {
  const rel = norm(sf.fileName);
  if (sf.isDeclarationFile || rel.includes("node_modules")) continue;
  for (const imp of sf.statements) {
    if ((ts.isImportDeclaration(imp) || ts.isExportDeclaration(imp)) && imp.moduleSpecifier && ts.isStringLiteral(imp.moduleSpecifier)) {
      const r = ts.resolveModuleName(imp.moduleSpecifier.text, sf.fileName, cfg.options, ts.sys).resolvedModule;
      if (r) importedFiles.add(norm(r.resolvedFileName));
    }
  }
  // dynamic import("...")
  sf.forEachChild(function visit(n) {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      const r = ts.resolveModuleName(n.arguments[0].text, sf.fileName, cfg.options, ts.sys).resolvedModule;
      if (r) importedFiles.add(norm(r.resolvedFileName));
    }
    n.forEachChild(visit);
  });
}

for (const sf of program.getSourceFiles()) {
  const rel = norm(sf.fileName);
  if (sf.isDeclarationFile || isEntry(rel)) continue;
  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
    if (!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const names = [];
    if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && names.push(d.name));
    else if (st.name && ts.isIdentifier(st.name)) names.push(st.name);
    for (const id of names) {
      const refs = ls.findReferences(sf.fileName, id.getStart()) ?? [];
      const external = refs.flatMap((r) => r.references).filter((r) => !r.isDefinition && norm(r.fileName) !== rel);
      if (external.length === 0) {
        const internal = refs.flatMap((r) => r.references).filter((r) => !r.isDefinition).length;
        dead.push(`${rel}:${sf.getLineAndCharacterOfPosition(id.getStart()).line + 1} ${id.text}${internal ? " (used inside its file only: drop the export)" : " (unused)"}`);
      }
    }
  }
}

const orphanFiles = files.map(norm).filter((f) => f.startsWith("src/") && !isEntry(f) && !importedFiles.has(f));
console.log(`# Unused exports (${dead.length})`);
dead.sort().forEach((d) => console.log(d));
console.log(`\n# Files nothing imports (${orphanFiles.length})`);
orphanFiles.sort().forEach((f) => console.log(f));
