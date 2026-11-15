import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectTemplateDetailsPage } from "./ProjectTemplateDetailsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId"
)({
  staticData: { readiness: "full" },
  component: ProjectTemplateDetailsPage,
  validateSearch: zodValidator(z.object({ role: z.string().optional().catch(undefined) })),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
