import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "./MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/kms/$projectId/_kms-layout/members/$membershipId"
)({
  component: MemberDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/kms/$projectId/access-management",
            params: {
              projectId: params.projectId
            }
          })
        },
        {
          label: "Users"
        }
      ]
    };
  }
});
