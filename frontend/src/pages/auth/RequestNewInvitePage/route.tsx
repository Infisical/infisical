import { createFileRoute } from "@tanstack/react-router";

import { RequestNewInvitePage } from "./RequestNewInvitePage";

export const Route = createFileRoute("/_restrict-login-signup/requestnewinvite")({
  component: RequestNewInvitePage
});
