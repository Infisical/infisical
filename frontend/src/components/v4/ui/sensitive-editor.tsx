import * as React from "react";

import { useFieldControlAttributes } from "../lib/field-context";
import { Button } from "./button";

import geometry from "./button-geometry.module.css";
import styles from "./data.module.css";

export interface CopyButtonProps {
  value: string;
  label?: string;
  onCopy?: (value: string) => void;
  writeClipboard?: (value: string) => Promise<void>;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
}
export async function writeClipboard(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
  await navigator.clipboard.writeText(value);
}
export function CopyButton({
  value,
  label = "Copy value",
  onCopy,
  writeClipboard: writer = writeClipboard,
  disabled,
  size = "sm",
  iconOnly = false
}: CopyButtonProps) {
  const [state, setState] = React.useState<"idle" | "pending" | "copied" | "failed">("idle");
  const turn = React.useRef(0);
  const pending = React.useRef(false);
  React.useEffect(() => {
    turn.current += 1;
    pending.current = false;
    setState("idle");
    return () => {
      turn.current += 1;
    };
  }, [value]);
  React.useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 1200);
    return () => window.clearTimeout(timer);
  }, [state]);
  const copy = async () => {
    if (pending.current) return;
    pending.current = true;
    turn.current += 1;
    const { current } = turn;
    setState("pending");
    try {
      await writer(value);
      if (current === turn.current) {
        setState("copied");
        onCopy?.(value);
      }
    } catch {
      if (current === turn.current) setState("failed");
    } finally {
      if (current === turn.current) pending.current = false;
    }
  };
  return (
    <span
      className={`${styles.copy} ${styles[`copy${size}`]}`}
      data-slot="copy-button"
      data-size={size}
      data-copy-state={state}
    >
      <Button
        type="button"
        variant="ghost"
        className={geometry.nestedAction}
        iconOnly={iconOnly}
        icon={iconOnly ? (state === "copied" ? "check" : "copy") : undefined}
        title={iconOnly ? (state === "copied" ? "Copied" : label) : undefined}
        disabled={disabled}
        loading={state === "pending"}
        onClick={() => copy()}
      >
        {state === "copied" ? "Copied" : label}
      </Button>
      <span
        role="status"
        data-copy-feedback
        className={state === "failed" ? styles.smallStatus : styles.sr}
      >
        {state === "failed" ? "Copy failed. Try again." : state === "copied" ? "Copied" : ""}
      </span>
    </span>
  );
}
export interface SecretInputProps {
  value: string;
  copyable?: boolean;
  label?: string;
  onCopy?: CopyButtonProps["onCopy"];
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}
export function SecretInput({
  value,
  copyable = true,
  label = "Secret value",
  onCopy,
  id,
  ...aria
}: SecretInputProps) {
  const control = useFieldControlAttributes({ ...(id ? { id } : {}), ...aria });
  const [revealed, setRevealed] = React.useState<string | null>(null);
  React.useEffect(() => setRevealed(null), [value]);
  const shown = revealed === value;
  return (
    <div className={styles.secret}>
      <span
        role="textbox"
        aria-readonly
        aria-label={label}
        title={shown ? value : undefined}
        {...control}
        className={styles.machine}
      >
        {shown ? value : "••••••••"}
      </span>
      <Button
        type="button"
        variant="ghost"
        className={geometry.nestedAction}
        iconOnly
        icon="eye"
        title={shown ? "Hide value" : "Reveal value"}
        aria-pressed={shown}
        onClick={() => setRevealed(shown ? null : value)}
      >
        {shown ? "Hide value" : "Reveal value"}
      </Button>
      {copyable && <CopyButton value={value} onCopy={onCopy} iconOnly />}
    </div>
  );
}
export interface StoredSecret {
  id: string;
  revision: string;
  hasValue: boolean;
}
export interface SensitiveEditorProps {
  stored: StoredSecret;
  label: string;
  multiline?: boolean;
  readOnly?: boolean;
  onReveal?: (context: { signal: AbortSignal }) => Promise<string>;
  onSave?: (value: string, context: { signal: AbortSignal; stored: StoredSecret }) => Promise<void>;
  onCopy?: CopyButtonProps["onCopy"];
  copyable?: boolean;
}
type View =
  | { kind: "masked" }
  | { kind: "loading" }
  | { kind: "revealed"; value: string }
  | { kind: "failed" };
