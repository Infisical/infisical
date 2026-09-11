import { RefObject, useEffect } from "react";

const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menu"]',
  "[cmdk-root]",
  ".cm-editor",
  ".monaco-editor",
  ".xterm"
].join(", ");

const OPEN_OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [cmdk-root]';

const isEditable = (element: EventTarget | Element | null) =>
  element instanceof Element && Boolean(element.closest(EDITABLE_SELECTOR));

/** Focuses and selects the referenced search input when `/` is pressed outside any editable element or overlay. */
export const useSlashFocusSearch = (
  ref: RefObject<HTMLInputElement | null>,
  { enabled = true }: UseSlashFocusSearchOptions = {}
) => {
  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.repeat ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      if (isEditable(event.target) || isEditable(document.activeElement)) return;
      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) return;

      const input = ref.current;
      if (!input || !input.isConnected || input.disabled || input.readOnly) return;

      event.preventDefault();
      input.focus();
      input.select();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [ref, enabled]);
};

type UseSlashFocusSearchOptions = {
  enabled?: boolean;
};
