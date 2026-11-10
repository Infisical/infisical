import * as React from "react";

import { useDescendantFlags } from "../lib/descendant-flags";
import { useFieldControlAttributes } from "../lib/field-context";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { fieldBoxFlags, fieldBoxWatch } from "./input";

import controlStyles from "./controls.module.css";
import styles from "./picker.module.css";

const separators = /[,\n\r]/;
const noTags: readonly string[] = [];

export type TagsInputProps = {
  value?: readonly string[];
  defaultValue?: readonly string[];
  onChange?: (tags: string[]) => void;
  onValueChange?: (tags: string[]) => void;
  /** Names the text input for assistive technology; the visible label comes from a Field. */
  label: string;
  placeholder?: string;
  id?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
  invalid?: boolean;
  mono?: boolean;
  /** Returns why a tag is refused. A refused tag stays in the input so it can be corrected. */
  validate?: (tag: string, tags: readonly string[]) => string | undefined;
  /** Runs on every commit with the first refusal reason, or undefined when nothing was refused. */
  onValidationChange?: (reason: string | undefined) => void;
  className?: string;
};

export function TagsInput({
  value,
  defaultValue = noTags,
  onChange,
  onValueChange,
  label,
  placeholder,
  disabled,
  invalid,
  mono,
  validate,
  onValidationChange,
  className,
  ref,
  ...props
}: TagsInputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const field = useFieldControlAttributes(props);
  const [tags, setTags] = useControllableState<readonly string[]>({
    value,
    defaultValue,
    onChange: (next) => {
      onChange?.([...next]);
      onValueChange?.([...next]);
    }
  });
  const [draft, setDraft] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => input.current as HTMLInputElement);
  const box = React.useRef<HTMLDivElement>(null);
  const boxRef = useDescendantFlags(fieldBoxFlags, fieldBoxWatch, box);
  const refocus = React.useRef<string | null | undefined>(undefined);
  React.useLayoutEffect(() => {
    if (refocus.current === undefined) return;
    const target = refocus.current;
    refocus.current = undefined;
    const chip = Array.from(
      box.current?.querySelectorAll<HTMLButtonElement>("[data-slot=tags-input-remove]") ?? []
    ).find((button) => button.dataset.value === target);
    (chip ?? input.current)?.focus();
  });

  const commit = (text: string) => {
    const accepted: string[] = [];
    const refused: string[] = [];
    let reason: string | undefined;
    text
      .split(separators)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const existing = [...tags, ...accepted];
        if (existing.includes(part)) return;
        const refusal = validate?.(part, existing);
        if (refusal) {
          refused.push(part);
          reason = reason ?? refusal;
          return;
        }
        accepted.push(part);
      });
    if (accepted.length) setTags([...tags, ...accepted]);
    setDraft(refused.join(", "));
    onValidationChange?.(reason);
  };
  const remove = (tag: string) => {
    const index = tags.indexOf(tag);
    refocus.current = tags[index + 1] ?? tags[index - 1] ?? null;
    setTags(tags.filter((item) => item !== tag));
  };

  return (
    <div
      ref={boxRef}
      data-slot="tags-input"
      data-size="sm"
      data-field-box=""
      className={cn(controlStyles.field, styles.multiCombobox, className)}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        input.current?.focus();
      }}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(styles.chip, mono && styles.mono)}
          data-locked={disabled || undefined}
        >
          <span title={tag}>{tag}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${tag}`}
            data-slot="tags-input-remove"
            data-value={tag}
            disabled={disabled}
            onClick={() => remove(tag)}
            onKeyDown={(event) => {
              if (event.key !== "Backspace" && event.key !== "Delete") return;
              event.preventDefault();
              remove(tag);
            }}
          >
            <Icon name="x" size={12} />
          </Button>
        </span>
      ))}
      <input
        ref={input}
        type="text"
        data-slot="tags-input-input"
        data-field-control=""
        className={cn(controlStyles.bare, mono && styles.mono)}
        {...field}
        aria-label={field["aria-labelledby"] ? undefined : label}
        aria-invalid={invalid || field["aria-invalid"] || undefined}
        placeholder={tags.length ? undefined : placeholder}
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (!event.target.value.trim()) onValidationChange?.(undefined);
        }}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter" || event.key === ",") {
            if (event.key === "Enter" && !draft.trim()) return;
            event.preventDefault();
            commit(draft);
            return;
          }
          if (event.key === "Backspace" && !draft && tags.length) {
            event.preventDefault();
            setTags(tags.slice(0, -1));
          }
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          if (!separators.test(pasted)) return;
          event.preventDefault();
          const { selectionStart, selectionEnd } = event.currentTarget;
          commit(
            `${draft.slice(0, selectionStart ?? draft.length)}${pasted}${draft.slice(selectionEnd ?? draft.length)}`
          );
        }}
      />
    </div>
  );
}
TagsInput.displayName = "TagsInput";
