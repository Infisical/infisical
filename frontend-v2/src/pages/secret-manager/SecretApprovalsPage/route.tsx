import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretApprovalsPage } from "./SecretApprovalsPage";

const SecretApprovalPageQueryParams = z.object({
  requestId: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/approval"
)({
  component: SecretApprovalsPage,
  validateSearch: zodValidator(SecretApprovalPageQueryParams)
});
