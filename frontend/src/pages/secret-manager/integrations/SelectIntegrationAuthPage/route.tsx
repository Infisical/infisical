import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SelectIntegrationAuthPage } from "./SelectIntegrationAuthPage";

const SelectIntegrationAuthPageQueryParamsSchema = z.object({
  integrationSlug: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/select-integration-auth"
)({
  component: SelectIntegrationAuthPage,
  validateSearch: zodValidator(SelectIntegrationAuthPageQueryParamsSchema)
});
