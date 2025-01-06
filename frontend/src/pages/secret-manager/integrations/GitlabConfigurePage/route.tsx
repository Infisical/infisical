import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GitlabConfigurePage } from "./GitlabConfigurePage";

const GitlabConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gitlab/create"
)({
  component: GitlabConfigurePage,
  validateSearch: zodValidator(GitlabConfigurePageQueryParamsSchema)
});
