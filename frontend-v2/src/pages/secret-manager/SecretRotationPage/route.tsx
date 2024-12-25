import { createFileRoute } from "@tanstack/react-router";

import { SecretRotationPage } from "./SecretRotationPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/secret-rotation/"
)({
  component: SecretRotationPage
});
