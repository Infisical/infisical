import * as React from "react";

/** Data attribute name to the selector that turns it on. */
export type DescendantFlags = Readonly<Record<string, string>>;

type Watch = {
  /** Attributes whose changes below the element can flip a flag. */
  attributes?: readonly string[];
  /** false watches only the element's own children. */
  subtree?: boolean;
  /** Re-checks on focus moving in or out, for :focus-visible selectors. */
  focus?: boolean;
  /** Flags set on each element below that matches the selector, instead of on the element itself. */
  marks?: DescendantFlags;
};

const setFlag = (element: Element, name: string, on: boolean) => {
  if (element.hasAttribute(name) !== on) element.toggleAttribute(name, on);
};

export const assignRef = <T>(ref: React.Ref<T> | undefined, value: T | null) => {
  if (typeof ref === "function") ref(value);
  else if (ref) {
    const target = ref;
    target.current = value;
  }
};

/**
 * Mirrors state the component does not own, such as a slotted control's focus, invalid or disabled
 * state or which slots a caller composed, onto data attributes, re-checked only on this element's own
 * focus changes and mutations. A :has() selector instead re-checks on every DOM change in the
 * document, so one cell update in a large table relayouts the page. Returns the ref to attach;
 * flags and watch must be module constants.
 */
export function useDescendantFlags<T extends Element>(
  flags: DescendantFlags,
  watch: Watch = {},
  forwardedRef?: React.Ref<T>
) {
  const [node, setNode] = React.useState<T | null>(null);
  const ref = React.useCallback(
    (element: T | null) => {
      setNode(element);
      assignRef(forwardedRef, element);
    },
    [forwardedRef]
  );
  const { attributes, subtree = true, focus = false, marks } = watch;
  const sync = React.useCallback(() => {
    if (!node) return;
    Object.entries(flags).forEach(([name, selector]) =>
      setFlag(node, name, node.querySelector(selector) !== null)
    );
    if (marks)
      Object.entries(marks).forEach(([name, selector]) => {
        const hits = new Set(node.querySelectorAll(selector));
        node.querySelectorAll(`[${name}]`).forEach((element) => {
          if (!hits.has(element)) element.removeAttribute(name);
        });
        hits.forEach((element) => setFlag(element, name, true));
      });
  }, [node, flags, marks]);
  React.useLayoutEffect(sync);
  React.useLayoutEffect(() => {
    if (!node) return undefined;
    const observer = new MutationObserver(sync);
    observer.observe(node, {
      childList: true,
      subtree,
      ...(attributes?.length ? { attributes: true, attributeFilter: [...attributes] } : {})
    });
    const later = () => queueMicrotask(sync);
    if (focus) {
      node.addEventListener("focusin", later);
      node.addEventListener("focusout", later);
    }
    return () => {
      observer.disconnect();
      node.removeEventListener("focusin", later);
      node.removeEventListener("focusout", later);
    };
  }, [node, sync, subtree, attributes, focus]);
  return ref;
}
