import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertAuthDetailsByIDPage } from "./CertAuthDetailsByIDPage";

const caDetailsSearchSchema = z.object({
  from: z.enum(["settings", "profile"]).optional(),
  profileId: z.string().optional(),
  profileFrom: z.enum(["settings", "application"]).optional(),
  profileApplicationName: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/ca/$caId"
)({
  component: CertAuthDetailsByIDPage,
  validateSearch: zodValidator(caDetailsSearchSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Authorities",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/certificate-authorities",
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
