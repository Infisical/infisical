import { createFileRoute } from "@tanstack/react-router";

import { AWSParameterStoreAuthorizeIntegrationPage } from "./AwsParameterStoreAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/aws-parameter-store/authorize"
)({
  component: AWSParameterStoreAuthorizeIntegrationPage
});
