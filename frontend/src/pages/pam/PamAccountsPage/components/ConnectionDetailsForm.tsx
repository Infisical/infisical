import { Control, UseFormClearErrors, UseFormSetValue, useWatch } from "react-hook-form";

import { PamFieldWidget, useListPamAccountTypes } from "@app/hooks/api/pam";

import { TAccountFormValues } from "./accountFormSchema";
import { applyConnectionString } from "./applyConnectionString";
import { PamSchemaFields, TSmartPaste } from "./PamSchemaFields";

type Props = {
  control: Control<TAccountFormValues>;
  setValue: UseFormSetValue<TAccountFormValues>;
  clearErrors: UseFormClearErrors<TAccountFormValues>;
};

export const ConnectionDetailsForm = ({ control, setValue, clearErrors }: Props) => {
  const accountType = useWatch({ control, name: "accountType" });
  const { data: accountTypes } = useListPamAccountTypes();

  const metadata = accountTypes?.find((t) => t.type === accountType);
  if (!metadata) return null;

  const schemes = metadata.connectionStringSchemes ?? [];

  const pasteField = schemes.length
    ? metadata.connectionFields.find((field) => field.widget === PamFieldWidget.Text)
    : undefined;

  const smartPaste: TSmartPaste | undefined = pasteField && {
    fieldKey: pasteField.key,
    hint: `${pasteField.label}, or paste a connection string`,
    onPaste: (text) =>
      applyConnectionString({
        text,
        schemes,
        connectionFields: metadata.connectionFields,
        credentialFields: metadata.credentialFields,
        setValue,
        clearErrors
      })
  };

  return (
    <PamSchemaFields
      control={control}
      setValue={setValue}
      namePrefix="connectionDetails"
      fields={metadata.connectionFields}
      smartPaste={smartPaste}
    />
  );
};
