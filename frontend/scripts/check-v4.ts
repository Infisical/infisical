import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type V4Check = {
  id: string;
  /** The shared or component rule this check enforces. Generation requires the rule to name it. */
  rule: string;
  message: string;
  appliesTo: (file: string) => boolean;
  /** Patterns for .ts/.tsx files. */
  markup?: readonly RegExp[];
  /** Patterns for .css files. */
  css?: readonly RegExp[];
  /** Files this one check does not scan. */
  exempt?: readonly string[];
  /** For .ts/.tsx files: judges each className-like string literal and returns the offending text. */
  classString?: (value: string) => readonly string[];
};

const isUi = (file: string) => file.startsWith("src/components/v4/");
const isExample = (file: string) => file.startsWith("src/pages/design-system/");
const isCss = (file: string) => file.endsWith(".css");
const isMarkup = (file: string) => /\.tsx?$/.test(file);
const isAuthored = (file: string) => isUi(file) || isExample(file);

const tailwindPalette =
  "black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const tailwindColorUtility =
  "bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent";

const splitVariant = (token: string) => {
  let depth = 0;
  let cut = -1;
  [...token].forEach((char, index) => {
    if (char === "[" || char === "(") depth += 1;
    else if (char === "]" || char === ")") depth -= 1;
    else if (char === ":" && depth === 0) cut = index;
  });
  return {
    variant: token.slice(0, cut + 1),
    utility: token.slice(cut + 1).replace(/^!|!$/g, "")
  };
};
const borderWidth =
  /^border(?:-[trblxyse])?(?:-(?:[1-9]\d*|\[(?:length:)?\.?\d[^\]]*\]|\(length:[^)]*\)))?$/;
const borderColor =
  /^border(?:-[trblxyse])?-(?:\[(?!length:|\.?\d)[^\]]+\]|\((?!length:)[^)]+\)|(?!(?:solid|dashed|dotted|double|none|hidden|collapse|separate|spacing)\b|[trblxyse](?:-\d|$))[a-z][\w-]*(?:\/[\w.[\]]+)?)$/;

/** Border width utilities whose state (variant chain) has no border colour in the same string. */
export const bareBorders = (value: string): string[] => {
  const tokens = value.split(/\s+/).filter(Boolean).map(splitVariant);
  const colored = new Set(
    tokens.filter((token) => borderColor.test(token.utility)).map((token) => token.variant)
  );
  return tokens
    .filter((token) => borderWidth.test(token.utility))
    .filter((token) => !colored.has("") && !colored.has(token.variant))
    .map((token) => `${token.variant}${token.utility}`);
};

const classCallee = /(?:^|[^\w.$])(?:cn|cva|cx|clsx|twMerge)\s*$/;

