/**
 * Copy text to the clipboard with a fallback for non-secure contexts.
 *
 * `navigator.clipboard` is only defined in secure contexts (HTTPS or localhost).
 * Self-hosted Infisical instances served over plain HTTP — and some embedded
 * browsers — leave it `undefined`, which would otherwise crash with
 * `TypeError: Cannot read properties of undefined (reading 'writeText')`
 * (see #6254).
 *
 * Strategy:
 * 1. Use the modern Async Clipboard API when available.
 * 2. Fall back to `document.execCommand('copy')` with a transient textarea.
 *    Although deprecated, it is still supported by every major browser and
 *    works in non-secure contexts.
 *
 * @returns `true` if the copy succeeded, `false` otherwise.
 */
export const copyToClipboard = async (value: string): Promise<boolean> => {
  // Modern path — secure context with the Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to legacy path (e.g. permission denied in a focused-frame edge case)
    }
  }

  // Legacy fallback — execCommand with a hidden textarea.
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = value;
  // Position off-screen but keep it visible to the layout so selection works.
  // `position: fixed` avoids triggering page scroll on focus.
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");

  document.body.appendChild(textarea);

  try {
    // Preserve any existing selection so we can restore it afterwards.
    const previousSelection = document.getSelection();
    const previousRange =
      previousSelection && previousSelection.rangeCount > 0
        ? previousSelection.getRangeAt(0)
        : null;

    textarea.select();
    textarea.setSelectionRange(0, value.length);

    const succeeded = document.execCommand("copy");

    if (previousRange && previousSelection) {
      previousSelection.removeAllRanges();
      previousSelection.addRange(previousRange);
    }

    return succeeded;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
};
