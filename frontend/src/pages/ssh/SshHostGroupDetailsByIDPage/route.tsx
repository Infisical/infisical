import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshHostGroupDetailsByIDPage } from "./SshHostGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/ssh/_ssh-layout/ssh-host-groups/$sshHostGroupId"
)({
  component: SshHostGroupDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Hosts",
          link: linkOptions({
            to: "/projects/$projectId/ssh/overview",
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
