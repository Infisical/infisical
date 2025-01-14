import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshOverviewPage } from "./SshOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/ssh/overview"
)({
  component: SshOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "products",
        link: linkOptions({ disabled: true, to: "/" })
      },
      {
        label: "SSH",
        link: linkOptions({ to: "/organization/ssh/overview" })
      }
    ]
  })
});
