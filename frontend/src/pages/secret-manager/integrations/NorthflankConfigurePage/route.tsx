import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { NorthflankConfigurePage } from "./NorthflankConfigurePage";

const NorthflankConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/northflank/create"
)({
  component: NorthflankConfigurePage,
  validateSearch: zodValidator(NorthflankConfigurePageQueryParamsSchema)
});
