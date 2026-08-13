import { Path, UseFormClearErrors, UseFormSetValue } from "react-hook-form";

import { TPamFieldDescriptor } from "@app/hooks/api/pam";

import { TAccountFormValues } from "./accountFormSchema";
import { parseConnectionString } from "./parseConnectionString";

type TArgs = {
  text: string;
  schemes: string[];
  connectionFields: TPamFieldDescriptor[];
  credentialFields: TPamFieldDescriptor[];
  setValue: UseFormSetValue<TAccountFormValues>;
  clearErrors: UseFormClearErrors<TAccountFormValues>;
};

export const applyConnectionString = ({
  text,
  schemes,
  connectionFields,
  credentialFields,
  setValue,
  clearErrors
}: TArgs): boolean => {
  const values = parseConnectionString(text, schemes);
  if (!values) return false;

  const paths: Path<TAccountFormValues>[] = [];
  Object.entries(values).forEach(([key, value]) => {
    const isConnectionField = connectionFields.some((field) => field.key === key);
    if (!isConnectionField && !credentialFields.some((field) => field.key === key)) return;

    const path =
      `${isConnectionField ? "connectionDetails" : "credentials"}.${key}` as Path<TAccountFormValues>;
    setValue(path, value as never, { shouldDirty: true });
    paths.push(path);
  });

  if (!paths.length) return false;

  // setValue does not clear the submit handler's "required" errors
  clearErrors(paths);
  return true;
};
