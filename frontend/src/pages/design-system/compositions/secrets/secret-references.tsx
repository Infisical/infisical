import {
  type ChangeEvent,
  createContext,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { LayersIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Popover, PopoverAnchor, PopoverContent } from "@app/components/v4/ui/popover";
import { CopyButton } from "@app/components/v4/ui/sensitive-editor";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";

import { readableValue, type Resource, type Scope, type Secret } from "../secrets-model";

import styles from "./references.module.css";

export type ReferenceTarget = Scope & { key: string };
type ReferenceFocus = { environment?: string; path?: string; key?: string };
export type ReferenceSource = {
  project: string;
  environments: { value: string; label: string }[];
  resources: readonly Resource[];
  onFocusReference: (target: ReferenceFocus) => void;
  report: (message: string) => void;
};

const ReferenceSourceContext = createContext<ReferenceSource | undefined>(undefined);

export function ReferenceSourceProvider({
  value,
  children
}: {
  value: ReferenceSource;
  children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <ReferenceSourceContext value={value}>{children}</ReferenceSourceContext>
    </TooltipProvider>
  );
}

const SYNTAX = /\$\{([@a-zA-Z0-9-_. ]+)\}/g;

export const referencesIn = (value: string) =>
  [...value.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1].trim());

export const hasReference = (value: string | undefined) =>
  Boolean(value && /\$\{([^}]+)\}/.test(value));

export const resolveReference = (reference: string, base: Scope): ReferenceTarget => {
  const segments = reference.split(".");
  if (segments.length === 1) return { ...base, key: reference };
  return {
    project: base.project,
    environment: segments[0],
    path: `/${segments.slice(1, -1).join("/")}`,
    key: segments.at(-1) ?? ""
  };
};

export const findSecret = (resources: readonly Resource[], target: ReferenceTarget) =>
  resources.find(
    (resource): resource is Secret =>
      resource.kind === "secret" &&
      resource.project === target.project &&
      resource.environment === target.environment &&
      resource.path === target.path &&
      resource.name === target.key
  );

export const referenceId = (target: ReferenceTarget) =>
  `${target.environment} ${target.path} ${target.key}`;

export function expandReferences(value: string, base: Secret, resources: readonly Resource[]) {
  let circular = false;
  let forbidden = false;
  const expand = (text: string, scope: Scope, seen: string[]): string =>
    text.replace(/\$\{([^}]+)\}/g, (raw, reference: string) => {
      const target = resolveReference(reference.trim(), scope);
      const found = findSecret(resources, target);
      if (!found) return raw;
      const resolved = readableValue(found);
      if (resolved === undefined) {
        forbidden = true;
        return raw;
      }
      if (seen.includes(referenceId(target))) {
        circular = true;
        return raw;
      }
      return expand(resolved, found, [...seen, referenceId(target)]);
    });
  const expanded = expand(value, base, [referenceId({ ...base, key: base.name })]);
  return { value: expanded, circular, forbidden };
}

const DENIED = "You do not have permission to access this secret";

function focusSegment(index: number, parts: string[], base: Scope, source: ReferenceSource) {
  if (parts[0]?.startsWith("@")) return;
  const unreadable = (target: ReferenceTarget) => {
    const found = findSecret(source.resources, target);
    return Boolean(found && readableValue(found) === undefined);
  };
  if (parts.length === 1) {
    if (unreadable({ ...base, key: parts[0] })) {
      source.report(DENIED);
      return;
    }
    source.onFocusReference({ key: parts[0] });
    return;
  }
  const [environment] = parts;
  const isKey = index === parts.length - 1;
  const path = `/${parts.slice(1, -1).slice(0, index).join("/")}`;
  const key = parts[parts.length - 1];
  if (isKey && unreadable({ project: base.project, environment, path, key })) {
    source.report(DENIED);
    return;
  }
  source.onFocusReference({ environment, path, key: isKey ? key : undefined });
}

function useModifierHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) setHeld(true);
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) setHeld(false);
    };
    const reset = () => setHeld(false);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", reset);
    };
  }, []);
  return held;
}

