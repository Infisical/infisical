import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificatePolicyDetailsByIDPage } from "./CertificatePolicyDetailsByIDPage";

const policyDetailsSearchSchema = z.object({
  from: z.enum(["settings", "profile"]).optional(),
  profileId: z.string().optional(),
  profileFrom: z.enum(["settings", "application"]).optional(),
  profileApplicationName: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-policies/$policyId"
)({
  component: CertificatePolicyDetailsByIDPage,
  validateSearch: zodValidator(policyDetailsSearchSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Policies",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/certificate-policies",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});
