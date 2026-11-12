import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type JSXAttribute,
  type JSXElement,
  type Node,
  type ObjectProperty,
  parseSync,
  type Program,
  type TSSignature,
  type TSType
} from "oxc-parser";
import { format } from "oxfmt";
import { z } from "zod";

import type { ComponentDefinition, RuleDetect } from "../src/components/v4/contracts/types";
import { v4LiveOrgPath, v4ThemeStorage } from "../src/components/v4/lib/boot-theme-keys";
import { defaultV4Theme } from "../src/components/v4/lib/theme-registry";
import { legacyV4Themes } from "../src/components/v4/lib/themes";
import { v4Checks } from "./check-v4";

const root = path.resolve(import.meta.dirname, "..");
const componentRoot = "src/components/v4";
const registryName = "cipher";
const baseItemName = `${registryName}-base`;
const registryItem = (name: string) => `@${registryName}/${name}`;
const excludedFromRegistry: Record<string, string> = {
  "app-connection-form":
    "Builds Infisical App Connection forms; its presets, schemas and redirect flow live in the Infisical app.",
  "provider-icon":
    "Loads integration logos from the Infisical app's /images/integrations assets, which the registry does not ship."
};
const check = process.argv.includes("--check");
const failures: string[] = [];
const generated = new Set<string>();
const buildOutputs = [
  "registry.json",
  `${componentRoot}/tokens.generated.css`,
  `${componentRoot}/docs/components.json`,
  `${componentRoot}/docs/coverage.json`
];
const isBuildOutput = (file: string) => file.startsWith("public/r/") || buildOutputs.includes(file);
const emittedOutputs = new Map<string, string>();
const pendingOutputs = new Map<string, string>();
const obsoleteOutputs = new Set<string>();
const read = (file: string) =>
  emittedOutputs.get(file) ?? readFileSync(path.join(root, file), "utf8");
const parsed = new Map<string, { text: string; program: Program }>();
const parse = (file: string) => {
  const text = read(file);
  const cached = parsed.get(file);
  if (cached?.text === text) return cached;
  const result = parseSync(file, text);
  if (result.errors.length)
    throw new Error(
      `${file} does not parse: ${result.errors.map((error) => error.message).join("; ")}`
    );
  const entry = { text, program: result.program };
  parsed.set(file, entry);
  return entry;
};
const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";
const walk = (
  node: Node,
  enter: (node: Node, ancestors: readonly Node[]) => void,
  ancestors: Node[] = []
) => {
  enter(node, ancestors);
  ancestors.push(node);
  Object.values(node).forEach((value) =>
    (Array.isArray(value) ? value : [value]).forEach((child) => {
      if (isNode(child)) walk(child, enter, ancestors);
    })
  );
  ancestors.pop();
};
const lineOf = (text: string, offset: number) => text.slice(0, offset).split("\n").length;
const packageManifest: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} = JSON.parse(read("package.json"));
const declaredDependencies = {
  ...packageManifest.devDependencies,
  ...packageManifest.dependencies
};
const declaredPackage = (name: string) => {
  const version = declaredDependencies[name];
  if (!version) {
    failures.push(`Undeclared runtime dependency: ${name}`);
    return name;
  }
  return `${name}@${version}`;
};
const filesIn = (folder: string): string[] =>
  readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`]
  );
const previousGenerated = ["public/r", `${componentRoot}/docs`].flatMap((folder) =>
  existsSync(path.join(root, folder)) ? filesIn(folder) : []
);
const emit = (file: string, text: string) => {
  generated.add(file);
  const current = existsSync(path.join(root, file))
    ? readFileSync(path.join(root, file), "utf8")
    : undefined;
  emittedOutputs.set(file, text);
  if (current === text) return;
  if (check) {
    if (isBuildOutput(file)) return;
    failures.push(`Stale generated file: ${file}`);
    return;
  }
  pendingOutputs.set(file, text);
};
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const importCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const contracts = filesIn(`${componentRoot}/contracts`)
  .filter((file) => file.endsWith(".ts") && !file.endsWith("types.ts"))
  .sort((left, right) =>
    importCollator.compare(path.basename(left, ".ts"), path.basename(right, ".ts"))
  );
const imports: string[] = [];
const entries: string[] = [];
contracts.forEach((file) => {
  const names = [...read(file).matchAll(/export const (\w+Definitions?)\b/g)].map(
    (match) => match[1]
  );
  if (!names.length) return;
  imports.push(`import { ${names.join(", ")} } from "./contracts/${path.basename(file, ".ts")}";`);
  entries.push(
    ...names.map((name) => (name.endsWith("Definitions") ? `  ...${name},` : `  ${name},`))
  );
});
const formatOptions = JSON.parse(readFileSync(path.join(root, ".oxfmtrc.json"), "utf8"));
const catalog = await format(
  "catalog.ts",
  `// Generated by ui:generate.\n${imports.join("\n")}\nimport type { ComponentDefinition } from "./contracts/types";\n\nexport const componentCatalog: readonly ComponentDefinition[] = [\n${entries.join("\n")}\n];\n`,
  formatOptions
);
if (catalog.errors.length) throw new Error(catalog.errors.map((error) => error.message).join("\n"));
emit(`${componentRoot}/catalog.ts`, catalog.code);
const tokenValue = z.union([z.string(), z.number(), z.record(z.string())]);
const tokenFamily = z.object({
  tokens: z.array(z.object({ name: z.string(), value: tokenValue }))
});
const typeStyle = z.object({ name: z.string() }).catchall(z.union([z.string(), z.number()]));
const tokens = z
  .object({
    type: z.object({
      families: z.record(z.string()),
      groups: z.array(z.object({ styles: z.array(typeStyle) }))
    })
  })
  .passthrough()
  .parse(JSON.parse(read(`${componentRoot}/tokens.json`)));
const themed: {
  name: string;
  value: Record<string, string>;
}[] = [];
const constant: {
  name: string;
  value: string | number;
}[] = [];
Object.values(tokens).forEach((family) => {
  if (
    !family ||
    typeof family !== "object" ||
    !("tokens" in family) ||
    !Array.isArray(family.tokens)
  )
    return;
  tokenFamily.parse(family).tokens.forEach((token) => {
    if (typeof token.value === "object") themed.push({ name: token.name, value: token.value });
    else constant.push({ name: token.name, value: token.value });
  });
});
const cssValue = (value: string | number) => String(value).replace(/\{([^}]+)\}/g, "var(--v4-$1)");
const rule = (selector: string, values: string[]) =>
  `${selector} {\n${values.map((value) => `  ${value}`).join("\n")}\n}\n`;
const typeValues: string[] = [];
Object.entries(tokens.type.families).forEach(([name, value]) => {
  typeValues.push(`--v4-font-${name}: ${value};`);
});
const cssProperties: Record<string, string> = {
  fontFamily: "font-family",
  fontSize: "font-size",
  lineHeight: "line-height",
  fontWeight: "font-weight",
  letterSpacing: "letter-spacing",
  fontStyle: "font-style",
  textTransform: "text-transform",
  fontStretch: "font-stretch"
};
tokens.type.groups.forEach((group) => {
  group.styles.forEach((style) => {
    Object.entries(cssProperties).forEach(([key, css]) => {
      if (style[key] !== undefined)
        typeValues.push(`--v4-type-${style.name}-${css}: ${style[key]};`);
    });
  });
});
let generatedCss = "/* Generated from tokens.json by ui:generate. */\n";
generatedCss += rule(".v4", [
  ...constant.map((token) => `--v4-${token.name}: ${cssValue(token.value)};`),
  ...themed.map((token) => `--v4-${token.name}: ${cssValue(token.value.light)};`),
  ...typeValues
]);
generatedCss += rule(
  '.v4[data-scheme="dark"]',
  themed.map((token) => `--v4-${token.name}: ${cssValue(token.value.dark ?? token.value.light)};`)
);
const { v4ThemeChain, v4ThemedValue } = await import(
  pathToFileURL(path.join(root, componentRoot, "lib/themes.ts")).href
);
const themeList = z
  .object({
    themes: z.object({
      list: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          scheme: z.enum(["light", "dark"]),
          base: z.enum(["light", "dark"]).optional(),
          extends: z.string().optional(),
          overrides: z.record(z.string())
        })
      )
    })
  })
  .passthrough()
  .parse(JSON.parse(read(`${componentRoot}/tokens.json`))).themes.list;
