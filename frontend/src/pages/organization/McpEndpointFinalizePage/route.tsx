import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { McpEndpointFinalizePage } from "./McpEndpointFinalizePage";

const McpEndpointFinalizePageQuerySchema = z.object({
  response_type: z.string(),
  client_id: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.string(),
  redirect_uri: z.string(),
  resource: z.string().optional(),
  state: z.string().optional(),
  scope: z.string().optional(),
  endpointId: z.string()
});

export const Route = createFileRoute("/_authenticate/organization/mcp-endpoint-finalize")({
  component: McpEndpointFinalizePage,
  validateSearch: zodValidator(McpEndpointFinalizePageQuerySchema)
});
