import { createFileRoute } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/identities/$identityId/"
)({
  component: IdentityDetailsByIDPage
});
