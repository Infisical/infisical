import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { McpScopeSelectPage } from "./McpScopeSelectPage";

const QueryParams = z.object({
  response_type: z.string().catch(""),
  client_id: z.string().catch(""),
  code_challenge: z.string().catch(""),
  code_challenge_method: z.string().catch(""),
  redirect_uri: z.string().catch(""),
  scope: z.string().catch(""),
  resource: z.string().catch(""),
  state: z.string().catch("").optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/mcp-scope"
)({
  component: McpScopeSelectPage,
  validateSearch: zodValidator(QueryParams)
});
