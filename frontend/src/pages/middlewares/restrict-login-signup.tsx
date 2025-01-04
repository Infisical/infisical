import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";
import { ProjectType } from "@app/hooks/api/workspace/types";

const QueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined)
});

export const Route = createFileRoute("/_restrict-login-signup")({
  validateSearch: zodValidator(QueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ callback_port: undefined })]
  },
  beforeLoad: async ({ context, location, search }) => {
    if (!context.serverConfig.initialized) {
      if (location.pathname.endsWith("/admin/signup")) return;
      throw redirect({ to: "/admin/signup" });
    }

    const data = await context.queryClient
      .fetchQuery({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => {
        return null;
      });
    if (!data) return;

    setAuthToken(data.token);
    // to do cli login
    if (search?.callback_port) {
      if (location.pathname.endsWith("select-organization") || location.pathname.endsWith("login"))
        return;
    }

    if (!data.organizationId) {
      if (location.pathname.endsWith("select-organization")) return;
      throw redirect({ to: "/login/select-organization" });
    }
    throw redirect({
      to: `/organization/${ProjectType.SecretManager}/overview` as const
    });
  }
});
