import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { TriangleAlertIcon, XIcon } from "lucide-react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "../Tooltip";

import "../../utils/ScrollEdgeFade.css";

const NO_ITEMS: string[] = [];
const DEFAULT_SEPARATORS = [",", " "];
const DEFAULT_PASTE_DELIMITER = /[\n\r, ]/;

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
  separators?: readonly string[];
  /** Returning a reason flags a committed tag as invalid without refusing it, so it stays visible and removable. */
  getTagError?: (tag: string) => string | null;
  /** What splits a pasted list into separate tags. Defaults to commas, spaces and newlines. */
  pasteDelimiter?: RegExp;
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
      separators = DEFAULT_SEPARATORS,
      getTagError,
      pasteDelimiter = DEFAULT_PASTE_DELIMITER,
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

      if (separators.includes(event.key)) {
        event.preventDefault();
        commit(draft);
      }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData("text");
      if (!pasteDelimiter.test(pasted)) return;

      event.preventDefault();

      const { selectionStart, selectionEnd } = event.currentTarget;
      const parts = [
        draft.slice(0, selectionStart ?? draft.length),
        pasted,
        draft.slice(selectionEnd ?? draft.length)
      ]
        .flatMap((chunk) => chunk.split(pasteDelimiter))
        .map((part) => part.trim())
        .filter(Boolean);

      const accepted: string[] = [];
      const refused: string[] = [];
      let refusalReason: string | null = null;

      parts.forEach((part) => {
        const reason = validateTag?.(part, [...tags, ...accepted]) ?? null;
        if (reason) {
          refused.push(part);
          refusalReason = refusalReason ?? reason;
          return;
        }
        accepted.push(part);
      });

      if (accepted.length) onValueChange([...tags, ...accepted]);
      onValidationError?.(refusalReason);

      if (!refused.length) {
        setDraft("");
        return;
      }

      setDraft(separators.length ? refused.join(separators[0]) : refused[0]);
    };

    return (
      <ComboboxPrimitive.Root
        multiple
        items={NO_ITEMS}
        value={tags}
        onValueChange={(next, details) => {
          if (details.reason === "escape-key") return;
          onValueChange(next);
        }}
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
            {tags.map((tag) => {
              const tagError = getTagError?.(tag) ?? null;
              const isInvalid = tagError !== null;
              const chip = (
                <ComboboxPrimitive.Chip
                  key={tag}
                  data-invalid={isInvalid || undefined}
                  className={cn(COMBOBOX_CHIP_CLASS, isInvalid && "bg-danger/15 text-danger")}
                >
                  {isInvalid && <TriangleAlertIcon aria-hidden className="size-3 shrink-0" />}
                  <span className={COMBOBOX_CHIP_LABEL_CLASS}>{tag}</span>
                  {isInvalid && <span className="sr-only">({tagError})</span>}
                  {!isDisabled && (
                    <ComboboxPrimitive.ChipRemove
                      aria-label={`Remove ${tag}`}
                      // Removal is Base UI's, through the controlled Root. Doing it here too would fire the
                      // caller's handler twice. Adding is ours, in `commit`, since there is no options list.
                      onClick={() => onValidationError?.(null)}
                      className={cn(
                        COMBOBOX_CHIP_REMOVE_CLASS,
                        isInvalid &&
                          "text-danger hover:bg-danger/20 hover:text-danger focus-visible:ring-danger"
                      )}
                    >
                      <XIcon className="size-3" />
                    </ComboboxPrimitive.ChipRemove>
                  )}
                </ComboboxPrimitive.Chip>
              );
              if (!isInvalid) return chip;
              return (
                <Tooltip key={tag}>
                  <TooltipTrigger asChild>{chip}</TooltipTrigger>
                  <TooltipContent>{tagError}</TooltipContent>
                </Tooltip>
              );
            })}
            <ComboboxPrimitive.Input
              ref={forwardedRef}
              aria-invalid={isError || undefined}
              placeholder={tags.length === 0 ? placeholder : undefined}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={() => commit(draft)}
              className={cn(
                COMBOBOX_CHIPS_INPUT_CLASS,
                tags.length > 0 && !draft && "min-w-0 focus:min-w-24"
              )}
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
