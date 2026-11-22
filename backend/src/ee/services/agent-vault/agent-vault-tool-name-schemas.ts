import RE2 from "re2";
import { z } from "zod";

import { refineNoDuplicates } from "./agent-vault-list-schema-fns";

const AGENT_VAULT_MAX_TOOL_NAME_LENGTH = 128;
export const AGENT_VAULT_MAX_ALLOWED_TOOLS = 500;

// The MCP spec says a tool name SHOULD be 1-128 of these characters; held as a must so a name can't carry characters
// that Postgres drivers rewrite or that the Go backend folds together. The proxy compares names exactly.
const TOOL_NAME_RE = new RE2(/^[A-Za-z0-9_.-]+$/);

const toolNameError = (name: string) => {
  if (!name) return "A tool name can't be empty.";
  if (name.length > AGENT_VAULT_MAX_TOOL_NAME_LENGTH)
    return `"${name.slice(0, 40)}…" is longer than ${AGENT_VAULT_MAX_TOOL_NAME_LENGTH} characters.`;
  if (!TOOL_NAME_RE.test(name))
    return `"${name}" can only contain letters, numbers, underscores (_), hyphens (-), and dots (.).`;
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
