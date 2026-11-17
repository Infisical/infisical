import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AgentVaultServicesPage } from "./AgentVaultServicesPage";

const agentVaultServicesSearchParams = z.object({
  requiresSetup: z.boolean().optional().catch(undefined)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/services"
)({
  component: AgentVaultServicesPage,
  validateSearch: zodValidator(agentVaultServicesSearchParams),
  search: {
    middlewares: [stripSearchParams({ requiresSetup: undefined })]
  },
  beforeLoad: ({ context }) => {
    return { breadcrumbs: [...context.breadcrumbs, { label: "Services" }] };
  }
});
