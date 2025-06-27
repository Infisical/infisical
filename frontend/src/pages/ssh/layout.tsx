import { createFileRoute } from "@tanstack/react-router";

import { SshLayout } from "@app/layouts/SshLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/ssh/_ssh-layout"
)({
  component: SshLayout
});
