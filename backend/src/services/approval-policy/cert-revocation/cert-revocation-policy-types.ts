import { z } from "zod";

import { CertRevocationPolicyRequestDataSchema, CertRevocationRequestSchema } from "./cert-revocation-policy-schemas";

export type TCertRevocationRequest = z.infer<typeof CertRevocationRequestSchema>;
export type TCertRevocationRequestData = z.infer<typeof CertRevocationPolicyRequestDataSchema>;
