import { useLayoutEffect, useRef, useState } from "react";

import { componentCatalog } from "@app/components/v4/catalog";
import required from "@app/components/v4/required-capabilities.json";
import { V4Scope } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Input } from "@app/components/v4/ui/input";

import { AccentPanelButton, useAccentPanel } from "./accent-panel";
import { DocDisclosure, DocSection, PageHeading, PreviewFrame } from "./doc-parts";
import {
  type ColorMode,
  resolveColorToken,
  resolveSpacingToken,
  tokens,
  typeSpecimenStyle,
  typographyStyles
} from "./foundation-data";
import { hasComponentPreview } from "./navigation";

const requiredFamilies = required.components.filter((entry) => entry.kind !== "pattern");
const patterns = required.components.filter((entry) => entry.kind === "pattern");
const exampleCount = componentCatalog.reduce((count, entry) => count + entry.examples.length, 0);
const inventoryLabel = (id: string, kind: string) => {
  if (!hasComponentPreview(id)) return "Documentation pending";
  return kind === "pattern" ? "Composed pattern" : "Executable examples";
};

const foundationLinks = [
  { href: "#colors", title: "Color", description: "Warm neutrals, neon lime and semantic pairs." },
  {
    href: "#typography",
    title: "Typography",
    description: "Archivo for the interface. Geist Mono for technical values."
  },
  {
    href: "#spacing-shape",
    title: "Spacing and shape",
    description: "Compact controls, shared spacing and square corners."
  }
];

export const OverviewPage = () => (
  <div>
    <PageHeading title="Infisical design system" />
    <div
      className="flex min-h-56 flex-col justify-between gap-10 p-6 sm:p-8"
      style={{ backgroundColor: "var(--v4-accent)", color: "var(--v4-on-accent)" }}
    >
      <p style={typeSpecimenStyle("title-lg")}>Infisical</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p style={typeSpecimenStyle("title")}>
          Secrets, certificates
          <br />
          and access.
        </p>
        <code className="text-xs">Archivo / Geist Mono</code>
      </div>
    </div>
    <div className="mt-6 divide-y divide-border border-y border-border">
      {foundationLinks.map((page) => (
        <a
          key={page.href}
          href={page.href}
          className="group flex flex-col gap-1 py-4 hover:underline"
        >
          <span className="text-sm font-medium">{page.title}</span>
          <span className="text-muted-foreground text-sm">{page.description}</span>
        </a>
      ))}
    </div>
    <DocSection title="Ink for the main action, lime for approvals.">
      <PreviewFrame>
        <Button asChild>
          <a href="#button">Explore Button</a>
        </Button>
        <Button asChild variant="outline">
          <a href="#rules">Read the rules</a>
        </Button>
        <Button variant="accent">Grant for 1 hour</Button>
        <span
          className="px-2 py-1 text-sm font-medium"
          style={{ backgroundColor: "var(--v4-accent)", color: "var(--v4-on-accent)" }}
        >
          {exampleCount} examples
        </span>
      </PreviewFrame>
      <p className="text-muted-foreground mt-4 text-sm leading-6">
        Primary (the default) is the ink fill for the one main action in a view or dialog. Accent is
        the lime finish for approval and grant moments only, never a second primary. Use outline or
        ghost for supporting actions. Menus and row selection keep their neutral interaction fills.
      </p>
    </DocSection>
    <DocDisclosure title="Foundation scope">
      <p className="text-muted-foreground text-sm leading-6">
        {requiredFamilies.length} component families and {patterns.length} composed patterns define
        the foundation. The catalog has {exampleCount} executable examples, with shared text and
        layout helpers counted separately. Inventory coverage and verification are separate. Product
        pages continue to use v3.
      </p>
      <dl className="mt-5 divide-y divide-border border-y border-border text-sm leading-6">
        <div className="py-4">
          <dt className="font-medium">Sensitive editor and editable DataGrid</dt>
          <dd className="text-muted-foreground mt-1">
            <a href="#sensitive-editor" className="underline">
              Edit and reveal synthetic values
            </a>{" "}
            or{" "}
            <a href="#data-grid" className="underline">
              inspect the editable grid
            </a>
            . These examples use local data. Agent view provides their implementation contracts.
          </dd>
        </div>
        <div className="py-4">
          <dt className="font-medium">Motion</dt>
          <dd className="text-muted-foreground mt-1">
            Read the{" "}
            <a href="#motion" className="underline">
              motion
            </a>{" "}
            contract. These are foundation guidance, separate from installable components.
          </dd>
        </div>
      </dl>
      <details className="mt-4 border-y border-border py-4">
        <summary className="cursor-pointer text-sm font-medium">View component inventory</summary>
        <ul className="mt-4 divide-y divide-border">
          {required.components.map(({ id: name, name: title, kind }) => (
            <li
              key={name}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              {hasComponentPreview(name) ? (
                <a href={`#${name}`} className="underline underline-offset-4">
                  {title}
                </a>
              ) : (
                <span>{title}</span>
              )}
              <span className="text-muted-foreground text-xs">{inventoryLabel(name, kind)}</span>
            </li>
          ))}
        </ul>
      </details>
    </DocDisclosure>
  </div>
);

