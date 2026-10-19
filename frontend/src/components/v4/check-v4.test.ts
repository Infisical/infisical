import { describe, expect, it } from "vitest";

import {
  compareToBaseline,
  readBaseline,
  scanSource,
  scanTree,
  v4Checks
} from "../../../scripts/check-v4";
import sharedRules from "./skills/infisical-ui/rules.json";

const ui = "src/components/v4/ui/sample.tsx";
const css = "src/components/v4/ui/sample.module.css";
const example = "src/pages/design-system/examples/sample/default.tsx";

const checksIn = (file: string, text: string) =>
  scanSource(file, text).map((finding) => finding.check);

const cases: Record<string, { bad: [string, string][]; good: [string, string][] }> = {
  "raw-color": {
    bad: [
      [css, ".face { color: #fbfbf9; }"],
      [css, ".face { background: rgba(0, 0, 0, 0.1); }"],
      [ui, '<div className="bg-black/10 text-zinc-500" />']
    ],
    good: [
      [css, ".face { color: var(--v4-ink); }"],
      [ui, '<div className="bg-background text-muted-foreground" />'],
      [ui, '<a href="#colors">Colors</a>']
    ]
  },
  "bare-border": {
    bad: [
      [ui, '<div className="flex items-center rounded-lg border" />'],
      [ui, 'cn("-mx-4 border-t bg-muted/50", className)'],
      [ui, '<tr className="data-[state=open]:border-b p-2" />'],
      [ui, '<div className="border-2 p-2" />'],
      [ui, '<div className="border-l-4 bg-muted" />'],
      [ui, '<div className="border-[1.5px] border-dashed" />'],
      [ui, '<div className="!border p-2" />'],
      [ui, '<div className="focus:border-input border" />'],
      [
        ui,
        'cn(\n  "has-[>[data-slot=field]]:border has-data-[state=checked]:border-[color:var(--v4-ink)]"\n)'
      ],
      [ui, 'const item = cva("rounded-lg", { variants: { tone: { plain: "border" } } });'],
      [ui, 'cn("shrink-0", { "w-0 border-[1.5px]": dashed })']
    ],
    good: [
      [ui, '<div className="rounded-lg border border-[color:var(--v4-line)]" />'],
      [ui, '<div className="border-t border-t-transparent" />'],
      [ui, '<div className="border-input border" />'],
      [ui, '<div className="border-b-0" />'],
      [ui, '<div className="border-2 border-(--color-border)" />'],
      [ui, '<div className="focus:border focus:border-input" />'],
      [ui, 'const hint = "remove border";'],
      [ui, "<p>Use a border only when the panel needs one.</p>"],
      [ui, 'label("Add a border around unrelated actions.")']
    ]
  },
  "decorative-effect": {
    bad: [
      [ui, '<div className="shadow-md" />'],
      [ui, '<div className="backdrop-blur-xs" />'],
      [css, ".scrim { backdrop-filter: blur(4px); }"]
    ],
    good: [[ui, '<div className="shadow-pop" />']]
  },
  "transition-all": {
    bad: [
      [ui, '<button className="transition-all" />'],
      [css, ".row { transition: all 120ms; }"]
    ],
    good: [[ui, '<button className="transition-colors" />']]
  },
  "motion-literal": {
    bad: [
      [css, ".row { transition: height 200ms cubic-bezier(0.2, 0, 0, 1); }"],
      [css, ".glow { transition: box-shadow var(--v4-duration-moderate) ease-in-out; }"],
      [css, "    width 180ms,"],
      [css, ".dot { animation-delay: -0.6s; }"],
      [ui, '<div className="transition-colors duration-200 ease-out" />'],
      [ui, '<div className="delay-150" />'],
      [ui, '<div className="ease-[cubic-bezier(0.22,1,0.36,1)]" />'],
      [ui, '<div style={{ transition: "opacity 150ms" }} />'],
      [ui, '<div className="duration-[250ms] delay-[40ms]" />'],
      [ui, '<div style={{ transitionTimingFunction: "linear" }} />'],
      [css, ".v4 { --tw-duration: 150ms; }"]
    ],
    good: [
      [css, ".row { transition: height var(--v4-duration-moderate) var(--v4-ease-standard); }"],
      [css, ".row { transition-duration: 0ms; }"],
      [css, ".inner { transition: overflow 0s var(--v4-duration-moderate); }"],
      [css, ".face { background-image: linear-gradient(180deg, var(--v4-a), var(--v4-b)); }"],
      [css, ".bar { animation: none; }"],
      [ui, '<div className="duration-(--v4-duration-fast) ease-(--v4-ease-fade)" />'],
      [ui, '<div style={{ transitionDuration: "0ms" }} />'],
      [ui, '<div style={{ transitionTimingFunction: "var(--v4-ease-fade)" }} />']
    ]
  },
  "arbitrary-geometry": {
    bad: [
      [ui, '<div className="max-w-[440px]" />'],
      [example, '<div className="rounded-[10px] px-[13px]" />']
    ],
    good: [
      [ui, '<div className="max-w-sm px-3" />'],
      [ui, '<div className="[&_svg]:size-4" />']
    ]
  },
  "icon-source": {
    bad: [
      [ui, 'import { XIcon } from "@radix-ui/react-icons";'],
      [ui, 'import { iconShapes } from "../assets/icons-legacy/icon-data.legacy";']
    ],
    good: [
      [ui, 'import { Icon } from "./icon";'],
      [ui, 'import { XIcon } from "lucide-react";']
    ]
  },
  "dot-separator": {
    bad: [[example, "<span>Primary · alias of default</span>"]],
    good: [[example, "<span>Primary, alias of default</span>"]]
  }
};

describe("v4 lint checks", () => {
  it("covers every check with fixtures", () => {
    expect(Object.keys(cases).sort()).toEqual(v4Checks.map((check) => check.id).sort());
  });

  Object.entries(cases).forEach(([id, { bad, good }]) => {
    it(`${id} flags its bad fixtures`, () => {
      bad.forEach(([file, text]) => expect(checksIn(file, text)).toContain(id));
    });
    it(`${id} passes its good fixtures`, () => {
      good.forEach(([file, text]) => expect(checksIn(file, text)).not.toContain(id));
    });
  });

  it("exempts a line under a v4-check-ignore marker that gives a reason", () => {
    const marked =
      "// v4-check-ignore raw-color -- matches a library attribute\n\"[stroke='#ccc']\"";
    const unexplained = "// v4-check-ignore raw-color\n\"[stroke='#ccc']\"";
    expect(checksIn(ui, marked)).not.toContain("raw-color");
    expect(checksIn(ui, unexplained)).toContain("raw-color");
  });

  it("finds nothing above the recorded baseline in the v4 tree", () => {
    const baseline = readBaseline();
    expect(baseline).toBeDefined();
    const { grown } = compareToBaseline(scanTree(), baseline ?? {});
    expect(grown.map((finding) => `${finding.file}:${finding.line} ${finding.check}`)).toEqual([]);
  });

  it("names a shared rule that names it back", () => {
    const linted = new Map(
      sharedRules.rules.flatMap((rule) =>
        rule.detect.by === "lint" && "check" in rule.detect ? [[rule.detect.check, rule.id]] : []
      )
    );
    v4Checks.forEach((check) => expect(linted.get(check.id)).toBe(check.rule));
  });
});
