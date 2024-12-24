import { createFileRoute } from "@tanstack/react-router";

import { AdminPage } from "./AdminPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/admin/"
)({
  component: AdminPage
});
