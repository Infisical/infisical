import { createFileRoute } from "@tanstack/react-router";

import { SshCasPage } from "./SshCasPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/ssh/$projectId/_ssh-layout/cas"
)({
  component: SshCasPage
});
