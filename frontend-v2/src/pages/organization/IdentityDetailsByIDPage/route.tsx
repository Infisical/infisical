import { createFileRoute } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/identities/$identityId"
)({
  component: IdentityDetailsByIDPage
});
