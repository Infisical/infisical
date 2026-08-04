import { FieldValues } from "react-hook-form";

import { DynamicSecretProviderFields } from "../DynamicSecretProviderFields";
import { DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE } from "../schemas";
import { TDynamicSecretProviderField } from "../types";

export const usernameTemplateFieldDefinition = {
  name: "usernameTemplate",
  type: "text",
  label: "Username Template",
  placeholder: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE
} as const;

type Props<TValues extends FieldValues> = {
  fields?: readonly TDynamicSecretProviderField<TValues>[];
};

/** Renders the standard username-template scalar, optionally with trailing fields. */
export const UsernameTemplateFields = <TValues extends FieldValues>({
  fields = [usernameTemplateFieldDefinition as TDynamicSecretProviderField<TValues>]
}: Props<TValues>) => <DynamicSecretProviderFields fields={fields} />;
