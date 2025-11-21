import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshHostGroupDetailsByIDPage } from "./SshHostGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ssh/$projectId/_ssh-layout/ssh-host-groups/$sshHostGroupId"
)({
  component: SshHostGroupDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Hosts",
          link: linkOptions({
            to: "/organizations/$orgId/projects/ssh/$projectId/overview",
            params
          })
        },
        {
          label: "Host Group"
        }
      ]
    };
  }
});