const colorRoles = [
  {
    name: "surface",
    label: "Surface",
    utility: "bg-background",
    description: "The page and content ground."
  },
  {
    name: "tint",
    label: "Muted surface",
    utility: "bg-muted",
    description: "A neutral layer for grouped content."
  },
  {
    name: "select",
    label: "Selection",
    utility: "bg-accent",
    description: "Selected and hovered content, without brand color."
  },
  {
    name: "ink",
    label: "Primary text",
    utility: "text-foreground",
    description: "Text, icons, the global primary role and the primary Button fill."
  },
  {
    name: "muted",
    label: "Secondary text",
    utility: "text-muted-foreground",
    description: "Supporting copy that still needs to be read."
  },
  {
    name: "line",
    label: "Border",
    utility: "border-border",
    description: "Separate surfaces when spacing is not enough."
  }
];

const ColorSwatch = ({ name, mode }: { name: string; mode: ColorMode }) => {
  const value = resolveColorToken(name, mode);
  return (
    <div className="min-w-0">
      <div className="h-16 border border-border" style={{ backgroundColor: value }} />
      <p className="text-muted-foreground mt-2 text-xs">
        {mode === "light" ? "Light" : "Dark"} <code>{value}</code>
      </p>
    </div>
  );
};

const LiveValue = ({ name }: { name: string }) => {
  const panel = useAccentPanel();
  const ref = useRef<HTMLElement>(null);
  const [value, setValue] = useState("");
  useLayoutEffect(() => {
    if (ref.current)
      setValue(getComputedStyle(ref.current).getPropertyValue(`--v4-${name}`).trim());
  }, [name, panel?.choice]);
  return (
    <code ref={ref} className="block">
      {name} {value}
    </code>
  );
};

const LivePair = ({
  mode,
  background,
  foreground
}: {
  mode: "light" | "dark";
  background: string;
  foreground: string;
}) => (
  <V4Scope theme={mode}>
    <div
      className="flex min-h-32 flex-col justify-between gap-5 p-4"
      style={{
        backgroundColor: `var(--v4-${background})`,
        color: `var(--v4-${foreground})`
      }}
    >
      <p className="text-sm font-medium">{mode === "light" ? "Light" : "Dark"}</p>
      <div className="text-xs leading-5">
        <LiveValue name={background} />
        <LiveValue name={foreground} />
      </div>
    </div>
  </V4Scope>
);

const AccentSwatch = ({ mode }: { mode: "light" | "dark" }) => {
  const panel = useAccentPanel();
  return (
    <V4Scope theme={mode}>
      <div
        className="flex min-h-40 flex-col justify-between gap-6 p-5"
        style={{ backgroundColor: "var(--v4-accent)", color: "var(--v4-on-accent)" }}
      >
        <p className="text-sm font-medium">{mode === "light" ? "Light" : "Dark"} neon lime</p>
        <div>
          <p style={typeSpecimenStyle("title-lg")}>Infisical</p>
          <code className="mt-2 block text-xs">
            {panel?.choice[mode] ?? resolveColorToken("accent", mode)}
          </code>
        </div>
      </div>
    </V4Scope>
  );
};

