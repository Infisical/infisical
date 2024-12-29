import { createFileRoute } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/ssh/$projectId/_ssh-layout/identities/$identityId"
)({
  component: IdentityDetailsByIDPage
});
