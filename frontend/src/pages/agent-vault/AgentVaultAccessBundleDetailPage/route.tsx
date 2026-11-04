import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { agentVaultCreateIntentSearchParams } from "@app/hooks/useAgentVaultCreateIntent";
import { agentVaultSkillSheetSearchParams } from "@app/hooks/useAgentVaultSheetState";

import { AgentVaultAccessBundleDetailPage } from "./AgentVaultAccessBundleDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/access-bundles/$accessBundleId"
)({
  component: AgentVaultAccessBundleDetailPage,
  validateSearch: zodValidator(
    agentVaultSkillSheetSearchParams.merge(agentVaultCreateIntentSearchParams)
  ),
  search: {
    middlewares: [stripSearchParams({ skillId: undefined })]
  },
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Bundles",
          link: linkOptions({
            to: "/organizations/$orgId/agent-vault/access-bundles",
            params: { orgId: params.orgId }
          })
        },
        { label: "Access Bundle" }
      ]
    };
  }
});
