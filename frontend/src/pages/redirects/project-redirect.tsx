import { createFileRoute, redirect } from "@tanstack/react-router";

import { localStorageService } from "@app/helpers/localStorage";

export const Route = createFileRoute("/_authenticate/_inject-org-details/projects/$")({
  beforeLoad: ({ context, params, search }) => {
    const orgId = context.organizationId;

    if (!orgId) {
      throw redirect({
        to: "/login/select-organization"
      });
    }

    // eslint-disable-next-line no-underscore-dangle
    const remainingPath = params._splat || "";
    const projectId = localStorageService.getIintegrationProjectId();

    if (!projectId) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId }
      });
    }

    throw redirect({
      to: `/organizations/$orgId/projects/${remainingPath}` as const,
      params: { orgId, projectId },
      search
    });
  }
});
