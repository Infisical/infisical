import { z } from "zod";

import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/helpers/agentVaultControlChars";

// Mirrors the backend's rules and messages. Callers map a blank description to null.
export const agentVaultDescriptionSchema = z
  .string()
  .trim()
  .max(256, "A description can be at most 256 characters")
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);

export const AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE =
  "A description can't contain invisible characters, such as zero-width spaces or text direction marks.";

// The rest of the backend's containsLogUnsafeCharacters, after the control characters the schema above refuses: format
// characters other than the zero-width joiners, C1 controls, the line and paragraph separators, the tags block, and lone
// surrogates.
const INVISIBLE_CHARS_RE =
  /[^\P{Cf}\u200C\u200D]|[\u0080-\u009f\u2028\u2029\u{E0000}-\u{E007F}\uD800-\uDFFF]/u;

// Agents read a service's description, so like the API this refuses text that renders as nothing.
export const agentVaultServiceDescriptionSchema = agentVaultDescriptionSchema.refine(
  (description) => !INVISIBLE_CHARS_RE.test(description),
  AGENT_VAULT_SERVICE_DESCRIPTION_MESSAGE
);
