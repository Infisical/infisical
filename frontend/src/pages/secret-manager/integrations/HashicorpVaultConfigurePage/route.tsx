import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { HashicorpVaultConfigurePage } from "./HashicorpVaultConfigurePage";

const HashicorpVaultConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/hashicorp-vault/create"
)({
  component: HashicorpVaultConfigurePage,
  validateSearch: zodValidator(HashicorpVaultConfigurePageQueryParamsSchema)
});
