import { z } from "zod";

// Mirrors AgentVaultDescriptionSchema on the backend, messages included.
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

export const agentVaultDescriptionSchema = z
  .string()
  .trim()
  .max(256, "A description can be at most 256 characters")
  .regex(
    NO_CONTROL_CHARS_RE,
    "This can't contain line breaks or other control characters. Check for a stray newline if you pasted it."
  );
