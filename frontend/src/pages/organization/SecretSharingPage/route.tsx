import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SecretSharingPage } from "./SecretSharingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/secret-sharing"
)({
  component: SecretSharingPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "home",
        link: linkOptions({ to: "/" })
      },
      {
        label: "secret sharing"
      }
    ]
  })
});
