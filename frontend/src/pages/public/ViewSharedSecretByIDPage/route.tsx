import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";

import { ViewSharedSecretByIDPage } from "./ViewSharedSecretByIDPage";

const SharedSecretByIDPageQuerySchema = z.object({
  key: z.string().catch(""),
  email: z.string().optional(),
  hash: z.string().optional()
});

export const Route = createFileRoute("/shared/secret/$secretId")({
  validateSearch: zodValidator(SharedSecretByIDPageQuerySchema),
  component: ViewSharedSecretByIDPage,
  search: {
    middlewares: [stripSearchParams({ key: "" })]
  },
  beforeLoad: async ({ context }) => {
    // we load the auth token because the view shared secret screen serves both public and authenticated users
    await context.queryClient
      .ensureQueryData({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => undefined);
  }
});
