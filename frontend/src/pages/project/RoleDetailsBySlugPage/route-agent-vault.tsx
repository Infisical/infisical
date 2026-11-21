import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AgentVaultAccessControlTab } from "@app/pages/agent-vault/AgentVaultAccessControlPage/AgentVaultAccessControlPage";
import { AgentVaultRoleDetailPage } from "@app/pages/agent-vault/AgentVaultRoleDetailPage/AgentVaultRoleDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/roles/$roleSlug"
)({
  component: AgentVaultRoleDetailPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/organizations/$orgId/projects/agent-vault/$projectId/access-management",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            },
            search: {
              selectedTab: AgentVaultAccessControlTab.Roles
            }
          })
        },
        {
          label: "Roles"
        }
      ]
    };
  }
});
