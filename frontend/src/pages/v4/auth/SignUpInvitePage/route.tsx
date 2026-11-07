import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import {
  acceptSignupInvite,
  SignupInvitePageQueryParamsSchema
} from "@app/helpers/authRouteGuards";

import { SignUpInvitePage } from "./SignUpInvitePage";

export const Route = createFileRoute("/v4/_v4-auth/signupinvite")({
  validateSearch: zodValidator(SignupInvitePageQueryParamsSchema.partial()),
  beforeLoad: async ({ context, search }) => {
    if (context.authPreview) {
      return {
        inviteEmail: "ada@acme.dev",
        inviteOrganizationName: "Acme Corp",
        error: context.authPreview === "invalid" ? "This invitation link is invalid." : undefined
      };
    }
    const { withV4Redirects } = await import("../paths");
    return withV4Redirects(() =>
      acceptSignupInvite({ context, search: SignupInvitePageQueryParamsSchema.parse(search) })
    );
  },
  component: SignUpInvitePage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
