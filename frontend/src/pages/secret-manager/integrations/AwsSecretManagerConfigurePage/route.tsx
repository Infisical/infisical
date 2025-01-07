import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AwsSecretManagerConfigurePage } from "./AwsSecretManagerConfigurePage";

const AwsSecretManagerConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/aws-secret-manager/create"
)({
  component: AwsSecretManagerConfigurePage,
  validateSearch: zodValidator(AwsSecretManagerConfigurePageQueryParamsSchema)
});
