import { OrganizationLayout } from "@app/layouts/OrganizationLayout";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticate/_org_details/_organization_layout")({
  component: OrganizationLayout
});
