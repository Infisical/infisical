import { z } from "zod";

import {
  KubernetesAccountCredentialsSchema,
  KubernetesAccountSchema,
  KubernetesResourceConnectionDetailsSchema,
  KubernetesResourceSchema
} from "./kubernetes-resource-schemas";

// Resources
export type TKubernetesResource = z.infer<typeof KubernetesResourceSchema>;
export type TKubernetesResourceConnectionDetails = z.infer<typeof KubernetesResourceConnectionDetailsSchema>;

// Accounts
export type TKubernetesAccount = z.infer<typeof KubernetesAccountSchema>;
export type TKubernetesAccountCredentials = z.infer<typeof KubernetesAccountCredentialsSchema>;
