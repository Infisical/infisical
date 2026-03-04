import type { Change } from "diff";
import { diffLines, diffWords } from "diff";

/**
 * Scrolls a container to center the first changed element if it's not visible
 */
export const scrollToFirstChange = (container: HTMLDivElement | null) => {
  if (!container) return;

  const firstChange = container.querySelector('[data-first-change="true"]') as HTMLElement;
  if (!firstChange) return;

  const elementTop = firstChange.offsetTop;
  const containerHeight = container.clientHeight;
  const elementHeight = firstChange.offsetHeight;

  const isVisible =
    elementTop >= container.scrollTop &&
    elementTop + elementHeight <= container.scrollTop + containerHeight;

  if (!isVisible) {
    const targetScrollTop = elementTop - containerHeight / 2 + elementHeight / 2;
    container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" });
  }
};

export const areValuesEqual = (
  oldValue: string | null | undefined,
  newValue: string | null | undefined
): boolean => {
  return (oldValue ?? "") === (newValue ?? "");
};

export const isSingleLine = (str: string | null | undefined): boolean => {
  if (!str || typeof str !== "string") return true;
  return !str.includes("\n");
};

/**
 * Use jsdiff for line-by-line diffing - returns Change[] directly
 */
export const computeLineDiff = (oldText: string, newText: string): Change[] => {
  return diffLines(oldText, newText, {
    ignoreWhitespace: false,
    newlineIsToken: false
  });
};

/**
 * Use jsdiff for word-level diffing - returns Change[] directly or null
 * Returns null when there are no common words, indicating entire line should be highlighted
 */
export const computeWordDiff = (oldText: string, newText: string): Change[] | null => {
  const changes = diffWords(oldText, newText);

  // Check if there are any common words (excluding whitespace and punctuation)
  const hasCommonWords = changes.some(
    (change) => !change.added && !change.removed && /\w/.test(change.value)
  );

  // If no common words, return null to indicate entire line should be highlighted
  if (!hasCommonWords && oldText.trim() !== "" && newText.trim() !== "") {
    return null;
  }

  return changes;
};

/**
 * Helper to split change value into lines, removing trailing empty string from split
 */
export const splitChangeIntoLines = (value: string): string[] => {
  const lines = value.split("\n");
  // Remove trailing empty string (artifact of split when value ends with newline)
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
};
