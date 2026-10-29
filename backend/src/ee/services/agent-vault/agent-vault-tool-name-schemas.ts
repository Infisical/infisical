import RE2 from "re2";
import { z } from "zod";

import { refineNoDuplicates } from "./agent-vault-list-schema-fns";

const AGENT_VAULT_MAX_TOOL_NAME_LENGTH = 128;
export const AGENT_VAULT_MAX_ALLOWED_TOOLS = 500;

// The proxy compares names exactly, whatever characters they hold. Edge whitespace is refused as a likely typo, and
// control characters because the name is shown in the UI and audit logs.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_RE = new RE2(/[\u0000-\u001f\u007f-\u009f]/);

const toolNameError = (name: string) => {
  if (!name) return "A tool name can't be empty.";
  if (name.length > AGENT_VAULT_MAX_TOOL_NAME_LENGTH)
    return `"${name.slice(0, 40)}…" is longer than ${AGENT_VAULT_MAX_TOOL_NAME_LENGTH} characters.`;
  if (name !== name.trim()) return `"${name}" can't start or end with a space.`;
  if (CONTROL_CHARACTER_RE.test(name)) return "A tool name can't contain control characters.";
  return null;
};

// Not trimmed: names are exact and case-sensitive, so " read_file" is refused rather than quietly changed.
export const toolNameSchema = z.string().superRefine((name, ctx) => {
  const message = toolNameError(name);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

// NULL is the only "every tool". `.nullable()` without `.optional()`, so a PATCH omitting the field leaves the
// column alone and an explicit null clears it.
export const agentVaultAllowedToolsSchema = z
  .array(toolNameSchema)
  .min(1, "Send at least one tool name, or null to allow every tool.")
  .max(AGENT_VAULT_MAX_ALLOWED_TOOLS, `A service can allow at most ${AGENT_VAULT_MAX_ALLOWED_TOOLS} tools.`)
  .superRefine(refineNoDuplicates)
  .nullable();