export function ReferenceText({ value, scope }: { value: string; scope?: Scope }) {
  const source = useContext(ReferenceSourceContext);
  const held = useModifierHeld();
  const nodes: ReactElement[] = [];
  let last = 0;
  [...value.matchAll(SYNTAX)].forEach((match) => {
    const start = match.index ?? 0;
    if (start > last)
      nodes.push(<Fragment key={`text-${last}`}>{value.slice(last, start)}</Fragment>);
    last = start + match[0].length;
    const parts = match[1].split(".");
    const target = source && scope && !parts[0]?.startsWith("@") ? { source, scope } : undefined;
    nodes.push(
      <span key={`ref-${start}`} className={styles.reference}>
        {"${"}
        {parts.map((segment, index) => (
          <Fragment key={`${start}-${index + 1}`}>
            {held && target ? (
              <span
                role="button"
                tabIndex={0}
                className={styles.segment}
                data-interactive
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  focusSegment(index, parts, target.scope, target.source);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  focusSegment(index, parts, target.scope, target.source);
                }}
              >
                {segment}
              </span>
            ) : (
              <span className={styles.segment}>{segment}</span>
            )}
            {index < parts.length - 1 && <span className={styles.segment}>.</span>}
          </Fragment>
        ))}
        {"}"}
      </span>
    );
  });
  if (last < value.length)
    nodes.push(<Fragment key={`text-${last}`}>{value.slice(last)}</Fragment>);
  return nodes;
}

const unclosedLeft = (value: string, position: number) => {
  for (let index = position; index >= 1; index -= 1) {
    if (value[index] === "}") return -1;
    if (value[index - 1] === "$" && value[index] === "{") return index;
  }
  return -1;
};

const unclosedRight = (value: string, position: number) => {
  for (let index = position; index < value.length; index += 1) {
    if (value[index] === "}") return index - 1;
  }
  return -1;
};

type WizardOption = {
  id: string;
  kind: "environment" | "folder" | "secret";
  label: string;
  meta?: string;
  reference: string;
  insert: boolean;
};
type Wizard = {
  step: "environment" | "browse";
  crumbs: { label: string; reference: string }[];
  sections: { label: string; options: WizardOption[] }[];
  empty: string;
};

const SEARCH_MIN_LENGTH = 2;
const SEARCH_LIMIT = 50;

