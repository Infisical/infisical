import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/workspace/types";

export const Route = createFileRoute("/_authenticate/_ctx-org-details/organization/_layout-org/")({
  beforeLoad: () => {
    redirect({
      throw: true,
      to: `/organization/${ProjectType.SecretManager}/overview` as const
    });
  }
});
