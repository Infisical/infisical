import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-scanning/$projectId/_secret-scanning-layout/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/secret-scanning/$projectId/access-management",
            params: {
              projectId: params.projectId
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
