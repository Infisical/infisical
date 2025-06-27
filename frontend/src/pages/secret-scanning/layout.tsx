import { createFileRoute } from "@tanstack/react-router";

import { SecretScanningLayout } from "@app/layouts/SecretScanningLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-scanning/_secret-scanning-layout"
)({
  component: SecretScanningLayout
});
