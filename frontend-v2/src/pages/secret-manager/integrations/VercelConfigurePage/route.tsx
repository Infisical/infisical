import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { VercelConfigurePage } from "./VercelConfigurePage";

const VercelConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/vercel/create"
)({
  component: VercelConfigurePage,
  validateSearch: zodValidator(VercelConfigurePageQueryParamsSchema)
});
