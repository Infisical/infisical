import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { GroupDetailsByIDPage } from "./GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/kms/$projectId/_kms-layout/groups/$groupId"
)({
  component: GroupDetailsByIDPage,
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
          label: "Groups"
        }
      ]
    };
  }
});
