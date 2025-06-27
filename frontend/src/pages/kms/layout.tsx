import { createFileRoute } from "@tanstack/react-router";

import { KmsLayout } from "@app/layouts/KmsLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/kms/_kms-layout"
)({
  component: KmsLayout
});
