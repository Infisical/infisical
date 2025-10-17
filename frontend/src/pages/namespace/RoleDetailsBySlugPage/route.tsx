import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OrgAccessControlTabSections } from "@app/types/org";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceId/_namespace-layout/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage,
  beforeLoad: ({ params, context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/organization/namespaces/$namespaceId/access-management",
            params: {
              namespaceId: params.namespaceId
            },
            search: {
              selectedTab: OrgAccessControlTabSections.Roles
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
