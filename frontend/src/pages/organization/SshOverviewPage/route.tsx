import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshOverviewPage } from "./SshOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/ssh/overview"
)({
  component: SshOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "SSH",
        link: linkOptions({ to: "/organization/ssh/overview" })
      }
    ]
  })
});
