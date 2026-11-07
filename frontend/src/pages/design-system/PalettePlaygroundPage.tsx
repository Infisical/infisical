import { type ReactNode, useEffect, useMemo, useState } from "react";

import { v4Themes } from "@app/components/v4/lib/theme-registry";
import { v4ThemedValue } from "@app/components/v4/lib/themes";
import { V4Scope, useV4Theme } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn, EnvMark } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Sidebar, type SidebarProps } from "@app/components/v4/ui/sidebar";
import { Slider } from "@app/components/v4/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import { DocDisclosure, DocSection, PageHeading } from "./doc-parts";
import { ExampleStage } from "./example-presentation";
import { resolveColorToken, tokens } from "./foundation-data";

type Control =
  | { kind: "color"; name: string }
  | { kind: "mix"; name: string }
  | { kind: "translucent"; name: string };
type Overrides = Record<string, Record<string, string>>;

const hex = /^#[0-9a-f]{6}$/i;
const percent = /^(\d+(?:\.\d+)?)%$/;
const translucent = /^color-mix\(in oklab, (#[0-9a-f]{6}) (\d+(?:\.\d+)?)%, transparent\)$/i;
const statusFamily = /^(ok|warn|bad|info|chart|toast)(-|$)/;

const themeOverridden = new Set(v4Themes.flatMap((theme) => Object.keys(theme.overrides)));
const colorControls = tokens.color.tokens
  .filter((token) => v4Themes.every((theme) => hex.test(resolveColorToken(token.name, theme.id))))
  .map((token): Control => ({ kind: "color", name: token.name }));
const appearanceValue = (name: string, theme: string): string => {
  const token = tokens.appearance.tokens.find((entry) => entry.name === name);
  if (!token) return "";
  return v4ThemedValue(v4Themes, theme, name, token.value as Record<string, string>).replace(
    /\{([a-z0-9-]+)\}/g,
    (reference: string, inner: string) => {
      const resolved = appearanceValue(inner, theme);
      return percent.test(resolved) ? resolved : reference;
    }
  );
};
const appearanceControls = tokens.appearance.tokens.flatMap((token): Control[] => {
  const values = v4Themes.map((theme) => appearanceValue(token.name, theme.id));
  if (values.every((value) => percent.test(value))) return [{ kind: "mix", name: token.name }];
  if (values.every((value) => translucent.test(value)))
    return [{ kind: "translucent", name: token.name }];
  return [];
});
const groups: { title: string; controls: Control[]; open: boolean }[] = [
  {
    title: "Overridden by themes",
    controls: colorControls.filter((control) => themeOverridden.has(control.name)),
    open: true
  },
  {
    title: "Neutrals and accent",
    controls: colorControls.filter(
      (control) => !themeOverridden.has(control.name) && !statusFamily.test(control.name)
    ),
    open: true
  },
  { title: "Interaction", controls: appearanceControls, open: true },
  {
    title: "Status, chart and toast",
    controls: colorControls.filter((control) => statusFamily.test(control.name)),
    open: false
  }
];
const allControls = groups.flatMap((group) => group.controls);

const baseValue = (control: Control, theme: string) =>
  control.kind === "color"
    ? resolveColorToken(control.name, theme)
    : appearanceValue(control.name, theme);

const encode = (overrides: Overrides) =>
  Object.entries(overrides)
    .filter(([, values]) => Object.keys(values).length > 0)
    .map(
      ([theme, values]) =>
        `${theme}~${Object.entries(values)
          .map(([name, value]) => {
            const mix = value.match(translucent);
            if (mix) return `${name}:${mix[1].slice(1)}.${mix[2]}`;
            return `${name}:${value.replace(/^#|%$/g, "")}`;
          })
          .join(",")}`
    )
    .join("|");

const decode = (raw: string): Overrides => {
  const overrides: Overrides = {};
  raw.split("|").forEach((section) => {
    const [theme, entries] = section.split("~");
    if (!theme || !entries || !v4Themes.some((entry) => entry.id === theme)) return;
    entries.split(",").forEach((entry) => {
      const [name, value] = entry.split(":");
      const control = allControls.find((candidate) => candidate.name === name);
      if (!control || !value) return;
      let parsed = "";
      if (control.kind === "color" && /^[0-9a-f]{6}$/i.test(value)) parsed = `#${value}`;
      if (control.kind === "mix" && /^\d+(\.\d+)?$/.test(value)) parsed = `${value}%`;
      const mix = value.match(/^([0-9a-f]{6})\.(\d+(?:\.\d+)?)$/i);
      if (control.kind === "translucent" && mix)
        parsed = `color-mix(in oklab, #${mix[1]} ${mix[2]}%, transparent)`;
      if (parsed) overrides[theme] = { ...overrides[theme], [name]: parsed };
    });
  });
  return overrides;
};

const readUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get("palette-theme") ?? "";
  return {
    overrides: decode(params.get("palette") ?? ""),
    theme: v4Themes.some((entry) => entry.id === theme) ? theme : undefined
  };
};

const writeUrl = (overrides: Overrides, theme: string) => {
  const url = new URL(window.location.href);
  const encoded = encode(overrides);
  if (encoded) url.searchParams.set("palette", encoded);
  else url.searchParams.delete("palette");
  url.searchParams.set("palette-theme", theme);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
};

const clearUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete("palette");
  url.searchParams.delete("palette-theme");
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
};

const sidebarSpaces: SidebarProps["spaces"] = [
  {
    id: "org",
    label: "Organization",
    icon: "building",
    sections: [
      {
        items: [
          { id: "home", label: "Home", icon: "home" },
          { id: "secrets", label: "Secrets", icon: "key", count: 3 },
          { id: "integrations", label: "Integrations", icon: "link" }
        ]
      },
      {
        label: "Administration",
        items: [
          { id: "access", label: "Access control", icon: "user" },
          { id: "audit", label: "Audit logs", icon: "history" },
          { id: "settings", label: "Settings", icon: "settings" }
        ]
      }
    ]
  }
];

type Row = { id: string; name: string; staging: boolean; production: boolean };
const rows: Row[] = ["API_BASE_URL", "APP_DB_PASSWORD", "STRIPE_SECRET_KEY", "SENTRY_DSN"].map(
  (name, index) => ({ id: name, name, staging: index !== 2, production: index % 2 === 0 })
);
const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", primary: true, text: (row) => row.name, render: (row) => row.name },
  {
    id: "staging",
    header: "Staging",
    render: (row) => <EnvMark present={row.staging} env="Staging" />
  },
  {
    id: "production",
    header: "Production",
    render: (row) => <EnvMark present={row.production} env="Production" />
  }
];

const SampleShell = () => {
  const [current, setCurrent] = useState("secrets");
  const [selected, setSelected] = useState<string[]>(["APP_DB_PASSWORD"]);
  return (
    <div className="flex h-full min-h-0">
      <Sidebar
        spaces={sidebarSpaces}
        current={current}
        onNavigate={(item) => setCurrent(item.id)}
      />
      <div
        className="flex min-w-0 flex-1 flex-col gap-6 overflow-auto p-6"
        style={{ background: "var(--v4-inset)" }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">payments-api</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Environment actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Staging</DropdownMenuLabel>
              <DropdownMenuItem>Connection details</DropdownMenuItem>
              <DropdownMenuItem>Rotate credentials</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Delete environment</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <DataTable
          label="Sample secrets"
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
        />
        <Card variant="framed" title="Rotation">
          <p className="text-sm">Credentials rotate every 30 days. The next rotation is Nov 21.</p>
        </Card>
      </div>
    </div>
  );
};

const ControlRow = ({
  control,
  value,
  base,
  onChange
}: {
  control: Control;
  value: string;
  base: string;
  onChange: (next: string | undefined) => void;
}) => {
  const changed = value !== base;
  const mix = value.match(translucent);
  const color = control.kind === "color" ? value : mix?.[1];
  const amount = Number((control.kind === "mix" ? value : (mix?.[2] ?? "0")).replace("%", ""));
  const setColor = (next: string) =>
    onChange(
      control.kind === "color" ? next : `color-mix(in oklab, ${next} ${amount}%, transparent)`
    );
  const setAmount = (next: number) =>
    onChange(
      control.kind === "mix" ? `${next}%` : `color-mix(in oklab, ${color} ${next}%, transparent)`
    );
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 py-1.5">
      <label className="truncate font-mono text-xs" htmlFor={`palette-${control.name}`}>
        {control.name}
      </label>
      <div className="flex min-w-0 items-center gap-3">
        {color && (
          <input
            id={`palette-${control.name}`}
            type="color"
            value={color}
            aria-label={`${control.name} color`}
            onChange={(event) => setColor(event.target.value)}
            className="h-7 w-10 shrink-0 border border-[color:var(--v4-line-soft)] bg-transparent p-0.5"
          />
        )}
        {control.kind !== "color" && (
          <Slider
            aria-label={`${control.name} amount`}
            min={0}
            max={control.kind === "mix" ? 30 : 100}
            step={1}
            value={[amount]}
            onValueChange={([next]) => setAmount(next)}
          />
        )}
        <span className="font-mono text-xs text-[color:var(--v4-muted)]">
          {control.kind === "color" ? value : `${amount}%`}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={!changed}
        onClick={() => onChange(undefined)}
      >
        Reset
      </Button>
    </div>
  );
};

