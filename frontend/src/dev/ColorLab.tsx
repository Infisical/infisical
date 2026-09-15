import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { Button } from "@app/components/v3/generic/Button";
import { Input } from "@app/components/v3/generic/Input";

import { isDarkAuthPath } from "../components/v3/platform/ThemeProvider/auth-theme";
import source from "../index.css?raw";

import "./color-lab.css";

type Palette = Record<string, string>;
type Mode = "dark" | "light";
const parseColors = (text: string): Palette =>
  Object.fromEntries(
    [...text.matchAll(/(--color-[\w-]+):\s*(oklch\([^;]+\));/g)].map((m) => [m[1], m[2]])
  );
const [darkSource, lightSource] = source.split('html[data-theme="light"]');
const defaults = {
  dark: parseColors(darkSource),
  light: parseColors(lightSource.split("/* Platform overrides */")[0])
};
const modes: Mode[] = ["dark", "light"];
const channels = [
  { label: "Lightness", max: 1, step: 0.0001 },
  { label: "Chroma", max: 0.4, step: 0.0001 },
  { label: "Hue", max: 360, step: 0.1 }
];
const valuesOf = (color: string) => (color.match(/[\d.]+/g) || []).map(Number);
const format = (values: number[]) =>
  `oklch(${values[0].toFixed(4)} ${values[1].toFixed(4)} ${values[2].toFixed(1)})`;
const groupOf = (name: string) => {
  if (name.startsWith("--color-sidebar")) return "Sidebar";
  if (/^--color-(success|info|warning|danger|neutral)$/.test(name)) return "Status";
  if (/^--color-(org|sub-org|project|admin|product-)/.test(name)) return "Scope & products";
  if (/^--color-(folder|secret|dynamic-secret|import|override|proxied-service)/.test(name))
    return "Resources";
  return "Surfaces & content";
};
const groups = ["Surfaces & content", "Sidebar", "Status", "Scope & products", "Resources"];

