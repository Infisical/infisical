import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GcpSecretManagerConfigurePage } from "./GcpSecretManagerConfigurePage";

const GcpConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/create"
)({
  component: GcpSecretManagerConfigurePage,
  validateSearch: zodValidator(GcpConfigurePageQueryParamsSchema)
});
