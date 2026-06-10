import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SignerDetailPage } from "./SignerDetailPage";

const SignerDetailSearchSchema = z.object({
  selectedTab: z.enum(["activity", "approvals", "members"]).catch("activity").optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/$signerId"
)({
  component: SignerDetailPage,
  validateSearch: zodValidator(SignerDetailSearchSchema),
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Code Signing"
        },
        {
          label: "Signer Details"
        }
      ]
    };
  }
});