/** String literals that hold classes: className attributes and cn/cva/clsx call arguments, at any depth. */
export const classStringLiterals = (text: string) => {
  const found: { value: string; index: number }[] = [];
  const stack: ("class" | "other")[] = [];
  let index = 0;
  const inClass = () => stack.includes("class");
  while (index < text.length) {
    const char = text[index];
    const rest = text.slice(index, index + 2);
    if (rest === "//") {
      index = text.indexOf("\n", index);
      if (index < 0) break;
    } else if (rest === "/*") {
      index = text.indexOf("*/", index) + 2;
      if (index < 2) break;
    } else if (
      (char === '"' || char === "'" || char === "`") &&
      /(?:^|[=(,:[{?+!&|]|return)\s*$/.test(text.slice(Math.max(0, index - 12), index))
    ) {
      let end = index + 1;
      while (end < text.length && text[end] !== char) end += text[end] === "\\" ? 2 : 1;
      const value = text.slice(index + 1, end);
      const attribute = /className\s*=\s*$/.test(text.slice(Math.max(0, index - 40), index));
      if ((inClass() || attribute) && !(char === "`" && value.includes("${")))
        found.push({ value, index });
      index = end + 1;
    } else {
      if (char === "(" || char === "{" || char === "[") {
        const before = text.slice(Math.max(0, index - 40), index);
        const opensClass =
          (char === "(" && classCallee.test(before)) ||
          (char === "{" && /className\s*=\s*$/.test(before));
        stack.push(opensClass ? "class" : "other");
      } else if (char === ")" || char === "}" || char === "]") stack.pop();
      index += 1;
    }
  }
  return found;
};

export const v4Checks: readonly V4Check[] = [
  {
    id: "raw-color",
    rule: "token-colors",
    // The hand-written theme bridge declares the token values themselves.
    exempt: ["src/components/v4/v4.css"],
    message: "Colour comes from a v4 token, not a hex, rgb/hsl literal or Tailwind palette class.",
    appliesTo: isAuthored,
    css: [/#[0-9a-fA-F]{3,8}\b(?![-\w])/g, /\b(?:rgba?|hsla?)\(\s*\d/g],
    markup: [
      /#[0-9a-fA-F]{3,8}\b(?![-\w])/g,
      /\b(?:rgba?|hsla?)\(\s*\d/g,
      new RegExp(
        `\\b(?:${tailwindColorUtility})-(?:${tailwindPalette})(?:-\\d{2,3})?(?:/\\d{1,3})?(?![-\\w])`,
        "g"
      )
    ]
  },
  {
    id: "bare-border",
    rule: "line-colored-borders",
    message:
      "A border width utility needs a v4 line colour for the same state in the same class string. A bare border falls back to the global gray.",
    appliesTo: isAuthored,
    classString: (value) => bareBorders(value)
  },
  {
    id: "decorative-effect",
    rule: "no-added-depth",
    message:
      "No added shadow or backdrop blur. Use the owned surface, or the shadow-raised and shadow-pop tokens.",
    appliesTo: isAuthored,
    css: [/(?:^|[;{\s])backdrop-filter\s*:/g],
    markup: [
      /(?<![-\w])shadow(?:-(?:xs|sm|md|lg|xl|2xl|\[[^\]]*\]))?(?![-\w])/g,
      /\bdrop-shadow(?:-[\w[\]]+)?/g,
      /\bbackdrop-blur(?:-\w+)?\b/g
    ]
  },
  {
    id: "transition-all",
    rule: "named-transitions",
    message:
      "Name the properties that animate. transition: all also animates layout and colour you did not mean to move.",
    appliesTo: isAuthored,
    markup: [/\btransition-all\b/g],
    css: [/transition(?:-property)?\s*:\s*all\b/g]
  },
  {
    id: "motion-literal",
    rule: "motion-tokens",
    message:
      "Time motion with the v4 duration and ease tokens, or the named springs and tweens in lib/motion.ts, not a literal duration, delay, easing curve or inline spring number.",
    appliesTo: (file) => isAuthored(file) && !file.endsWith("lib/motion.ts"),
    css: [
      /(?<![\w.])(?!0*\.?0+m?s\b)\d*\.?\d+m?s\b/g,
      /\bcubic-bezier\(/g,
      /(?:transition|animation)[\w-]*\s*:[^;]*?\b(?:ease(?:-in-out|-in|-out)?|linear)\b(?![-(])/g
    ],
    markup: [
      /\b(?:duration|delay)-(?:\d+\b|\[)/g,
      /\bease-(?:linear|in-out|in|out)\b/g,
      /\bease-\[/g,
      /\bcubic-bezier\(/g,
      /\b(?:transition|animation)\w*\s*:\s*["'`][^"'`]*?(?<![\w.])(?!0*\.?0+m?s\b)\d*\.?\d+m?s\b/g,
      /\b(?:transition|animation)TimingFunction\s*:\s*["'`](?!var\()/g,
      /\b(?:stiffness|damping|mass|bounce|duration|delay)\s*:\s*(?:[1-9]\d*|0?\.\d*[1-9])/g
    ]
  },
  {
    id: "arbitrary-geometry",
    rule: "token-geometry",
    message:
      "No arbitrary Tailwind size, spacing or radius value. Use the component recipe or a v4 size, space or radius token.",
    appliesTo: isAuthored,
    markup: [
      /\b(?:[mp][trblxyse]?|gap(?:-[xy])?|[wh]|min-[wh]|max-[wh]|size|rounded(?:-[trbl]{1,2})?|inset(?:-[xy])?|top|right|bottom|left|text|leading|tracking|basis|ring(?:-offset)?|outline|border(?:-[trblxy])?|translate-[xy]|grid-(?:cols|rows))-\[(?:min\(|max\(|calc\()?-?\d[^\]]*\]/g
    ]
  },
  {
    id: "icon-source",
    rule: "one-icon-set",
    message:
      "Draw icons with the v4 Icon component. lucide-react imports bypass its stroke and size tokens.",
    appliesTo: isAuthored,
    markup: [/from\s+["']lucide-react["']/g]
  },
  {
    id: "dot-separator",
    rule: "no-dot-separators",
    message: "Separate details with words or layout, not a middle dot or bullet.",
    appliesTo: isAuthored,
    markup: [/\s[·•]\s/g]
  }
];

const patternsFor = (check: V4Check, file: string): readonly RegExp[] => {
  if (isCss(file)) return check.css ?? [];
  if (isMarkup(file)) return check.markup ?? [];
  return [];
};

const ignoreMarker = /v4-check-ignore\s+([\w-]+)\s+--\s+\S/;

const skipped = (file: string) =>
  file.endsWith(".test.ts") ||
  file.endsWith(".test.tsx") ||
  file.startsWith("src/components/v4/docs/") ||
  file === "src/components/v4/tokens.generated.css" ||
  file === "src/components/v4/catalog.ts" ||
  file === "src/components/v4/ui/icon-data.ts";

export type Finding = { check: string; file: string; line: number; text: string };

/** Scan one file's text. A line marked `v4-check-ignore <id> -- <reason>`, or the line after it, is exempt. */
export const scanSource = (file: string, text: string): Finding[] => {
  if (skipped(file)) return [];
  const lines = text.split("\n");
  const exemptLine = (line: number, id: string) =>
    [lines[line - 1] ?? "", lines[line - 2] ?? ""].some(
      (candidate) => candidate.match(ignoreMarker)?.[1] === id
    );
  const classStrings = isMarkup(file) ? classStringLiterals(text) : [];
  return v4Checks
    .filter((check) => check.appliesTo(file) && !check.exempt?.includes(file))
    .flatMap((check) => {
      const judge = check.classString;
      if (judge)
        return classStrings.flatMap(({ value, index }) => {
          const line = text.slice(0, index).split("\n").length;
          if (exemptLine(line, check.id)) return [];
          return judge(value).map((match) => ({ check: check.id, file, line, text: match }));
        });
      return lines.flatMap((lineText, index) => {
        const exempt = [lineText, lines[index - 1] ?? ""].some(
          (candidate) => candidate.match(ignoreMarker)?.[1] === check.id
        );
        if (exempt) return [];
        return patternsFor(check, file).flatMap((pattern) =>
          [...lineText.matchAll(pattern)].map((match) => ({
            check: check.id,
            file,
            line: index + 1,
            text: match[0]
          }))
        );
      });
    });
};

const root = path.resolve(import.meta.dirname, "..");
const scanRoots = ["src/components/v4", "src/pages/design-system"];
const baselinePath = path.join(root, "scripts/check-v4-baseline.json");

const walk = (dir: string): string[] =>
  readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return /\.(tsx?|css)$/.test(entry.name) ? [relative] : [];
  });

export type Counts = Record<string, Record<string, number>>;

const countFindings = (findings: Finding[]): Counts =>
  findings.reduce<Counts>((counts, finding) => {
    const byFile = counts[finding.check] ?? {};
    return {
      ...counts,
      [finding.check]: { ...byFile, [finding.file]: (byFile[finding.file] ?? 0) + 1 }
    };
  }, {});

const sorted = (counts: Counts): Counts =>
  Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((check) => [
        check,
        Object.fromEntries(Object.entries(counts[check]).sort(([a], [b]) => a.localeCompare(b)))
      ])
  );

export const scanTree = (): Finding[] =>
  scanRoots
    .flatMap(walk)
    .flatMap((file) => scanSource(file, readFileSync(path.join(root, file), "utf8")));

/** Findings above the recorded per-file count for their check. The baseline may only shrink. */
export const compareToBaseline = (findings: Finding[], baseline: Counts) => {
  const current = countFindings(findings);
  const grown = findings.filter(
    (finding) =>
      (current[finding.check]?.[finding.file] ?? 0) > (baseline[finding.check]?.[finding.file] ?? 0)
  );
  const shrunk = Object.entries(baseline).flatMap(([check, files]) =>
    Object.entries(files)
      .filter(([file, count]) => (current[check]?.[file] ?? 0) < count)
      .map(([file, count]) => `${check} ${file}: ${count} -> ${current[check]?.[file] ?? 0}`)
  );
  return { current, grown, shrunk };
};

export const readBaseline = (): Counts | undefined =>
  existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : undefined;

const writeBaseline = (counts: Counts) =>
  writeFileSync(baselinePath, `${JSON.stringify(sorted(counts), null, 2)}\n`);

const run = () => {
  const update = process.argv.includes("--update");
  const findings = scanTree();
  const baseline = readBaseline();
  if (!baseline) {
    if (update) {
      writeBaseline(countFindings(findings));
      console.log(`Baseline recorded: ${findings.length} known finding(s).`);
      return;
    }
    console.error(
      `${path.relative(root, baselinePath)} is missing. Run with --update to record it.`
    );
    process.exitCode = 1;
    return;
  }
  const { current, grown, shrunk } = compareToBaseline(findings, baseline);

  if (grown.length) {
    const messages = new Map(
      v4Checks.map((check) => [check.id, `${check.message} (rule ${check.rule})`])
    );
    grown.forEach((finding) =>
      console.error(
        `${finding.file}:${finding.line}  ${finding.check}  ${finding.text}\n  ${messages.get(finding.check)}`
      )
    );
    console.error(
      `\n${grown.length} finding(s) above the baseline. Fix them; the baseline only shrinks.`
    );
    process.exitCode = 1;
    return;
  }
  if (update) {
    writeBaseline(current);
    console.log(`Baseline written: ${findings.length} known finding(s).`);
    return;
  }
  if (shrunk.length) {
    console.log(`Fixed since the baseline, run with --update to lock it in:\n${shrunk.join("\n")}`);
  }
  console.log(
    `v4 checks pass: ${v4Checks.length} checks, ${findings.length} known finding(s) in the baseline.`
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) run();
