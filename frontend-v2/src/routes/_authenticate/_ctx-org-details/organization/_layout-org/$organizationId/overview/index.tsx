import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/$organizationId/overview/"
)({
  beforeLoad: ({ context }) => {
    throw redirect({
      to: `/organization/$organizationId/${ProjectType.SecretManager}/overview` as const,
      params: {
        organizationId: context.organizationId
      }
    });
  }
});
