import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Input } from "@app/components/v4/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import { resolveColorToken } from "./foundation-data";

type Mode = "light" | "dark";
type Family = Record<"accent" | "accent-2" | "accent-wash" | "accent-line", string>;
export type AccentChoice = { light: string; dark: string };

export const accentPresets = [
  {
    id: "vlad",
    name: "Current (Vlad)",
    light: resolveColorToken("accent", "light").toLowerCase(),
    dark: resolveColorToken("accent", "dark").toLowerCase()
  },
  // v4-check-ignore raw-color -- workbench preset under comparison, not a token
  { id: "jadden", name: "Jadden", light: "#f0f707", dark: "#f0f707" },
  // v4-check-ignore raw-color -- workbench preset under comparison, not a token
  { id: "bright", name: "Bright", light: "#f7fe62", dark: "#f7fe62" }
] as const;

const hexRe = /^#?([0-9a-f]{6})$/i;
export const normalizeHex = (value: string) => {
  const match = hexRe.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

const toOklch = (hex: string) => {
  const [r, g, b] = rgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
};

const fromOklch = ({ L, C, h }: { L: number; C: number; h: number }) => {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  return `#${channels
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

const canonical = (name: string, mode: Mode) => resolveColorToken(name, mode).toLowerCase();

const deriveFamily = (base: string, mode: Mode): Family => {
  const reference = toOklch(canonical("accent", mode));
  const chosen = toOklch(base);
  const derive = (name: keyof Family) => {
    if (name === "accent") return base;
    const target = toOklch(canonical(name, mode));
    return fromOklch({
      L: Math.min(1, Math.max(0, chosen.L + (target.L - reference.L))),
      C: reference.C ? chosen.C * (target.C / reference.C) : target.C,
      h: chosen.h + (target.h - reference.h)
    });
  };
  return {
    accent: base,
    "accent-2": derive("accent-2"),
    "accent-wash": derive("accent-wash"),
    "accent-line": derive("accent-line")
  };
};

const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const isCanonical = (choice: AccentChoice) =>
  choice.light === canonical("accent", "light") && choice.dark === canonical("accent", "dark");

const overrideCss = (choice: AccentChoice) =>
  (["light", "dark"] as const)
    .map((mode) => {
      const family = deriveFamily(choice[mode], mode);
      const declarations = Object.entries(family)
        .map(([name, value]) => `--v4-${name}: ${value};`)
        .concat(mode === "dark" ? [`--v4-mark: ${family.accent};`] : [])
        .join(" ");
      return `.v4.v4[data-theme="${mode}"] { ${declarations} }`;
    })
    .join("\n");

const readInitial = (): AccentChoice | null => {
  try {
    const fromUrl = normalizeHex(new URLSearchParams(window.location.search).get("accent") ?? "");
    if (fromUrl) return { light: fromUrl, dark: fromUrl };
    const stored = window.localStorage.getItem("v4-accent");
    return stored ? (JSON.parse(stored) as AccentChoice) : null;
  } catch {
    return null;
  }
};

const persist = (choice: AccentChoice | null) => {
  const url = new URL(window.location.href);
  try {
    if (choice) window.localStorage.setItem("v4-accent", JSON.stringify(choice));
    else window.localStorage.removeItem("v4-accent");
  } catch {
    // Storage is unavailable; the URL still carries the choice.
  }
  if (choice && !isCanonical(choice)) url.searchParams.set("accent", choice.light.slice(1));
  else url.searchParams.delete("accent");
  window.history.replaceState(window.history.state, "", url);
};

const AccentPanelContext = createContext<{ open: () => void; choice: AccentChoice } | null>(null);

export const useAccentPanel = () => useContext(AccentPanelContext);

export const AccentPanelButton = ({ children = "Compare accents" }: { children?: ReactNode }) => {
  const panel = useAccentPanel();
  if (!panel) return null;
  return (
    <Button type="button" variant="outline" size="sm" onClick={panel.open}>
      {children}
    </Button>
  );
};

const ratio = (value: number) => `${value.toFixed(2)}:1`;

const Readout = ({ choice }: { choice: AccentChoice }) => (
  <table className="w-full text-left text-xs">
    <thead>
      <tr className="text-muted-foreground">
        <th className="py-1 font-medium">Theme</th>
        <th className="py-1 font-medium">Fill on surface</th>
        <th className="py-1 font-medium">Fill on paper</th>
        <th className="py-1 font-medium">Line on surface</th>
        <th className="py-1 font-medium">Ink on fill</th>
      </tr>
    </thead>
    <tbody>
      {(["light", "dark"] as const).map((mode) => {
        const family = deriveFamily(choice[mode], mode);
        return (
          <tr key={mode}>
            <td className="py-1">{mode === "light" ? "Light" : "Dark"}</td>
            <td className="py-1 font-mono">
              {ratio(contrast(family.accent, canonical("surface", mode)))}
            </td>
            <td className="py-1 font-mono">
              {ratio(contrast(family.accent, canonical("paper", mode)))}
            </td>
            <td className="py-1 font-mono">
              {ratio(contrast(family["accent-line"], canonical("surface", mode)))}
            </td>
            <td className="py-1 font-mono">
              {ratio(contrast(canonical("on-accent", mode), family.accent))}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

export const AccentPanelProvider = ({ children }: { children: ReactNode }) => {
  const reset = useMemo(
    () => ({ light: canonical("accent", "light"), dark: canonical("accent", "dark") }),
    []
  );
  const [choice, setChoice] = useState<AccentChoice>(() => readInitial() ?? reset);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    persist(isCanonical(choice) ? null : choice);
  }, [choice]);
  const css = isCanonical(choice) ? "" : overrideCss(choice);
  const custom = normalizeHex(draft);
  const value = useMemo(() => ({ open: () => setOpen(true), choice }), [choice]);
  return (
    <AccentPanelContext.Provider value={value}>
      {css && <style data-accent-override>{css}</style>}
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Accent</SheetTitle>
            <SheetDescription>
              Workbench only. Picks a base and derives accent-2, accent-wash and accent-line from
              how today&apos;s tokens relate to it. On-accent stays ink.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-6 px-4 pb-6">
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Accent presets">
              {accentPresets.map((preset) => {
                const selected = preset.light === choice.light && preset.dark === choice.dark;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setChoice({ light: preset.light, dark: preset.dark })}
                    className={`flex items-center gap-3 border p-2 text-left text-sm ${selected ? "border-foreground" : "border-border"}`}
                  >
                    <span className="flex">
                      <span className="size-6" style={{ background: preset.light }} />
                      <span className="size-6" style={{ background: preset.dark }} />
                    </span>
                    <span className="flex-1">{preset.name}</span>
                    <code className="text-muted-foreground text-xs">
                      {preset.light === preset.dark
                        ? preset.light
                        : `${preset.light} / ${preset.dark}`}
                    </code>
                  </button>
                );
              })}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (custom) setChoice({ light: custom, dark: custom });
              }}
            >
              <div className="flex-1">
                <p id="accent-hex-label" className="mb-1 text-xs font-medium">
                  Custom hex
                </p>
                <Input
                  aria-labelledby="accent-hex-label"
                  mono
                  placeholder="f0f707"
                  value={draft}
                  invalid={draft !== "" && !custom}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={!custom}>
                Apply
              </Button>
            </form>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium">Contrast for the current choice</p>
              <Readout choice={choice} />
              <p className="text-muted-foreground text-xs leading-5">
                In light, the fill sits close to the ground, so its edge comes from accent-line.
                Read the line column for that edge.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium">Presets</p>
              {accentPresets.map((preset) => (
                <div key={preset.id}>
                  <p className="text-muted-foreground mb-1 text-xs">{preset.name}</p>
                  <Readout choice={preset} />
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isCanonical(choice)}
              onClick={() => {
                setDraft("");
                setChoice(reset);
              }}
            >
              Reset to tokens
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AccentPanelContext.Provider>
  );
};
