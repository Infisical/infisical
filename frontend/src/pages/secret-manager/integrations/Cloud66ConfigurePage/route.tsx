import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { Cloud66ConfigurePage } from "./Cloud66ConfigurePage";

const Cloud66ConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloud-66/create"
)({
  component: Cloud66ConfigurePage,
  validateSearch: zodValidator(Cloud66ConfigurePageQueryParamsSchema)
});
