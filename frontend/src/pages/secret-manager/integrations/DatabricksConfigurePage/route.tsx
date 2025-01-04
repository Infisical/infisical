import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { DatabricksConfigurePage } from "./DatabricksConfigurePage";

const DatabricksConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/databricks/create"
)({
  component: DatabricksConfigurePage,
  validateSearch: zodValidator(DatabricksConfigurePageQueryParamsSchema)
});
