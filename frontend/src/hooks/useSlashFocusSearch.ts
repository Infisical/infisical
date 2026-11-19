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

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

const isEditable = (element: EventTarget | Element | null) =>
  element instanceof Element && Boolean(element.closest(EDITABLE_SELECTOR));

export const useSlashFocusSearch = (ref: RefObject<HTMLInputElement | null>) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      const isFind =
        event.key.toLowerCase() === "f" &&
        (IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
        !event.shiftKey &&
        !event.altKey;

      if ((!isSlash && !isFind) || event.repeat || event.defaultPrevented) return;

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
  }, [ref]);
};