const themedNames = new Set(themed.map((token) => token.name));
themeList.forEach((theme) => {
  if (Boolean(theme.base) === Boolean(theme.extends))
    failures.push(`Theme ${theme.id} needs exactly one of base and extends`);
  const { base } = v4ThemeChain(themeList, theme.id);
  if (base !== theme.scheme)
    failures.push(
      `Theme ${theme.id} declares scheme ${theme.scheme} but resolves to the ${base} base`
    );
  Object.keys(theme.overrides).forEach((name) => {
    if (!themedNames.has(name)) failures.push(`Theme ${theme.id} overrides unknown token ${name}`);
  });
  const changed = themed.filter(
    (token) =>
      v4ThemedValue(themeList, theme.id, token.name, token.value) !==
      (token.value[base] ?? token.value.light)
  );
  if (changed.length)
    generatedCss += rule(
      `.v4[data-theme="${theme.id}"]`,
      changed.map(
        (token) =>
          `--v4-${token.name}: ${cssValue(v4ThemedValue(themeList, theme.id, token.name, token.value))};`
      )
    );
});
emit(`${componentRoot}/tokens.generated.css`, generatedCss);
const themedValue = (theme: string, name: string): string | undefined => {
  const token = themed.find((entry) => entry.name === name);
  if (!token) return undefined;
  const value = v4ThemedValue(themeList, theme, name, token.value);
  const alias = /^\{([^}]+)\}$/.exec(value)?.[1];
  return alias ? themedValue(theme, alias) : value;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastRatio = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const contrastChecks = [
  ...["ink", "text2", "muted"].flatMap((text) =>
    ["surface", "inset", "sidebar", "tint", "sidebar-current"].map((ground) => ({
      text,
      ground,
      floor: 4.5
    }))
  ),
  ...["surface", "inset", "sidebar"].map((ground) => ({ text: "faint", ground, floor: 3 })),
  ...["ok", "warn", "bad", "info"].map((text) => ({ text, ground: "surface", floor: 4.5 })),
  { text: "on-accent", ground: "accent", floor: 4.5 },
  ...["surface", "inset"].map((ground) => ({ text: "control", ground, floor: 3 }))
];
const hexColor = /^#[0-9a-f]{6}$/i;
const themeDocs = themeList.map((theme) => {
  const rows = contrastChecks.flatMap(({ text, ground, floor }) => {
    const foreground = themedValue(theme.id, text);
    const background = themedValue(theme.id, ground);
    if (!foreground || !background || !hexColor.test(foreground) || !hexColor.test(background))
      return [];
    const value = contrastRatio(foreground, background);
    return [
      `| ${text} | ${ground} | ${foreground} on ${background} | ${value.toFixed(2)}:1 | ${floor}:1 | ${value >= floor ? "pass" : "below"} |`
    ];
  });
  const overrides = Object.entries(theme.overrides)
    .map(([name, value]) => `- ${name}: ${value}`)
    .join("\n");
  return `## ${theme.name} (\`${theme.id}\`)\n\nScheme ${theme.scheme}, ${theme.base ? `on the ${theme.base} base` : `extends ${theme.extends}`}.\n\n${overrides ? `Overrides:\n\n${overrides}` : "No overrides; it renders exactly like its base."}\n\n| Text | Ground | Values | Ratio | Floor | Result |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
});
emit(
  `${componentRoot}/docs/themes.md`,
  `# Themes\n\nGenerated by ui:generate from the themes list in tokens.json. Each theme resolves every themed token through its overrides, then the base column its chain ends on. Ratios are WCAG 2.x; faint and control use the 3:1 floor for disabled text and control boundaries, and a below result is reported here, not failed.\n\n${themeDocs.join("\n")}`
);
const bootStart = "<!-- v4-boot: generated by ui:generate from tokens.json -->";
const bootEnd = "<!-- /v4-boot -->";
const bootGrounds = themeList
  .map(
    (theme) =>
      `      html[data-v4-boot="${theme.id}"] { background: ${themedValue(theme.id, "inset")}; color-scheme: ${theme.scheme}; }`
  )
  .join("\n");
const bootScript = `(function () {
        var path = location.pathname;
        if (!/^\\/v4(?:\\/|$)/.test(path)) return;
        var schemes = ${JSON.stringify(Object.fromEntries(themeList.map((theme) => [theme.id, theme.scheme])))};
        var legacy = ${JSON.stringify(legacyV4Themes)};
        var defaults = ${JSON.stringify(defaultV4Theme)};
        var own = function (map, key) { return typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key); };
        var named = function (value) { var id = own(legacy, value) ? legacy[value] : value; return own(schemes, id) ? id : null; };
        var read = function (store, key) { try { return window[store].getItem(key); } catch (error) { return null; } };
        var theme = null;
        if (!/${v4LiveOrgPath.source}/.test(path))
          theme = named(new URLSearchParams(location.search).get("theme")) || named(read("sessionStorage", "${v4ThemeStorage.override}"));
        if (!theme) {
          var shared = read("localStorage", "${v4ThemeStorage.shared}");
          var scheme = shared === "light" ? "light" : shared === "system" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
          var preferred = {};
          try { preferred = JSON.parse(read("localStorage", "${v4ThemeStorage.preferred}") || "{}") || {}; } catch (error) { preferred = {}; }
          var pick = named(preferred[scheme]);
          theme = pick && schemes[pick] === scheme ? pick : defaults[scheme];
        }
        document.documentElement.setAttribute("data-v4-boot", theme);
      })();`;
const indexHtml = read("index.html");
const bootFrom = indexHtml.indexOf(bootStart);
const bootTo = indexHtml.indexOf(bootEnd);
if (bootFrom < 0 || bootTo < bootFrom) failures.push("index.html is missing the v4-boot markers");
else
  emit(
    "index.html",
    `${indexHtml.slice(0, bootFrom)}${bootStart}
    <style>
${bootGrounds}
    </style>
    <script>
      ${bootScript}
    </script>
    ${indexHtml.slice(bootTo)}`
  );
const componentCatalog: readonly ComponentDefinition[] = (
  await Promise.all(
    contracts
      .filter((file) => /export const \w+Definitions?\b/.test(read(file)))
      .map(async (file) => {
        const module = await import(pathToFileURL(path.join(root, file)).href);
        return [...read(file).matchAll(/export const (\w+Definitions?)\b/g)].flatMap((match) => {
          const definition: ComponentDefinition | ComponentDefinition[] = module[match[1]];
          return definition;
        });
      })
  )
).flat();
const required = z
  .object({
    baselineRegistryItems: z.array(z.string()),
    components: z.array(
      z.object({ id: z.string(), kind: z.string(), exports: z.array(z.string()) }).passthrough()
    )
  })
  .passthrough()
  .parse(JSON.parse(read(`${componentRoot}/required-capabilities.json`)));
const missingCapabilities = required.components.filter(
  (entry: { id: string }) => !componentCatalog.some((definition) => definition.id === entry.id)
);
missingCapabilities.forEach((entry: { id: string }) =>
  failures.push(`Missing required capability: ${entry.id}`)
);
const mappedNames = new Set(
  componentCatalog.flatMap((entry) => [...entry.exports, ...entry.referenceNames])
);
const missingNames = [
  ...new Set<string>(required.components.flatMap((entry: { exports: string[] }) => entry.exports))
].filter((name) => !mappedNames.has(name));
missingNames.forEach((name) => failures.push(`Unmapped required export: ${name}`));
const coverage = {
  requiredCapabilities: required.components.length,
  componentFamilies: required.components.filter(
    (entry: { kind: string }) => entry.kind !== "pattern"
  ).length,
  patterns: required.components.filter((entry: { kind: string }) => entry.kind === "pattern")
    .length,
  catalogEntries: componentCatalog.length,
  supplementalGuides: componentCatalog
    .filter(
      (entry) =>
        !required.components.some((capability: { id: string }) => capability.id === entry.id)
    )
    .map((entry) => entry.id),
  examples: componentCatalog.reduce((total, entry) => total + entry.examples.length, 0),
  missingCapabilities: missingCapabilities.map((entry: { id: string }) => entry.id),
  unmappedExports: missingNames,
  assessment:
    "Inventory and recipe coverage only. Behavior parity, browser checks and installation require executed evidence.",
  obligations: required.components
};
emit(`${componentRoot}/docs/coverage.json`, json(coverage));
const moduleExportName = (name: Node) =>
  name.type === "Literal" ? String(name.value) : "name" in name ? String(name.name) : "";
const actualExports = (file: string) => {
  if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return [];
  const { program, text } = parse(file);
  return program.body.flatMap((statement): string[] => {
    if (statement.type === "ExportNamedDeclaration" && !statement.declaration)
      return statement.specifiers.map((entry) => moduleExportName(entry.exported));
    const declaration =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : undefined;
    if (declaration?.type === "VariableDeclaration")
      return declaration.declarations.map((declarator) =>
        declarator.id.type === "Identifier"
          ? declarator.id.name
          : text.slice(declarator.id.start, declarator.id.end)
      );
    if (
      (declaration?.type === "FunctionDeclaration" ||
        declaration?.type === "TSDeclareFunction" ||
        declaration?.type === "ClassDeclaration" ||
        declaration?.type === "TSInterfaceDeclaration" ||
        declaration?.type === "TSTypeAliasDeclaration") &&
      declaration.id
    )
      return [declaration.id.name];
    return [];
  });
};
const propertyText = (key: Node) =>
  key.type === "Identifier"
    ? key.name
    : key.type === "Literal" && (typeof key.value === "string" || typeof key.value === "number")
      ? String(key.value)
      : undefined;
const elementName = (element: Node) =>
  element.type === "Property" && !element.computed ? propertyText(element.key) : undefined;
const isAssignment = (property: Node): property is ObjectProperty =>
  property.type === "Property" &&
  property.kind === "init" &&
  !property.method &&
  !property.shorthand;
const objectProperty = (node: Node | undefined, key: string) =>
  node?.type === "ObjectExpression"
    ? node.properties.find(
        (property): property is ObjectProperty =>
          isAssignment(property) && elementName(property) === key
      )?.value
    : undefined;
const cvaAxes = (file: string) => {
  if (!/\.tsx?$/.test(file)) return [];
  const { program, text } = parse(file);
  const found: { component: string; axis: string; keys: string[] }[] = [];
  walk(program, (node, ancestors) => {
    const parent = ancestors.at(-1);
    if (node.type === "Identifier" && node.name === "cva") {
      const direct =
        (parent?.type === "CallExpression" && parent.callee === node) ||
        (parent?.type === "ImportSpecifier" &&
          moduleExportName(parent.imported) === parent.local.name);
      if (!direct) failures.push(`Unparsed cva call: ${file}:${lineOf(text, node.start)}`);
    }
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "cva"
    ) {
      const owner =
        parent?.type === "VariableDeclarator" && parent.id.type === "Identifier"
          ? parent.id.name.replace(/(Variants|Style)$/, "")
          : "";
      const variants = objectProperty(node.arguments[1], "variants");
      if (variants?.type === "ObjectExpression")
        variants.properties.forEach((axis) => {
          const axisName = elementName(axis);
          if (!axisName || !isAssignment(axis) || axis.value.type !== "ObjectExpression") return;
          found.push({
            component: owner.charAt(0).toUpperCase() + owner.slice(1),
            axis: axisName,
            keys: axis.value.properties.flatMap((key) => elementName(key) ?? [])
          });
        });
    }
  });
  return found;
};
const localFile = (from: string, specifier: string): string | undefined => {
  let base: string | undefined;
  if (specifier.startsWith("@app/components/v4/")) base = specifier.replace("@app/", "src/");
  else if (specifier.startsWith("."))
    base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  if (!base) return undefined;
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`
  ].find((file) => emittedOutputs.has(file) || existsSync(path.join(root, file)));
};
const declarationsIn = (file: string) => {
  const declarations = new Map<string, Node>();
  parse(file).program.body.forEach((statement) => {
    const declaration =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (declaration?.type === "VariableDeclaration")
      declaration.declarations.forEach((declarator) => {
        if (declarator.id.type === "Identifier") declarations.set(declarator.id.name, declarator);
      });
    else if (
      (declaration?.type === "FunctionDeclaration" ||
        declaration?.type === "TSInterfaceDeclaration" ||
        declaration?.type === "TSTypeAliasDeclaration") &&
      declaration.id
    )
      declarations.set(declaration.id.name, declaration);
  });
  return declarations;
};
const resolveName = (file: string, name: string): { file: string; node: Node } | undefined => {
  const node = declarationsIn(file).get(name);
  if (node) return { file, node };
  for (const statement of parse(file).program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const specifier = statement.specifiers.find((entry) => entry.local.name === name);
    if (!specifier) continue;
    const target = localFile(file, statement.source.value);
    return specifier.type === "ImportSpecifier" && target && /\.tsx?$/.test(target)
      ? resolveName(target, moduleExportName(specifier.imported))
      : undefined;
  }
  return undefined;
};
const propsType = (node: Node) => {
  const fn = node.type === "VariableDeclarator" ? node.init : node;
  if (
    fn?.type !== "FunctionDeclaration" &&
    fn?.type !== "ArrowFunctionExpression" &&
    fn?.type !== "FunctionExpression"
  )
    return undefined;
  const [parameter] = fn.params;
  const pattern = parameter?.type === "AssignmentPattern" ? parameter.left : parameter;
  return pattern && "typeAnnotation" in pattern
    ? pattern.typeAnnotation?.typeAnnotation
    : undefined;
};
type LocatedType = { file: string; type: TSType };
const memberType = (file: string, members: TSSignature[], axis: string) => {
  const member = members.find(
    (candidate) =>
      candidate.type === "TSPropertySignature" &&
      !candidate.computed &&
      propertyText(candidate.key) === axis
  );
  return member?.type === "TSPropertySignature" && member.typeAnnotation
    ? { file, type: member.typeAnnotation.typeAnnotation }
    : undefined;
};
const literalKeys = (file: string, type: TSType | undefined): string[] => {
  if (type?.type === "TSUnionType")
    return type.types.flatMap((member) => literalKeys(file, member));
  if (type?.type === "TSParenthesizedType") return literalKeys(file, type.typeAnnotation);
  if (type?.type === "TSLiteralType")
    return type.literal.type === "Literal" && typeof type.literal.value === "string"
      ? [type.literal.value]
      : [];
  if (type?.type === "TSTypeReference" && type.typeName.type === "Identifier") {
    const resolved = resolveName(file, type.typeName.name);
    return resolved?.node.type === "TSTypeAliasDeclaration"
      ? literalKeys(resolved.file, resolved.node.typeAnnotation)
      : [];
  }
  if (type?.type === "TSIndexedAccessType" && type.objectType.type === "TSTypeReference") {
    const [axis] = literalKeys(file, type.indexType);
    const { typeName, typeArguments } = type.objectType;
    const target = typeArguments?.params[0];
    const helper =
      typeName.type === "TSQualifiedName"
        ? typeName.right.name
        : typeName.type === "Identifier"
          ? typeName.name
          : "";
    const component =
      helper.startsWith("ComponentProps") &&
      target?.type === "TSTypeQuery" &&
      target.exprName.type === "Identifier"
        ? resolveName(file, target.exprName.name)
        : undefined;
    const property =
      axis && component && propertyType(component.file, propsType(component.node), axis);
    return property ? literalKeys(property.file, property.type) : [];
  }
  return [];
};
const propertyType = (
  file: string,
  type: TSType | undefined,
  axis: string
): LocatedType | undefined => {
  if (type?.type === "TSParenthesizedType") return propertyType(file, type.typeAnnotation, axis);
  if (type?.type === "TSIntersectionType" || type?.type === "TSUnionType")
    return type.types.reduce<LocatedType | undefined>(
      (found, member) => found ?? propertyType(file, member, axis),
      undefined
    );
  if (type?.type === "TSTypeLiteral") return memberType(file, type.members, axis);
  if (type?.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return undefined;
  const [target, omitted] = type.typeArguments?.params ?? [];
  if (type.typeName.name === "Omit")
    return literalKeys(file, omitted).includes(axis) ? undefined : propertyType(file, target, axis);
  const resolved = resolveName(file, type.typeName.name);
  if (resolved?.node.type === "TSTypeAliasDeclaration")
    return propertyType(resolved.file, resolved.node.typeAnnotation, axis);
  return resolved?.node.type === "TSInterfaceDeclaration"
    ? memberType(resolved.file, resolved.node.body.body, axis)
    : undefined;
};
const typedAxisNames = ["variant", "size", "tone", "side", "collapsible"];
const typedKeys = (definition: ComponentDefinition, component: string, axis: string) => {
  const owned = definition.sourceFiles.filter(
    (file) => /\.tsx?$/.test(file) && existsSync(path.join(root, file))
  );
  const file = owned.find((candidate) => declarationsIn(candidate).has(component));
  const declaration = file && declarationsIn(file).get(component);
  const property = file && declaration && propertyType(file, propsType(declaration), axis);
  return property && owned.includes(property.file) ? literalKeys(property.file, property.type) : [];
};
const exampleLiterals = (file: string) => {
  const literals = new Set<string>();
  walk(parse(file).program, (node) => {
    if (node.type === "Literal" && typeof node.value === "string") literals.add(node.value);
    if (node.type === "TemplateLiteral" && !node.expressions.length && node.quasis[0].value.cooked)
      literals.add(node.quasis[0].value.cooked);
  });
  return literals;
};
const detectLine = (detect: RuleDetect | undefined) => {
  if (!detect) return "Checked by: missing detect field.";
  if (detect.by === "lint") return `Checked by: \`npm run ui:lint\` (${detect.check}).`;
  if (detect.by === "test") return `Checked by: ${detect.test}. ${detect.how}`;
  return `Checked by: review only.${detect.how ? ` Look for: ${detect.how}` : ""}`;
};
const checkIds = new Map(v4Checks.map((v4Check) => [v4Check.id, v4Check.rule]));
const lintedRules = new Map<string, string>();
const checkRuleDetect = (ruleId: string, detect: RuleDetect | undefined) => {
  if (!detect || !["lint", "test", "review"].includes(detect.by)) {
    failures.push(`Rule has no detect field: ${ruleId}`);
    return;
  }
  if (detect.by === "lint") {
    if (checkIds.get(detect.check) !== ruleId)
      failures.push(`Rule ${ruleId} names lint check ${detect.check}, which does not name it back`);
    lintedRules.set(detect.check, ruleId);
  }
  if (detect.by === "test" && (!detect.how?.trim() || !existsSync(path.join(root, detect.test))))
    failures.push(`Rule ${ruleId} names a missing test or omits what it asserts: ${detect.test}`);
};
const sharedRuleCatalog: {
  rules: {
    id: string;
    detect?: RuleDetect;
    instruction: string;
    good: string;
    avoid: string;
    exceptions?: string;
  }[];
} = JSON.parse(read(`${componentRoot}/skills/infisical-ui/rules.json`));
const codeToken = (token: string) =>
  /^[^A-Za-z]/.test(token) ||
  /^[a-z]+[A-Z]/.test(token) ||
  /[<>(){}[\]=:_#$@`]/.test(token) ||
  /[a-z0-9]-[a-z0-9(]/i.test(token);
const opensAsSentence = (text: string) =>
  /^[A-Z0-9]/.test(text) || codeToken(text.split(/\s/)[0].replace(/,$/, ""));
sharedRuleCatalog.rules.forEach((sharedRule) => {
  checkRuleDetect(sharedRule.id, sharedRule.detect);
  (["instruction", "good", "avoid", "exceptions"] as const).forEach((field) => {
    const text = sharedRule[field];
    if (text !== undefined && !opensAsSentence(text))
      failures.push(
        `Shared rule ${sharedRule.id} ${field} opens with a lowercase fragment: ${text.slice(0, 40)}`
      );
  });
});
const normalSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) =>
      sentence
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[.!?;:,\s]+$/, "")
        .trim()
    )
    .filter(Boolean);