export function SensitiveEditor({
  stored,
  label,
  multiline = false,
  readOnly = false,
  onReveal,
  onSave,
  onCopy,
  copyable = true
}: SensitiveEditorProps) {
  // Identity keys discard plaintext before a new stored object can render.
  return (
    <SensitiveEditorSession
      key={`${stored.id}:${stored.revision}:${stored.hasValue}:${Boolean(onReveal)}:${Boolean(onSave)}:${readOnly}`}
      stored={stored}
      label={label}
      multiline={multiline}
      readOnly={readOnly}
      onReveal={onReveal}
      onSave={onSave}
      onCopy={onCopy}
      copyable={copyable}
    />
  );
}
function SensitiveEditorSession({
  stored,
  label,
  multiline,
  readOnly,
  onReveal,
  onSave,
  onCopy,
  copyable
}: SensitiveEditorProps) {
  const [view, setView] = React.useState<View>({ kind: "masked" });
  const [draft, setDraft] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState({ message: "", failed: false });
  const { message, failed } = notice;
  const setMessage = (text: string, error = false) => setNotice({ message: text, failed: error });
  const controller = React.useRef<AbortController | null>(null);
  const request = React.useRef(0);
  const savingRef = React.useRef(false);
  const uid = React.useId();
  const editRef = React.useRef<HTMLTextAreaElement>(null);
  const region = React.useRef<HTMLDivElement>(null);
  React.useEffect(
    () => () => {
      request.current += 1;
      controller.current?.abort();
    },
    []
  );
  React.useEffect(() => {
    if (draft !== null) editRef.current?.focus();
  }, [draft === null]);
  const hide = () => {
    request.current += 1;
    controller.current?.abort();
    setView({ kind: "masked" });
  };
  const reveal = async () => {
    if (!onReveal || view.kind === "loading") return;
    request.current += 1;
    const { current } = request;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setView({ kind: "loading" });
    setMessage("");
    try {
      const value = await onReveal({ signal: next.signal });
      if (request.current === current && !next.signal.aborted) setView({ kind: "revealed", value });
    } catch {
      if (request.current === current && !next.signal.aborted) {
        setView({ kind: "failed" });
        setMessage("The value could not be revealed. Check access and try again.", true);
      }
    }
  };
  const save = async () => {
    if (draft === null || !onSave || savingRef.current) return;
    request.current += 1;
    const { current } = request;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    savingRef.current = true;
    setSaving(true);
    setMessage("Saving replacement");
    try {
      await onSave(draft, { signal: next.signal, stored });
      if (request.current === current && !next.signal.aborted) {
        setDraft(null);
        setView({ kind: "masked" });
        setMessage("Replacement saved");
        region.current?.focus();
      }
    } catch {
      if (request.current === current && !next.signal.aborted) {
        setMessage("The replacement was not saved. Your draft is kept. Retry or cancel.", true);
      }
    } finally {
      if (request.current === current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };
  return (
    <div
      className={styles.editor}
      role="group"
      ref={region}
      tabIndex={-1}
      aria-label={label}
      data-v4-escape-owner={
        draft !== null || view.kind === "loading" || view.kind === "revealed" ? "" : undefined
      }
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !saving &&
          (draft !== null || view.kind === "loading" || view.kind === "revealed")
        ) {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
          hide();
          setMessage("Edit cancelled");
          region.current?.focus();
        }
      }}
    >
      <label className={styles.label} htmlFor={draft !== null ? uid : undefined}>
        {label}
      </label>
      {draft !== null ? (
        <textarea
          id={uid}
          ref={editRef}
          rows={multiline ? 3 : 1}
          aria-describedby={`${uid}-status`}
          placeholder="New value"
          value={draft}
          disabled={saving}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage("");
          }}
          className={styles.editorInput}
        />
      ) : (
        <div className={styles.secret} data-multiline={multiline || undefined}>
          <span
            className={styles.machine}
            title={view.kind === "revealed" ? view.value : undefined}
            aria-label={
              view.kind === "revealed"
                ? undefined
                : stored.hasValue
                  ? "Stored value is hidden"
                  : "No stored value"
            }
          >
            {view.kind === "revealed" ? view.value : stored.hasValue ? "••••••••" : "No value"}
          </span>
          {onReveal && stored.hasValue && (
            <Button
              type="button"
              variant="ghost"
              className={geometry.nestedAction}
              iconOnly
              icon="eye"
              title={view.kind === "revealed" ? "Hide value" : "Reveal value"}
              loading={view.kind === "loading"}
              aria-pressed={view.kind === "revealed"}
              onClick={() => (view.kind === "revealed" ? hide() : reveal())}
            >
              {view.kind === "revealed" ? "Hide value" : "Reveal value"}
            </Button>
          )}
          {onReveal &&
            stored.hasValue &&
            copyable &&
            (view.kind === "revealed" ? (
              <CopyButton value={view.value} onCopy={onCopy} iconOnly />
            ) : (
              <span className={styles.editorSlot} aria-hidden="true" />
            ))}
        </div>
      )}
      {!readOnly && onSave && (
        <div className={styles.editorActions}>
          {draft !== null ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setDraft(null);
                  hide();
                  setMessage("Edit cancelled");
                  region.current?.focus();
                }}
              >
                Cancel
              </Button>
              <Button type="button" loading={saving} onClick={() => save()}>
                Save replacement
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft("");
                hide();
                setMessage("");
              }}
            >
              Replace without viewing
            </Button>
          )}
        </div>
      )}
      <div id={`${uid}-status`} role="status" className={failed ? styles.editorError : styles.sr}>
        {message}
      </div>
    </div>
  );
}
