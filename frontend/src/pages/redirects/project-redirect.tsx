import { createFileRoute, redirect } from "@tanstack/react-router";

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

    throw redirect({
      to: "/organizations/$orgId/projects/$" as const,
      params: { orgId, _splat: remainingPath },
      search
    });
  }
});
