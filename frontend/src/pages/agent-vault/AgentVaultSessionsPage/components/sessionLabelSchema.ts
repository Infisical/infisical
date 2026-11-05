import { z } from "zod";

export const SESSION_LABEL_MAX_LENGTH = 128;

// Mirrors the API's rule. With the u flag a lone surrogate is its own code point, so \p{Cs} sees it.
const DISALLOWED_LABEL_CHARS_RE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Zl}\p{Zp}]/u;

export const sessionLabelSchema = z
  .string()
  .trim()
  .max(SESSION_LABEL_MAX_LENGTH, `A label can be at most ${SESSION_LABEL_MAX_LENGTH} characters`)
  .refine(
    (label) => !DISALLOWED_LABEL_CHARS_RE.test(label),
    "A label can't contain line breaks, tabs, or invisible characters such as zero-width spaces or text direction marks."
  );
