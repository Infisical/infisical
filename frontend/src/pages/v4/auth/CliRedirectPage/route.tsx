import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { pushCliTokenToTerminal } from "./cli-token";
import { CliRedirectPage } from "./CliRedirectPage";

const SearchSchema = z.object({
  org_id: z.string().optional().catch(undefined),
  preview: z.enum(["token", "done"]).optional().catch(undefined)
});

export const Route = createFileRoute("/v4/cli-redirect")({
  validateSearch: zodValidator(SearchSchema),
  beforeLoad: async ({ location, search }) => {
    const { canPreviewV4States, isV4AppEnabled } = await import("../../mode");
    if (search.preview && canPreviewV4States()) return;
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    await pushCliTokenToTerminal();
  },
  staticData: { readiness: "full" },
  component: CliRedirectPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
