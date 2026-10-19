import * as React from "react";

export function useOwnedEscape<ElementType extends HTMLElement>(
  ref: React.ForwardedRef<ElementType>,
  onEscapeKeyDown?: (event: KeyboardEvent) => void
) {
  const content = React.useRef<ElementType | null>(null);
  const attach = React.useCallback(
    (node: ElementType | null) => {
      content.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) {
        // eslint-disable-next-line no-param-reassign -- React attaches forwarded object refs by mutation.
        ref.current = node;
      }
    },
    [ref]
  );
  const handle = (event: KeyboardEvent) => {
    onEscapeKeyDown?.(event);
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const owner = event.target.closest("[data-v4-escape-owner]");
    if (owner && content.current?.contains(owner)) event.preventDefault();
  };
  return { ref: attach, onEscapeKeyDown: handle };
}
