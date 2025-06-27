import { createFileRoute } from "@tanstack/react-router";

import { SshHostGroupDetailsByIDPage } from "./SshHostGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/ssh/_ssh-layout/ssh-host-groups/$sshHostGroupId"
)({
  component: SshHostGroupDetailsByIDPage
});
