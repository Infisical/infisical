import { createFileRoute } from "@tanstack/react-router";

import { SshHostsPage } from "./SshHostsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ssh/$projectId/_ssh-layout/overview"
)({
  component: SshHostsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Hosts"
        }
      ]
    };
  }
});
