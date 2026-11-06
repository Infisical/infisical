import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ProjectAccessControlTabs } from "@app/types/project";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/identities/$identityId"
)({
  component: IdentityDetailsByIDPage,
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
              selectedTab: ProjectAccessControlTabs.Identities
            }
          })
        },
        {
          label: "Machine Identity"
        }
      ]
    };
  }
});
