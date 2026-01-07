import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { RequestNewInvitePage } from "./RequestNewInvitePage";

const RequestNewInvitePageQueryParamsSchema = z.object({
  reason: z.enum(["expired", "already_member"]).optional()
});

export const Route = createFileRoute("/_restrict-login-signup/requestnewinvite")({
  component: RequestNewInvitePage,
  validateSearch: zodValidator(RequestNewInvitePageQueryParamsSchema)
});
