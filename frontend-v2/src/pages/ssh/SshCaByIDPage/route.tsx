import { createFileRoute } from "@tanstack/react-router";

import { SshCaByIDPage } from "./SshCaByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/ssh/$projectId/_ssh-layout/ca/$caId"
)({
  component: SshCaByIDPage
});
