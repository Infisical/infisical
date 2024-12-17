import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

export const Route = createFileRoute("/_authenticate/_org_details/_org-layout/organization/")({
  beforeLoad: ({ context }) => {
    redirect({
      throw: true,
      to: `/organization/$organizationId/${ProjectType.SecretManager}/overview` as const,
      params: {
        organizationId: String(context.organizationId)
      }
    });
  }
});