const Group = ({ title, open, children }: { title: string; open: boolean; children: ReactNode }) =>
  open ? (
    <div className="mt-6">
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {children}
    </div>
  ) : (
    <DocDisclosure title={title} className="mt-6">
      {children}
    </DocDisclosure>
  );

export const PalettePlaygroundPage = () => {
  const workbenchTheme = useV4Theme() ?? "peach";
  const [initial] = useState(readUrl);
  const [overrides, setOverrides] = useState<Overrides>(initial.overrides);
  const [theme, setTheme] = useState(initial.theme ?? workbenchTheme);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => writeUrl(overrides, theme), [overrides, theme]);
  useEffect(() => clearUrl, []);
  const current = overrides[theme] ?? {};
  const css = useMemo(() => {
    const declarations = Object.entries(current)
      .map(([name, value]) => `--v4-${name}: ${value};`)
      .join(" ");
    return declarations
      ? `.v4.v4[data-palette-scope], [data-palette-scope] .v4.v4 { ${declarations} }`
      : "";
  }, [current]);
  const update = (name: string, value: string | undefined) =>
    setOverrides((previous) => {
      const next = { ...previous[theme] };
      if (value === undefined) delete next[name];
      else next[name] = value;
      return { ...previous, [theme]: next };
    });
  const changedCount = Object.values(overrides).reduce(
    (count, values) => count + Object.keys(values).length,
    0
  );
  const copy = async () => {
    const output = Object.fromEntries(
      Object.entries(overrides).filter(([, values]) => Object.keys(values).length > 0)
    );
    await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div>
      <PageHeading title="Palette playground" />
      <p
        className="text-muted-foreground text-sm leading-6"
        style={{ maxWidth: "var(--v4-size-measure-prose)" }}
      >
        Override theme tokens on a sample shell. Changes stay on this page and in its link; the
        canonical tokens never change.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          aria-label="Sample theme"
          value={theme}
          onValueChange={(next) => next && setTheme(next)}
        >
          {v4Themes.map((entry) => (
            <ToggleGroupItem key={entry.id} value={entry.id}>
              {entry.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={changedCount === 0}
          onClick={copy}
        >
          {copied ? "Copied" : "Copy overrides"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={changedCount === 0}
          onClick={() => setOverrides({})}
        >
          Reset all
        </Button>
      </div>
      <DocSection title="Sample">
        <ExampleStage height="app">
          <div ref={setHost} data-palette-scope="" className="relative h-full overflow-hidden">
            {css && <style>{css}</style>}
            {host && (
              <V4Scope
                theme={theme}
                portalContainer={host}
                data-palette-scope=""
                className="h-full"
                style={{ background: "var(--v4-sidebar)", color: "var(--v4-ink)" }}
              >
                <SampleShell />
              </V4Scope>
            )}
          </div>
        </ExampleStage>
      </DocSection>
      <DocSection title={`Tokens, ${v4Themes.find((entry) => entry.id === theme)?.name ?? theme}`}>
        <p className="text-muted-foreground text-sm">
          Each theme keeps its own overrides; switching themes shows that theme&apos;s set. Derived
          tokens such as sidebar-current, hover and press follow their inputs.
        </p>
        {groups.map((group) => (
          <Group key={group.title} title={group.title} open={group.open}>
            {group.controls.map((control) => (
              <ControlRow
                key={control.name}
                control={control}
                value={current[control.name] ?? baseValue(control, theme)}
                base={baseValue(control, theme)}
                onChange={(next) => update(control.name, next)}
              />
            ))}
          </Group>
        ))}
      </DocSection>
    </div>
  );
};
