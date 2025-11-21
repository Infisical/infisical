import { createFileRoute } from "@tanstack/react-router";

import { SshCertsPage } from "./SshCertsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ssh/$projectId/_ssh-layout/certificates"
)({
  component: SshCertsPage
});
