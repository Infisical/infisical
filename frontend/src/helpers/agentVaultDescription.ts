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