const familyProse = (definition: ComponentDefinition): [string, string][] => {
  const guide = definition.guidance;
  return [
    ["guidance.decision", guide.decision],
    ...(guide.use ?? []).map((text, index): [string, string] => [`guidance.use[${index}]`, text]),
    ...(guide.avoid ?? []).map((text, index): [string, string] => [
      `guidance.avoid[${index}]`,
      text
    ]),
    ...(guide.states ?? []).map((state): [string, string] => [
      `states.${state.state}`,
      state.guidance
    ]),
    ...(guide.antiSlop ?? []).flatMap((pair, index): [string, string][] => [
      [`antiSlop[${index}].do`, pair.do],
      [`antiSlop[${index}].avoid`, pair.avoid],
      [`antiSlop[${index}].reason`, pair.reason]
    ]),
    ...(guide.rules ?? []).flatMap((componentRule): [string, string][] => [
      [`${componentRule.id}.when`, componentRule.when],
      [`${componentRule.id}.do`, componentRule.do],
      [`${componentRule.id}.avoid`, componentRule.avoid],
      [`${componentRule.id}.reason`, componentRule.reason]
    ]),
    ...(definition.behavior ?? []).map((text, index): [string, string] => [
      `behavior[${index}]`,
      text
    ]),
    ...(definition.accessibility ?? []).map((text, index): [string, string] => [
      `accessibility[${index}]`,
      text
    ]),
    ...(definition.limitations ?? []).map((text, index): [string, string] => [
      `limitations[${index}]`,
      text
    ])
  ];
};
const checkRepeatedSentences = (definition: ComponentDefinition) => {
  const firstSeen = new Map<string, string>();
  familyProse(definition).forEach(([field, text]) => {
    normalSentences(text ?? "").forEach((sentence) => {
      const earlier = firstSeen.get(sentence);
      if (earlier)
        failures.push(
          `Repeated sentence in ${definition.id}: ${earlier} and ${field} both say "${sentence}"`
        );
      else firstSeen.set(sentence, field);
    });
  });
};
const ids = new Set<string>();
const editorialRuleIds = new Set<string>();
const sourceOwners = new Map<string, string>();
const knownModules = new Set(
  [`${componentRoot}/ui`, `${componentRoot}/patterns`]
    .filter((folder) => existsSync(path.join(root, folder)))
    .flatMap((folder) => filesIn(folder))
    .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
);
componentCatalog.forEach((definition) => {
  if (ids.has(definition.id)) failures.push(`Duplicate component ID: ${definition.id}`);
  ids.add(definition.id);
  const guide = definition.guidance;
  if (
    !guide.decision?.trim() ||
    !guide.rules?.length ||
    !guide.states?.length ||
    !guide.antiSlop?.length
  )
    failures.push(`Incomplete editorial guidance: ${definition.id}`);
  checkRepeatedSentences(definition);
  const evidenceFiles = new Set([
    ...definition.sourceFiles,
    ...definition.examples.map((example) =>
      path.posix.join("src/pages/design-system", example.module)
    )
  ]);
  (guide.rules ?? []).forEach((componentRule) => {
    if (!componentRule.id.startsWith(`${definition.id}-`) || editorialRuleIds.has(componentRule.id))
      failures.push(
        `Unowned or duplicate component rule ID: ${definition.id} -> ${componentRule.id}`
      );
    editorialRuleIds.add(componentRule.id);
    checkRuleDetect(componentRule.id, componentRule.detect);
    if (
      ![componentRule.when, componentRule.do, componentRule.avoid, componentRule.reason].every(
        (value) => value?.trim()
      ) ||
      componentRule.do === componentRule.avoid
    )
      failures.push(`Incomplete conditional Do/Avoid rule: ${componentRule.id}`);
    if (
      !componentRule.evidence?.length ||
      componentRule.evidence.some(
        (file) => !evidenceFiles.has(file) || !existsSync(path.join(root, file))
      )
    )
      failures.push(`Missing family-owned rule evidence: ${componentRule.id}`);
  });
  (guide.states ?? []).forEach((state) => {
    if (!state.state?.trim() || !state.guidance?.trim())
      failures.push(`Incomplete state guidance: ${definition.id}`);
  });
  (guide.antiSlop ?? []).forEach((pair) => {
    if (
      ![pair.do, pair.avoid, pair.reason].every((value) => value?.trim()) ||
      pair.do === pair.avoid
    )
      failures.push(`Incomplete presentation Do/Avoid pair: ${definition.id}`);
  });
  definition.sourceFiles.forEach((file) => {
    if (!existsSync(path.join(root, file))) failures.push(`Missing component source: ${file}`);
    if (knownModules.has(file)) sourceOwners.set(file, definition.id);
  });
  const sourceExports = new Set(
    definition.sourceFiles
      .filter((file) => existsSync(path.join(root, file)))
      .flatMap(actualExports)
  );
  definition.exports.forEach((name) => {
    if (!sourceExports.has(name))
      failures.push(`Unproven exported API: ${definition.id} -> ${name}`);
  });
  const exampleIds = new Set<string>();
  definition.examples.forEach((example) => {
    if (exampleIds.has(example.id))
      failures.push(`Duplicate example ID: ${definition.id}:${example.id}`);
    exampleIds.add(example.id);
    const file = path.join("src/pages/design-system", example.module);
    if (!existsSync(path.join(root, file))) failures.push(`Missing example: ${file}`);
  });
  if (!definition.examples.length) failures.push(`No real example: ${definition.id}`);
  const axes = new Set<string>();
  definition.coverage?.forEach((axis) => {
    if (!axis.axis.trim() || axes.has(axis.axis) || !axis.expected.length)
      failures.push(`Invalid coverage axis: ${definition.id}:${axis.axis}`);
    axes.add(axis.axis);
    const expected = new Set(axis.expected);
    if (expected.size !== axis.expected.length)
      failures.push(`Duplicate expected coverage: ${definition.id}:${axis.axis}`);
    const declared = new Set<string>();
    const declare = (value: string) => {
      if (!expected.has(value) || declared.has(value))
        failures.push(`Unexpected or duplicate coverage: ${definition.id}:${axis.axis}:${value}`);
      declared.add(value);
    };
    axis.shown.forEach((entry) => {
      declare(entry.value);
      if (!exampleIds.has(entry.exampleId))
        failures.push(
          `Missing coverage example: ${definition.id}:${axis.axis}:${entry.value} -> ${entry.exampleId}`
        );
      if (
        !entry.label.trim() ||
        (entry.aliasOf && (!expected.has(entry.aliasOf) || entry.aliasOf === entry.value))
      )
        failures.push(
          `Invalid coverage label or alias: ${definition.id}:${axis.axis}:${entry.value}`
        );
    });
    axis.omitted?.forEach((entry) => {
      declare(entry.value);
      if (!entry.reason.trim())
        failures.push(`Missing omission reason: ${definition.id}:${axis.axis}:${entry.value}`);
    });
    axis.expected.forEach((value) => {
      if (!declared.has(value))
        failures.push(`Missing coverage declaration: ${definition.id}:${axis.axis}:${value}`);
    });
  });
  // An axis on the family's first export keeps its bare name ("size"); one on another part is keyed
  // by that part's export ("ItemMedia.variant"). cva bindings name their part (itemMediaVariants).
  // A cva axis wins over the same prop's TypeScript union.
  const sourceAxes = new Map<string, Set<string>>();
  const partKey = (component: string, axis: string) =>
    !component || component === definition.exports[0] ? axis : `${component}.${axis}`;
  definition.sourceFiles
    .filter((file) => existsSync(path.join(root, file)))
    .flatMap(cvaAxes)
    .forEach(({ component, axis, keys }) => {
      const key = partKey(component, axis);
      sourceAxes.set(key, new Set([...(sourceAxes.get(key) ?? []), ...keys]));
    });
  const cvaKeys = new Set(sourceAxes.keys());
  definition.coverage?.forEach(({ axis: key }) => {
    if (cvaKeys.has(key)) return;
    const [component, axis] = key.includes(".") ? key.split(".") : [definition.exports[0], key];
    if (!typedAxisNames.includes(axis) || !definition.exports.includes(component)) return;
    const keys = typedKeys(definition, component, axis);
    if (keys.length) sourceAxes.set(key, new Set(keys));
  });
  definition.coverage?.forEach((axis) => {
    if (
      /^[A-Z]\w*\.\w+$/.test(axis.axis) &&
      !sourceAxes.has(axis.axis) &&
      !definition.exports.includes(axis.axis.split(".")[0])
    )
      failures.push(`Declared part axis has no source: ${definition.id}:${axis.axis}`);
  });
  const list = (values: Iterable<string>) => `[${[...values].join(", ")}]`;
  sourceAxes.forEach((keys, key) => {
    const declaration = definition.coverage?.find((axis) => axis.axis === key);
    const booleanOnly = keys.size === 2 && keys.has("true") && keys.has("false");
    if (!declaration) {
      if (keys.size > 1 && !booleanOnly)
        failures.push(`Undeclared variant axis: ${definition.id}:${key} ${list(keys)}`);
      return;
    }
    const missing = [...keys].filter((value) => !declaration.expected.includes(value));
    const extra = declaration.expected.filter((value) => !keys.has(value));
    if (missing.length || extra.length)
      failures.push(
        `Coverage drifts from source: ${definition.id}:${key} missing ${list(missing)} extra ${list(extra)}`
      );
    const captionOf = (value: string) =>
      [
        value,
        ...[...keys].filter((alias) =>
          declaration.shown.some((entry) => entry.value === alias && entry.aliasOf === value)
        )
      ].join(", ");
    declaration.shown.forEach((entry) => {
      const caption = entry.aliasOf
        ? declaration.shown.find((canonical) => canonical.value === entry.aliasOf)?.label
        : captionOf(entry.value);
      if (entry.label !== caption)
        failures.push(
          `Caption is not the prop value: ${definition.id}:${key}:${entry.value} -> "${entry.label}"`
        );
      const example = definition.examples.find((candidate) => candidate.id === entry.exampleId);
      const file = example && path.join("src/pages/design-system", example.module);
      if (file && existsSync(path.join(root, file)) && !exampleLiterals(file).has(entry.label))
        failures.push(
          `Caption is not in the example: ${definition.id}:${key}:${entry.value} -> ${entry.exampleId} "${entry.label}"`
        );
    });
  });
});
knownModules.forEach((file) => {
  if (!sourceOwners.has(file)) failures.push(`Undocumented runtime module: ${file}`);
});
const moduleNames = new Map<string, string>();
knownModules.forEach((file) => {
  const name = path.basename(file, ".tsx");
  const existing = moduleNames.get(name);
  if (existing) failures.push(`Registry item collision: ${existing} and ${file} both use ${name}`);
  moduleNames.set(name, file);
});
const packageName = (specifier: string) =>
  specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
