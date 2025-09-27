import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ProjectAccessControlTabs } from "@app/types/project";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/pam/$projectId/_pam-layout/identities/$identityId"
)({
  component: IdentityDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/projects/secret-management/$projectId/access-management",
            params: {
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
