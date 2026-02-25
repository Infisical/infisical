import { createFileRoute } from "@tanstack/react-router";

import { InfraEditorPage } from "./InfraEditorPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/editor"
)({
  component: InfraEditorPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        { label: "Editor" }
      ]
    };
  }
});