const importsFrom = (file: string) => {
  if (!emittedOutputs.has(file) && !existsSync(path.join(root, file))) return [];
  if (file.endsWith(".css"))
    return [...read(file).matchAll(/@(?:import|reference)\s+["']([^"']+)["']/g)].map(
      (match) => match[1]
    );
  if (!/\.[cm]?[jt]sx?$/.test(file)) return [];
  return parse(file).program.body.flatMap((statement) =>
    (statement.type === "ImportDeclaration" ||
      statement.type === "ExportNamedDeclaration" ||
      statement.type === "ExportAllDeclaration") &&
    statement.source
      ? [statement.source.value]
      : []
  );
};
const presentationTags = ["ExampleCell", "ExampleGrid", "ExampleStack", "ExampleStage"];
const portablePresentation = async (file: string) => {
  const code = read(file);
  if (!code.includes('from "../../example-presentation"')) return code;
  const { program } = parse(file);
  const source = (node: Node) => code.slice(node.start, node.end);
  const tagOf = (element: JSXElement) => source(element.openingElement.name);
  const attributeOf = (element: JSXElement, key: string) =>
    element.openingElement.attributes.find(
      (attribute): attribute is JSXAttribute =>
        attribute.type === "JSXAttribute" && source(attribute.name) === key
    );
  const stringOf = (attribute: JSXAttribute | undefined) =>
    attribute?.value?.type === "Literal" ? attribute.value.value : undefined;
  const presented = new Set<Node>();
  const nested = new Map<Node | undefined, JSXElement[]>();
  const grids = new Map<JSXElement, JSXElement | undefined>();
  walk(program, (node, ancestors) => {
    if (
      node.type !== "JSXElement" ||
      !node.closingElement ||
      !presentationTags.includes(tagOf(node))
    )
      return;
    const owner = ancestors.findLast((ancestor) => presented.has(ancestor));
    presented.add(node);
    nested.set(owner, [...(nested.get(owner) ?? []), node]);
    grids.set(
      node,
      ancestors.findLast(
        (ancestor): ancestor is JSXElement =>
          ancestor.type === "JSXElement" && tagOf(ancestor) === "ExampleGrid"
      )
    );
  });
  const splice = (start: number, end: number, replacements: { node: Node; text: string }[]) => {
    let text = "";
    let cursor = start;
    replacements
      .filter(({ node }) => node.start >= start && node.end <= end)
      .sort((left, right) => left.node.start - right.node.start)
      .forEach(({ node, text: replacement }) => {
        text += code.slice(cursor, node.start) + replacement;
        cursor = node.end;
      });
    return text + code.slice(cursor, end);
  };
  const render = (element: JSXElement): string => {
    const name = tagOf(element);
    const width = stringOf(attributeOf(element, "width"));
    const height = stringOf(attributeOf(element, "height"));
    const align = stringOf(attributeOf(element, "align"));
    const label = attributeOf(element, "label")?.value;
    const labelContent =
      label?.type === "JSXExpressionContainer" ? source(label) : label && `{${source(label)}}`;
    const grid = grids.get(element);
    const parentGridWidth = grid && (stringOf(attributeOf(grid, "width")) ?? "field");
    const compactCell = parentGridWidth === "compact";
    const cellAlignment = compactCell
      ? "center"
      : (align ?? (parentGridWidth === "field" ? "stretch" : "start"));
    const gridWidth = width ?? "field";
    const stageHeight = height ?? "auto";
    const className =
      name === "ExampleGrid"
        ? `grid min-w-0 w-full items-start gap-x-6 gap-y-8 ${gridWidth === "full" ? "grid-cols-1" : gridWidth === "compact" ? "justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]" : gridWidth === "wide" ? "grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]" : "grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]"}`
        : name === "ExampleStage"
          ? `relative min-w-0 w-full overflow-auto${stageHeight === "shell" ? " h-[360px] isolate [transform:translateZ(0)]" : stageHeight === "app" ? " h-[600px] isolate [transform:translateZ(0)]" : stageHeight === "compact" ? " h-40 isolate [transform:translateZ(0)]" : stageHeight === "medium" ? " h-60 isolate [transform:translateZ(0)]" : stageHeight === "data" ? " max-h-[400px]" : ""}`
          : name === "ExampleCell"
            ? `m-0 flex min-w-0 w-full flex-col gap-3${cellAlignment === "center" ? " items-center text-center" : ""}`
            : "flex min-w-0 w-full flex-col items-start gap-6";
    const tag = name === "ExampleCell" ? "figure" : "div";
    const props = element.openingElement.attributes
      .filter(
        (attribute) =>
          attribute.type !== "JSXAttribute" ||
          !["label", "width", "height", "align"].includes(source(attribute.name))
      )
      .map(source);
    const inner = splice(
      element.openingElement.end,
      element.closingElement?.start ?? element.end,
      (nested.get(element) ?? []).map((child) => ({ node: child, text: render(child) }))
    );
    const children =
      name === "ExampleCell" && labelContent
        ? `<div className="flex min-h-8 min-w-0 w-full flex-col gap-3 ${cellAlignment === "center" ? "items-center" : cellAlignment === "stretch" ? "items-stretch" : "items-start"}">${inner}</div><figcaption className="text-muted-foreground text-xs">${labelContent}</figcaption>`
        : inner;
    return `<${tag} ${[...props, `className="${className}"`].join(" ")}>${children}</${tag}>`;
  };
  const spliced = splice(0, code.length, [
    ...program.body
      .filter(
        (statement) =>
          statement.type === "ImportDeclaration" &&
          statement.source.value === "../../example-presentation"
      )
      .map((statement) => ({ node: statement, text: "" })),
    ...(nested.get(undefined) ?? []).map((element) => ({ node: element, text: render(element) }))
  ]);
  const formatted = await format(path.basename(file), spliced, formatOptions);
  if (formatted.errors.length)
    throw new Error(
      `${file} does not format: ${formatted.errors.map((error) => error.message).join("; ")}`
    );
  return formatted.code;
};

