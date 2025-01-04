import { createFileRoute } from "@tanstack/react-router";

import { NoOrgPage } from "./NoOrgPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/none"
)({
  component: NoOrgPage
});
