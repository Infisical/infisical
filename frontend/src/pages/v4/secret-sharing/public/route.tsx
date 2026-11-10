import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";

import { PublicLayout } from "./PublicLayout";

export const Route = createFileRoute("/v4/_v4-public")({
  validateSearch: zodValidator(
    z.object({
      preview: z
        .enum(["secret", "password", "error", "branded", "answered"])
        .optional()
        .catch(undefined)
    })
  ),
  beforeLoad: async ({ context, location, search }) => {
    const { canPreviewV4States, isV4AppEnabled } = await import("../../mode");
    if (search.preview && canPreviewV4States()) {
      const { secretSharingPublicDemo } = await import("../../data/secret-sharing/demo");
      return { publicAdapter: secretSharingPublicDemo(search.preview) };
    }
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    await context.queryClient
      .ensureQueryData({ queryKey: authKeys.getAuthToken, queryFn: fetchAuthToken })
      .catch(() => undefined);
    const { secretSharingPublicLive } = await import("../../data/secret-sharing/live");
    return { publicAdapter: secretSharingPublicLive };
  },
  component: PublicLayout,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
