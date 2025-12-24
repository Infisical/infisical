import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SqlConsolePage } from "./SqlConsolePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/sql-console/$sessionId"
)({
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Accounts",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/accounts",
            params: () => params as never
          })
        },
        {
          label: "SQL Console"
        }
      ]
    };
  },
  component: SqlConsolePage
});

