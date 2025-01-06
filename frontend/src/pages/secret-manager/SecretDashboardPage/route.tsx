import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretDashboardPage } from "./SecretDashboardPage";

const SecretDashboardPageQueryParamsSchema = z.object({
  secretPath: z.string().catch("/"),
  search: z.string().catch(""),
  tags: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/secrets/$envSlug"
)({
  component: SecretDashboardPage,
  validateSearch: zodValidator(SecretDashboardPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ secretPath: "/", search: "", tags: "" })]
  }
});
