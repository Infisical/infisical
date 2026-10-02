import { z } from "zod";

import {
  CodeSigningPolicyConditionsSchema,
  CodeSigningPolicyConstraintsSchema,
  CodeSigningPolicyInputsSchema,
  CodeSigningPolicyRequestDataSchema,
  CodeSigningPolicySchema,
  CodeSigningRequestGrantSchema,
  CodeSigningRequestSchema,
  CodeSigningRequestScopeInputSchema,
  CodeSigningScopeSchema
} from "./code-signing-policy-schemas";

export type TCodeSigningPolicy = z.infer<typeof CodeSigningPolicySchema>;
export type TCodeSigningPolicyInputs = z.infer<typeof CodeSigningPolicyInputsSchema>;
export type TCodeSigningPolicyConditions = z.infer<typeof CodeSigningPolicyConditionsSchema>;
export type TCodeSigningPolicyConstraints = z.infer<typeof CodeSigningPolicyConstraintsSchema>;

export type TCodeSigningRequest = z.infer<typeof CodeSigningRequestSchema>;
export type TCodeSigningRequestData = z.infer<typeof CodeSigningPolicyRequestDataSchema>;

export type TCodeSigningGrantAttributes = z.infer<typeof CodeSigningRequestGrantSchema>["attributes"];

export type TCodeSigningScope = z.infer<typeof CodeSigningScopeSchema>;
export type TCodeSigningRequestScopeInput = z.infer<typeof CodeSigningRequestScopeInputSchema>;
