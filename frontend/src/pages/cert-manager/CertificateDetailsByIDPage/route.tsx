import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificateDetailsByIDPage } from "./CertificateDetailsByIDPage";

const CertificateDetailsByIDPageQuerySchema = z.object({
  fromApplication: z.string().optional(),
  fromHsmConnector: z.string().uuid().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificates/$certificateId"
)({
  component: CertificateDetailsByIDPage,
  validateSearch: zodValidator(CertificateDetailsByIDPageQuerySchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificates",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/inventory",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            }
          })
        },
        {
          label: params.certificateId
        }
      ]
    };
  }
});
