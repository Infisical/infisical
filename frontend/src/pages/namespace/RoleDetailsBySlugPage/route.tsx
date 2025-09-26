import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OrgAccessControlTabSections } from "@app/types/org";

import { RoleBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceName/_namespace-layout/roles/$roleSlug"
)({
  component: RoleBySlugPage,
  beforeLoad: ({ params }) => {
    return {
      breadcrumbs: [
        // ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/organization/namespaces/$namespaceName/access-management",
            params: {
              namespaceName: params.namespaceName
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
