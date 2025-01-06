import { createFileRoute } from "@tanstack/react-router";

import { AdminPage } from "./AdminPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/admin"
)({
  component: AdminPage
});
