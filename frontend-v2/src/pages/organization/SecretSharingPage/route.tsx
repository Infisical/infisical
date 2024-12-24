import { createFileRoute } from "@tanstack/react-router";

import { SecretSharingPage } from "./SecretSharingPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/secret-sharing/"
)({
  component: SecretSharingPage
});
