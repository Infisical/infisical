import fs from "node:fs";

import { repoRelative } from "../paths.js";
import type { SourceQuote } from "../types.js";

/**
 * Quote verification and line recovery.
 *
 * Two separate jobs, deliberately not conflated:
 *
 *  1. Verify the model quoted the step rather than inventing plausible text. Checked against
 *     the flattened step text, because that is what the model was shown.
 *
 *  2. Recover the real line number in the real file, by searching the raw MDX. The model is
 *     never trusted for this: a wrong line silently puts a GitHub suggestion on the wrong
 *     row, which is worse than having no suggestion at all.
 */

/** Collapses whitespace and unifies the dash and quote characters docs/ mixes freely. */
export const normalizeForMatch = (text: string): string =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const quoteAppearsIn = (quote: string, haystack: string): boolean => {
  const needle = normalizeForMatch(quote);
  if (needle.length === 0) return false;
  return normalizeForMatch(haystack).includes(needle);
};

/**
 * Finds the line in a raw source file that best corresponds to a quote.
 *
 * The quote came from flattened prose, so it will not match raw MDX bytes exactly: bold
 * markers, JSX attributes and link syntax have all been stripped. So this scores lines by
 * distinctive-word overlap and biases toward lines near the step, which is where the text
 * actually lives.
 */
export const locateQuoteLine = (
  filePath: string,
  quote: string,
  nearLine: number
): number => {
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, "utf8").split("\n");
  } catch {
    return nearLine;
  }

  const words = normalizeForMatch(quote)
    .split(" ")
    // Short words match everywhere and carry no signal.
    .filter((word) => word.length > 3);

  if (words.length === 0) return nearLine;

  let bestLine = nearLine;
  let bestScore = -1;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const normalized = normalizeForMatch(raw);
    if (normalized.length === 0) return;

    let hits = 0;
    for (const word of words) {
      if (normalized.includes(word)) hits += 1;
    }
    if (hits === 0) return;

    // Proximity is a tiebreak, not the signal: the same sentence can appear in several steps
    // of the same guide, and the nearest copy is the right one.
    const distance = Math.abs(lineNumber - nearLine);
    const score = hits / words.length - distance / 10_000;

    if (score > bestScore) {
      bestScore = score;
      bestLine = lineNumber;
    }
  });

  // A weak best match means the quote does not really live on any one line (it spans several,
  // or came from a step title attribute). Fall back to the step's own line.
  return bestScore >= 0.5 ? bestLine : nearLine;
};

/**
 * Takes the absolute path, because locating the line means reading the file, and stores the
 * repo-relative one, because the result is committed.
 */
export const buildSourceQuote = (
  text: string,
  absoluteFile: string,
  nearLine: number
): SourceQuote => ({
  text: text.trim(),
  file: repoRelative(absoluteFile),
  line: locateQuoteLine(absoluteFile, text, nearLine)
});
