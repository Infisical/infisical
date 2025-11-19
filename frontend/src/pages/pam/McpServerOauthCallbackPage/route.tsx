import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { McpServerOauthCallbackPage } from "./McpServerOauthCallbackPage";

const QuerySchema = z.object({
  code: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/pam/$projectId/_pam-layout/mcp-server-oauth/$accountId/callback"
)({
  component: McpServerOauthCallbackPage,
  validateSearch: zodValidator(QuerySchema),
  search: {
    middlewares: [stripSearchParams({ code: "" })]
  }
});
