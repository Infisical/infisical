import { createFileRoute } from "@tanstack/react-router";

import { AWSSecretManagerAuthorizePage } from "./AwsSecretManagerAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/aws-secret-manager/authorize"
)({
  component: AWSSecretManagerAuthorizePage
});