const ColorLab = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(
    document.documentElement.dataset.theme === "light" ? "light" : "dark"
  );
  const [palettes, setPalettes] = useState(defaults);
  const [preview, setPreview] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [exportText, setExportText] = useState("");
  const [side, setSide] = useState<"left" | "right">("right");
  const launcher = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const changed = modes.reduce(
    (count, theme) =>
      count +
      Object.keys(defaults[theme]).filter((key) => palettes[theme][key] !== defaults[theme][key])
        .length,
    0
  );

  useEffect(() => {
    const sheet = document.createElement("style");
    sheet.dataset.colorLab = "overrides";
    sheet.textContent = preview
      ? modes
          .map(
            (theme) =>
              `html[data-theme="${theme}"] {\n${Object.entries(palettes[theme])
                .filter(([key, value]) => value !== defaults[theme][key])
                .map(([key, value]) => `${key}: ${value} !important;`)
                .join("\n")}\n}`
          )
          .join("\n")
      : "";
    document.head.append(sheet);
    return () => sheet.remove();
  }, [palettes, preview]);

  useEffect(() => {
    const observer = new MutationObserver(() =>
      setMode(document.documentElement.dataset.theme === "light" ? "light" : "dark")
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        document.getElementById("color-lab-root")?.contains(document.activeElement)
      ) {
        event.stopPropagation();
        setOpen(false);
        launcher.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const update = (name: string, value: string) => {
    setPalettes((previous) => ({ ...previous, [mode]: { ...previous[mode], [name]: value } }));
    setStatus("");
    setExportText("");
  };
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  const copy = async () => {
    const css = modes
      .map(
        (theme) =>
          `${theme === "dark" ? "@theme" : 'html[data-theme="light"]'} {\n${Object.entries(
            palettes[theme]
          )
            .map(([name, value]) => `  ${name}: ${value};`)
            .join("\n")}\n}`
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(css);
      setStatus("Copied both palettes. Paste them into your Codex task.");
    } catch {
      setExportText(css);
      setStatus("Clipboard unavailable. Select and copy the CSS below.");
    }
  };

  return (
    <div className="color-lab" style={{ ...defaults.dark, [side]: 16 } as React.CSSProperties}>
      <Button
        ref={launcher}
        className="color-lab-launcher"
        aria-expanded={open}
        aria-controls="color-lab-panel"
        onClick={() => setOpen(!open)}
      >
        <span className="color-lab-mark" aria-hidden /> Colors {changed > 0 && `· ${changed}`}
      </Button>
      {open && (
        <section
          id="color-lab-panel"
          role="dialog"
          aria-label="Color Lab"
          className="color-lab-panel"
        >
          <header>
            <div>
              <strong>Color Lab</strong>
              <small>Local preview · index.css</small>
            </div>
            <Button size="xs" variant="ghost" onClick={close} aria-label="Collapse Color Lab">
              −
            </Button>
          </header>
          <div className="color-lab-toolbar">
            {modes.map((theme) => (
              <Button
                key={theme}
                size="sm"
                variant={mode === theme ? "neutral" : "ghost"}
                aria-pressed={mode === theme}
                onClick={() => {
                  if (theme === "light" && isDarkAuthPath(window.location.pathname)) {
                    setStatus("Auth pages always use dark mode.");
                    return;
                  }
                  document.documentElement.dataset.theme = theme;
                  document.documentElement.style.colorScheme = theme;
                }}
              >
                {theme === "dark" ? "Dark" : "Light"}
              </Button>
            ))}
            <Button size="sm" onClick={copy}>
              Copy all
            </Button>
          </div>
          <div className="color-lab-toolbar">
            <Button size="xs" aria-pressed={preview} onClick={() => setPreview(!preview)}>
              {preview ? "Preview on" : "Preview off"}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setPalettes(defaults);
                setExportText("");
                setStatus("Both palettes reset.");
              }}
              disabled={!changed}
            >
              Reset all
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setSide(side === "right" ? "left" : "right")}
              aria-label={`Move panel to ${side === "right" ? "left" : "right"}`}
            >
              ⇄
            </Button>
          </div>
          <Input
            ref={search}
            aria-label="Find a color"
            placeholder="Find a color…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="color-lab-list">
            {groups.map((group) => {
              const colors = Object.entries(palettes[mode]).filter(
                ([name]) => groupOf(name) === group && name.includes(query.toLowerCase())
              );
              return (
                colors.length > 0 && (
                  <div key={group}>
                    <h3>{group}</h3>
                    {colors.map(([name, value]) => {
                      const values = valuesOf(value);
                      const edited = value !== defaults[mode][name];
                      return (
                        <details key={`${mode}-${name}`}>
                          <summary>
                            <span className="color-lab-swatch" style={{ background: value }} />
                            <span>{name.replace("--color-", "")}</span>
                            {edited && <span aria-label="Modified">·</span>}
                            <span className="color-lab-chevron">⌄</span>
                          </summary>
                          <div className="color-lab-editor">
                            <code>{value}</code>
                            {channels.map((channel, index) => (
                              <div className="color-lab-channel" key={channel.label}>
                                <label htmlFor={`${name}-${channel.label}`}>{channel.label}</label>
                                <input
                                  aria-label={`${name} ${channel.label}`}
                                  id={`${name}-${channel.label}`}
                                  type="range"
                                  min="0"
                                  max={channel.max}
                                  step={channel.step}
                                  value={values[index]}
                                  onChange={(event) => {
                                    const next = [...values];
                                    next[index] = Number(event.target.value);
                                    update(name, format(next));
                                  }}
                                />
                                <Input
                                  aria-label={`${name} ${channel.label} value`}
                                  type="number"
                                  min="0"
                                  max={channel.max}
                                  step={channel.step}
                                  value={values[index]}
                                  onChange={(event) => {
                                    if (event.target.value === "") return;
                                    const next = [...values];
                                    next[index] = Math.min(
                                      channel.max,
                                      Math.max(0, Number(event.target.value))
                                    );
                                    if (Number.isFinite(next[index])) update(name, format(next));
                                  }}
                                />
                              </div>
                            ))}
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={!edited}
                              onClick={() => update(name, defaults[mode][name])}
                            >
                              Reset color
                            </Button>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )
              );
            })}
            {!Object.keys(palettes[mode]).some((name) => name.includes(query.toLowerCase())) && (
              <p>No matching colors.</p>
            )}
          </div>
          <footer>
            <span>{changed} modified · Refresh clears edits</span>
            <p role="status">{status || "Overrides only. Your CSS file stays unchanged."}</p>
            {exportText && (
              <textarea
                aria-label="Palette CSS to copy"
                readOnly
                value={exportText}
                onFocus={(event) => event.target.select()}
              />
            )}
          </footer>
        </section>
      )}
    </div>
  );
};

const host = document.createElement("div");
host.id = "color-lab-root";
document.body.append(host);
const root = createRoot(host);
root.render(<ColorLab />);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    root.unmount();
    host.remove();
  });
