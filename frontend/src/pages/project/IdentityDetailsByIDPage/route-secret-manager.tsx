import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/identities/$identityId"
)({
  component: IdentityDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/secret-manager/$projectId/access-management",
            params: {
              projectId: params.projectId
            }
          })
        },
        {
          label: "Identities"
        }
      ]
    };
  }
});
