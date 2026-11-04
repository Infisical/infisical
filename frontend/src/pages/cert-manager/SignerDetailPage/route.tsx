import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SignerDetailPage } from "./SignerDetailPage";

const SignerDetailSearchSchema = z.object({
  selectedTab: z.enum(["activity", "approvals", "members"]).catch("activity").optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/code-signing/$signerId/"
)({
  component: SignerDetailPage,
  validateSearch: zodValidator(SignerDetailSearchSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Code Signing",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/code-signing",
            params: { orgId: params.orgId }
          })
        },
        {
          label: "Signer Details"
        }
      ]
    };
  }
});
