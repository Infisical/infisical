import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { TerraformCloudConfigurePage } from "./TerraformCloudConfigurePage";

const TerraformCloudConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/terraform-cloud/create"
)({
  component: TerraformCloudConfigurePage,
  validateSearch: zodValidator(TerraformCloudConfigurePageQueryParamsSchema)
});
