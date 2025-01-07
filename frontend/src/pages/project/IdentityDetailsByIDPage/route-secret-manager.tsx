import { createFileRoute } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/identities/$identityId"
)({
  component: IdentityDetailsByIDPage
});
