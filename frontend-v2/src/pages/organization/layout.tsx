import { createFileRoute } from "@tanstack/react-router";

import { OrganizationLayout } from "@app/layouts/OrganizationLayout";

export const Route = createFileRoute("/_authenticate/_ctx-org-details/organization/_layout-org")({
  component: OrganizationLayout
});
