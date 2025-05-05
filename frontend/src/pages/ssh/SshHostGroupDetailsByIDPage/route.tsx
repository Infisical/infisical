import { createFileRoute } from "@tanstack/react-router";

import { SshHostGroupDetailsByIDPage } from "./SshHostGroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/ssh/$projectId/_ssh-layout/ssh-host-groups/$sshHostGroupId"
)({
  component: SshHostGroupDetailsByIDPage
});