const plainLinkTargets = (file: string, code: string) => {
  if (!file.startsWith("src/pages/design-system/")) return code;
  const result = parseSync(file, code);
  const replacements: { start: number; end: number; text: string }[] = [];
  walk(result.program, (node, ancestors) => {
    if (node.type !== "ObjectExpression") return;
    const property = (key: string) =>
      node.properties.find(
        (entry) =>
          entry.type === "Property" && entry.key.type === "Identifier" && entry.key.name === key
      );
    const to = property("to");
    if (
      to?.type !== "Property" ||
      to.value.type !== "Literal" ||
      typeof to.value.value !== "string"
    )
      return;
    const params = property("params");
    const values = new Map<string, { literal?: string; source: string }>();
    if (params?.type === "Property" && params.value.type === "ObjectExpression")
      params.value.properties.forEach((entry) => {
        if (entry.type !== "Property" || entry.key.type !== "Identifier") return;
        const { value } = entry;
        values.set(entry.key.name, {
          literal:
            value.type === "Literal" && typeof value.value === "string" ? value.value : undefined,
          source: code.slice(value.start, value.end)
        });
      });
    let dynamic = false;
    const href = to.value.value.replace(/\$(\w+)/g, (segment, key: string) => {
      const value = values.get(key);
      if (!value) return segment;
      if (value.literal !== undefined) return value.literal;
      dynamic = true;
      return `${"$"}{${value.source}}`;
    });
    const parent = ancestors.at(-1);
    const wrapper =
      parent?.type === "CallExpression" &&
      code.slice(parent.callee.start, parent.callee.end) === "linkOptions"
        ? parent
        : node;
    replacements.push({
      start: wrapper.start,
      end: wrapper.end,
      text: `{ href: ${dynamic ? `\`${href}\`` : JSON.stringify(href)} }`
    });
  });
  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, { start, end, text: next }) => text.slice(0, start) + next + text.slice(end),
      code
    )
    .replace(/^import \{ linkOptions \} from "@tanstack\/react-router";\n/m, "");
};
const portable = async (file: string) =>
  plainLinkTargets(file, await portablePresentation(file))
    .replace(/^@source "\.\.\/\.\.\/pages\/.+";\n/gm, (match) =>
      file === `${componentRoot}/v4.css` ? "" : match
    )
    .replace('@source "./ui";\n', (match) =>
      file === `${componentRoot}/v4.css` ? `${match}@source "./patterns";\n` : match
    )
    .replace(/(["'])@app\/components\/v4\/([^"']+)\1/g, (_match, quote, suffix) => {
      let relative = path.posix.relative(path.posix.dirname(file), `${componentRoot}/${suffix}`);
      if (!relative.startsWith(".")) relative = `./${relative}`;
      return `${quote}${relative}${quote}`;
    })
    .replace(/url\(["']?([^"')]+\.woff2)["']?\)/g, (match, font) => {
      if (!file.endsWith(".css")) return match;
      const fontPath = path.resolve(root, path.dirname(file), font);
      const data = readFileSync(fontPath).toString("base64");
      return `url("data:font/woff2;base64,${data}")`;
    });
const agentInfo = {
  schemaVersion: 1,
  scope: "Incubating component foundation. Product migration is separate.",
  rules: "skills/infisical-ui/rules.json",
  components: componentCatalog
};
emit(`${componentRoot}/docs/components.json`, json(agentInfo));
for (const definition of componentCatalog) {
  const bullets = (values: readonly string[]) =>
    values.length
      ? values.map((value) => `- ${value}`).join("\n")
      : "No additional limits documented.";
  const exampleTexts = definition.examples.map(async (example) => {
    const file = path.posix.join("src/pages/design-system", example.module);
    const code = existsSync(path.join(root, file))
      ? (await portable(file)).trimEnd()
      : "Example source is missing.";
    const exampleItems = [
      ...new Set(
        importsFrom(file).flatMap((specifier) => {
          const local = localFile(file, specifier);
          return local && knownModules.has(local)
            ? [registryItem(path.basename(local, ".tsx"))]
            : [];
        })
      )
    ].sort();
    const examplePackages = [
      ...new Set(
        importsFrom(file)
          .filter(
            (specifier) =>
              !localFile(file, specifier) &&
              !specifier.startsWith(".") &&
              !specifier.startsWith("@app/") &&
              !["react", "react-dom"].includes(packageName(specifier)) &&
              code.includes(`"${specifier}"`)
          )
          .map(packageName)
          .map(declaredPackage)
      )
    ].sort();
    return `### ${example.title}\n\nSave this example at \`${file}\`; its relative imports are generated for that exact path. States: ${example.states.join(", ")}.\n\nRegistry items used: ${exampleItems.join(", ") || "none"}. Additional packages: ${examplePackages.join(", ") || "none"}. Install every listed item before compiling this example.\n\n\`\`\`tsx\n${code}\n\`\`\``;
  });
  const examples = (await Promise.all(exampleTexts)).join("\n\n");
  const usageRules = (definition.guidance.rules ?? [])
    .map(
      (componentRule) =>
        `### ${componentRule.id}\n\nOwner: ${definition.id}.\n\nWhen ${componentRule.when[0].toLowerCase()}${componentRule.when.slice(1)}\n\nDo: ${componentRule.do}\n\nAvoid: ${componentRule.avoid}\n\nWhy: ${componentRule.reason}\n\n${detectLine(componentRule.detect)}\n\nSource evidence:\n${bullets(componentRule.evidence)}`
    )
    .join("\n\n");
  const stateGuidance = (definition.guidance.states ?? [])
    .map((state) => `- ${state.state}: ${state.guidance}`)
    .join("\n");
  const presentationRules = (definition.guidance.antiSlop ?? [])
    .map((pair) => `Do: ${pair.do}\n\nAvoid: ${pair.avoid}\n\nWhy: ${pair.reason}`)
    .join("\n\n");
  const exampleCoverage = definition.coverage
    ?.map(
      (axis) =>
        `### ${axis.axis}\n\n${axis.shown.map((entry) => `- ${entry.value}: example \`${entry.exampleId}\`, visible label "${entry.label}"${entry.aliasOf ? `; alias of ${entry.aliasOf}` : ""}.`).join("\n")}${axis.omitted?.length ? `\n${axis.omitted.map((entry) => `- ${entry.value}: omitted. ${entry.reason}`).join("\n")}` : ""}`
    )
    .join("\n\n");
  const coverageSection = exampleCoverage
    ? `## Declared example coverage\n\nSource declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.\n\n${exampleCoverage}\n\n`
    : "";
  const text = `# ${definition.title}\n\n${definition.summary}\n\n## Choose this component\n\n${definition.guidance.decision ?? "Missing editorial decision."}\n\n## Usage rules\n\n${usageRules}\n\n## State guidance\n\n${stateGuidance}\n\n## Presentation rules\n\n${presentationRules}\n\n## Import and exports\n\n${definition.sourceFiles.map((file) => `- ${file}`).join("\n")}\n\nExports: ${definition.exports.join(", ")}. Source TypeScript defines the API.\n\n## Behavior\n\n${bullets(definition.behavior)}\n\n## Accessibility\n\n${bullets(definition.accessibility)}\n\n## Use cases\n\n${bullets(definition.guidance.use)}\n\n${definition.guidance.avoid.length ? `## Avoid\n\n${bullets(definition.guidance.avoid)}\n\n` : ""}## Limits\n\n${bullets(definition.limitations)}\n\n${coverageSection}## Executable examples\n\n${examples}\n\n## Verification recipes\n\nThese commands are recipes, not evidence that this component passed.\n\n${definition.checks.map((entry) => `- ${entry.kind}: ${entry.command}`).join("\n")}\n`;
  emit(`${componentRoot}/docs/${definition.id}.md`, text);
}
emit(
  `${componentRoot}/docs/README.md`,
  `# Component guide\n\nGenerated by ui:generate from the typed family contracts.\n\n${componentCatalog.map((definition) => `- [${definition.title}](${definition.id}.md): ${definition.summary}`).join("\n")}\n\nRead ../skills/infisical-ui/SKILL.md and its canonical rules before editing. Verification recipes are not passing evidence.\n`
);
previousGenerated.forEach((file) => {
  if (!file.startsWith(`${componentRoot}/docs/`) || generated.has(file)) return;
  if (check) {
    if (!isBuildOutput(file)) failures.push(`Obsolete generated file: ${file}`);
  } else if (existsSync(path.join(root, file))) obsoleteOutputs.add(file);
});
const support = [
  ...new Set([
    ...filesIn(componentRoot),
    ...[...generated].filter((file) => file.startsWith(`${componentRoot}/`))
  ])
].filter(
  (file) =>
    !file.includes("/ui/") &&
    !file.includes("/patterns/") &&
    !file.includes("/contracts/") &&
    !file.endsWith("/catalog.ts") &&
    !/\.(test|spec)\./.test(file) &&
    !file.endsWith(".woff2") &&
    (!file.includes("/docs/") || generated.has(file))
);
const docsOnly = (file: string) =>
  file === `${componentRoot}/AGENTS.md` ||
  file.startsWith(`${componentRoot}/skills/`) ||
  (file.startsWith(`${componentRoot}/docs/`) && file.endsWith(".md"));
