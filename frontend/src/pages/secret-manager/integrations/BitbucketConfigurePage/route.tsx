import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { BitbucketConfigurePage } from "./BitbucketConfigurePage";

const BitbucketConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/bitbucket/create"
)({
  component: BitbucketConfigurePage,
  validateSearch: zodValidator(BitbucketConfigurePageQueryParamsSchema)
});
