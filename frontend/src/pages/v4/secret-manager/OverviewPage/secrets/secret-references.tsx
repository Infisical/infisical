import {
  type ChangeEvent,
  createContext,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
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
import { Icon } from "@infisical/cipher/ui/icon";
import { Popover, PopoverAnchor, PopoverContent } from "@infisical/cipher/ui/popover";
import { CopyButton } from "@infisical/cipher/ui/sensitive-editor";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { AxiosError } from "axios";
import { LayersIcon } from "lucide-react";

import { ApiErrorTypes } from "@app/hooks/api/types";

import { useV4Adapter } from "../../../data/adapters";
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

const VALID_REFERENCE = /^\$\{[a-zA-Z0-9-_.@]+(?: +[a-zA-Z0-9-_@]+)*\}$/;
const DENIED_REFERENCE = "You do not have permission to view this referenced secret.";

function ResolvedReference({ reference, scope }: { reference: string; scope: Scope }) {
  const target = resolveReference(reference, scope);
  const { data, isPending, error } = useV4Adapter("secrets").useExpandedSecretValue({
    projectId: scope.project,
    environment: target.environment,
    secretPath: target.path,
    secretKey: target.key
  });
  if (isPending) return <Skeleton width={128} />;
  if (error) {
    const status =
      error instanceof AxiosError ? (error.status ?? error.response?.status) : undefined;
    if (status === 404) return "Referenced secret not found.";
    if (status === 403) return DENIED_REFERENCE;
    return "Failed to resolve this reference.";
  }
  if (!data || data.secretValueHidden) return DENIED_REFERENCE;
  if (!data.secretValue) return <span className={styles.previewEmpty}>Empty</span>;
  return <span className={styles.preview}>{data.secretValue}</span>;
}

const previewOf = (raw: string, reference: string, scope: Scope) => {
  if (!VALID_REFERENCE.test(raw)) return "Not a valid reference, so it stays as written.";
  if (reference.startsWith("@")) return "Cross-project references can't be previewed here.";
  return <ResolvedReference reference={reference} scope={scope} />;
};

export function ReferenceText({
  value,
  scope,
  hover
}: {
  value: string;
  scope?: Scope;
  hover?: { index?: number; onClose: () => void };
}) {
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
    const node = (
      <span key={`ref-${start}`} className={styles.reference} data-reference={start}>
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
    if (!scope) {
      nodes.push(node);
      return;
    }
    const preview = previewOf(match[0], match[1], scope);
    nodes.push(
      hover ? (
        <Tooltip
          key={`ref-${start}`}
          content={preview}
          open={hover.index === start}
          onOpenChange={(next) => {
            if (!next) hover.onClose();
          }}
        >
          {node}
        </Tooltip>
      ) : (
        <Tooltip key={`ref-${start}`} content={preview}>
          {node}
        </Tooltip>
      )
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
  onMouseMove: (event: MouseEvent<Field>) => void;
  onMouseLeave: () => void;
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
  const [hovered, setHovered] = useState<number>();
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
  useEffect(() => setHovered(undefined), [value, hidden]);
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
            onScroll: sync,
            onMouseMove: (event) => {
              if (!scope || hidden) return;
              const hit = [
                ...(layer.current?.querySelectorAll<HTMLElement>("[data-reference]") ?? [])
              ].find((node) =>
                [...node.getClientRects()].some(
                  (rect) =>
                    event.clientX >= rect.left &&
                    event.clientX <= rect.right &&
                    event.clientY >= rect.top &&
                    event.clientY <= rect.bottom
                )
              );
              setHovered(hit ? Number(hit.dataset.reference) : undefined);
            },
            onMouseLeave: () => setHovered(undefined)
          })}
          <div ref={layer} aria-hidden className={styles.layer}>
            {hidden ? (
              mask
            ) : (
              <ReferenceText
                value={value}
                scope={scope}
                hover={{ index: open ? undefined : hovered, onClose: () => setHovered(undefined) }}
              />
            )}
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

export function ResolvedValue({ secret }: { secret: Secret }) {
  const { data, isPending, error } = useV4Adapter("secrets").useSecretReferenceTree({
    projectId: secret.project,
    environmentSlug: secret.environment,
    secretPath: secret.path,
    secretKey: secret.name
  });
  if (isPending)
    return (
      <div className={styles.resolvedValue}>
        <Skeleton width="100%" />
      </div>
    );
  if (error)
    return (
      <p className={styles.resolvedError}>
        {error instanceof AxiosError &&
        error.response?.data?.error === ApiErrorTypes.CustomForbiddenError
          ? "You do not have permission to view one of the referenced secrets."
          : "Failed to resolve secret value."}
      </p>
    );
  const resolved = data?.value ?? "";
  return (
    <div className={styles.resolvedValue}>
      <span
        role="textbox"
        aria-readonly
        aria-label="Resolved secret value"
        className={styles.resolvedText}
      >
        <ReferenceText value={resolved} />
      </span>
      <CopyButton value={resolved} label="Copy resolved value" iconOnly />
    </div>
  );
}
