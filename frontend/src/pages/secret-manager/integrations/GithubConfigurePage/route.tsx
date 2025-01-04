import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GithubConfigurePage } from "./GithubConfigurePage";

const GithubConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/github/create"
)({
  component: GithubConfigurePage,
  validateSearch: zodValidator(GithubConfigurePageQueryParamsSchema)
});
