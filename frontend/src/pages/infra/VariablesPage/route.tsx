import { createFileRoute } from "@tanstack/react-router";

import { InfraVariablesPage } from "./InfraVariablesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/variables"
)({
  component: InfraVariablesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        { label: "Variables" }
      ]
    };
  }
});
