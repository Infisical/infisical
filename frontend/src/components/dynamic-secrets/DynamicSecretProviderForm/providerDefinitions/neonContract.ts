import { z } from "zod";

import {
  DynamicSecretProviders,
  NeonLeaseType,
  TDynamicSecretProvider,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const NEON_CUSTOM_RENDERER_REASONS = ["conditional-fields"] as const;

type TNeonInputs = Extract<TDynamicSecretProvider, { type: DynamicSecretProviders.Neon }>["inputs"];

const NEON_RESOURCE_ID_REGEX = /^[a-z0-9-]{1,60}$/;

// The form keeps the fields of both lease types, so switching back and forth keeps what was typed;
// buildInputs sends only the fields of the selected one, and refineNeonInputs checks only those.
const neonInputFields = {
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID is required")
    .regex(NEON_RESOURCE_ID_REGEX, "Must be a valid Neon project ID"),
  leaseType: z.nativeEnum(NeonLeaseType),
  branchId: z.string().trim().optional(),
  parentBranchId: z.string().trim().optional(),
  databaseName: z.string().trim().min(1, "Database is required").max(63),
  roleName: z.string().trim().optional(),
  pooled: z.boolean(),
  resetRolePassword: z.boolean(),
  setBranchExpiration: z.boolean()
};

const refineNeonInputs = (
  inputs: {
    leaseType: NeonLeaseType;
    branchId?: string;
    parentBranchId?: string;
    roleName?: string;
  },
  context: z.RefinementCtx
) => {
  const addIssue = (field: string, message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });

  if (inputs.leaseType === NeonLeaseType.Role) {
    if (!inputs.branchId)
      addIssue("branchId", "Branch ID is required when each lease creates a role");
    else if (!NEON_RESOURCE_ID_REGEX.test(inputs.branchId))
      addIssue("branchId", "Must be a valid Neon branch ID");
    return;
  }
  if (inputs.parentBranchId && !NEON_RESOURCE_ID_REGEX.test(inputs.parentBranchId))
    addIssue("parentBranchId", "Must be a valid Neon branch ID");
  if (!inputs.roleName) addIssue("roleName", "Role is required when each lease creates a branch");
  else if (inputs.roleName.length > 63) addIssue("roleName", "Role must be at most 63 characters");
};

const neonCreateInputsSchema = z
  .object({ ...neonInputFields, apiKey: z.string().trim().min(1, "API key is required") })
  .superRefine(refineNeonInputs);

// the stored API key is never sent back to the browser, so a blank key on edit keeps it
const neonEditInputsSchema = z
  .object({ ...neonInputFields, apiKey: z.string().trim().optional() })
  .superRefine(refineNeonInputs);

export type TNeonFormValues = TDynamicSecretProviderFormValues<
  z.infer<typeof neonEditInputsSchema>
>;

export const neonCreateFormSchema = createDynamicSecretProviderFormSchema(
  neonCreateInputsSchema
) as z.ZodType<TNeonFormValues>;

export const neonEditFormSchema = editDynamicSecretProviderFormSchema(neonEditInputsSchema, {
  usernameTemplateSchema: z.string().trim().nullable().optional()
}) as z.ZodType<TNeonFormValues>;

const buildInputs = (inputs: TNeonFormValues["inputs"]): TNeonInputs => {
  const shared = {
    ...(inputs.apiKey ? { apiKey: inputs.apiKey } : {}),
    projectId: inputs.projectId,
    databaseName: inputs.databaseName,
    pooled: inputs.pooled
  };
  if (inputs.leaseType === NeonLeaseType.Role) {
    return { ...shared, leaseType: NeonLeaseType.Role, branchId: inputs.branchId ?? "" };
  }
  return {
    ...shared,
    leaseType: NeonLeaseType.Branch,
    parentBranchId: inputs.parentBranchId || null,
    roleName: inputs.roleName ?? "",
    resetRolePassword: inputs.resetRolePassword,
    setBranchExpiration: inputs.setBranchExpiration
  };
};

const defaultInputs: TNeonFormValues["inputs"] = {
  apiKey: "",
  projectId: "",
  leaseType: NeonLeaseType.Role,
  branchId: "",
  parentBranchId: "",
  databaseName: "neondb",
  roleName: "",
  pooled: false,
  resetRolePassword: true,
  setBranchExpiration: false
};

export const getNeonCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TNeonFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: defaultInputs
});

export const getNeonEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TNeonFormValues => {
  const inputs = context.dynamicSecret.inputs as TNeonInputs;
  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: {
      ...defaultInputs,
      ...inputs,
      apiKey: "",
      parentBranchId: (inputs.leaseType === NeonLeaseType.Branch && inputs.parentBranchId) || ""
    }
  };
};

export const getNeonCreatePayload = (
  values: TNeonFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Neon> => ({
  provider: { type: DynamicSecretProviders.Neon, inputs: buildInputs(values.inputs) },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getNeonEditPayload = (
  values: TNeonFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || null,
    defaultTTL: values.defaultTTL,
    inputs: buildInputs(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});
