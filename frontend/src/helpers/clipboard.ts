export const copyToClipboard = async (text: string) => {
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

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);

  let copied = false;
  try {
    textArea.select();
    copied = document.execCommand("copy");
  } finally {
    textArea.remove();
  }

  if (!copied) {
    throw new Error("Clipboard access is unavailable");
  }
};
