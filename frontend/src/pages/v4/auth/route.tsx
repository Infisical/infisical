import {
  createFileRoute,
  lazyRouteComponent,
  redirect,
  stripSearchParams
} from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LoginSignupQueryParamsSchema, restrictLoginSignup } from "@app/helpers/authRouteGuards";

import { AuthLayout } from "./AuthLayout";

const AuthSearchSchema = LoginSignupQueryParamsSchema.extend({
  preview: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/v4/_v4-auth")({
  validateSearch: zodValidator(AuthSearchSchema),
  search: {
    middlewares: [stripSearchParams({ callback_port: undefined, force: undefined })]
  },
  beforeLoad: async ({ context, location, search }) => {
    const { canPreviewV4States, isV4AppEnabled } = await import("../mode");
    if (search.preview && canPreviewV4States()) return { authPreview: search.preview };
    if (!(await isV4AppEnabled())) {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
    const { toV3Location, withV4Redirects } = await import("./paths");
    await withV4Redirects(() =>
      restrictLoginSignup({ context, location: toV3Location(location), search })
    );
    return { authPreview: undefined };
  },
  component: AuthLayout,
  pendingComponent: lazyRouteComponent(() => import("../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../V4ErrorPage"), "V4ErrorPage")
});
