import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OverviewPage } from "./OverviewPage";

const SecretOverviewPageQuerySchema = z.object({
  search: z.string().catch(""),
  secretPath: z.string().catch("/")
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/overview/"
)({
  component: OverviewPage,
  validateSearch: zodValidator(SecretOverviewPageQuerySchema)
});
