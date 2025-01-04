import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ChecklyConfigurePage } from "./ChecklyConfigurePage";

const ChecklyConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/checkly/create"
)({
  component: ChecklyConfigurePage,
  validateSearch: zodValidator(ChecklyConfigurePageQueryParamsSchema)
});
