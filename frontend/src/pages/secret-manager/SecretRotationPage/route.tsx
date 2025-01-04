import { createFileRoute } from "@tanstack/react-router";

import { SecretRotationPage } from "./SecretRotationPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/secret-rotation"
)({
  component: SecretRotationPage
});
