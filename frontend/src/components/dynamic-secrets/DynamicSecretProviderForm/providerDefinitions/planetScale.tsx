import {
  DynamicSecretProviders,
  PlanetScalePasswordRole
} from "@app/hooks/api/dynamicSecret/types";

import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { defineDynamicSecretProvider, TDynamicSecretProviderFormItem } from "../types";
import {
  getPlanetScaleCreateDefaultValues,
  getPlanetScaleCreatePayload,
  getPlanetScaleEditDefaultValues,
  getPlanetScaleEditPayload,
  planetScaleCreateFormSchema,
  planetScaleEditFormSchema,
  TPlanetScaleFormValues
} from "./planetScaleContract";

const getFields = (mode: "create" | "edit") =>
  [
    {
      kind: "group",
      id: "planetscale-configuration",
      presentation: "panel",
      fields: [
        {
          name: "inputs.serviceTokenId",
          type: "text",
          label: "Service Token ID",
          description:
            "A PlanetScale service token with connect_branch and delete_branch_password on the database, or connect_production_branch and delete_production_branch_password for a production branch."
        },
        {
          name: "inputs.serviceToken",
          type: "secret",
          label: "Service Token",
          placeholder: mode === "edit" ? "••••••••" : undefined,
          autoComplete: "new-password",
          ...(mode === "edit"
            ? { isOptional: true, description: "Leave blank to keep the current service token." }
            : {})
        },
        {
          name: "inputs.organization",
          type: "text",
          label: "Organization",
          layout: "half"
        },
        {
          name: "inputs.database",
          type: "text",
          label: "Database",
          layout: "half"
        },
        {
          name: "inputs.branch",
          type: "text",
          label: "Branch",
          placeholder: "main",
          layout: "half"
        },
        {
          name: "inputs.role",
          type: "select",
          label: "Role",
          layout: "half",
          options: [
            { label: "Read-only", value: PlanetScalePasswordRole.Reader },
            { label: "Write-only", value: PlanetScalePasswordRole.Writer },
            { label: "Read/write", value: PlanetScalePasswordRole.ReadWriter },
            { label: "Admin", value: PlanetScalePasswordRole.Admin }
          ]
        }
      ]
    },
    {
      kind: "group",
      id: "planetscale-advanced",
      presentation: "collapse",
      title: "Advanced",
      fields: [
        {
          name: "usernameTemplate",
          type: "text",
          label: "Password Name Template",
          placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
          description: "Name given to each password in PlanetScale."
        }
      ]
    }
  ] satisfies readonly TDynamicSecretProviderFormItem<TPlanetScaleFormValues>[];

const noRenewalTtlDescription =
  "PlanetScale passwords expire at the end of the lease and cannot be renewed.";

export const planetScaleDynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.PlanetScale,
  label: "PlanetScale",
  create: {
    schema: planetScaleCreateFormSchema,
    getDefaultValues: getPlanetScaleCreateDefaultValues,
    toPayload: getPlanetScaleCreatePayload,
    fields: getFields("create"),
    commonFields: { ttlDescription: noRenewalTtlDescription },
    submitLabel: "Submit"
  },
  edit: {
    schema: planetScaleEditFormSchema,
    getDefaultValues: getPlanetScaleEditDefaultValues,
    toPayload: getPlanetScaleEditPayload,
    fields: getFields("edit"),
    commonFields: { ttlDescription: noRenewalTtlDescription },
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});
