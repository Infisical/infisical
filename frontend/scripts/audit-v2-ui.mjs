import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import picomatch from "picomatch";
import ts from "typescript";

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(frontend, "..");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "frontend"],
  { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
)
  .split("\0")
  .filter((file) => file && existsSync(path.join(root, file)));
const sourcePaths = tracked.filter(
  (file) => file.startsWith("frontend/") && /\.[cm]?[jt]sx?$/.test(file)
);
const configPath = path.join(frontend, "tsconfig.app.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, frontend);
if (parsed.errors.length) {
  throw new Error(
    parsed.errors
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
      .join("\n")
  );
}
const program = ts.createProgram(
  sourcePaths.map((file) => path.join(root, file)),
  {
    ...parsed.options,
    allowJs: true,
    checkJs: false,
    incremental: false
  }
);
const checker = program.getTypeChecker();
const legacyPrefix = "frontend/src/components/v2/";
const legacyFiles = tracked.filter((file) => file.startsWith(legacyPrefix));
const families = [
  ...new Set(legacyFiles.map((file) => file.slice(legacyPrefix.length).split("/")[0]))
]
  .filter((name) => !name.includes("."))
  .sort();
const edges = [];
const computedImports = [];
const literalGlobs = [];

for (const sourcePath of sourcePaths) {
  const source = program.getSourceFile(path.join(root, sourcePath));
  if (!source) throw new Error(`Could not parse ${sourcePath}`);
  const location = (node) =>
    `${sourcePath}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const origin = (name) => {
    let symbol = checker.getSymbolAtLocation(name);
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return [
      ...new Set(
        (symbol?.declarations ?? []).map((declaration) =>
          relative(declaration.getSourceFile().fileName)
        )
      )
    ];
  };
  const addEdge = (node, specifier, kind, bindings = []) => {
    const resolved = ts.resolveModuleName(
      specifier,
      source.fileName,
      parsed.options,
      ts.sys
    ).resolvedModule;
    const target = resolved ? relative(resolved.resolvedFileName) : null;
    if (
      target?.startsWith(legacyPrefix) ||
      bindings.some((binding) => binding.origins.some((file) => file.startsWith(legacyPrefix))) ||
      specifier.includes("components/v2")
    ) {
      edges.push({
        source: sourcePath,
        location: location(node),
        kind,
        specifier,
        target,
        bindings
      });
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = clause?.namedBindings;
      const bindings = [];
      if (clause?.name)
        bindings.push({
          imported: "default",
          local: clause.name.text,
          typeOnly: clause.isTypeOnly,
          origins: origin(clause.name)
        });
      if (names && ts.isNamespaceImport(names))
        bindings.push({
          imported: "*",
          local: names.name.text,
          typeOnly: clause.isTypeOnly,
          origins: origin(names.name)
        });
      if (names && ts.isNamedImports(names)) {
        for (const item of names.elements)
          bindings.push({
            imported: (item.propertyName ?? item.name).text,
            local: item.name.text,
            typeOnly: clause.isTypeOnly || item.isTypeOnly,
            origins: origin(item.name)
          });
      }
      addEdge(node, node.moduleSpecifier.text, "import", bindings);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addEdge(node, node.moduleSpecifier.text, "export");
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      addEdge(node, node.moduleReference.expression.text, "import-equals");
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      addEdge(node, node.argument.literal.text, "import-type");
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.getText(source).startsWith("import.meta.glob")))
    ) {
      const argument = node.arguments[0];
      if (argument && node.expression.getText(source).startsWith("import.meta.glob")) {
        const literals = ts.isStringLiteralLike(argument)
          ? [argument]
          : ts.isArrayLiteralExpression(argument) && argument.elements.every(ts.isStringLiteralLike)
            ? argument.elements
            : null;
        const baseOption =
          node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])
            ? node.arguments[1].properties.some(
                (property) =>
                  ts.isSpreadAssignment(property) ||
                  (property.name &&
                    ((!ts.isIdentifier(property.name) && !ts.isStringLiteralLike(property.name)) ||
                      property.name.text === "base"))
              )
            : Boolean(node.arguments[1] && !ts.isObjectLiteralExpression(node.arguments[1]));
        const patterns = literals?.map((literal) => {
          const negative = literal.text.startsWith("!");
          const pattern = negative ? literal.text.slice(1) : literal.text;
          const appPath = parsed.options.paths?.["@app/*"]?.[0];
          const resolved =
            pattern.startsWith("@app/") && appPath
              ? path.resolve(frontend, appPath.replace("*", pattern.slice(5)))
              : pattern.startsWith("/")
                ? path.resolve(frontend, `.${pattern}`)
                : pattern.startsWith(".")
                  ? path.resolve(path.dirname(source.fileName), pattern)
                  : null;
          return resolved ? { negative, pattern: relative(resolved) } : null;
        });
        if (!patterns || patterns.some((pattern) => !pattern) || baseOption) {
          computedImports.push({ location: location(node), expression: node.getText(source) });
        } else {
          const included = patterns.filter((pattern) => !pattern.negative);
          const excluded = patterns.filter((pattern) => pattern.negative);
          const matches = tracked.filter(
            (file) =>
              included.some((pattern) => picomatch.isMatch(file, pattern.pattern)) &&
              !excluded.some((pattern) => picomatch.isMatch(file, pattern.pattern))
          );
          literalGlobs.push({ location: location(node), patterns, matches });
          for (const target of matches.filter((file) => file.startsWith(legacyPrefix))) {
            edges.push({
              source: sourcePath,
              location: location(node),
              kind: "glob",
              specifier: argument.getText(source),
              target,
              bindings: []
            });
          }
          for (const pattern of included.filter((item) => item.pattern.startsWith(legacyPrefix))) {
            if (!matches.some((file) => file.startsWith(legacyPrefix)))
              edges.push({
                source: sourcePath,
                location: location(node),
                kind: "glob",
                specifier: pattern.pattern,
                target: null,
                bindings: []
              });
          }
        }
      } else if (argument && ts.isStringLiteralLike(argument))
        addEdge(node, argument.text, node.expression.getText(source));
      else computedImports.push({ location: location(node), expression: node.getText(source) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const outsideLegacy = [
  "frontend/src/components/basic/InputField.tsx",
  "frontend/src/components/basic/Error.tsx",
  "frontend/src/components/integrations/NoEnvironmentsBanner.tsx",
  "frontend/src/components/navigation/SecretDashboardPathBreadcrumb.tsx",
  "frontend/src/components/tags/CreateTagModal/CreateTagModal.tsx",
  "frontend/src/pages/secret-manager/OverviewPage/components/SecretSearchInput/SecretSearchInput.tsx",
  "frontend/src/pages/secret-manager/OverviewPage/components/SecretSearchInput/index.tsx",
  "frontend/src/legacy.css"
].filter((file) => existsSync(path.join(root, file)));
const result = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  workingTree: execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8"
  }).trim()
    ? "modified"
    : "clean",
  typescript: ts.version,
  sourceFiles: sourcePaths.length,
  legacyFiles,
  families,
  externalConsumerFiles: [
    ...new Set(
      edges
        .filter((edge) => edge.kind !== "export" && !edge.source.startsWith(legacyPrefix))
        .map((edge) => edge.source)
    )
  ].sort(),
  v3Ingress: edges.filter((edge) => edge.source.startsWith("frontend/src/components/v3/")),
  edges,
  computedImports,
  literalGlobs,
  outsideLegacy,
  compatibilitySelectors: tracked.filter((file) =>
    file.startsWith("frontend/src/components/v3/generic/ReactSelect/")
  ),
  legacyPaletteBytes: existsSync(path.join(root, "frontend/src/legacy.css"))
    ? readFileSync(path.join(root, "frontend/src/legacy.css")).length
    : 0
};
console.log(JSON.stringify(result, null, 2));
if (
  process.argv.includes("--assert-zero") &&
  (legacyFiles.length || edges.length || outsideLegacy.length || computedImports.length)
)
  process.exitCode = 1;
