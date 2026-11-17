export const copyToClipboard = async (text: string, trigger?: HTMLElement | null) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the legacy API when Clipboard API access is unavailable.
    }
  }

  if (
    typeof document === "undefined" ||
    !document.createElement ||
    !document.body ||
    !document.execCommand
  ) {
    throw new Error("Clipboard access is unavailable");
  }

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.setAttribute("aria-hidden", "true");
  textArea.tabIndex = -1;
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  // Inside a modal dialog the focus trap pulls focus back from anything outside it, so the textarea
  // has to live next to the trigger for focus() and select() to give execCommand the right selection.
  (trigger?.parentElement ?? document.body).appendChild(textArea);

  let copied = false;
  try {
    textArea.focus({ preventScroll: true });
    textArea.select();
    copied = document.execCommand("copy");
  } finally {
    textArea.remove();
    previousFocus?.focus({ preventScroll: true });
  }

  if (!copied) {
    throw new Error("Clipboard access is unavailable");
  }
};
