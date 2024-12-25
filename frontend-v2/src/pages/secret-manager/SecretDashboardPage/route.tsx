import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretDashboardPage } from "./SecretDashboardPage";

const SecretDashboardPageQueryParamsSchema = z.object({
  secretPath: z.string().catch("/"),
  search: z.string().catch(""),
  tags: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/secrets/$envSlug/"
)({
  component: SecretDashboardPage,
  validateSearch: zodValidator(SecretDashboardPageQueryParamsSchema)
});
