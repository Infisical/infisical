import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AWSParameterStoreConfigurePage } from "./AwsParamterStoreConfigurePage";

const AwsParameterStoreConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/aws-parameter-store/create"
)({
  component: AWSParameterStoreConfigurePage,
  validateSearch: zodValidator(AwsParameterStoreConfigurePageQueryParamsSchema)
});
