import ms from "ms";
import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import { SshCertKeyAlgorithm, sshCertKeyAlgorithms } from "@app/hooks/api/sshCa/constants";

import {
  createDynamicSecretProviderFormSchema,
  editDynamicSecretProviderFormSchema
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

const algorithmValues = sshCertKeyAlgorithms.map(({ value }) => value);
const sshInputsSchema = z.object({
  principals: z.array(z.string().trim().min(1)).min(1, "At least one principal is required"),
  keyAlgorithm: z.enum(algorithmValues as [string, ...string[]])
});

export type TSshFormValues = TDynamicSecretProviderFormValues<z.infer<typeof sshInputsSchema>>;

const withTtlOrder = <T extends z.ZodType<TSshFormValues>>(schema: T) =>
  schema.refine((data) => !data.maxTTL || ms(data.maxTTL)! >= ms(data.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  }) as z.ZodType<TSshFormValues>;

export const sshCreateFormSchema = withTtlOrder(
  createDynamicSecretProviderFormSchema(sshInputsSchema) as z.ZodType<TSshFormValues>
);
export const sshEditFormSchema = withTtlOrder(
  editDynamicSecretProviderFormSchema(sshInputsSchema) as z.ZodType<TSshFormValues>
);

export const getSshCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TSshFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: { principals: [], keyAlgorithm: SshCertKeyAlgorithm.ED25519 }
});

export const getSshEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TSshFormValues => {
  const inputs = context.dynamicSecret.inputs as Partial<TSshFormValues["inputs"]>;
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    inputs: {
      principals: inputs.principals ?? [],
      keyAlgorithm: inputs.keyAlgorithm ?? SshCertKeyAlgorithm.ED25519
    }
  };
};

export const getSshCreatePayload = (
  values: TSshFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Ssh> => ({
  provider: { type: DynamicSecretProviders.Ssh, inputs: sshInputsSchema.parse(values.inputs) },
  defaultTTL: values.defaultTTL,
  maxTTL: values.maxTTL || undefined,
  name: values.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? ""
});

export const getSshEditPayload = (
  values: TSshFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    inputs: sshInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    defaultTTL: values.defaultTTL,
    maxTTL: values.maxTTL || undefined
  }
});
