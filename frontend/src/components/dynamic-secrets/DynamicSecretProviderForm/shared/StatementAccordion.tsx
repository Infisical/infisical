import { FieldValues, Path } from "react-hook-form";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "../DynamicSecretProviderGroup";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { TDynamicSecretProviderField } from "../types";
import { usernameTemplateFieldDefinition } from "./UsernameTemplateField";

type StatementCopy = {
  creation?: string;
  revocation?: string;
  renew?: string;
};

type BuildOptions = {
  includeUsernameTemplate?: boolean;
  includeRenew?: boolean;
  renewOptional?: boolean;
  creationRows?: number;
  copy?: StatementCopy;
};

const DEFAULT_COPY: Required<StatementCopy> = {
  creation: "Username, password, and expiration are dynamically provisioned.",
  revocation: "Username is dynamically provisioned.",
  renew: "Username and expiration are dynamically provisioned."
};

export const buildStatementFields = <TValues extends FieldValues>(
  options: BuildOptions = {}
): TDynamicSecretProviderField<TValues>[] => {
  const {
    includeUsernameTemplate = true,
    includeRenew = true,
    renewOptional = true,
    creationRows = 3,
    copy = {}
  } = options;
  const resolvedCopy = { ...DEFAULT_COPY, ...copy };

  const fields: TDynamicSecretProviderField<TValues>[] = [];

  if (includeUsernameTemplate) {
    fields.push(usernameTemplateFieldDefinition as TDynamicSecretProviderField<TValues>);
  }

  fields.push(
    {
      name: "inputs.creationStatement" as Path<TValues>,
      type: "textarea",
      label: "Creation Statement",
      ...(resolvedCopy.creation ? { description: resolvedCopy.creation } : {}),
      rows: creationRows
    },
    {
      name: "inputs.revocationStatement" as Path<TValues>,
      type: "textarea",
      label: "Revocation Statement",
      ...(resolvedCopy.revocation ? { description: resolvedCopy.revocation } : {}),
      rows: 3
    }
  );

  if (includeRenew) {
    fields.push({
      name: "inputs.renewStatement" as Path<TValues>,
      type: "textarea",
      label: "Renew Statement",
      ...(resolvedCopy.renew ? { description: resolvedCopy.renew } : {}),
      isOptional: renewOptional,
      rows: 3
    });
  }

  return fields;
};

/** Convenience export when callers only need the username-template placeholder constant nearby. */
export { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE };

type Props<TValues extends FieldValues> = {
  title: string;
  fields: readonly TDynamicSecretProviderField<TValues>[];
  value?: string;
};

/** Statement cluster as a sheet-section collapse (peer to Configuration). */
export const StatementAccordion = <TValues extends FieldValues>({
  title,
  fields,
  value = "statements"
}: Props<TValues>) => (
  <DynamicSecretProviderGroup id={value} presentation="collapse" title={title}>
    <DynamicSecretProviderFields fields={fields} />
  </DynamicSecretProviderGroup>
);