function buildWizard(input: string, base: Scope, source: ReferenceSource): Wizard {
  const { environments, resources } = source;
  const order = environments.map((environment) => environment.value);
  const labelOf = (slug: string) =>
    environments.find((environment) => environment.value === slug)?.label ?? slug;
  const segments = input.includes(".") ? input.split(".") : undefined;
  const environment =
    segments &&
    environments.find((entry) => entry.value.toLowerCase() === segments[0].toLowerCase());
  if (segments && environment) {
    const folders = segments.slice(1, -1);
    const path = `/${folders.join("/")}`;
    const filter = (segments.at(-1) ?? "").toLowerCase();
    const here = resources
      .filter(
        (resource) =>
          resource.project === base.project &&
          resource.environment === environment.value &&
          resource.path === path &&
          resource.name.toLowerCase().includes(filter)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    const prefix = [environment.value, ...folders];
    const folderOptions = here
      .filter((resource) => resource.kind === "folder")
      .map((resource) => ({
        id: `folder-${resource.id}`,
        kind: "folder" as const,
        label: resource.name,
        reference: `${[...prefix, resource.name].join(".")}.`,
        insert: false
      }));
    const secretOptions = here
      .filter((resource) => resource.kind === "secret")
      .map((resource) => ({
        id: `secret-${resource.id}`,
        kind: "secret" as const,
        label: resource.name,
        reference: [...prefix, resource.name].join("."),
        insert: true
      }));
    return {
      step: "browse",
      crumbs: [environment.label, ...folders].map((label, index) => ({
        label,
        reference: `${[environment.value, ...folders.slice(0, index)].join(".")}.`
      })),
      sections: [
        { label: "", options: folderOptions },
        { label: "Secrets in this environment", options: secretOptions }
      ].filter((section) => section.options.length),
      empty: "No secrets found"
    };
  }
  const filter = segments ? "" : input.toLowerCase();
  const environmentOptions = environments
    .filter((entry) => entry.value.toLowerCase().includes(filter))
    .map((entry) => ({
      id: `environment-${entry.value}`,
      kind: "environment" as const,
      label: entry.label,
      reference: `${entry.value}.`,
      insert: false
    }));
  const searched =
    filter.length >= SEARCH_MIN_LENGTH
      ? resources
          .filter(
            (resource): resource is Secret =>
              resource.kind === "secret" &&
              resource.project === base.project &&
              order.includes(resource.environment) &&
              resource.name.toLowerCase().includes(filter)
          )
          .sort(
            (a, b) =>
              a.name.localeCompare(b.name) ||
              a.path.localeCompare(b.path) ||
              order.indexOf(a.environment) - order.indexOf(b.environment)
          )
          .slice(0, SEARCH_LIMIT)
          .map((secret) => {
            const folders = secret.path.split("/").filter(Boolean);
            return {
              id: `search-${secret.id}`,
              kind: "secret" as const,
              label: secret.name,
              meta: [labelOf(secret.environment), ...folders].join(" / "),
              reference: [secret.environment, ...folders, secret.name].join("."),
              insert: true
            };
          })
      : [];
  return {
    step: "environment",
    crumbs: [],
    sections: [
      { label: "Environments", options: environmentOptions },
      { label: "Secrets in this project", options: searched }
    ].filter((section) => section.options.length),
    empty: filter ? "No matching environments or secrets" : "No environments available"
  };
}

const glyphs = {
  environment: <Icon icon={LayersIcon} size={16} />,
  folder: <Icon name="folder" size={16} />,
  secret: <Icon name="key" size={16} />
};

type Field = HTMLInputElement & HTMLTextAreaElement;
type ControlProps = {
  ref: Ref<Field>;
  value: string;
  role: "combobox";
  "aria-autocomplete": "list";
  "aria-expanded": boolean;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
  onChange: (event: ChangeEvent<Field>) => void;
  onSelect: (event: SyntheticEvent<Field>) => void;
  onKeyDown: (event: KeyboardEvent<Field>) => void;
  onFocus: () => void;
  onBlur: (event: FocusEvent<Field>) => void;
  onScroll: () => void;
};

const mask = "••••••••••••••••";

export function ReferenceEditor({
  value,
  scope,
  multiline = false,
  readOnly = false,
  masked = false,
  className,
  onValueChange,
  onKeyDown,
  onBlur,
  children
}: {
  value: string;
  scope?: Scope;
  multiline?: boolean;
  readOnly?: boolean;
  masked?: boolean;
  className?: string;
  onValueChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<Field>) => void;
  onBlur?: (event: FocusEvent<Field>) => void;
  children: (control: ControlProps) => ReactElement;
}) {
  const source = useContext(ReferenceSourceContext);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const control = useRef<Field>(null);
  const [active, setActive] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [highlighted, setHighlighted] = useState(0);
  const [focused, setFocused] = useState(false);
  const hidden = masked && !focused && value !== "";

  const openLeft = unclosedLeft(value, cursor - 1);
  const input = openLeft !== -1 ? value.slice(openLeft + 1, cursor) : "";
  const wizard =
    source && scope && openLeft !== -1 && active && !readOnly && !input.startsWith("@")
      ? buildWizard(input, scope, source)
      : undefined;
  const open = Boolean(wizard);
  const options = wizard?.sections.flatMap((section) => section.options) ?? [];
  const optionKey = `${wizard?.step}:${input.split(".").slice(0, -1).join(".")}:${options.length}`;

  useEffect(() => setHighlighted(0), [optionKey]);
  useEffect(() => {
    if (open)
      document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted, listId]);

  const sync = useCallback(() => {
    const field = control.current;
    const box = layer.current;
    if (!field || !box) return;
    let left = 0;
    let top = 0;
    let node: HTMLElement | null = field;
    while (node && node !== wrap.current) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    const computed = getComputedStyle(field);
    Object.assign(box.style, {
      left: `${left + field.clientLeft}px`,
      top: `${top + field.clientTop}px`,
      width: `${field.clientWidth}px`,
      height: `${field.clientHeight}px`,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,
      font: computed.font,
      letterSpacing: computed.letterSpacing,
      color: computed.color,
      textAlign: computed.textAlign,
      tabSize: computed.tabSize,
      overflowWrap: computed.overflowWrap,
      wordBreak: computed.wordBreak,
      whiteSpace: multiline ? "pre-wrap" : "pre"
    });
    box.scrollTop = field.scrollTop;
    box.scrollLeft = field.scrollLeft;
  }, [multiline]);

  useLayoutEffect(sync);
  useEffect(() => {
    const field = control.current;
    if (!field) return undefined;
    const observer = new ResizeObserver(sync);
    observer.observe(field);
    return () => observer.disconnect();
  }, [sync]);

  const replace = (content: string, close: boolean) => {
    const left = openLeft + 1;
    const right = unclosedRight(value, left);
    const enclosed = right !== -1;
    const before = value.slice(0, left);
    const after = value.slice(enclosed ? right + 1 : cursor);
    onValueChange(`${before}${content}${close && !enclosed ? "}" : ""}${after}`);
    const next = before.length + content.length + (close ? 1 : 0);
    setCursor(next);
    requestAnimationFrame(() => control.current?.setSelectionRange(next, next));
  };
  const pick = (option: WizardOption) => {
    control.current?.focus();
    replace(option.reference, option.insert);
    if (option.insert) setActive(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setActive(false);
      }}
    >
      <PopoverAnchor asChild>
        <div ref={wrap} className={className ? `${styles.editor} ${className}` : styles.editor}>
          {children({
            ref: control,
            value: hidden ? mask : value,
            role: "combobox",
            "aria-autocomplete": "list",
            "aria-expanded": open,
            "aria-controls": open ? listId : undefined,
            "aria-activedescendant":
              open && options.length ? `${listId}-${highlighted}` : undefined,
            onChange: (event) => {
              const { selectionStart, value: next } = event.target;
              onValueChange(next);
              setCursor(selectionStart ?? 0);
              setActive(unclosedLeft(next, (selectionStart ?? 0) - 1) !== -1);
            },
            onSelect: (event) => {
              const { selectionStart, value: current } = event.currentTarget;
              setCursor(selectionStart ?? 0);
              if (unclosedLeft(current, (selectionStart ?? 0) - 1) === -1) setActive(false);
              sync();
            },
            onKeyDown: (event) => {
              if (open && event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setActive(false);
                return;
              }
              if (open && options.length && !event.nativeEvent.isComposing) {
                const forward =
                  event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey);
                const back = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
                if (forward || back) {
                  event.preventDefault();
                  event.stopPropagation();
                  setHighlighted(
                    (current) => (current + (forward ? 1 : -1) + options.length) % options.length
                  );
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (options[highlighted]) pick(options[highlighted]);
                  return;
                }
              }
              onKeyDown?.(event);
            },
            onFocus: () => setFocused(true),
            onBlur: (event) => {
              setActive(false);
              setFocused(false);
              onBlur?.(event);
            },
            onScroll: sync
          })}
          <div ref={layer} aria-hidden className={styles.layer}>
            {hidden ? mask : <ReferenceText value={value} scope={scope} />}
            {!hidden && value.endsWith("\n") && <br />}
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        surface="menu"
        align="start"
        className={styles.wizard}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
      >
        {wizard?.step === "browse" && (
          <div className={styles.crumbs}>
            <button type="button" className={styles.crumb} onClick={() => replace("", false)}>
              Envs
            </button>
            {wizard.crumbs.map((crumb, index) => (
              <Fragment key={crumb.reference}>
                <Icon name="chev-right" size={12} />
                <button
                  type="button"
                  className={styles.crumb}
                  data-current={index === wizard.crumbs.length - 1 || undefined}
                  onClick={() => replace(crumb.reference, false)}
                >
                  {crumb.label}
                </button>
              </Fragment>
            ))}
          </div>
        )}
        <div id={listId} role="listbox" aria-label="Secret references">
          {wizard?.sections.map((section, sectionIndex) => {
            const offset = wizard.sections
              .slice(0, sectionIndex)
              .reduce((total, entry) => total + entry.options.length, 0);
            return (
              <div
                key={section.label || "folders"}
                role="group"
                aria-label={section.label || "Folders"}
              >
                {sectionIndex > 0 && <div className={styles.separator} />}
                {section.label && <div className={styles.label}>{section.label}</div>}
                {section.options.map((option, index) => (
                  <div
                    key={option.id}
                    id={`${listId}-${offset + index}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={highlighted === offset + index}
                    className={styles.option}
                    data-highlighted={highlighted === offset + index || undefined}
                    onClick={() => pick(option)}
                    onKeyDown={() => undefined}
                    onMouseMove={() => setHighlighted(offset + index)}
                  >
                    <span className={styles.glyph} data-kind={option.kind}>
                      {glyphs[option.kind]}
                    </span>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.meta && <span className={styles.optionMeta}>{option.meta}</span>}
                    {!option.insert && (
                      <span className={styles.trail}>
                        <Icon name="chev-right" size={14} />
                      </span>
                    )}
                    {option.insert && !option.meta && <span className={styles.insert}>insert</span>}
                  </div>
                ))}
              </div>
            );
          })}
          {wizard && !options.length && <div className={styles.empty}>{wizard.empty}</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ResolvedValueButton({
  secret,
  disabledReason,
  open,
  onOpenChange
}: {
  secret: Secret;
  disabledReason?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const source = useContext(ReferenceSourceContext);
  const resolved = expandReferences(readableValue(secret) ?? "", secret, source?.resources ?? []);
  return (
    <Popover open={open && !disabledReason} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className={styles.resolvedSlot}>
          <Tooltip content={disabledReason ?? "View resolved value"}>
            <span className={styles.resolvedSlot}>
              <Button
                variant="ghost"
                size="icon-row"
                iconOnly
                aria-disabled={Boolean(disabledReason) || undefined}
                aria-expanded={open && !disabledReason}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!disabledReason) onOpenChange(!open);
                }}
              >
                <Icon name="link" />
                <span className="sr-only">View resolved secret value</span>
              </Button>
            </span>
          </Tooltip>
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className={styles.resolved}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {resolved.forbidden ? (
          <p className={styles.resolvedError}>
            You do not have permission to view one of the referenced secrets.
          </p>
        ) : (
          <div className={styles.resolvedValue}>
            <span
              role="textbox"
              aria-readonly
              aria-label="Resolved secret value"
              className={styles.resolvedText}
            >
              <ReferenceText value={resolved.value} />
            </span>
            <CopyButton value={resolved.value} label="Copy resolved value" iconOnly />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
