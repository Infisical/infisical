import { createFileRoute } from "@tanstack/react-router";

import { SecretManagerLayout } from "@app/layouts/SecretManagerLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout"
)({
  component: SecretManagerLayout
});
