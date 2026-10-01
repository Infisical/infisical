import { Knex } from "knex";
import { z } from "zod";

import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";

import {
  SecretAccessPolicyConditionsSchema,
  SecretAccessPolicyConstraintsSchema,
  SecretAccessPolicyInputsSchema,
  SecretAccessPolicyRequestDataSchema,
  SecretAccessPolicySchema,
  SecretAccessRequestSchema
} from "./secret-access-policy-schemas";

export type TSecretAccessPolicy = z.infer<typeof SecretAccessPolicySchema>;
export type TSecretAccessPolicyInputs = z.infer<typeof SecretAccessPolicyInputsSchema>;
export type TSecretAccessPolicyConditions = z.infer<typeof SecretAccessPolicyConditionsSchema>;
export type TSecretAccessPolicyConstraints = z.infer<typeof SecretAccessPolicyConstraintsSchema>;

export type TSecretAccessRequest = z.infer<typeof SecretAccessRequestSchema>;
export type TSecretAccessRequestData = z.infer<typeof SecretAccessPolicyRequestDataSchema>;

export type TSecretAccessApprovalContext = {
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "create">;
  tx: Knex;
};
