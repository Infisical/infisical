import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { XIcon } from "lucide-react";

import { cn } from "../../utils";
import { useScrollEdges } from "../../utils/useScrollEdges";
import {
  COMBOBOX_CHIP_CLASS,
  COMBOBOX_CHIP_LABEL_CLASS,
  COMBOBOX_CHIP_REMOVE_CLASS,
  COMBOBOX_CHIPS_CLASS,
  COMBOBOX_CHIPS_INPUT_CLASS,
  comboboxChipsViewportClass
} from "../Combobox/combobox-chips";

import "../../utils/ScrollEdgeFade.css";

const NO_ITEMS: string[] = [];

type TagsInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "children" | "disabled" | "onChange" | "type" | "value"
> & {
  /** Tags are keyed by their text, so `validateTag` has to refuse a duplicate for the list to render. */
  value?: readonly string[];
  onValueChange: (next: string[]) => void;
  isDisabled?: boolean;
  isError?: boolean;
  /** Returning a reason refuses the commit. `existing` never contains the value being checked. */
  validateTag?: (tag: string, existing: string[]) => string | null;
  onValidationError?: (reason: string | null) => void;
  inputValue?: string;
  onInputValueChange?: (draft: string) => void;
  className?: string;
};

const TagsInput = React.forwardRef<HTMLInputElement, TagsInputProps>(
  (
    {
      value = NO_ITEMS,
      onValueChange,
      isDisabled,
      isError,
      validateTag,
      onValidationError,
      inputValue,
      onInputValueChange,
      className,
      placeholder,
      ...inputProps
    },
    forwardedRef
  ) => {
    const [uncontrolledDraft, setUncontrolledDraft] = React.useState("");
    const draft = inputValue ?? uncontrolledDraft;

    const { scrollEdges, setViewportRef } = useScrollEdges<HTMLDivElement>("vertical");

    const setDraft = (next: string) => {
      if (inputValue === undefined) setUncontrolledDraft(next);
      onInputValueChange?.(next);
    };

    const tags = React.useMemo(() => [...value], [value]);

    const commit = (raw: string) => {
      const tag = raw.trim();
      if (!tag) {
        setDraft("");
        return true;
      }

      const reason = validateTag?.(tag, tags) ?? null;
      if (reason) {
        onValidationError?.(reason);
        return false;
      }

      onValidationError?.(null);
      onValueChange([...tags, tag]);
      setDraft("");
      return true;
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit(draft);
        return;
      }

      if (event.key === ",") {
        event.preventDefault();
        commit(draft);
      }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData("text");
      const splitOn = /[\n\r,]/;
      if (!splitOn.test(pasted)) return;

      event.preventDefault();

      const parts = pasted
        .split(splitOn)
        .map((part) => part.trim())
        .filter(Boolean);

      const accepted: string[] = [];
      let refusedFrom = -1;

      for (let index = 0; index < parts.length; index += 1) {
        const reason = validateTag?.(parts[index], [...tags, ...accepted]) ?? null;
        if (reason) {
          onValidationError?.(reason);
          refusedFrom = index;
          break;
        }
        accepted.push(parts[index]);
      }

      if (accepted.length) onValueChange([...tags, ...accepted]);
      if (refusedFrom === -1) {
        onValidationError?.(null);
        setDraft("");
        return;
      }

      setDraft(parts.slice(refusedFrom).join(","));
    };

    return (
      <ComboboxPrimitive.Root
        multiple
        items={NO_ITEMS}
        value={tags}
        onValueChange={onValueChange}
        // No popup is rendered, but the open state still drives aria-expanded and makes Base UI swallow Enter.
        open={false}
        onOpenChange={() => {}}
        openOnInputClick={false}
        inputValue={draft}
        onInputValueChange={setDraft}
        disabled={isDisabled}
      >
        <ComboboxPrimitive.Chips
          data-slot="tags-input"
          data-disabled={isDisabled ? "" : undefined}
          data-invalid={isError}
          className={cn(
            COMBOBOX_CHIPS_CLASS,
            "items-start",
            tags.length > 0 ? "p-1" : "px-2.5 py-1",
            className
          )}
        >
          <div
            ref={setViewportRef}
            className={comboboxChipsViewportClass()}
            data-scroll-edge-axis="vertical"
            data-scrollable-start={scrollEdges.start}
            data-scrollable-end={scrollEdges.end}
          >
            {tags.map((tag) => (
              <ComboboxPrimitive.Chip key={tag} className={COMBOBOX_CHIP_CLASS}>
                <span className={COMBOBOX_CHIP_LABEL_CLASS}>{tag}</span>
                {!isDisabled && (
                  <ComboboxPrimitive.ChipRemove
                    aria-label={`Remove ${tag}`}
                    // Removal is Base UI's, through the controlled Root. Doing it here too would fire the
                    // caller's handler twice. Adding is ours, in `commit`, since there is no options list.
                    onClick={() => onValidationError?.(null)}
                    className={COMBOBOX_CHIP_REMOVE_CLASS}
                  >
                    <XIcon className="size-3" />
                  </ComboboxPrimitive.ChipRemove>
                )}
              </ComboboxPrimitive.Chip>
            ))}
            <ComboboxPrimitive.Input
              ref={forwardedRef}
              aria-invalid={isError || undefined}
              placeholder={tags.length === 0 ? placeholder : undefined}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={() => commit(draft)}
              className={COMBOBOX_CHIPS_INPUT_CLASS}
              {...inputProps}
            />
          </div>
        </ComboboxPrimitive.Chips>
      </ComboboxPrimitive.Root>
    );
  }
);

TagsInput.displayName = "TagsInput";

export { TagsInput, type TagsInputProps };
