import { createFileRoute, retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { OrganizationLayout } from "@app/layouts/OrganizationLayout";

export const Route = createFileRoute("/_authenticate/_inject-org-details/_org-layout")({
  component: OrganizationLayout,
  validateSearch: z.object({
    subOrganization: z.string().optional()
  }),
  search: {
    middlewares: [retainSearchParams(["subOrganization"])]
  }
});
