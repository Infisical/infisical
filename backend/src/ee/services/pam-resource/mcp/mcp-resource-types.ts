import { z } from "zod";

import {
  McpAccountCredentialsSchema,
  McpAccountSchema,
  McpResourceConnectionDetailsSchema,
  McpResourceSchema
} from "./mcp-resource-schemas";

// Resources
export type TMcpResource = z.infer<typeof McpResourceSchema>;
export type TMcpResourceConnectionDetails = z.infer<typeof McpResourceConnectionDetailsSchema>;

// Accounts
export type TMcpAccount = z.infer<typeof McpAccountSchema>;
export type TMcpAccountCredentials = z.infer<typeof McpAccountCredentialsSchema>;
