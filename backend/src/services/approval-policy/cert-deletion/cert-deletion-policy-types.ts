import { z } from "zod";

import { CertDeletionPolicyRequestDataSchema, CertDeletionRequestSchema } from "./cert-deletion-policy-schemas";

export type TCertDeletionRequest = z.infer<typeof CertDeletionRequestSchema>;
export type TCertDeletionRequestData = z.infer<typeof CertDeletionPolicyRequestDataSchema>;
