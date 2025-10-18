import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { OrganizationLayout } from "@app/layouts/OrganizationLayout";
import { z } from "zod";

export const Route = createFileRoute("/_authenticate/_inject-org-details/_org-layout")({
  component: OrganizationLayout,
  validateSearch: z.object({
    subOrganization: z.string().optional()
  }),
  search: {
    middlewares: [retainSearchParams(["subOrganization"])]
  }
});
