import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { HasuraCloudConfigurePage } from "./HasuraCloudConfigurePage";

const HasuraCloudConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/hasura-cloud/create"
)({
  component: HasuraCloudConfigurePage,
  validateSearch: zodValidator(HasuraCloudConfigurePageQueryParamsSchema)
});
