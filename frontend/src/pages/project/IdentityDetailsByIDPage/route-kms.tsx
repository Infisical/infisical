import { createFileRoute } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/kms/$projectId/_kms-layout/identities/$identityId"
)({
  component: IdentityDetailsByIDPage
});
