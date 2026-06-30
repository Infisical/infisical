import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificateProfileDetailsByIDPage } from "./CertificateProfileDetailsByIDPage";

const profileDetailsSearchSchema = z.object({
  from: z.enum(["settings", "application"]).optional(),
  applicationName: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-profiles/$profileId"
)({
  component: CertificateProfileDetailsByIDPage,
  validateSearch: zodValidator(profileDetailsSearchSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Profiles",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles",
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
