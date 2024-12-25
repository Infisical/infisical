import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretApprovalsPage } from "./SecretApprovalsPage";

const SecretApprovalPageQueryParams = z.object({
  requestId: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/approval/"
)({
  component: SecretApprovalsPage,
  validateSearch: zodValidator(SecretApprovalPageQueryParams)
});