export const ColorPage = () => (
  <div>
    <PageHeading title="Color" />
    <div className="mb-4 flex items-center justify-between gap-4">
      <p className="text-muted-foreground text-sm leading-6">
        Compare accents opens a workbench-only picker (also in the dock and on the Button page). It
        overrides the accent family for this page and keeps the choice in the URL, so a link
        reproduces the view. The canonical tokens do not change.
      </p>
      <AccentPanelButton />
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(["light", "dark"] as const).map((mode) => (
        <AccentSwatch key={mode} mode={mode} />
      ))}
    </div>
    <p className="text-muted-foreground mt-4 text-sm leading-6">
      Use lime as a fill with <code>on-accent</code> ink. Do not use the light lime value as text on
      a light surface. For a text or icon accent, <code>--v4-accent-fg</code> resolves to ink in
      light mode and lime in dark mode.
    </p>
    <DocDisclosure title="Brand accent and neutral accent">
      <div className="space-y-4 text-sm leading-6">
        <p>
          <code>--v4-accent</code> is the neon brand fill. Its foreground is{" "}
          <code>--v4-on-accent</code>.
        </p>
        <p>
          <code>bg-accent</code> is the shadcn semantic role for a neutral interaction surface. It
          maps to the source <code>select</code> token, not the neon brand color. Keep these roles
          separate.
        </p>
        <p>
          The primary Button is ink; only the accent Button uses the lime material, for approval and
          grant moments. Changing the accent does not recolor checked controls or selected rows.
        </p>
      </div>
    </DocDisclosure>
    <DocSection title="Brand interaction pairs">
      <p className="text-muted-foreground mb-4 text-sm leading-6">
        The existing hover fill uses on-accent ink. The quieter accent wash uses primary ink. These
        specimens show source pairs, not additional button variants.
      </p>
      <div className="space-y-5">
        {[
          { background: "accent-2", foreground: "on-accent", label: "Hover and pressed fill" },
          { background: "accent-wash", foreground: "ink", label: "Accent wash" }
        ].map((pair) => (
          <div key={pair.background}>
            <h3 className="mb-3 text-sm font-medium">{pair.label}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["light", "dark"] as const).map((mode) => (
                <LivePair key={mode} mode={mode} {...pair} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </DocSection>
    <DocSection title="Neutral roles">
      <div className="divide-y divide-border border-t border-border">
        {colorRoles.map((role) => (
          <div key={role.name} className="grid gap-4 py-5 sm:grid-cols-[1fr_1fr]">
            <div>
              <h3 className="text-sm font-medium">{role.label}</h3>
              <code className="text-muted-foreground mt-1 block text-xs">{role.utility}</code>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{role.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ColorSwatch name={role.name} mode="light" />
              <ColorSwatch name={role.name} mode="dark" />
            </div>
          </div>
        ))}
      </div>
    </DocSection>
    <DocDisclosure title="Contrast limits">
      <p className="text-muted-foreground text-sm leading-6">
        The source faint role is reserved for inactive content, not ordinary copy. Current
        control-border pairs are below 3:1 in both themes. Labels, focus indicators and rendered
        component boundaries still need their own contrast checks; this palette is not a completed
        accessibility audit.
      </p>
    </DocDisclosure>
    <DocSection title="Status needs a name">
      <p className="text-muted-foreground mb-4 text-sm leading-6">
        Use a status color with a word or recognizable icon. A colored border by itself does not
        explain what happened.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          { name: "ok", label: "Success" },
          { name: "warn", label: "Warning" },
          { name: "bad", label: "Error" },
          { name: "info", label: "Information" }
        ].map((role) => (
          <div key={role.name}>
            <h3 className="mb-3 text-sm font-medium">
              {role.label} <code className="text-muted-foreground">{role.name}</code>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <ColorSwatch name={role.name} mode="light" />
              <ColorSwatch name={role.name} mode="dark" />
            </div>
          </div>
        ))}
      </div>
    </DocSection>
  </div>
);

export const TypographyPage = () => (
  <div>
    <PageHeading title="Typography" />
    <div className="border border-border p-6 sm:p-8">
      <p style={typeSpecimenStyle("title-lg")}>Production access</p>
      <p className="text-muted-foreground mt-4" style={typeSpecimenStyle("body")}>
        Review who can read credentials in this environment.
      </p>
      <code className="mt-6 block break-all" style={typeSpecimenStyle("mono")}>
        /production/payments/api_key
      </code>
    </div>
    <DocSection title="The type scale">
      <p className="text-muted-foreground mb-4 text-sm leading-6">
        These specimens read their sizes, weights, line heights and font families directly from{" "}
        <code>tokens.json</code>. The small eyebrow specimen is an existing source role, not a
        reason to add uppercase labels elsewhere.
      </p>
      <div className="divide-y divide-border border-t border-border">
        {typographyStyles.map((style) => (
          <div key={style.name} className="py-6">
            <div className="text-muted-foreground mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <code>{style.name}</code>
              <span>
                {style.fontSize} / {style.lineHeight} / {style.fontWeight}
              </span>
            </div>
            <p className="break-words" style={typeSpecimenStyle(style.name)}>
              {style.sample}
            </p>
            <p className="text-muted-foreground mt-3 max-w-prose text-sm leading-6">
              {style.usage}
            </p>
          </div>
        ))}
      </div>
    </DocSection>
    <DocDisclosure title="Choose a role before a size">
      <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm leading-6">
        <li>Keep one page title. Use descending heading levels for sections.</li>
        <li>
          Use the interface face for prose and labels. Keep monospace for code, commands, paths and
          literal values.
        </li>
        <li>
          Wrap descriptions. If a technical value must truncate, keep the full value available.
        </li>
        <li>Keep field labels visible. A placeholder is only an example.</li>
      </ul>
    </DocDisclosure>
  </div>
);

export const SpacingShapePage = () => (
  <div>
    <PageHeading title="Spacing and shape" />
    <PreviewFrame label="Control heights">
      <div className="flex w-full flex-wrap items-end gap-6">
        {(
          [
            { size: "sm", token: "sm" },
            { size: "md", token: "md" },
            { size: "lg", token: "lg" }
          ] as const
        ).map((control) => (
          <div key={control.size} className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <Input
                size={control.size}
                defaultValue="staging"
                aria-label={`${control.token} field`}
              />
              <Button type="button" size={control.size}>
                Save
              </Button>
            </div>
            <p className="text-muted-foreground font-mono text-xs">
              {
                tokens.size.tokens.find((token) => token.name === `size-control-${control.token}`)
                  ?.value
              }
            </p>
          </div>
        ))}
      </div>
    </PreviewFrame>
    <DocSection title="Spacing steps">
      <p className="text-muted-foreground mb-4 text-sm leading-6">
        This source scale describes intended spacing roles. Use component props for implemented
        sizes; do not force padding through caller classes.
      </p>
      <div className="divide-y divide-border border-t border-border">
        {tokens.spacing.tokens.map((space) => (
          <div key={space.name} className="grid grid-cols-[5rem_1fr] gap-4 py-3">
            <div>
              <code className="text-xs">{space.name}</code>
              <p className="text-muted-foreground mt-1 text-xs">{space.value}</p>
            </div>
            <div>
              <div
                className="mb-2 h-3"
                style={{
                  width: resolveSpacingToken(space.name),
                  backgroundColor: "var(--v4-accent)"
                }}
              />
              <p className="text-muted-foreground text-sm leading-6">{space.usage}</p>
            </div>
          </div>
        ))}
      </div>
    </DocSection>
    <DocSection title="Source radius scale">
      <p className="text-muted-foreground mb-4 text-sm leading-6">
        Square corners are the default across the workbench and its portals: the corner multiplier
        is <code>0</code>. The soft scale below is an available mode; switch it on with the corners
        control in the dock, or with <code>corners=&quot;soft&quot;</code> on V4Scope. Each specimen
        shows its soft radius; controls stay compact rather than becoming pills.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {tokens.radius.tokens.map((radius) => (
          <div key={radius.name} className="border border-border p-4">
            <div className="mb-4 flex gap-4">
              <div
                className="border-input h-12 w-16 border bg-muted"
                style={{ borderRadius: radius.value }}
              />
            </div>
            <code className="text-xs">{radius.name}</code>
            <p className="text-muted-foreground mt-1 text-xs">Soft {radius.value}</p>
            <p className="text-muted-foreground mt-2 text-sm leading-6">{radius.usage}</p>
          </div>
        ))}
      </div>
    </DocSection>
  </div>
);
