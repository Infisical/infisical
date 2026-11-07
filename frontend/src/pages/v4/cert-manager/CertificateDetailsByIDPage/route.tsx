import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CertificateDetailsByIDPage } from "./CertificateDetailsByIDPage";

const CertificateDetailsByIDPageQuerySchema = z.object({
  fromApplication: z.string().optional(),
  fromHsmConnector: z.string().uuid().optional()
});

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/certificates/$certificateId"
)({
  component: CertificateDetailsByIDPage,
  validateSearch: zodValidator(CertificateDetailsByIDPageQuerySchema)
});
