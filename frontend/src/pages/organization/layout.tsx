import { createFileRoute, retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";

import { handoffToV4 } from "@app/helpers/v4Bridge";
import { OrganizationLayout } from "@app/layouts/OrganizationLayout";

export const Route = createFileRoute("/_authenticate/_inject-org-details/_org-layout")({
  beforeLoad: ({ location }) => handoffToV4(location),
  component: function OrganizationLayoutRoute() {
    const { organizationId } = Route.useRouteContext();
    return <OrganizationLayout key={organizationId} />;
  },
  validateSearch: z.object({
    subOrganization: z.string().optional()
  }),
  search: {
    middlewares: [retainSearchParams(["subOrganization"])]
  }
});
