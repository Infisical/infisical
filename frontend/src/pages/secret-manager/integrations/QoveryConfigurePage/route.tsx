import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { QoveryConfigurePage } from "./QoveryConfigurePage";

const QoveryConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/qovery/create"
)({
  component: QoveryConfigurePage,
  validateSearch: zodValidator(QoveryConfigurePageQueryParamsSchema)
});
