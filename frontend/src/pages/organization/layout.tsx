import { createFileRoute } from "@tanstack/react-router";

import { OrganizationLayout } from "@app/layouts/OrganizationLayout";

export const Route = createFileRoute("/_authenticate/_inject-org-details/organization/_layout")({
  component: OrganizationLayout
});
