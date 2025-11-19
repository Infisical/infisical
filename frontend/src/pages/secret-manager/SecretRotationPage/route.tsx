import { createFileRoute } from "@tanstack/react-router";

import { SecretRotationPage } from "./SecretRotationPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/secret-rotation"
)({
  component: SecretRotationPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Secret Rotation"
        }
      ]
    };
  }
});
