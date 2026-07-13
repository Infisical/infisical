import { Control, useWatch } from "react-hook-form";

import { useListPamAccountTypes } from "@app/hooks/api/pam";

import { TAccountFormValues } from "./accountFormSchema";
import { PamSchemaFields } from "./PamSchemaFields";

type Props = {
  control: Control<TAccountFormValues>;
};

export const CredentialsForm = ({ control }: Props) => {
  const accountType = useWatch({ control, name: "accountType" });
  const { data: accountTypes } = useListPamAccountTypes();

  const metadata = accountTypes?.find((t) => t.type === accountType);
  if (!metadata) return null;

  return (
    <PamSchemaFields
      control={control}
      namePrefix="credentials"
      fields={metadata.credentialFields}
    />
  );
};