const internalOnly = [
  `${componentRoot}/required-capabilities.json`,
  `${componentRoot}/docs/components.json`,
  `${componentRoot}/docs/coverage.json`
];
const docsFiles = support.filter(docsOnly);
const baseFiles = support.filter(
  (file) =>
    !docsOnly(file) && !internalOnly.includes(file) && !file.startsWith(`${componentRoot}/assets/`)
);
const fileEntry = (file: string) => ({ path: file, type: "registry:file", target: file });
const baseDependencies = new Set(["tailwindcss", "tw-animate-css"]);
baseFiles.forEach((file) =>
  importsFrom(file).forEach((specifier) => {
    const local = localFile(file, specifier);
    if (local && !baseFiles.includes(local))
      failures.push(`Base support import is not shipped in base: ${file} -> ${local}`);
    else if (!local && (specifier.startsWith(".") || specifier.startsWith("@app/")))
      failures.push(`Unresolved support import: ${file} -> ${specifier}`);
    else if (!local && !["react", "react-dom"].includes(packageName(specifier)))
      baseDependencies.add(packageName(specifier));
  })
);
const items: Record<string, unknown>[] = [
  {
    name: baseItemName,
    type: "registry:base",
    description:
      "Cipher tokens, the Lightly Peach, Light and Dark themes, fonts, cn and scoped portal support.",
    dependencies: [...baseDependencies].sort().map(declaredPackage),
    files: baseFiles.map(fileEntry)
  },
  {
    name: `${registryName}-docs`,
    type: "registry:file",
    description:
      "Cipher usage rules, component guides and the agent skill, for people and coding agents.",
    files: docsFiles.map(fileEntry)
  }
];
[...knownModules].sort().forEach((file) => {
  const name = path.basename(file, ".tsx");
  if (name in excludedFromRegistry) return;
  const dependencies = new Set<string>();
  const registryDependencies = new Set([registryItem(baseItemName)]);
  const extras = new Set<string>();
  const scanned = new Set<string>();
  const collect = (current: string) => {
    if (scanned.has(current)) return;
    scanned.add(current);
    importsFrom(current).forEach((specifier) => {
      const local = localFile(current, specifier);
      if (local) {
        if (!local.startsWith(`${componentRoot}/`))
          failures.push(`Non-portable product import: ${current} -> ${local}`);
        else if (knownModules.has(local)) {
          const dependency = path.basename(local, ".tsx");
          if (dependency in excludedFromRegistry)
            failures.push(`Registry item ${name} depends on excluded ${dependency}`);
          registryDependencies.add(registryItem(dependency));
        } else if (!support.includes(local)) {
          extras.add(local);
          collect(local);
        }
      } else if (specifier.startsWith(".") || specifier.startsWith("@app/"))
        failures.push(`Unresolved local import: ${current} -> ${specifier}`);
      else if (!["react", "react-dom"].includes(packageName(specifier)))
        dependencies.add(packageName(specifier));
    });
  };
  collect(file);
  items.push({
    name,
    type: file.includes("/patterns/") ? "registry:block" : "registry:ui",
    registryDependencies: [...registryDependencies].sort(),
    ...(dependencies.size ? { dependencies: [...dependencies].sort().map(declaredPackage) } : {}),
    files: [fileEntry(file), ...[...extras].sort().map(fileEntry)]
  });
});
const targets = new Map<string, string>();
items.forEach((item) => {
  (
    item.files as {
      path: string;
      target: string;
    }[]
  ).forEach((file) => {
    const existing = targets.get(file.target);
    if (existing && existing !== file.path)
      failures.push(
        `Registry target collision: ${file.target} receives ${existing} and ${file.path}`
      );
    targets.set(file.target, file.path);
  });
});
const registryNames = new Set(items.map((item) => item.name));
(required.baselineRegistryItems ?? []).forEach((name) => {
  if (!registryNames.has(name)) failures.push(`Missing baseline registry identity: ${name}`);
});
const registry = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: registryName,
  homepage: "https://github.com/Infisical/infisical/tree/main/frontend/src/components/v4",
  items
};
emit("registry.json", json(registry));
for (const item of items) {
  const itemFiles = item.files as {
    path: string;
    type: string;
    target: string;
  }[];
  const files = await Promise.all(
    itemFiles.map(async (file) => ({ ...file, content: await portable(file.path) }))
  );
  emit(
    `public/r/${item.name}.json`,
    json({ $schema: "https://ui.shadcn.com/schema/registry-item.json", ...item, files })
  );
}
previousGenerated.forEach((file) => {
  if (generated.has(file)) return;
  if (!file.startsWith("public/r/") && !file.startsWith(`${componentRoot}/docs/`)) return;
  if (check) {
    if (!isBuildOutput(file)) failures.push(`Obsolete generated file: ${file}`);
  } else if (existsSync(path.join(root, file))) obsoleteOutputs.add(file);
});
v4Checks.forEach((v4Check) => {
  if (lintedRules.get(v4Check.id) !== v4Check.rule)
    failures.push(
      `Lint check ${v4Check.id} enforces ${v4Check.rule}, whose detect does not name it`
    );
});
if (failures.length) throw new Error(failures.join("\n"));
pendingOutputs.forEach((text, file) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
});
obsoleteOutputs.forEach((file) => rmSync(path.join(root, file)));
process.stdout.write(
  `${check ? "Checked" : "Generated"} ${componentCatalog.length} documented families, ${knownModules.size} source modules and ${items.length} registry entries.\n`
);
