import { createFileRoute } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/identities/$identityId")({
  component: IdentityDetailsByIDPage
});
