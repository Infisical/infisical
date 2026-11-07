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
  /** For .css files: judges each innermost rule block and returns the offending declarations. */
  cssBlock?: (selector: string, body: string) => readonly string[];
  /** For .ts/.tsx files: judges each className-like string literal and returns the offending text. */
  classString?: (value: string) => readonly string[];
  /** For .ts/.tsx files: judges the whole source and returns each offending text with its offset. */
  source?: (text: string) => readonly { index: number; text: string }[];
};

const isUi = (file: string) => file.startsWith("src/components/v4/");
const pageScrollerFiles = ["src/components/v4/ui/top-bar.module.css"];
const isExample = (file: string) =>
  file.startsWith("src/pages/design-system/") || file.startsWith("src/pages/v4/");
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

const destructiveLabel = /^\s*["'`](?:Delete|Remove|Revoke|Disable)\b/;
const destructiveIcon = /\bicon\s*:\s*["']trash["']/;

/** Entries of every rowActions or RowActions inline array literal that are destructive actions. */
export const destructiveInlineActions = (text: string) => {
  const found: { index: number; text: string }[] = [];
  [...text.matchAll(/\binline\s*(?::|=\{)\s*\[/g)].forEach((start) => {
    let depth = 0;
    let entry = -1;
    let index = (start.index ?? 0) + start[0].length;
    while (index < text.length && depth >= 0) {
      const char = text[index];
      if (char === '"' || char === "'" || char === "`") {
        let end = index + 1;
        while (end < text.length && text[end] !== char) end += text[end] === "\\" ? 2 : 1;
        index = end;
      } else if (char === "{" || char === "[" || char === "(") {
        if (depth === 0 && char === "{") entry = index;
        depth += 1;
      } else if (char === "}" || char === "]" || char === ")") {
        depth -= 1;
        if (depth === 0 && char === "}" && entry >= 0) {
          const body = text.slice(entry, index + 1);
          const label = body.match(
            /\blabel\s*:((?:(?!\b(?:icon|onSelect|disabledReason|hidden)\s*:)[\s\S])*)/
          );
          const labelText = label?.[1].replace(/^\s*\([^)]*\)\s*=>\s*/, "") ?? "";
          const destructive =
            destructiveLabel.test(labelText) ||
            /[?:]\s*["'`](?:Delete|Remove|Revoke|Disable)\b/.test(labelText) ||
            destructiveIcon.test(body);
          if (destructive) {
            const offset = label ? (label.index ?? 0) : body.search(destructiveIcon);
            found.push({ index: entry + offset, text: body.slice(offset).split("\n")[0].trim() });
          }
          entry = -1;
        }
      }
      index += 1;
    }
  });
  return found;
};

const jsxTagEnd = (text: string, from: number) => {
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < text.length && text[end] !== char) end += text[end] === "\\" ? 2 : 1;
      index = end;
    } else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return index;
  }
  return text.length;
};

/** Natively disabled Buttons inside a Tooltip or TooltipTrigger: they take no pointer or focus, so the tooltip never opens. */
export const disabledButtonsInTooltips = (text: string) => {
  const found = new Map<number, string>();
  [...text.matchAll(/<(Tooltip|TooltipTrigger)(?=[\s>])/g)].forEach((open) => {
    const start = jsxTagEnd(text, open.index ?? 0);
    if (text[start - 1] === "/") return;
    const close = text.indexOf(`</${open[1]}>`, start);
    if (close < 0) return;
    [...text.slice(start, close).matchAll(/<Button(?=[\s>])/g)].forEach((button) => {
      const at = start + (button.index ?? 0);
      const tag = text.slice(at, jsxTagEnd(text, at));
      if (/\sdisabled(?=[\s=/>]|$)/.test(tag) && !/\sdisabledReason\b/.test(tag))
        found.set(at, tag.split("\n")[0].trim());
    });
  });
  return [...found].map(([index, match]) => ({ index, text: match }));
};

const chevronGlyph =
  /\b(?:iconRight|icon|name)=(?:"chev-(?:down|ud)"|\{\s*["'`]chev-(?:down|ud)["'`]\s*\})|<(?:ChevronDown|ChevronsUpDown)\b|\{(?:ChevronDown|ChevronsUpDown)(?:Icon)?\}/;

/** Buttons with a chevron inside a PopoverTrigger or DropdownMenuTrigger that do not use layout="trigger", so their label and chevron center instead of sitting at the start and end. */
export const chevronTriggersWithoutLayout = (text: string) => {
  const found = new Map<number, string>();
  [...text.matchAll(/<(PopoverTrigger|DropdownMenuTrigger)(?=[\s>])/g)].forEach((open) => {
    const start = jsxTagEnd(text, open.index ?? 0);
    if (text[start - 1] === "/") return;
    const close = text.indexOf(`</${open[1]}>`, start);
    if (close < 0) return;
    [...text.slice(start, close).matchAll(/<Button(?=[\s>])/g)].forEach((button) => {
      const at = start + (button.index ?? 0);
      const tagEnd = jsxTagEnd(text, at);
      const tag = text.slice(at, tagEnd + 1);
      if (/\slayout=(?:"trigger"|\{\s*["'`]trigger["'`]\s*\})/.test(tag)) return;
      if (/\siconOnly\b/.test(tag) || /\ssize=(?:"icon|\{\s*["'`]icon)/.test(tag)) return;
      const bodyEnd = tag.endsWith("/>") ? tagEnd : text.indexOf("</Button>", tagEnd);
      const element = text.slice(at, bodyEnd < 0 ? tagEnd : bodyEnd);
      if (chevronGlyph.test(element)) found.set(at, tag.split("\n")[0].trim());
    });
  });
  return [...found].map(([index, match]) => ({ index, text: match }));
};

const framedParents = /<(Card|List|ApprovalQueue|DataTable|CodeBlock)(?=[\s>/])/g;
const framedChildren = /<(Card|List|ApprovalQueue)(?=[\s>/])/g;
const variantValue = /\svariant=(?:"(\w+)"|\{\s*["'`](\w+)["'`]\s*\})/;

const opensFrame = (name: string, tag: string) => {
  if (name === "DataTable" || name === "CodeBlock") return true;
  const variant = tag.match(variantValue);
  const value = variant?.[1] ?? variant?.[2];
  if (name === "Card") return value === "framed";
  return !/\svariant=/.test(tag) || value === "framed";
};

const elementEnd = (text: string, name: string, from: number) => {
  const tagEnd = jsxTagEnd(text, from);
  if (text[tagEnd - 1] === "/") return tagEnd;
  const tokens = new RegExp(`<${name}(?=[\\s>/])|</${name}>`, "g");
  tokens.lastIndex = tagEnd;
  let depth = 1;
  for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
    if (token[0].startsWith("</")) depth -= 1;
    else if (text[jsxTagEnd(text, token.index) - 1] !== "/") depth += 1;
    if (depth === 0) return token.index;
  }
  return text.length;
};

/** An explicit variant="framed" Card, List or ApprovalQueue written inside a framed Card, a framed List or ApprovalQueue, a DataTable or a CodeBlock. */
export const nestedFrames = (text: string) => {
  const found = new Map<number, string>();
  [...text.matchAll(framedParents)].forEach((open) => {
    const start = open.index ?? 0;
    if (!opensFrame(open[1], text.slice(start, jsxTagEnd(text, start)))) return;
    const region = text.slice(start + 1, elementEnd(text, open[1], start));
    [...region.matchAll(framedChildren)].forEach((child) => {
      const at = start + 1 + (child.index ?? 0);
      const tag = text.slice(at, jsxTagEnd(text, at));
      const variant = tag.match(variantValue);
      if ((variant?.[1] ?? variant?.[2]) === "framed") found.set(at, tag.split("\n")[0].trim());
    });
  });
  return [...found].map(([index, match]) => ({ index, text: match }));
};

const interactiveElement =
  /<(?:a|button|input|select|textarea|Button|Link|RowLink|CardLink|CopyButton|Checkbox|Switch)(?=[\s>/])|\son(?:Click|PointerDown|KeyDown)=/;

const attributeValue = (tag: string, name: string) => {
  const start = tag.search(new RegExp(`\\s${name}=\\{`));
  if (start < 0) return "";
  const open = tag.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < tag.length; index += 1) {
    if (tag[index] === "{") depth += 1;
    else if (tag[index] === "}") depth -= 1;
    if (depth === 0) return tag.slice(open + 1, index);
  }
  return tag.slice(open + 1);
};

/** Links, buttons, inputs and click handlers inside a Tooltip's content or a TooltipContent, which the pointer can never reach. */
export const interactiveTooltipContent = (text: string) => {
  const found: { index: number; text: string }[] = [];
  [...text.matchAll(/<(Tooltip|TooltipContent)(?=[\s>])/g)].forEach((open) => {
    const start = open.index ?? 0;
    const tagEnd = jsxTagEnd(text, start);
    const tag = text.slice(start, tagEnd + 1);
    const content =
      open[1] === "Tooltip"
        ? attributeValue(tag, "content")
        : text.slice(tagEnd + 1, Math.max(tagEnd + 1, text.indexOf("</TooltipContent>", tagEnd)));
    if (interactiveElement.test(content))
      found.push({ index: start, text: tag.split("\n")[0].trim() });
  });
  return found;
};

const flatHoverGround =
  /^background(?:-color)?\s*:\s*(?:var\(--v4-(?:tint|surface|inset|sidebar|line-soft|paper|pop|frame|select)(?:,[^)]*)?\)|#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*$/i;

/** A :hover rule that paints its own element with a flat ground instead of the shared hover overlay. */
export const flatHoverBackgrounds = (selector: string, body: string) => {
  const bare = selector.replace(/:not\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");
  if (!/:hover\b/.test(bare) || /::?(?:before|after)\b/.test(selector)) return [];
  if (
    /\[(?:aria-(?:pressed|current|selected)|data-(?:current|selected)|data-state="(?:on|active)")/.test(
      bare
    )
  )
    return [];
  return body
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => flatHoverGround.test(declaration));
};

const topLevelParts = (selector: string) => {
  const parts = [""];
  let depth = 0;
  [...selector].forEach((char) => {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) parts.push("");
    else parts[parts.length - 1] += char;
  });
  return parts.map((part) => part.trim()).filter(Boolean);
};
const namesLink = /(?:^|[\s>+~(])a(?=$|[\s.:#[>+~)])|\[href\b|:any-link\b|link/i;

/** cursor: pointer on a selector list with a part that does not name a link. */
export const pointerOutsideLinks = (selector: string, body: string) => {
  const declarations = [...body.matchAll(/(?:^|;|\n)\s*(cursor\s*:\s*pointer\b[^;]*)/g)];
  if (!declarations.length || topLevelParts(selector).every((part) => namesLink.test(part)))
    return [];
  return declarations.map((match) => match[1].trim());
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
    id: "theme-name-branch",
    rule: "theme-scheme",
    message:
      "Select light or dark by scheme, [data-scheme], not by theme name: a [data-theme] light or dark selector misses every other theme of that scheme.",
    appliesTo: isAuthored,
    css: [/\[data-theme=["']?(?:light|dark)["']?\]/g],
    markup: [/\[data-theme=["']?(?:light|dark)["']?\]/g]
  },
  {
    id: "line-on-edge",
    rule: "line-roles",
    message:
      "A four-sided border is a surface edge, so it takes line-soft. Keep line for a standalone rule that touches no other border.",
    appliesTo: isAuthored,
    css: [/(?:^|[;{\s])border(?:-color)?\s*:[^;{}]*var\(--v4-line\)/g],
    classString: (value) =>
      /(?:^|\s)border(?:-\d+)?(?=\s|$)/.test(value) &&
      value.includes("border-[color:var(--v4-line)]")
        ? ["border-[color:var(--v4-line)]"]
        : []
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
      "Icons come from the v4 set through the v4 Icon component, with Lucide only for glyphs the set lacks. Do not import another icon library.",
    appliesTo: isAuthored,
    markup: [
      /from\s+["'](?:react-icons[^"']*|@radix-ui\/react-icons|@heroicons\/[^"']+|@tabler\/icons[^"']*|@phosphor-icons\/[^"']+)["']/g
    ]
  },
  {
    id: "menu-row-margin",
    rule: "menu-spacing-model",
    message:
      "Menu rows, labels and rules never set an outer margin. The panel pads every side by --v4-menu-pad and a separator draws its own full-width rule.",
    appliesTo: (file) =>
      [
        "src/components/v4/ui/menu.module.css",
        "src/components/v4/ui/picker.module.css",
        "src/components/v4/ui/sidebar.module.css",
        "src/components/v4/v4.css"
      ].includes(file),
    cssBlock: (selector, body) => {
      const subject =
        /(?:^|[\s>+~,])(?:\.(?:row|label|separator|themeRow|userRow)|\[cmdk-(?:item|separator|group-heading)\]|\.v4-switcher-(?:header|footer))(?=[\s:[.,{]|$)/;
      const last = selector
        .split(",")
        .map(
          (part) =>
            part
              .trim()
              .split(/[\s>+~]+/)
              .pop() ?? ""
        )
        .some((part) => subject.test(` ${part.replace(/::?[\w-]+(\([^)]*\))?/g, "")}`));
      if (!last) return [];
      return [...body.matchAll(/(?:^|;|\n)\s*(margin(?:-[\w-]+)?\s*:\s*[^;]+)/g)]
        .map((match) => match[1].trim())
        .filter((declaration) => !/:\s*0(?:px)?\s*$/.test(declaration));
    }
  },
  {
    id: "overlay-section-padding",
    rule: "overlay-section-padding",
    message:
      "Dialog, AlertDialog and Sheet headers, bodies and footers pad every side by the one overlay pad. Use a single padding value.",
    appliesTo: (file) => file === "src/components/v4/v4.css",
    cssBlock: (selector, body) => {
      if (!/(?:dialog|sheet)-(?:header|footer|body|content)/.test(selector)) return [];
      return [...body.matchAll(/(?:^|;|\n)\s*(padding\s*:\s*([^;]+))/g)]
        .filter((match) => match[2].trim().split(/\s+(?![^(]*\))/).length > 1)
        .map((match) => match[1].trim());
    }
  },
  {
    id: "press-transform",
    rule: "press-keeps-box",
    message:
      "Pressing never moves or resizes a control box. Put press feedback on the [data-press] label, not a transform, translate or scale on the control.",
    appliesTo: (file) => isUi(file) && isCss(file),
    cssBlock: (selector, body) => {
      if (!/:active|\[aria-pressed|\[data-state="on"\]|\[data-pressed/.test(selector)) return [];
      if (/\[data-press\]\s*$/.test(selector.split(",").pop() ?? "")) return [];
      return [...body.matchAll(/(?:^|;|\n)\s*((?:transform|translate|scale)\s*:\s*[^;]+)/g)]
        .map((match) => match[1].trim())
        .filter((declaration) => !/:\s*none\s*$/.test(declaration));
    }
  },
  {
    id: "scroll-fade",
    rule: "scroll-edge-fade",
    message:
      "A v4 component scroll container takes the shared edge fade: add data-scroll-fade (y, x or both) to the element that scrolls, or mark the rule with a reason. Page and inset scrollers never fade.",
    appliesTo: (file) => isUi(file) && isCss(file),
    exempt: pageScrollerFiles,
    cssBlock: (_selector, body) =>
      [...body.matchAll(/(?:^|;|\n)\s*(overflow(?:-[xy])?\s*:\s*(?:auto|scroll)[^;]*)/g)].map(
        (match) => match[1].trim()
      )
  },
  {
    id: "left-accent-bar",
    rule: "no-left-accent-bars",
    message:
      "No left accent bar. Mark the state with a translucent tint over the whole row or surface plus a Badge or icon with text. Dividers and guides in line or line-soft are fine.",
    appliesTo: isAuthored,
    css: [
      /box-shadow\s*:\s*inset\s+(?!-|0(?:px)?\s)[^\s;]+\s+0(?:px)?\s+0(?:px)?\s/g,
      /border-(?:left|inline-start)(?:-color)?\s*:[^;]*var\(--v4-(?!line\b|size-|space-)[\w-]+\)/g
    ],
    markup: [/\bborder-[ls](?:-\d+)?-\[color:var\(--v4-(?!line\b)[\w-]+\)\]/g]
  },
  {
    id: "row-action-reveal",
    rule: "persistent-row-actions",
    message:
      "Row actions are persistent and live in the sticky actions column (DataTable rowActions, or TableActionsCell with RowActions). Nothing a hover or focus shows may change a cell's width or the row's layout.",
    appliesTo: isAuthored,
    markup: [
      /<TableRowActions\b[^>]*\breveal\b/g,
      /<TableRowIndicators\b[^>]*\bswap\b/g,
      /\bdata-(?:reveal|swap)\b/g
    ],
    cssBlock: (selector, body) => {
      if (!/:hover|:focus-within/.test(selector)) return [];
      if (!/(?:^|[\s>+~,(])(?:tr|td|th)\b|row|table|cell/i.test(selector)) return [];
      return [
        ...body.matchAll(
          /(?:^|;|\n)\s*((?:display|position|(?:min-|max-)?(?:width|inline-size)|flex(?:-basis)?|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|gap)\s*:\s*[^;]+)/g
        )
      ].map((match) => match[1].trim());
    }
  },
  {
    id: "row-action-destructive-inline",
    rule: "row-actions-destructive-in-more",
    message:
      "Delete, Remove, Revoke, Disable and other destructive row actions never sit in the inline actions. Put them last in the More menu, after a separator, with the destructive menu item variant.",
    appliesTo: isAuthored,
    source: destructiveInlineActions
  },
  {
    id: "disabled-in-tooltip",
    rule: "disabled-reason-tooltip",
    message:
      "A natively disabled Button gets no pointer or focus events, so a Tooltip around it never opens. Pass the reason as disabledReason, which keeps the Button focusable and shows the reason in its own tooltip.",
    appliesTo: isAuthored,
    source: disabledButtonsInTooltips
  },
  {
    id: "trigger-start-aligned",
    rule: "trigger-start-aligned",
    message:
      'A Button that opens a menu, popover or picker with a chevron uses layout="trigger": its label sits at the start and truncates and the chevron sits at the end, like SelectTrigger. Pass layout="trigger" and drop iconRight="chev-down" (the layout draws the chevron).',
    appliesTo: isAuthored,
    source: chevronTriggersWithoutLayout
  },
  {
    id: "nested-frame",
    rule: "no-nested-frames",
    message:
      'A framed container never renders inside another framed container. Remove variant="framed": inside a framed Card, List, DataTable or CodeBlock, a Card, List or ApprovalQueue drops to its frameless treatment on its own.',
    appliesTo: isMarkup,
    source: nestedFrames
  },
  {
    id: "interactive-tooltip",
    rule: "tooltip-pass-through",
    message:
      "A tooltip is pass-through: the pointer never reaches it and it closes when the pointer leaves the trigger, so a link, button, input or click handler inside it can never be used. Use HoverCard for content meant to be read, selected or copied, and Popover when it holds actions.",
    appliesTo: isMarkup,
    source: interactiveTooltipContent
  },
  {
    id: "flat-hover",
    rule: "translucent-hover",
    message:
      "Hover grounds use the shared overlay: background var(--v4-hover) (var(--v4-press) while pressed), translucent ink that lands on whatever sits underneath. Never paint a hovered element with a flat ground such as tint, surface or a literal color; where an opaque fill is needed, mix ink at var(--v4-hover-mix) into that ground in srgb.",
    appliesTo: isCss,
    cssBlock: flatHoverBackgrounds
  },
  {
    id: "dot-separator",
    rule: "no-dot-separators",
    message: "Separate details with words or layout, not a middle dot or bullet.",
    appliesTo: isAuthored,
    markup: [/\s[·•]\s/g]
  },
  {
    id: "slash-separator",
    rule: "breadcrumb-divider",
    message:
      "Breadcrumb draws its own vertical divider between crumbs from the crumb-divider tokens. Do not type a slash between crumbs.",
    appliesTo: isAuthored,
    markup: [/^\s*\/\s*$/g, /(?<!<code)>\s*\/\s*</g],
    css: [/content\s*:\s*["']\/["']/g]
  },
  {
    id: "cursor-pointer",
    rule: "pointer-cursor-for-links",
    message:
      "Only links take the pointer cursor: a selector that names an anchor (a, [href], :any-link) or a link by name (.link, .rowLink, [data-row-link]). Buttons, triggers, menu and sidebar items, tabs, toggles and other styled controls keep the default cursor. An unstyled text button that reads as a link takes v4-check-ignore cursor-pointer with that reason.",
    appliesTo: isAuthored,
    cssBlock: pointerOutsideLinks,
    source: (text) => [
      ...classStringLiterals(text).flatMap(({ value, index }) =>
        value
          .split(/\s+/)
          .filter((token) => splitVariant(token).utility === "cursor-pointer")
          .map((token) => ({ index, text: token }))
      ),
      ...[...text.matchAll(/\bcursor\s*[:=]\s*\{?[^,;}\n]*?["'`]pointer["'`]/g)].map((match) => ({
        index: match.index ?? 0,
        text: match[0]
      }))
    ]
  },
  {
    id: "suspense-fallback",
    rule: "page-loading",
    message:
      "A Suspense fallback is a Loader (size page for a page or a lazy page chunk) or Skeleton shapes for a known layout. Never a Spinner, bare status text or null.",
    appliesTo: isAuthored,
    markup: [/\bfallback=\{\s*(?:null\b|<(?!Loader\b|Skeleton\b)[\w.]+|["'`])/g]
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
      const block = check.cssBlock;
      if (block && isCss(file))
        return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match) => {
          const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
          if (selector.startsWith("@")) return [];
          const line = text.slice(0, (match.index ?? 0) + match[0].indexOf("{")).split("\n").length;
          const markedRule = [...match[1].matchAll(new RegExp(ignoreMarker, "g"))].some(
            (marker) => marker[1] === check.id
          );
          if (markedRule || exemptLine(line, check.id)) return [];
          return block(selector, match[2]).map((found) => ({
            check: check.id,
            file,
            line,
            text: found
          }));
        });
      const whole = check.source;
      if (whole && isMarkup(file))
        return whole(text).flatMap(({ index, text: match }) => {
          const line = text.slice(0, index).split("\n").length;
          if (exemptLine(line, check.id)) return [];
          return [{ check: check.id, file, line, text: match }];
        });
      const judge = check.classString;
      if (judge && isMarkup(file))
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
const scanRoots = ["src/components/v4", "src/pages/design-system", "src/pages/v4"];
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
