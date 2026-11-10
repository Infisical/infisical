import { useFormContext } from "react-hook-form";

import { DynamicSecretProviders, NeonLeaseType } from "@app/hooks/api/dynamicSecret/types";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import {
  defineDynamicSecretProvider,
  TDynamicSecretProviderField,
  TDynamicSecretProviderRendererProps
} from "../types";
import {
  getNeonCreateDefaultValues,
  getNeonCreatePayload,
  getNeonEditDefaultValues,
  getNeonEditPayload,
  NEON_CUSTOM_RENDERER_REASONS,
  neonCreateFormSchema,
  neonEditFormSchema,
  TNeonFormValues
} from "./neonContract";

const getNeonConnectionFields = (mode: TDynamicSecretProviderRendererProps["mode"]) =>
  [
    {
      name: "inputs.apiKey",
      type: "secret",
      label: "API Key",
      placeholder: mode === "edit" ? "••••••••" : "napi_...",
      autoComplete: "new-password",
      description:
        mode === "edit"
          ? "Leave blank to keep the current API key."
          : "A Neon API key with access to the project. An organization or project API key works.",
      isOptional: mode === "edit"
    },
    {
      name: "inputs.projectId",
      type: "text",
      label: "Project ID",
      placeholder: "shiny-wind-028834",
      description: "Found under Settings in the Neon console.",
      layout: "half"
    },
    {
      name: "inputs.leaseType",
      type: "select",
      label: "Each Lease Creates",
      layout: "half",
      options: [
        { label: "A Postgres role", value: NeonLeaseType.Role },
        { label: "A database branch", value: NeonLeaseType.Branch }
      ]
    }
  ] satisfies readonly TDynamicSecretProviderField<TNeonFormValues>[];

const neonRoleFields = [
  {
    name: "inputs.branchId",
    type: "text",
    label: "Branch ID",
    placeholder: "br-aged-salad-637688",
    description: "The branch each lease's role is created on.",
    layout: "half"
  },
  {
    name: "inputs.databaseName",
    type: "text",
    label: "Database",
    placeholder: "neondb",
    description: "Database used in the returned connection string.",
    layout: "half"
  },
  {
    name: "inputs.pooled",
    type: "switch",
    label: "Pooled Connection",
    description: "Return the PgBouncer (-pooler) connection string."
  }
] as const satisfies readonly TDynamicSecretProviderField<TNeonFormValues>[];

const neonBranchFields = [
  {
    name: "inputs.branchId",
    type: "text",
    label: "Parent Branch ID",
    placeholder: "br-aged-salad-637688",
    description:
      "Each lease branches from this branch. Leave empty to use the project's default branch.",
    isOptional: true
  },
  {
    name: "inputs.databaseName",
    type: "text",
    label: "Database",
    placeholder: "neondb",
    layout: "half"
  },
  {
    name: "inputs.roleName",
    type: "text",
    label: "Role",
    placeholder: "neondb_owner",
    description: "Existing role whose credentials are returned for the new branch.",
    layout: "half"
  },
  {
    name: "inputs.pooled",
    type: "switch",
    label: "Pooled Connection",
    description: "Return the PgBouncer (-pooler) connection string."
  },
  {
    name: "inputs.resetRolePassword",
    type: "switch",
    label: "Rotate Role Password",
    description:
      "Branches inherit their parent's passwords. Reset the role's password on each new branch so a lease can't be used against the parent."
  },
  {
    name: "inputs.setBranchExpiration",
    type: "switch",
    label: "Set Neon Branch Expiration",
    description:
      "Also schedule the branch for deletion in Neon at the lease's expiry, as a fallback if revocation fails. Requires access to Neon's branch expiration feature."
  }
] as const satisfies readonly TDynamicSecretProviderField<TNeonFormValues>[];

const neonNameTemplateField = (leaseType?: NeonLeaseType) =>
  [
    {
      name: "usernameTemplate",
      type: "text",
      label: leaseType === NeonLeaseType.Branch ? "Branch Name Template" : "Role Name Template",
      placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      isOptional: true
    }
  ] satisfies readonly TDynamicSecretProviderField<TNeonFormValues>[];

const NeonFields = ({ mode }: TDynamicSecretProviderRendererProps) => {
  const { watch } = useFormContext<TNeonFormValues>();
  const leaseType = watch("inputs.leaseType");

  return (
    <DynamicSecretProviderGroup id="neon-configuration" presentation="panel">
      <DynamicSecretProviderFields fields={getNeonConnectionFields(mode)} />
      <DynamicSecretProviderFields
        fields={leaseType === NeonLeaseType.Branch ? neonBranchFields : neonRoleFields}
      />
      <DynamicSecretProviderFields fields={neonNameTemplateField(leaseType)} />
    </DynamicSecretProviderGroup>
  );
};

export const neonDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.Neon,
  label: "Neon",
  customRenderer: {
    reasons: NEON_CUSTOM_RENDERER_REASONS,
    Component: NeonFields
  },
  create: {
    schema: neonCreateFormSchema,
    getDefaultValues: getNeonCreateDefaultValues,
    toPayload: getNeonCreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: neonEditFormSchema,
    getDefaultValues: getNeonEditDefaultValues,
    toPayload: getNeonEditPayload,
    submitLabel: "Save",
    successMessage: "Successfully updated dynamic secret"
  }
});
