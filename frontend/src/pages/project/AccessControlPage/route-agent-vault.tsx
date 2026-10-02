import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import {
  AgentVaultAccessControlPage,
  AgentVaultAccessControlTab
} from "@app/pages/agent-vault/AgentVaultAccessControlPage/AgentVaultAccessControlPage";

const AccessControlPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(AgentVaultAccessControlTab).catch(AgentVaultAccessControlTab.Users),
  requesterEmail: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/access-management"
)({
  component: AgentVaultAccessControlPage,
  validateSearch: zodValidator(AccessControlPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ requesterEmail: "" })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control"
        }
      ]
    };
  }
});
