import ms from "ms";
import { z } from "zod";

import { SshCertKeyAlgorithm, sshCertKeyAlgorithms } from "@app/hooks/api/dynamicSecret/constants";
import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

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

export const SSH_CUSTOM_RENDERER_REASONS = ["repeatable-fields"] as const;
export const SSH_CREATE_WORKFLOW_BOUNDARY_REASONS = ["post-create-workflow"] as const;
export const SSH_DYNAMIC_SECRET_MAX_TTL = "7d";

const algorithmValues = sshCertKeyAlgorithms.map(({ value }) => value);
const sshInputsSchema = z.object({
  principals: z.array(z.string().trim().min(1)).min(1, "At least one principal is required"),
  keyAlgorithm: z.enum(algorithmValues as [string, ...string[]]),
  caKeyAlgorithm: z.enum(algorithmValues as [string, ...string[]])
});

export type TSshFormValues = TDynamicSecretProviderFormValues<z.infer<typeof sshInputsSchema>>;

const sshTtlSchema = z
  .string()
  .min(1, "TTL is required")
  .superRefine((value, context) => {
    if (!value) return;
    const valueMs = ms(value);
    if (valueMs === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TTL must be a valid duration"
      });
      return;
    }
    if (valueMs < 60 * 1000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TTL must be a greater than 1min"
      });
    }
    if (valueMs > ms(SSH_DYNAMIC_SECRET_MAX_TTL)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TTL must be 7 days or less"
      });
    }
  });

const withSshTtls = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.extend({
    defaultTTL: sshTtlSchema,
    maxTTL: sshTtlSchema
  });

const withTtlOrder = <T extends z.ZodType<TSshFormValues>>(schema: T) =>
  schema.refine(
    (data) => {
      if (!data.maxTTL || !data.defaultTTL) return true;
      const maxTtlMs = ms(data.maxTTL);
      const defaultTtlMs = ms(data.defaultTTL);
      if (maxTtlMs === undefined || defaultTtlMs === undefined) return true;
      return maxTtlMs >= defaultTtlMs;
    },
    {
      path: ["maxTTL"],
      message: "Max TTL must be greater than or equal to Default TTL"
    }
  ) as z.ZodType<TSshFormValues>;

export const sshCreateFormSchema = withTtlOrder(
  withSshTtls(createDynamicSecretProviderFormSchema(sshInputsSchema)) as z.ZodType<TSshFormValues>
);
export const sshEditFormSchema = withTtlOrder(
  withSshTtls(editDynamicSecretProviderFormSchema(sshInputsSchema)) as z.ZodType<TSshFormValues>
);

export const getSshCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TSshFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  inputs: {
    principals: [],
    keyAlgorithm: SshCertKeyAlgorithm.ED25519,
    caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
  }
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
      keyAlgorithm: inputs.keyAlgorithm ?? SshCertKeyAlgorithm.ED25519,
      caKeyAlgorithm: inputs.caKeyAlgorithm ?? SshCertKeyAlgorithm.ED25519
    }
  };
};

export const getSshCreatePayload = (
  values: TSshFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Ssh> => ({
  provider: { type: DynamicSecretProviders.Ssh, inputs: sshInputsSchema.parse(values.inputs) },
  defaultTTL: values.defaultTTL,
  maxTTL: values.maxTTL ?? undefined,
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
    maxTTL: values.maxTTL
  }
});
