import { Controller, useFormContext } from "react-hook-form";

import {
  Detail,
  DetailLabel,
  DetailValue,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";

import { CREDENTIAL_LABELS, TConnectionForm } from "./connectionSchema";
import { credentialPreview } from "./CredentialFields";

export const ReviewFields = () => {
  const { control, watch } = useFormContext<TConnectionForm>();
  const form = watch();

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="datadog-us5" />
              <FieldDescription>Lowercase letters, numbers and hyphens.</FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <div className="flex flex-col gap-3 rounded-md border border-border bg-container p-4">
        <Detail>
          <DetailLabel>Credential</DetailLabel>
          <DetailValue>{CREDENTIAL_LABELS[form.credentialType]}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Sends</DetailLabel>
          <DetailValue className="font-mono text-xs">{credentialPreview(form)}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>To</DetailLabel>
          <DetailValue className="font-mono text-xs">{form.hostPattern}</DetailValue>
        </Detail>
      </div>
    </div>
  );
};
